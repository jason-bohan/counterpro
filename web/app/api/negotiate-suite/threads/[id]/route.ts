import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [neg] = await sql`SELECT * FROM negotiations WHERE id = ${id} AND clerk_user_id = ${userId}`;
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await sql`
    SELECT * FROM negotiation_messages
    WHERE negotiation_id = ${id}
    ORDER BY created_at ASC
  `;

  return NextResponse.json({ negotiation: neg, messages });
}
