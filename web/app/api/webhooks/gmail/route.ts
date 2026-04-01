import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase } from "@/lib/db";
import { getAccessToken, sendGmail } from "@/lib/gmail";
import { sendDraftReadyEmail, sendAutonomousUpdateEmail, getClerkUser } from "@/lib/notify";
import { stripMarkdown, stripAiPreamble } from "@/lib/email-pipeline";
import Anthropic from "@anthropic-ai/sdk";
import { parseEmail, routeInboundEmail, buildNegotiationPrompt, extractAttachments, SUITE_SYSTEM_PROMPT, type GmailMessagePart } from "@/lib/email-pipeline";
import { put } from "@vercel/blob";
import { CLAUDE_MODEL, SUITE_MAX_TOKENS } from "@/lib/constants";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function wlog(event_type: string, detail: string, status: "ok" | "error" | "skip" = "ok", error?: string) {
  try {
    await sql`INSERT INTO webhook_logs (event_type, detail, status, error) VALUES (${event_type}, ${detail}, ${status}, ${error ?? null})`;
  } catch { /* never block on logging */ }
}

async function getSystemAccessToken(): Promise<string | null> {
  const systemUserId = process.env.GMAIL_SYSTEM_USER_ID;
  if (!systemUserId) return null;
  return getAccessToken(systemUserId);
}

export async function processNewMessages(historyId: string): Promise<void> {
  await setupDatabase();

  // Atomically advance the stored historyId only if the incoming one is newer.
  // If another concurrent request already processed this historyId, the UPDATE
  // matches no rows and we skip — preventing duplicate message processing.
  const [stateRow] = await sql`SELECT history_id FROM gmail_state WHERE id = 1`;
  const startHistoryId = stateRow?.history_id ?? historyId;

  const [advanced] = await sql`
    INSERT INTO gmail_state (id, history_id, updated_at)
    VALUES (1, ${historyId}, NOW())
    ON CONFLICT (id) DO UPDATE
      SET history_id = ${historyId}, updated_at = NOW()
      WHERE gmail_state.history_id < ${historyId}
    RETURNING history_id
  `;

  if (!advanced) {
    await wlog("history", `historyId=${historyId} already processed — skip`);
    return;
  }

  const accessToken = await getSystemAccessToken();
  if (!accessToken) {
    await wlog("process", "No system access token", "error");
    console.error("[gmail-webhook] No system access token");
    return;
  }

  // Fetch history since last known historyId
  const historyRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!historyRes.ok) {
    const errText = await historyRes.text();
    await wlog("history_fetch", `startHistoryId=${startHistoryId}`, "error", errText.slice(0, 300));
    console.error("[gmail-webhook] history fetch failed", errText);
    return;
  }

  const historyData = await historyRes.json();
  const historyItems: Array<{ messagesAdded?: Array<{ message: { id: string } }> }> =
    historyData.history ?? [];

  // Collect unique message IDs
  const messageIds = new Set<string>();
  for (const item of historyItems) {
    for (const added of item.messagesAdded ?? []) {
      messageIds.add(added.message.id);
    }
  }

  await wlog("history", `historyId=${historyId} found ${messageIds.size} new message(s)`);

  for (const msgId of messageIds) {
    try {
      await processSingleMessage(msgId, accessToken);
    } catch (err) {
      console.error(`[gmail-webhook] error processing message ${msgId}:`, err);
    }
  }
}

