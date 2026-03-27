import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserDeals, getUserPlan } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [deals, plan] = await Promise.all([
    getUserDeals(userId),
    getUserPlan(userId),
  ]);

  return NextResponse.json({ deals, plan });
}
