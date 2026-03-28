import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase } from "@/lib/db";
import { getGmailToken, refreshGmailToken } from "@/lib/gmail";
import { sendDraftReadyEmail, getClerkUserEmail } from "@/lib/notify";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUITE_SYSTEM = `You are CounterPro, an expert real estate negotiation coach.
You are helping a user manage an ongoing negotiation thread.
Given the full conversation history and the latest message from the counterparty,
draft the ideal response for the user to send.

Rules:
- Be strategic, professional, and firm but not aggressive
- Reference prior messages and any concessions already made
- Keep responses concise — real estate emails are short
- Use specific numbers, not ranges
- End with a clear next step or deadline
- Do NOT include a subject line — just the email body`;

// Strip HTML tags for plain-text fallback
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Decode a Gmail message part body (base64url)
function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

// Recursively find a part by mimeType
function findPart(
  payload: GmailMessagePayload,
  mimeType: string
): GmailMessagePart | null {
  if (payload.mimeType === mimeType && payload.body?.data) {
    return payload as GmailMessagePart;
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findPart(part, mimeType);
      if (found) return found;
    }
  }
  return null;
}

type GmailMessagePart = {
  mimeType: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
  headers?: Array<{ name: string; value: string }>;
};

type GmailMessagePayload = GmailMessagePart;

function extractBody(payload: GmailMessagePayload): string {
  // Prefer text/plain
  const plainPart = findPart(payload, "text/plain");
  if (plainPart?.body?.data) {
    return decodeBody(plainPart.body.data);
  }
  // Fall back to text/html
  const htmlPart = findPart(payload, "text/html");
  if (htmlPart?.body?.data) {
    return stripHtml(decodeBody(htmlPart.body.data));
  }
  // Top-level body
  if (payload.body?.data) {
    return decodeBody(payload.body.data);
  }
  return "";
}

function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string
): string {
  return (
    headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

async function getSystemAccessToken(): Promise<string | null> {
  const systemUserId = process.env.GMAIL_SYSTEM_USER_ID;
  if (!systemUserId) return null;

  let token = await getGmailToken(systemUserId);
  if (!token) return null;

  const needsRefresh =
    token.expires_at !== null && token.expires_at.getTime() - Date.now() < 5 * 60 * 1000;
  if (needsRefresh) {
    const refreshed = await refreshGmailToken(systemUserId);
    if (refreshed) return refreshed;
  }
  return token.access_token;
}

async function processNewMessages(historyId: string): Promise<void> {
  await setupDatabase();

  // Load last known historyId
  const [stateRow] = await sql`SELECT history_id FROM gmail_state WHERE id = 1`;
  const startHistoryId = stateRow?.history_id ?? historyId;

  const accessToken = await getSystemAccessToken();
  if (!accessToken) {
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

  // Update stored historyId to the latest one we received
  await sql`
    INSERT INTO gmail_state (id, history_id, updated_at)
    VALUES (1, ${historyId}, NOW())
    ON CONFLICT (id) DO UPDATE SET history_id = ${historyId}, updated_at = NOW()
  `;

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
  const headers: Array<{ name: string; value: string }> = msgData.payload?.headers ?? [];

  const toHeader = getHeader(headers, "To");
  const fromHeader = getHeader(headers, "From");
  const subjectHeader = getHeader(headers, "Subject");

  // Skip emails sent FROM our own aliases (to avoid loops)
  const salesDomain = "@counterproai.com";
  if (fromHeader.includes(salesDomain)) {
    return;
  }

  // Parse negotiation ID from To: header
  const aliasMatch = toHeader.match(/sales\+neg(\d+)@counterproai\.com/i);
  if (!aliasMatch) {
    return; // Not addressed to a negotiation alias
  }

  const negotiationId = parseInt(aliasMatch[1], 10);
  if (isNaN(negotiationId)) return;

  // Look up the negotiation
  const [neg] = await sql`SELECT * FROM negotiations WHERE id = ${negotiationId}`;
  if (!neg) {
    console.error(`[gmail-webhook] Negotiation ${negotiationId} not found`);
    return;
  }

  // Extract email body
  const body = extractBody(msgData.payload);
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

  const history = (messages as Array<{ direction: string; content: string }>)
    .map((m) =>
      `[${m.direction === "inbound" ? "COUNTERPARTY" : "YOU"}]: ${m.content}`
    )
    .join("\n\n");

  const prompt = `Property: ${neg.address}

Negotiation history so far:
${history || "(No prior messages)"}

New message from counterparty:
${body}

Draft my response:`;

  const aiMessage = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: SUITE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const draft =
    aiMessage.content[0].type === "text" ? aiMessage.content[0].text : "";

  // Save inbound message + draft
  await sql`
    INSERT INTO negotiation_messages (negotiation_id, direction, content, ai_draft)
    VALUES (${negotiationId}, 'inbound', ${body}, ${draft})
  `;

  await sql`UPDATE negotiations SET updated_at = NOW() WHERE id = ${negotiationId}`;

  // Notify user
  const userEmail = await getClerkUserEmail(neg.clerk_user_id);
  if (userEmail) {
    await sendDraftReadyEmail(userEmail, neg.address, negotiationId, draft);
  } else {
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
    return new NextResponse(null, { status: 200 });
  }

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
