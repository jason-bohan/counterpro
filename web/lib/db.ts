import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

/** Run a single migration step. Logs and continues on failure so one bad
 *  migration can never take down every API route. */
async function m(label: string, query: Promise<unknown>) {
  try {
    await query;
  } catch (e: unknown) {
    // Duplicate-object errors (42P07 index already exists, 42701 column
    // already exists) are harmless — log at debug level only.
    const code = (e as { code?: string }).code;
    if (code === "42P07" || code === "42701") return;
    console.error(`[setupDatabase] migration "${label}" failed:`, e);
  }
}

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

  await sql`
    CREATE TABLE IF NOT EXISTS negotiations (
      id SERIAL PRIMARY KEY,
      clerk_user_id TEXT NOT NULL,
      deal_id INTEGER,
      address TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'buyer',
      counterparty_email TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      deadline_date TIMESTAMPTZ,
      contingencies JSONB DEFAULT '[]',
      gmail_token TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Add columns that may be missing from tables created before schema updates
  await m("negotiations.role", sql`ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'buyer'`);
  await m("negotiations.status", sql`ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
  await m("negotiations.deadline_date", sql`ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS deadline_date TIMESTAMPTZ`);
  await m("negotiations.contingencies", sql`ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS contingencies JSONB DEFAULT '[]'`);
  await m("negotiations.updated_at", sql`ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  await m("negotiations.alias_email", sql`ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS alias_email TEXT`);
  await m("negotiations.autonomous_mode", sql`ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS autonomous_mode BOOLEAN NOT NULL DEFAULT FALSE`);

  await sql`
    CREATE TABLE IF NOT EXISTS negotiation_messages (
      id SERIAL PRIMARY KEY,
      negotiation_id INTEGER NOT NULL REFERENCES negotiations(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      content TEXT NOT NULL,
      ai_draft TEXT,
      approved BOOLEAN DEFAULT FALSE,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS negotiation_deadlines (
      id SERIAL PRIMARY KEY,
      negotiation_id INTEGER NOT NULL REFERENCES negotiations(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      due_date TIMESTAMPTZ NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_gmail_tokens (
      clerk_user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS gmail_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      history_id TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await m("deals.archived_at", sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  await m("negotiations.archived_at", sql`ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);

  await m("user_plans.stripe_customer_id", sql`ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);

  await m("gmail_state.watch_expiration", sql`ALTER TABLE gmail_state ADD COLUMN IF NOT EXISTS watch_expiration TIMESTAMPTZ`);
  await m("gmail_state.watch_email", sql`ALTER TABLE gmail_state ADD COLUMN IF NOT EXISTS watch_email TEXT`);

  await m("negotiation_messages.gmail_thread_id", sql`ALTER TABLE negotiation_messages ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT`);
  await m("negotiation_messages.gmail_message_id", sql`ALTER TABLE negotiation_messages ADD COLUMN IF NOT EXISTS gmail_message_id TEXT`);

  await sql`
    CREATE TABLE IF NOT EXISTS negotiation_documents (
      id SERIAL PRIMARY KEY,
      negotiation_id INTEGER NOT NULL REFERENCES negotiations(id) ON DELETE CASCADE,
      clerk_user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      blob_url TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER,
      direction TEXT NOT NULL DEFAULT 'sent' CHECK (direction IN ('sent', 'received')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await m("docs_neg_idx", sql`CREATE INDEX IF NOT EXISTS docs_neg_idx ON negotiation_documents (negotiation_id, created_at DESC)`);
  await m("negotiation_documents.message_id", sql`ALTER TABLE negotiation_documents ADD COLUMN IF NOT EXISTS message_id INTEGER REFERENCES negotiation_messages(id) ON DELETE SET NULL`);
  await m("docs_msg_idx", sql`CREATE INDEX IF NOT EXISTS docs_msg_idx ON negotiation_documents (message_id) WHERE message_id IS NOT NULL`);
  // Deduplicate existing rows before creating the unique index (keep highest id per gmail_message_id)
  await m("dedup_gmail_msg_id", sql`
    DELETE FROM negotiation_messages
    WHERE gmail_message_id IS NOT NULL
    AND id NOT IN (
      SELECT MAX(id) FROM negotiation_messages
      WHERE gmail_message_id IS NOT NULL
      GROUP BY gmail_message_id
    )
  `);
  // Prevent duplicate inbound messages from the same Gmail message ID
  await m("uq_gmail_msg_id", sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_msg_id ON negotiation_messages (gmail_message_id) WHERE gmail_message_id IS NOT NULL`);

  await sql`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id SERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      detail TEXT,
      status TEXT NOT NULL DEFAULT 'ok',
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Backfill alias_email for negotiations created before this column existed
  await m("backfill_alias_email", sql`
    UPDATE negotiations
    SET alias_email = 'sales+neg' || id::text || '@counterproai.com'
    WHERE alias_email IS NULL
  `);

  await m("negotiations.pairing_token", sql`ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS pairing_token TEXT`);
  await m("uq_pairing_token", sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_pairing_token ON negotiations (pairing_token) WHERE pairing_token IS NOT NULL`);
  // Backfill pairing tokens for existing negotiations
  await m("backfill_pairing_token", sql`
    UPDATE negotiations
    SET pairing_token = encode(gen_random_bytes(18), 'base64url')
    WHERE pairing_token IS NULL
  `);
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
    AND archived_at IS NULL
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

/** Returns the negotiation row if it exists and belongs to the user, otherwise null. */
export async function verifyNegotiationOwnership(
  userId: string,
  negotiationId: number
) {
  const rows = await sql`
    SELECT * FROM negotiations WHERE id = ${negotiationId} AND clerk_user_id = ${userId}
  `;
  return rows[0] ?? null;
}

export async function canUserRunSuite(userId: string): Promise<boolean> {
  // Test account bypass
  const testEmails = (process.env.TEST_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase());
  // We only have userId here, not email — check test bypass via a separate env var for user IDs
  const testUserIds = (process.env.TEST_USER_IDS ?? "").split(",").map(e => e.trim()).filter(Boolean);
  if (testUserIds.includes(userId)) return true;

  const plan = await getUserPlan(userId);
  if (!plan) return false;
  if (plan.plan === "suite") {
    // Check subscription not expired
    if (!plan.subscription_end || new Date(plan.subscription_end) > new Date()) {
      return true;
    }
    return false;
  }
  return false;
}
