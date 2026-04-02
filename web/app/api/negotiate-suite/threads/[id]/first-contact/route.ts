import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, verifyNegotiationOwnership } from "@/lib/db";
import { buildFirstContactPrompt, SUITE_SYSTEM_PROMPT } from "@/lib/email-pipeline";
import { CLAUDE_MODEL, SUITE_MAX_TOKENS } from "@/lib/constants";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const { id } = await params;
  const negotiationId = parseInt(id, 10);
  if (isNaN(negotiationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  if (!await verifyNegotiationOwnership(userId, negotiationId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [neg] = await sql`SELECT address, role, alias_email, pairing_token FROM negotiations WHERE id = ${negotiationId}`;

  const body = await req.json();
  const { offerAmount, notes } = body;

  if (!offerAmount || typeof offerAmount !== "number" || offerAmount <= 0) {
    return NextResponse.json({ error: "offerAmount (positive number) is required" }, { status: 400 });
  }

  const pairUrl = neg.pairing_token
    ? `https://counterproai.com/pair?token=${neg.pairing_token}`
    : null;
  const prompt = buildFirstContactPrompt(neg.address, neg.role, offerAmount, notes, neg.alias_email, pairUrl);

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: SUITE_MAX_TOKENS,
    system: SUITE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const draft = message.content[0].type === "text" ? message.content[0].text : "";

  // Save as a pending inbound message so the existing approval flow handles it
  const [savedMsg] = await sql`
    INSERT INTO negotiation_messages (negotiation_id, direction, content, ai_draft)
    VALUES (${negotiationId}, 'inbound', '[First contact]', ${draft})
    RETURNING id
  `;

  await sql`UPDATE negotiations SET updated_at = NOW() WHERE id = ${negotiationId}`;

  return NextResponse.json({ draft, messageId: savedMsg.id }, { status: 201 });
}
