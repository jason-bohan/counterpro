import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";
import { buildProactivePrompt, SUITE_SYSTEM_PROMPT } from "@/lib/email-pipeline";
import { CLAUDE_MODEL, SUITE_MAX_TOKENS } from "@/lib/constants";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  // Handle FormData for file attachments
  const formData = await req.formData();
  const negotiationId = formData.get("negotiationId") as string;
  const message = formData.get("message") as string;
  const attachment = formData.get("attachment") as File | null;

  // Fetch negotiation + message history
  const [neg] = await sql`SELECT * FROM negotiations WHERE id = ${negotiationId} AND clerk_user_id = ${userId}`;
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await sql`
    SELECT direction, content FROM negotiation_messages
    WHERE negotiation_id = ${negotiationId}
    ORDER BY created_at ASC
  `;

  const prompt = buildProactivePrompt(
    neg.address,
    messages as Array<{ direction: string; content: string }>,
    message
  );

  const claudeMessage = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: SUITE_MAX_TOKENS,
    system: SUITE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const draft = claudeMessage.content[0].type === "text" ? claudeMessage.content[0].text : "";

  // Save proactive message + draft as outbound (from user's perspective)
  const [savedMsg] = await sql`
    INSERT INTO negotiation_messages (negotiation_id, direction, content, ai_draft)
    VALUES (${negotiationId}, 'outbound', ${message}, ${draft})
    RETURNING id
  `;

  // Handle attachment if provided
  if (attachment) {
    try {
      // For now, we'll store the attachment info in the message content
      // In a full implementation, you'd upload to blob storage here
      const attachmentInfo = `[Attachment: ${attachment.name} (${attachment.size} bytes, ${attachment.type})]`;
      await sql`
        UPDATE negotiation_messages 
        SET content = ${message + '\n\n' + attachmentInfo}
        WHERE id = ${savedMsg.id}
      `;
    } catch (error) {
      console.error("Failed to process attachment:", error);
      // Continue without attachment - don't fail the whole request
    }
  }

  await sql`UPDATE negotiations SET updated_at = NOW() WHERE id = ${negotiationId}`;

  return NextResponse.json({ draft, messageId: savedMsg.id });
}
