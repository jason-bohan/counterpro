import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserPlan } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(userId);
  if (!plan?.stripe_customer_id) {
    if (plan?.plan === "single") {
      return NextResponse.json({ error: "One-time purchases don't have a subscription portal" }, { status: 400 });
    }
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: plan.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
