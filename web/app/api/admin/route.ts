import { currentUser, clerkClient } from "@clerk/nextjs/server";
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

  const [promoCodes, redemptions, inquiries, waitlist, recentPlans, gmailStateRows, gmailTokenRows, webhookLogs] = await Promise.all([
    sql`SELECT * FROM promo_codes ORDER BY created_at DESC`,
    sql`SELECT r.*, p.code as promo_code FROM promo_redemptions r JOIN promo_codes p ON r.code = p.code ORDER BY r.redeemed_at DESC LIMIT 50`,
    sql`SELECT * FROM enterprise_inquiries ORDER BY created_at DESC`,
    sql`SELECT * FROM waitlist ORDER BY created_at DESC`,
    sql`SELECT * FROM user_plans ORDER BY updated_at DESC LIMIT 500`,
    sql`SELECT * FROM gmail_state WHERE id = 1`,
    sql`SELECT clerk_user_id, expires_at, updated_at FROM user_gmail_tokens LIMIT 10`,
    sql`SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 50`,
  ]);

  const gmailState = gmailStateRows[0] ?? null;

  // Look up emails for all paid users via Clerk
  const userIds = (recentPlans as Array<{ clerk_user_id: string }>).map(p => p.clerk_user_id);
  const userEmails: Record<string, string> = {};
  try {
    const client = await clerkClient();
    const users = await client.users.getUserList({ userId: userIds, limit: 500 });
    for (const u of users.data) {
      const email = u.emailAddresses?.[0]?.emailAddress;
      if (email) userEmails[u.id] = email;
    }
  } catch {
    // Non-fatal — admin page still works without emails
  }

  return NextResponse.json({ promoCodes, redemptions, inquiries, waitlist, recentPlans, gmailState, gmailTokens: gmailTokenRows, webhookLogs, userEmails });
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

  if (action === "grant_suite") {
    const trialDays = data.trial_days ? Number(data.trial_days) : null;
    const subEnd = trialDays
      ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
    await sql`
      INSERT INTO user_plans (clerk_user_id, plan, deals_remaining, subscription_end)
      VALUES (${data.clerk_user_id}, 'suite', 0, ${subEnd})
      ON CONFLICT (clerk_user_id) DO UPDATE
      SET plan = 'suite',
          subscription_end = ${subEnd},
          updated_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  }

  if (action === "simulate_inbound") {
    // Directly insert a fake inbound message and generate an AI draft
    const { negotiation_id, message_body } = data;
    if (!negotiation_id || !message_body) return NextResponse.json({ error: "negotiation_id and message_body required" }, { status: 400 });

    const [neg] = await sql`SELECT * FROM negotiations WHERE id = ${negotiation_id}`;
    if (!neg) return NextResponse.json({ error: "Negotiation not found" }, { status: 404 });

    const messages = await sql`SELECT direction, content FROM negotiation_messages WHERE negotiation_id = ${negotiation_id} ORDER BY created_at ASC`;
    const history = (messages as Array<{ direction: string; content: string }>)
      .map(m => `[${m.direction === "inbound" ? "COUNTERPARTY" : "YOU"}]: ${m.content}`)
      .join("\n\n");

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const aiMsg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: `You are CounterPro, an expert real estate negotiation coach. Draft the ideal response for the user. Be strategic, professional, and concise. Use specific numbers. End with a clear next step. Do NOT include a subject line.`,
      messages: [{ role: "user", content: `Property: ${neg.address}\n\nHistory:\n${history || "(none)"}\n\nNew message:\n${message_body}\n\nDraft my response:` }],
    });
    const draft = aiMsg.content[0].type === "text" ? aiMsg.content[0].text : "";

    await sql`INSERT INTO negotiation_messages (negotiation_id, direction, content, ai_draft) VALUES (${negotiation_id}, 'inbound', ${message_body}, ${draft})`;
    await sql`UPDATE negotiations SET updated_at = NOW() WHERE id = ${negotiation_id}`;
    await sql`INSERT INTO webhook_logs (event_type, detail, status) VALUES ('simulate', ${'neg=' + negotiation_id}, 'ok')`;

    return NextResponse.json({ ok: true, draft });
  }

  if (action === "gmail_watch_stop") {
    await sql`
      UPDATE gmail_state SET watch_expiration = NULL, updated_at = NOW() WHERE id = 1
    `;
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_gmail_token") {
    const { clerk_user_id } = data;
    if (!clerk_user_id) return NextResponse.json({ error: "clerk_user_id required" }, { status: 400 });
    await sql`DELETE FROM user_gmail_tokens WHERE clerk_user_id = ${clerk_user_id}`;
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