async function processSingleMessage(msgId: string, accessToken: string): Promise<void> {
  const msgRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!msgRes.ok) {
    console.error(`[gmail-webhook] failed to fetch message ${msgId}`, msgRes.status);
    return;
  }

  const msgData = await msgRes.json();
  const email = parseEmail(msgData.payload ?? {});
  const { to: toHeader, from: fromHeader, subject: subjectHeader, body } = email;
  const gmailThreadId: string | null = msgData.threadId ?? null;
  const gmailMessageId: string | null =
    (msgData.payload?.headers ?? []).find(
      (h: { name: string; value: string }) => h.name.toLowerCase() === "message-id"
    )?.value ?? null;

  const routing = routeInboundEmail(fromHeader, toHeader);

  if (routing.type === "loop" || routing.type === "unrelated") {
    return;
  }

  const { negotiationId } = routing;
  await wlog("message_match", `msgId=${msgId} neg=${negotiationId} from=${fromHeader} subject=${subjectHeader}`);

  // Look up the negotiation
  const [neg] = await sql`SELECT * FROM negotiations WHERE id = ${negotiationId}`;
  if (!neg) {
    await wlog("message_process", `neg=${negotiationId} not found`, "error");
    console.error(`[gmail-webhook] Negotiation ${negotiationId} not found`);
    return;
  }

  if (!body.trim()) {
    console.error(`[gmail-webhook] Empty body for message ${msgId}`);
    return;
  }

  // Get conversation history for AI
  const messages = await sql`
    SELECT direction, content FROM negotiation_messages
    WHERE negotiation_id = ${negotiationId}
    ORDER BY created_at ASC
  `;

  const prompt = buildNegotiationPrompt(
    neg.address,
    messages as Array<{ direction: string; content: string }>,
    body
  );

  const aiMessage = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: SUITE_MAX_TOKENS,
    system: SUITE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const draft =
    aiMessage.content[0].type === "text" ? aiMessage.content[0].text : "";

  // Save inbound message + draft. ON CONFLICT handles Gmail Pub/Sub re-deliveries.
  const [savedMsg] = await sql`
    INSERT INTO negotiation_messages (negotiation_id, direction, content, ai_draft, gmail_thread_id, gmail_message_id)
    VALUES (${negotiationId}, 'inbound', ${body}, ${draft}, ${gmailThreadId}, ${gmailMessageId})
    ON CONFLICT (gmail_message_id) DO NOTHING
    RETURNING id
  `;

  if (!savedMsg) {
    await wlog("process", `Message ${gmailMessageId} already saved — skipping duplicate`, "skip");
    return;
  }

  await sql`UPDATE negotiations SET updated_at = NOW() WHERE id = ${negotiationId}`;

  // Save any file attachments (images, PDFs, etc.) from the inbound email
  const attachmentParts = extractAttachments(msgData.payload ?? {});
  for (const att of attachmentParts) {
    try {
      const attRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${att.attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!attRes.ok) continue;
      const attData = await attRes.json() as { data?: string };
      if (!attData.data) continue;
      const buf = Buffer.from(attData.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      const blobPath = `documents/${neg.clerk_user_id}/${negotiationId}/${Date.now()}-${att.filename}`;
      const { url } = await put(blobPath, buf, { access: "public", contentType: att.mimeType });
      await sql`
        INSERT INTO negotiation_documents (negotiation_id, clerk_user_id, filename, blob_url, mime_type, size_bytes, direction, message_id)
        VALUES (${negotiationId}, ${neg.clerk_user_id}, ${att.filename}, ${url}, ${att.mimeType}, ${buf.length}, 'received', ${savedMsg.id})
      `;
      await wlog("attachment_saved", `neg=${negotiationId} file=${att.filename} size=${buf.length}`);
    } catch (err) {
      await wlog("attachment_error", `neg=${negotiationId} file=${att.filename}`, "error", String(err));
    }
  }

  // Autonomous mode: send immediately without user approval
  if (neg.autonomous_mode) {
    await wlog("autonomous", `neg=${negotiationId} — auto-sending draft`);
    const plainText = stripAiPreamble(stripMarkdown(draft));
    // Fall back to system account if the user hasn't connected their own Gmail
    const sendAsUserId = (await getAccessToken(neg.clerk_user_id))
      ? neg.clerk_user_id
      : (process.env.GMAIL_SYSTEM_USER_ID ?? neg.clerk_user_id);
    const sendToken = await getAccessToken(sendAsUserId);
    if (sendToken && neg.counterparty_email) {
      const subject = `Re: Negotiation - ${neg.address}`;
      const fromAddress = neg.alias_email || process.env.GMAIL_SALES_ADDRESS;
      const replyTo = neg.alias_email ?? undefined;
      const sent = await sendGmail(sendAsUserId, neg.counterparty_email, subject, plainText, fromAddress ?? undefined, replyTo, undefined, gmailThreadId ?? undefined, gmailMessageId ?? undefined);

      if (sent) {
        // Mark inbound as approved, save outbound
        await sql`
          UPDATE negotiation_messages
          SET approved = true, sent_at = NOW()
          WHERE id = ${savedMsg.id}
        `;
        await sql`
          INSERT INTO negotiation_messages (negotiation_id, direction, content, approved, sent_at)
          VALUES (${negotiationId}, 'outbound', ${plainText}, true, NOW())
        `;
        await wlog("autonomous_sent", `neg=${negotiationId} to=${neg.counterparty_email}`);
        const user = await getClerkUser(neg.clerk_user_id);
        if (user) {
          await sendAutonomousUpdateEmail(user.email, neg.address, negotiationId, plainText, user.firstName, neg.counterparty_email);
        }
        return;
      } else {
        await wlog("autonomous_send_failed", `neg=${negotiationId}`, "error");
      }
    } else {
      await wlog("autonomous_skip", `neg=${negotiationId} — no token or no counterparty email`, "error");
    }
  }

  // Notify user to review draft
  const user = await getClerkUser(neg.clerk_user_id);
  if (user) {
    await sendDraftReadyEmail(user.email, neg.address, negotiationId, draft, user.firstName, fromHeader);
    await wlog("draft_ready", `neg=${negotiationId} notified=${user.email}`);
  } else {
    await wlog("notify", `neg=${negotiationId} user=${neg.clerk_user_id} — could not find email`, "error");
    console.error(`[gmail-webhook] Could not find email for user ${neg.clerk_user_id}`);
  }
}

export async function POST(req: NextRequest) {
  // Verify secret token in URL
  const webhookSecret = process.env.GMAIL_WEBHOOK_SECRET;
  if (webhookSecret) {
    const token = req.nextUrl.searchParams.get("token");
    if (token !== webhookSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Always return 200 quickly — Pub/Sub retries on non-200
  let body: { message?: { data?: string }; subscription?: string };
  try {
    body = await req.json();
  } catch {
    await wlog("webhook_hit", "invalid JSON body", "error");
    return new NextResponse(null, { status: 200 });
  }

  await wlog("webhook_hit", `subscription=${body.subscription ?? "unknown"} hasData=${!!body.message?.data}`);

  // Decode the Pub/Sub message
  if (!body.message?.data) {
    return new NextResponse(null, { status: 200 });
  }

  let notification: { emailAddress?: string; historyId?: string | number };
  try {
    const decoded = Buffer.from(body.message.data, "base64").toString("utf8");
    notification = JSON.parse(decoded);
  } catch {
    console.error("[gmail-webhook] Failed to decode Pub/Sub message");
    return new NextResponse(null, { status: 200 });
  }

  const historyId = String(notification.historyId ?? "");
  if (!historyId) {
    return new NextResponse(null, { status: 200 });
  }

  // Process asynchronously so we return 200 immediately
  processNewMessages(historyId).catch(err => {
    console.error("[gmail-webhook] processNewMessages error:", err);
  });

  return new NextResponse(null, { status: 200 });
}
