import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { code } = await req.json();
  if (!code?.trim()) return NextResponse.json({ error: "No code provided" }, { status: 400 });

  const normalized = code.trim().toUpperCase();

  // Ensure tables exist
  await sql`
    CREATE TABLE IF NOT EXISTS promo_codes (
      code TEXT PRIMARY KEY,
      deals_granted INTEGER NOT NULL DEFAULT 1,
      uses_remaining INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      clerk_user_id TEXT NOT NULL,
      redeemed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(code, clerk_user_id)
    )
  `;

  // Check code exists and has uses left
  const codes = await sql`
    SELECT * FROM promo_codes WHERE code = ${normalized} AND uses_remaining > 0
  `;
  if (codes.length === 0) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }
  const promo = codes[0];

  // Check user hasn't already redeemed this code
  const prior = await sql`
    SELECT id FROM promo_redemptions WHERE code = ${normalized} AND clerk_user_id = ${userId}
  `;
  if (prior.length > 0) {
    return NextResponse.json({ error: "You've already used this code" }, { status: 400 });
  }

  // Apply credits and record redemption in a transaction-like sequence
  await sql`
    INSERT INTO user_plans (clerk_user_id, plan, deals_remaining)
    VALUES (${userId}, 'single', ${promo.deals_granted})
    ON CONFLICT (clerk_user_id) DO UPDATE
    SET deals_remaining = user_plans.deals_remaining + ${promo.deals_granted},
        plan = CASE WHEN user_plans.plan = 'free' THEN 'single' ELSE user_plans.plan END,
        updated_at = NOW()
  `;
  await sql`UPDATE promo_codes SET uses_remaining = uses_remaining - 1 WHERE code = ${normalized}`;
  await sql`INSERT INTO promo_redemptions (code, clerk_user_id) VALUES (${normalized}, ${userId})`;

  return NextResponse.json({ ok: true, deals_granted: promo.deals_granted });
}
