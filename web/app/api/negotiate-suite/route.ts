import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";
import { getAccessToken, sendGmail as sendGmailLib, type GmailAttachment } from "@/lib/gmail";
import { put } from "@vercel/blob";
import { buildNegotiationPrompt, SUITE_SYSTEM_PROMPT, stripMarkdown, stripAiPreamble } from "@/lib/email-pipeline";
import { ALIAS_DOMAIN, CLAUDE_MODEL, SUITE_MAX_TOKENS } from "@/lib/constants";
import { buildDocumentBlobPath } from "@/lib/utils";
import { sendNegotiationActivityCopyEmail } from "@/lib/notify";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const COUNTERPRO_ALIAS_SUFFIX = `@${ALIAS_DOMAIN}`;

function isCounterProAlias(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(COUNTERPRO_ALIAS_SUFFIX);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const { negotiationId, newMessage, replyToMessageId, toneOverride, hints } = await req.json();

  // Generate a draft for an existing inbound message that has not been handled yet.
  if (replyToMessageId) {
    const [target] = await sql`
      SELECT nm.*, n.address, n.ai_tone
      FROM negotiation_messages nm
      JOIN negotiations n ON n.id = nm.negotiation_id
      WHERE nm.id = ${replyToMessageId}
        AND nm.negotiation_id = ${negotiationId}
        AND nm.direction IN ('inbound', 'proactive')
        AND n.clerk_user_id = ${userId}
    `;
    if (!target) return NextResponse.json({ error: "Reply target not found" }, { status: 404 });

    const history = await sql`
      SELECT direction, content FROM negotiation_messages
      WHERE negotiation_id = ${negotiationId}
        AND id <> ${replyToMessageId}
      ORDER BY created_at ASC
    `;

    // For proactive drafts (no specific inbound message), generate a follow-up
    // based on conversation history only (no "new message from counterparty").
    const incomingMessage = target.direction === "proactive"
      ? "(Generate a proactive follow-up based on the conversation history above.)"
      : target.content;

    const resolvedTone = toneOverride ?? target.ai_tone ?? "professional";
    const hintsLine = hints ? `\nAdditional guidance: ${hints}` : "";
    const prompt = buildNegotiationPrompt(
      target.address,
      history as Array<{ direction: string; content: string }>,
      incomingMessage,
      resolvedTone
    ) + hintsLine;

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: SUITE_MAX_TOKENS,
      system: SUITE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const draft = message.content[0].type === "text" ? message.content[0].text : "";

    // If the inbound message is already approved (reply was sent), create a new pending
    // proactive draft rather than overwriting the old approved message's ai_draft.
    let returnMessageId: number;
    if (target.approved) {
      const [newMsg] = await sql`
        INSERT INTO negotiation_messages (negotiation_id, direction, content, ai_draft, approved)
        VALUES (${negotiationId}, 'proactive', ${draft}, ${draft}, false)
        RETURNING id
      `;
      returnMessageId = newMsg.id;
    } else {
      await sql`
        UPDATE negotiation_messages
        SET ai_draft = ${draft}
        WHERE id = ${replyToMessageId}
      `;
      returnMessageId = replyToMessageId;
    }

    await sql`UPDATE negotiations SET updated_at = NOW() WHERE id = ${negotiationId}`;

    return NextResponse.json({ draft, messageId: returnMessageId });
  }

  // Fetch negotiation + message history
  const [neg] = await sql`SELECT * FROM negotiations WHERE id = ${negotiationId} AND clerk_user_id = ${userId}`;
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await sql`
    SELECT direction, content FROM negotiation_messages
    WHERE negotiation_id = ${negotiationId}
    ORDER BY created_at ASC
  `;

  const prompt = buildNegotiationPrompt(
    neg.address,
    messages as Array<{ direction: string; content: string }>,
    newMessage,
    neg.ai_tone
  );

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: SUITE_MAX_TOKENS,
    system: SUITE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const draft = message.content[0].type === "text" ? message.content[0].text : "";

  // Save inbound message + draft
  const [savedMsg] = await sql`
    INSERT INTO negotiation_messages (negotiation_id, direction, content, ai_draft)
    VALUES (${negotiationId}, 'inbound', ${newMessage}, ${draft})
    RETURNING id
  `;

  await sql`UPDATE negotiations SET updated_at = NOW() WHERE id = ${negotiationId}`;

  return NextResponse.json({ draft, messageId: savedMsg.id });
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  // Accept either JSON or multipart/form-data (when a file attachment is included)
  let messageId: number, approved: boolean, editedDraft: string, discard: boolean;
  let attachment: GmailAttachment | undefined;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    messageId = Number(form.get("messageId"));
    approved = form.get("approved") === "true";
    editedDraft = (form.get("editedDraft") as string) ?? "";
    discard = form.get("discard") === "true";
    const file = form.get("attachment") as File | null;
    if (file && file.size > 0) {
      console.log("PUT route: Processing attachment:", file.name, file.type, file.size);
      const bytes = await file.arrayBuffer();
      console.log("PUT route: Got bytes, length:", bytes.byteLength);
      attachment = {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        data: Buffer.from(bytes),
      };
      console.log("PUT route: Created GmailAttachment:", {
        name: attachment.name,
        mimeType: attachment.mimeType,
        dataSize: attachment.data.length
      });
    }
  } else {
    ({ messageId, approved, editedDraft, discard } = await req.json());
  }

  // Verify ownership. The approved = false guard prevents a double-send from
  // creating a second outbound record if the same messageId is submitted twice.
  const [msg] = await sql`
    SELECT nm.*, n.clerk_user_id, n.counterparty_email, n.address, n.alias_email, n.gmail_copy_enabled
    FROM negotiation_messages nm
    JOIN negotiations n ON n.id = nm.negotiation_id
    WHERE nm.id = ${messageId} AND n.clerk_user_id = ${userId} AND nm.approved = false
  `;
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Discard: mark as approved without sending so it disappears from the pending queue
  if (discard) {
    await sql`UPDATE negotiation_messages SET approved = true WHERE id = ${messageId}`;
    return NextResponse.json({ ok: true, sent: false });
  }

  const finalText = editedDraft || msg.ai_draft;
  const plainText = stripAiPreamble(stripMarkdown(finalText));

  let sent = false;
  if (approved && msg.counterparty_email) {
    // Fall back to system account if the user hasn't connected their own Gmail
    const sendAsUserId = (await getAccessToken(userId))
      ? userId
      : (process.env.GMAIL_SYSTEM_USER_ID ?? userId);
    const accessToken = await getAccessToken(sendAsUserId);
    if (accessToken) {
      try {
        const subject = `Re: Negotiation - ${msg.address}`;
        const fromAddress = msg.alias_email || process.env.GMAIL_SALES_ADDRESS;
        const replyTo = msg.alias_email ?? undefined;

        // For proactive messages (user-initiated), gmail_thread_id is not set on the message
        // itself — look up the most recent inbound message that has one so the reply stays
        // in the existing Gmail thread.
        let gmailThreadId: string | undefined = msg.gmail_thread_id ?? undefined;
        let gmailMessageId: string | undefined = msg.gmail_message_id ?? undefined;
        if (!gmailThreadId) {
          const [threadSource] = await sql`
            SELECT gmail_thread_id, gmail_message_id FROM negotiation_messages
            WHERE negotiation_id = ${msg.negotiation_id} AND direction = 'inbound'
              AND gmail_thread_id IS NOT NULL
            ORDER BY created_at DESC LIMIT 1
          `;
          gmailThreadId = threadSource?.gmail_thread_id ?? undefined;
          gmailMessageId = threadSource?.gmail_message_id ?? undefined;
        }

        sent = await sendGmailLib(
          sendAsUserId,
          msg.counterparty_email,
          subject,
          plainText,
          fromAddress ?? undefined,
          replyTo,
          undefined,
          gmailThreadId,
          gmailMessageId,
          attachment ? [attachment] : undefined,
        );
      } catch {
        // Gmail failure must not block approval
        sent = false;
      }
    }
  }

  let outboundMessageId: number = messageId;
  if (msg.direction === "proactive") {
    // Proactive messages are already outbound — update in-place so only one bubble appears
    await sql`
      UPDATE negotiation_messages
      SET direction = 'outbound', content = ${plainText}, approved = true, ai_draft = ${finalText}, sent_at = ${sent ? sql`NOW()` : null}
      WHERE id = ${messageId}
    `;
  } else {
    await sql`
      UPDATE negotiation_messages
      SET approved = true, ai_draft = ${finalText}, sent_at = ${sent ? sql`NOW()` : null}
      WHERE id = ${messageId}
    `;

    // Save outbound reply as a separate record; capture its id for document linking
    const [outbound] = await sql`
      INSERT INTO negotiation_messages (negotiation_id, direction, content, approved, sent_at)
      VALUES (${msg.negotiation_id}, 'outbound', ${plainText}, true, ${sent ? sql`NOW()` : null})
      RETURNING id
    `;
    outboundMessageId = outbound.id;
  }

  // Save attachment to Blob and record it so users can access sent documents later
  if (sent && attachment) {
    try {
      const blobPath = buildDocumentBlobPath(userId, msg.negotiation_id, attachment.name);
      const { url } = await put(blobPath, attachment.data, {
        access: "public",
        contentType: attachment.mimeType,
      });
      await sql`
        INSERT INTO negotiation_documents (negotiation_id, clerk_user_id, filename, blob_url, mime_type, size_bytes, direction, message_id)
        VALUES (${msg.negotiation_id}, ${userId}, ${attachment.name}, ${url}, ${attachment.mimeType}, ${attachment.data.length}, 'sent', ${outboundMessageId})
      `;
    } catch (err) {
      // Document storage failure must not block the response
      console.error("[negotiate-suite] Failed to save document to blob:", err);
    }
  }

  if (sent && msg.gmail_copy_enabled && isCounterProAlias(msg.counterparty_email)) {
    try {
      await sendNegotiationActivityCopyEmail({
        clerkUserId: userId,
        negotiationId: msg.negotiation_id,
        address: msg.address,
        direction: "sent",
        message: plainText,
        counterpartyLabel: msg.counterparty_email,
      });
    } catch (err) {
      console.error("[negotiate-suite] Failed to send Gmail copy email:", err);
    }
  }

  return NextResponse.json({ ok: true, sent });
}

