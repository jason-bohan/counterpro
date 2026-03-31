import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ count: 0 });

  const [row] = await sql`
    SELECT COUNT(*)::int AS count
    FROM negotiation_messages nm
    JOIN negotiations n ON n.id = nm.negotiation_id
    WHERE n.clerk_user_id = ${userId}
      AND nm.direction = 'inbound'
      AND nm.approved = false
      AND n.archived_at IS NULL
  `;

  return NextResponse.json({ count: row?.count ?? 0 });
}
