import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";
import { getAccessToken, sendGmail as sendGmailLib } from "@/lib/gmail";
import { buildNegotiationPrompt, SUITE_SYSTEM_PROMPT, stripMarkdown } from "@/lib/email-pipeline";
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
  const plainText = stripMarkdown(finalText);

  let sent = false;
  if (approved && msg.counterparty_email) {
    const accessToken = await getAccessToken(userId);
    if (accessToken) {
      try {
        const subject = `Re: Negotiation - ${msg.address}`;
        const fromAddress = msg.alias_email || process.env.GMAIL_SALES_ADDRESS;
        const replyTo = msg.alias_email ?? undefined;
        sent = await sendGmailLib(userId, msg.counterparty_email, subject, plainText, fromAddress ?? undefined, replyTo);
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
