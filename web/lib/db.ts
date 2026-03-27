import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

export async function setupDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_plans (
      clerk_user_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      deals_remaining INTEGER NOT NULL DEFAULT 0,
      subscription_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS deals (
      id SERIAL PRIMARY KEY,
      clerk_user_id TEXT NOT NULL,
      address TEXT NOT NULL,
      role TEXT NOT NULL,
      asking_price INTEGER,
      offer_amount INTEGER,
      result TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS deals_user_idx ON deals (clerk_user_id, created_at DESC)
  `;
}

export async function getUserPlan(clerkUserId: string) {
  const rows = await sql`
    SELECT * FROM user_plans WHERE clerk_user_id = ${clerkUserId}
  `;
  return rows[0] ?? null;
}

export async function getUserDeals(clerkUserId: string) {
  return sql`
    SELECT id, address, role, asking_price, offer_amount, created_at
    FROM deals
    WHERE clerk_user_id = ${clerkUserId}
    ORDER BY created_at DESC
    LIMIT 50
  `;
}

export async function saveDeal(
  clerkUserId: string,
  address: string,
  role: string,
  askingPrice: number,
  offerAmount: number,
  result: string
) {
  const rows = await sql`
    INSERT INTO deals (clerk_user_id, address, role, asking_price, offer_amount, result)
    VALUES (${clerkUserId}, ${address}, ${role}, ${askingPrice}, ${offerAmount}, ${result})
    RETURNING id
  `;
  return rows[0].id;
}

export async function canUserRunDeal(clerkUserId: string, email: string): Promise<{ allowed: boolean; reason: string }> {
  // Test account bypass
  const testEmails = (process.env.TEST_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase());
  if (testEmails.includes(email.toLowerCase())) {
    return { allowed: true, reason: "test" };
  }

  const plan = await getUserPlan(clerkUserId);

  if (!plan) return { allowed: false, reason: "no_plan" };
  if (plan.plan === "subscription") {
    if (!plan.subscription_end || new Date(plan.subscription_end) > new Date()) {
      return { allowed: true, reason: "subscription" };
    }
    return { allowed: false, reason: "subscription_expired" };
  }
  if (plan.plan === "single" && plan.deals_remaining > 0) {
    return { allowed: true, reason: "single_deal" };
  }

  return { allowed: false, reason: "no_credits" };
}

export async function decrementDealCredit(clerkUserId: string) {
  await sql`
    UPDATE user_plans
    SET deals_remaining = deals_remaining - 1, updated_at = NOW()
    WHERE clerk_user_id = ${clerkUserId} AND deals_remaining > 0
  `;
}
