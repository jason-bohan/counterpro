import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Verify the negotiation exists and is archived for this user
  const [negotiation] = await sql`
    SELECT id FROM negotiations
    WHERE id = ${id} 
    AND clerk_user_id = ${userId}
    AND archived_at IS NOT NULL
  `;

  if (!negotiation) {
    return NextResponse.json({ error: "Archived negotiation not found" }, { status: 404 });
  }

  // Get all messages for this archived negotiation
  const messages = await sql`
    SELECT id, direction, content, ai_draft, approved, sent_at, created_at
    FROM negotiation_messages
    WHERE negotiation_id = ${id}
    ORDER BY created_at ASC
  `;

  return NextResponse.json({ messages });
}
