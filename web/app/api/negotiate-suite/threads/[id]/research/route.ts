import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase } from "@/lib/db";
import { buildMarketResearchPrompt } from "@/lib/email-pipeline";
import { CLAUDE_MODEL } from "@/lib/constants";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const { id } = await params;
  const [neg] = await sql`SELECT address, role FROM negotiations WHERE id = ${id} AND clerk_user_id = ${userId}`;
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prompt = buildMarketResearchPrompt(neg.address);

  let message;
  try {
    message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[research] Anthropic API error:", msg);
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 500 });
  }

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[research] No JSON in AI response:", text.slice(0, 300));
    return NextResponse.json({ error: "Could not estimate market value" }, { status: 500 });
  }

  try {
    const data = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      market_value_low: data.market_value_low,
      market_value_high: data.market_value_high,
      suggested_offer: data.suggested_offer,
      reasoning: data.reasoning,
    });
  } catch {
    return NextResponse.json({ error: "Could not estimate market value" }, { status: 500 });
  }
}
