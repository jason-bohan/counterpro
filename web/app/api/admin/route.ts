import { currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

async function isAdmin() {
  const user = await currentUser();
  if (!user) return false;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase());
  return user.emailAddresses.some(e => adminEmails.includes(e.emailAddress.toLowerCase()));
}

async function ensureTables() {
  await sql`CREATE TABLE IF NOT EXISTS promo_codes (
    code TEXT PRIMARY KEY,
    deals_granted INTEGER NOT NULL DEFAULT 1,
    uses_remaining INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS promo_redemptions (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL,
    clerk_user_id TEXT NOT NULL,
    redeemed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(code, clerk_user_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS waitlist (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS enterprise_inquiries (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT NOT NULL,
    agents TEXT,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
}

// GET — fetch all admin data
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await ensureTables();

  const [promoCodes, redemptions, inquiries, waitlist, recentPlans] = await Promise.all([
    sql`SELECT * FROM promo_codes ORDER BY created_at DESC`,
    sql`SELECT r.*, p.code as promo_code FROM promo_redemptions r JOIN promo_codes p ON r.code = p.code ORDER BY r.redeemed_at DESC LIMIT 50`,
    sql`SELECT * FROM enterprise_inquiries ORDER BY created_at DESC`,
    sql`SELECT * FROM waitlist ORDER BY created_at DESC`,
    sql`SELECT * FROM user_plans ORDER BY updated_at DESC LIMIT 50`,
  ]);

  return NextResponse.json({ promoCodes, redemptions, inquiries, waitlist, recentPlans });
}

// POST — create promo code
export async function POST(req: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, ...data } = await req.json();

  if (action === "create_promo") {
    const { code, deals_granted, max_uses } = data;
    if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });
    await sql`
      INSERT INTO promo_codes (code, deals_granted, uses_remaining)
      VALUES (${code.toUpperCase()}, ${deals_granted ?? 1}, ${max_uses ?? 1})
      ON CONFLICT (code) DO UPDATE SET
        deals_granted = ${deals_granted ?? 1},
        uses_remaining = ${max_uses ?? 1}
    `;
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_promo") {
    await sql`DELETE FROM promo_codes WHERE code = ${data.code}`;
    return NextResponse.json({ ok: true });
  }

  if (action === "lookup_user") {
    const plans = await sql`
      SELECT up.*, COUNT(d.id)::int as deal_count
      FROM user_plans up
      LEFT JOIN deals d ON d.clerk_user_id = up.clerk_user_id
      WHERE up.clerk_user_id = ${data.clerk_user_id}
      GROUP BY up.clerk_user_id, up.plan, up.deals_remaining, up.subscription_end, up.created_at, up.updated_at
    `;
    return NextResponse.json({ plan: plans[0] ?? null });
  }

  if (action === "grant_credits") {
    await sql`
      INSERT INTO user_plans (clerk_user_id, plan, deals_remaining)
      VALUES (${data.clerk_user_id}, 'single', ${data.credits})
      ON CONFLICT (clerk_user_id) DO UPDATE
      SET deals_remaining = user_plans.deals_remaining + ${data.credits},
          plan = CASE WHEN user_plans.plan = 'free' THEN 'single' ELSE user_plans.plan END,
          updated_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