// Resend an outbound message that failed to deliver
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const { messageId } = await req.json();

  const [msg] = await sql`
    SELECT nm.*, n.clerk_user_id, n.counterparty_email, n.address, n.alias_email, n.gmail_copy_enabled
    FROM negotiation_messages nm
    JOIN negotiations n ON n.id = nm.negotiation_id
    WHERE nm.id = ${messageId}
      AND nm.direction = 'outbound'
      AND nm.approved = true
      AND nm.sent_at IS NULL
      AND n.clerk_user_id = ${userId}
  `;
  if (!msg) return NextResponse.json({ error: "Not found or already sent" }, { status: 404 });

  if (!msg.counterparty_email) {
    return NextResponse.json({ error: "No counterparty email set" }, { status: 400 });
  }

  const sendAsUserId = (await getAccessToken(userId))
    ? userId
    : (process.env.GMAIL_SYSTEM_USER_ID ?? userId);
  const accessToken = await getAccessToken(sendAsUserId);
  if (!accessToken) return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });

  // Find threading data from the most recent inbound message for this negotiation
  const [threadSource] = await sql`
    SELECT gmail_thread_id, gmail_message_id FROM negotiation_messages
    WHERE negotiation_id = ${msg.negotiation_id} AND direction = 'inbound'
      AND gmail_thread_id IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `;

  let sent = false;
  try {
    const subject = `Re: Negotiation - ${msg.address}`;
    const fromAddress = msg.alias_email || process.env.GMAIL_SALES_ADDRESS;
    const replyTo = msg.alias_email ?? undefined;
    sent = await sendGmailLib(
      sendAsUserId,
      msg.counterparty_email,
      subject,
      msg.content,
      fromAddress ?? undefined,
      replyTo,
      undefined,
      threadSource?.gmail_thread_id ?? undefined,
      threadSource?.gmail_message_id ?? undefined,
    );
  } catch {
    sent = false;
  }

  if (sent) {
    await sql`UPDATE negotiation_messages SET sent_at = NOW() WHERE id = ${messageId}`;

    if (msg.gmail_copy_enabled && isCounterProAlias(msg.counterparty_email)) {
      try {
        await sendNegotiationActivityCopyEmail({
          clerkUserId: userId,
          negotiationId: msg.negotiation_id,
          address: msg.address,
          direction: "sent",
          message: msg.content,
          counterpartyLabel: msg.counterparty_email,
        });
      } catch (err) {
        console.error("[negotiate-suite] Failed to send Gmail copy email on resend:", err);
      }
    }
  }

  return NextResponse.json({ ok: true, sent });
}

// Delete a failed outbound message (approved=true, sent_at IS NULL)
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const { messageId } = await req.json();

  const [row] = await sql`
    DELETE FROM negotiation_messages
    USING negotiations
    WHERE negotiation_messages.id = ${messageId}
      AND negotiation_messages.negotiation_id = negotiations.id
      AND negotiation_messages.direction IN ('outbound', 'proactive')
      AND negotiation_messages.approved = true
      AND negotiation_messages.sent_at IS NULL
      AND negotiations.clerk_user_id = ${userId}
    RETURNING negotiation_messages.id
  `;
  if (!row) return NextResponse.json({ error: "Not found or already sent" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
