import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threads = await sql`
    SELECT n.*,
      (SELECT content FROM negotiation_messages WHERE negotiation_id = n.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM negotiation_messages WHERE negotiation_id = n.id AND approved = false AND direction = 'inbound') as pending_count
    FROM negotiations n
    WHERE n.clerk_user_id = ${userId}
    ORDER BY n.updated_at DESC
  `;

  return NextResponse.json({ threads });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { address, counterpartyEmail, dealId } = await req.json();

  const [thread] = await sql`
    INSERT INTO negotiations (clerk_user_id, deal_id, address, counterparty_email)
    VALUES (${userId}, ${dealId ?? null}, ${address}, ${counterpartyEmail ?? null})
    RETURNING id
  `;

  return NextResponse.json({ id: thread.id });
}
