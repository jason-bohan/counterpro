import Stripe from "stripe";
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? undefined;

  const { plan } = await req.json();
  const validPlans = ["subscription", "single", "suite"];
  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId = plan === "subscription"
    ? process.env.STRIPE_SUBSCRIPTION_PRICE_ID!
    : plan === "suite"
    ? process.env.STRIPE_SUITE_PRICE_ID!
    : process.env.STRIPE_SINGLE_PRICE_ID!;

  const session = await stripe.checkout.sessions.create({
    mode: plan === "subscription" || plan === "suite" ? "subscription" : "payment",
    payment_method_types: ["card"],
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { clerk_user_id: userId, plan },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
  });

  return NextResponse.json({ url: session.url });
}
