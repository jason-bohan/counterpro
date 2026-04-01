import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const { id } = await params;
  const idNum = Number(id);
  if (isNaN(idNum)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Get the archived negotiation
  const [negotiation] = await sql`
    SELECT id, address, role, status, counterparty_email, created_at, archived_at
    FROM negotiations
    WHERE id = ${idNum} 
    AND clerk_user_id = ${userId}
    AND archived_at IS NOT NULL
  `;

  if (!negotiation) {
    return NextResponse.json({ error: "Archived negotiation not found" }, { status: 404 });
  }

  return NextResponse.json(negotiation);
}
