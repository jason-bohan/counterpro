import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";
import { buildProactivePrompt, SUITE_SYSTEM_PROMPT } from "@/lib/email-pipeline";
import { CLAUDE_MODEL, SUITE_MAX_TOKENS } from "@/lib/constants";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    console.log("Proactive API: Starting request");
    
    const { userId } = await auth();
    if (!userId) {
      console.log("Proactive API: No userId found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Proactive API: User authenticated:", userId);
    await setupDatabase();

    const allowed = await canUserRunSuite(userId);
    if (!allowed) {
      console.log("Proactive API: User not allowed to run suite");
      return NextResponse.json({ error: "Suite plan required" }, { status: 403 });
    }

    console.log("Proactive API: User allowed, parsing FormData");
    // Handle FormData for file attachments
    const formData = await req.formData();
    const negotiationId = formData.get("negotiationId") as string;
    const message = formData.get("message") as string;
    const attachment = formData.get("attachment") as File | null;
    const skipAI = formData.get("skipAI") as string;

    console.log("Proactive API: Parsed data:", { negotiationId, message: message?.substring(0, 100), hasAttachment: !!attachment, skipAI });

    if (!negotiationId || !message) {
      console.log("Proactive API: Missing required fields");
      return NextResponse.json({ error: "Missing negotiationId or message" }, { status: 400 });
    }

    // Fetch negotiation + message history
    const [neg] = await sql`SELECT * FROM negotiations WHERE id = ${negotiationId} AND clerk_user_id = ${userId}`;
    if (!neg) {
      console.log("Proactive API: Negotiation not found");
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    console.log("Proactive API: Found negotiation:", neg.id);
  
    let draft = message; // Default: use original message
  
    // Only call AI if not skipping
    if (skipAI !== "true") {
      console.log("Proactive API: Calling Claude API for refinement");
      const messages = await sql`
        SELECT direction, content FROM negotiation_messages
        WHERE negotiation_id = ${negotiationId}
        ORDER BY created_at ASC
      `;

      console.log("Proactive API: Found messages:", messages.length);
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

      draft = claudeMessage.content[0].type === "text" ? claudeMessage.content[0].text : "";
      console.log("Proactive API: Claude response received, draft length:", draft.length);
    } else {
      console.log("Proactive API: Skipping AI refinement, using original message");
    }

    // Save proactive message + draft as proactive (its own category)
    const [savedMsg] = await sql`
      INSERT INTO negotiation_messages (negotiation_id, direction, content, ai_draft)
      VALUES (${negotiationId}, 'proactive', ${message}, ${draft})
      RETURNING id
    `;

    console.log("Proactive API: Message saved:", savedMsg.id);

    // Note: We don't handle attachment here - let the PUT route handle it properly
    // The attachment will be processed when the message is approved/sent via PUT
    if (attachment) {
      console.log("Proactive API: Attachment detected, will be processed by PUT route:", attachment.name);
    }

    await sql`UPDATE negotiations SET updated_at = NOW() WHERE id = ${negotiationId}`;

    console.log("Proactive API: Request completed successfully");
    // Return different response based on whether AI was used
    if (skipAI === "true") {
      return NextResponse.json({ messageId: savedMsg.id });
    } else {
      return NextResponse.json({ draft, messageId: savedMsg.id });
    }
  } catch (error) {
    console.error("Proactive API: Error occurred:", error);
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
