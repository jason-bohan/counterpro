import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sql, setupDatabase } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const [deals, negotiations] = await Promise.all([
    sql`
      SELECT id, address, role, asking_price, offer_amount, created_at, archived_at
      FROM deals
      WHERE clerk_user_id = ${userId} AND archived_at IS NOT NULL
      ORDER BY archived_at DESC
    `,
    sql`
      SELECT id, address, role, status, counterparty_email, created_at, archived_at
      FROM negotiations
      WHERE clerk_user_id = ${userId} AND archived_at IS NOT NULL
      ORDER BY archived_at DESC
    `,
  ]);

  return NextResponse.json({ deals, negotiations });
}
