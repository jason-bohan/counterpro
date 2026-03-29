import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase } from "@/lib/db";
import { PLAN, nextMonthEnd } from "@/lib/constants";

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

  await setupDatabase();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const clerkUserId = session.metadata?.clerk_user_id;
    const plan = session.metadata?.plan;
    const customerId = session.customer as string | null;

    if (!clerkUserId) return NextResponse.json({ ok: true });

    if (plan === PLAN.SUBSCRIPTION || plan === PLAN.SUITE) {
      const subEnd = nextMonthEnd().toISOString();
      await sql`
        INSERT INTO user_plans (clerk_user_id, plan, deals_remaining, subscription_end, stripe_customer_id, updated_at)
        VALUES (${clerkUserId}, ${plan}, 0, ${subEnd}, ${customerId}, NOW())
        ON CONFLICT (clerk_user_id) DO UPDATE
        SET plan = ${plan},
            subscription_end = ${subEnd},
            stripe_customer_id = COALESCE(${customerId}, user_plans.stripe_customer_id),
            updated_at = NOW()
      `;
    } else {
      // Single deal — one-time payment
      await sql`
        INSERT INTO user_plans (clerk_user_id, plan, deals_remaining, stripe_customer_id, updated_at)
        VALUES (${clerkUserId}, ${PLAN.SINGLE}, 1, ${customerId}, NOW())
        ON CONFLICT (clerk_user_id) DO UPDATE
        SET plan = ${PLAN.SINGLE},
            deals_remaining = user_plans.deals_remaining + 1,
            stripe_customer_id = COALESCE(${customerId}, user_plans.stripe_customer_id),
            updated_at = NOW()
      `;
    }
  }

  // Renew subscription on recurring billing
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    if (!customerId) return NextResponse.json({ ok: true });

    const subEnd = nextMonthEnd().toISOString();
    await sql`
      UPDATE user_plans
      SET subscription_end = ${subEnd}, updated_at = NOW()
      WHERE stripe_customer_id = ${customerId}
        AND plan IN (${PLAN.SUBSCRIPTION}, ${PLAN.SUITE})
    `;
  }

  // Downgrade when subscription is cancelled
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;
    if (!customerId) return NextResponse.json({ ok: true });

    await sql`
      UPDATE user_plans
      SET plan = ${PLAN.FREE}, subscription_end = NULL, updated_at = NOW()
      WHERE stripe_customer_id = ${customerId}
    `;
  }

  return NextResponse.json({ ok: true });
}
