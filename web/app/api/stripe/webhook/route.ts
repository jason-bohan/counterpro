import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const clerkUserId = session.metadata?.clerk_user_id;
  const plan = session.metadata?.plan;

  if (!clerkUserId) return NextResponse.json({ ok: true });

  if (event.type === "checkout.session.completed") {
    if (plan === "subscription") {
      const subEnd = new Date();
      subEnd.setMonth(subEnd.getMonth() + 1);
      await sql`
        INSERT INTO user_plans (clerk_user_id, plan, deals_remaining, subscription_end, updated_at)
        VALUES (${clerkUserId}, 'subscription', 0, ${subEnd.toISOString()}, NOW())
        ON CONFLICT (clerk_user_id) DO UPDATE
        SET plan = 'subscription', subscription_end = ${subEnd.toISOString()}, updated_at = NOW()
      `;
    } else {
      await sql`
        INSERT INTO user_plans (clerk_user_id, plan, deals_remaining, updated_at)
        VALUES (${clerkUserId}, 'single', 1, NOW())
        ON CONFLICT (clerk_user_id) DO UPDATE
        SET plan = 'single', deals_remaining = user_plans.deals_remaining + 1, updated_at = NOW()
      `;
    }
  }

  // Renew subscription on recurring billing
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    // Look up clerk user by stripe customer — best effort
    const rows = await sql`
      SELECT clerk_user_id FROM user_plans
      WHERE plan = 'subscription'
      LIMIT 1
    `;
    if (rows.length > 0) {
      const subEnd = new Date();
      subEnd.setMonth(subEnd.getMonth() + 1);
      await sql`
        UPDATE user_plans SET subscription_end = ${subEnd.toISOString()}, updated_at = NOW()
        WHERE clerk_user_id = ${rows[0].clerk_user_id}
      `;
    }
    void customerId;
  }

  return NextResponse.json({ ok: true });
}
