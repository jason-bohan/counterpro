import Stripe from "stripe";
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getUserPlan } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan, embedded } = await req.json();
  const validPlans = ["subscription", "single", "suite"];
  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId = plan === "subscription"
    ? process.env.STRIPE_SUBSCRIPTION_PRICE_ID!
    : plan === "suite"
    ? process.env.STRIPE_SUITE_PRICE_ID!
    : process.env.STRIPE_SINGLE_PRICE_ID!;

  try {
    // Reuse existing live Stripe customer if available, otherwise fall back to email
    const existingPlan = await getUserPlan(userId);
    const existingCustomerId = existingPlan?.stripe_customer_id;
    // Only reuse customer IDs that match the current mode (live vs test)
    const isLive = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live") || process.env.STRIPE_SECRET_KEY?.startsWith("rk_live");
    const customerIdValid = existingCustomerId &&
      (isLive ? existingCustomerId.startsWith("cus_") : true);

    const customerParam = customerIdValid
      ? { customer: existingCustomerId }
      : await (async () => {
          const user = await currentUser();
          const email = user?.emailAddresses?.[0]?.emailAddress;
          return email ? { customer_email: email } : {};
        })();

    const isSubscription = plan === "subscription" || plan === "suite";
    const baseParams = {
      mode: isSubscription ? "subscription" as const : "payment" as const,
      payment_method_types: ["card"] as ["card"],
      ...customerParam,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { clerk_user_id: userId, plan },
    };

    if (embedded) {
      const session = await stripe.checkout.sessions.create({
        ...baseParams,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ui_mode: "embedded" as any,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success`,
      });
      return NextResponse.json({ clientSecret: session.client_secret });
    }

    const session = await stripe.checkout.sessions.create({
      ...baseParams,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
