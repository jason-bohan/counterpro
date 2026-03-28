import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";
import { getGmailToken, sendGmail as sendGmailLib } from "@/lib/gmail";

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

  // Build conversation history for Claude
  const history = messages.map((m: any) =>
    `[${m.direction === "inbound" ? "COUNTERPARTY" : "YOU"}]: ${m.content}`
  ).join("\n\n");

  const prompt = `Property: ${neg.address}

Negotiation history so far:
${history || "(No prior messages)"}

New message from counterparty:
${newMessage}

Draft my response:`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: SUITE_SYSTEM,
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

  const { messageId, approved, editedDraft } = await req.json();

  // Verify ownership
  const [msg] = await sql`
    SELECT nm.*, n.clerk_user_id, n.counterparty_email, n.address, n.alias_email
    FROM negotiation_messages nm
    JOIN negotiations n ON n.id = nm.negotiation_id
    WHERE nm.id = ${messageId} AND n.clerk_user_id = ${userId}
  `;
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const finalText = editedDraft || msg.ai_draft;

  let sent = false;
  if (approved && msg.counterparty_email) {
    const gmailToken = await getGmailToken(userId);
    if (gmailToken) {
      try {
        const subject = `Re: Negotiation - ${msg.address}`;
        const fromAddress = msg.alias_email || process.env.GMAIL_SALES_ADDRESS;
        sent = await sendGmailLib(userId, msg.counterparty_email, subject, finalText, fromAddress ?? undefined);
      } catch {
        // Gmail failure must not block approval
        sent = false;
      }
    }
  }

  await sql`
    UPDATE negotiation_messages
    SET approved = true, ai_draft = ${finalText}, sent_at = NOW()
    WHERE id = ${messageId}
  `;

  // Save outbound message
  await sql`
    INSERT INTO negotiation_messages (negotiation_id, direction, content, approved, sent_at)
    VALUES (${msg.negotiation_id}, 'outbound', ${finalText}, true, NOW())
  `;

  return NextResponse.json({ ok: true, sent });
}
