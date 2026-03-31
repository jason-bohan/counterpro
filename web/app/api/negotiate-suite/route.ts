import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";
import { getAccessToken, sendGmail as sendGmailLib, type GmailAttachment } from "@/lib/gmail";
import { put } from "@vercel/blob";
import { buildNegotiationPrompt, SUITE_SYSTEM_PROMPT, stripMarkdown, stripAiPreamble } from "@/lib/email-pipeline";
import { CLAUDE_MODEL, SUITE_MAX_TOKENS } from "@/lib/constants";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const { negotiationId, newMessage } = await req.json();

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
    newMessage
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

  // Verify ownership
  const [msg] = await sql`
    SELECT nm.*, n.clerk_user_id, n.counterparty_email, n.address, n.alias_email
    FROM negotiation_messages nm
    JOIN negotiations n ON n.id = nm.negotiation_id
    WHERE nm.id = ${messageId} AND n.clerk_user_id = ${userId}
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
        sent = await sendGmailLib(
          sendAsUserId,
          msg.counterparty_email,
          subject,
          plainText,
          fromAddress ?? undefined,
          replyTo,
          undefined,
          msg.gmail_thread_id ?? undefined,
          msg.gmail_message_id ?? undefined,
          attachment ? [attachment] : undefined,
        );
      } catch {
        // Gmail failure must not block approval
        sent = false;
      }
    }
  }

  await sql`
    UPDATE negotiation_messages
    SET approved = true, ai_draft = ${finalText}, sent_at = ${sent ? sql`NOW()` : null}
    WHERE id = ${messageId}
  `;

  // Save outbound message
  await sql`
    INSERT INTO negotiation_messages (negotiation_id, direction, content, approved, sent_at)
    VALUES (${msg.negotiation_id}, 'outbound', ${plainText}, true, ${sent ? sql`NOW()` : null})
  `;

  // Save attachment to Blob and record it so users can access sent documents later
  if (sent && attachment) {
    try {
      const blobPath = `documents/${userId}/${msg.negotiation_id}/${Date.now()}-${attachment.name}`;
      const { url } = await put(blobPath, attachment.data, {
        access: "public",
        contentType: attachment.mimeType,
      });
      await sql`
        INSERT INTO negotiation_documents (negotiation_id, clerk_user_id, filename, blob_url, mime_type, size_bytes, direction)
        VALUES (${msg.negotiation_id}, ${userId}, ${attachment.name}, ${url}, ${attachment.mimeType}, ${attachment.data.length}, 'sent')
      `;
    } catch (err) {
      // Document storage failure must not block the response
      console.error("[negotiate-suite] Failed to save document to blob:", err);
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
    SELECT nm.*, n.clerk_user_id, n.counterparty_email, n.address, n.alias_email
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
  }

  return NextResponse.json({ ok: true, sent });
}
