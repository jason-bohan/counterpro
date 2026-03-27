import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // Ensure the waitlist table exists
  await sql`
    CREATE TABLE IF NOT EXISTS waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const { userId } = await auth();
  let email: string | null = null;

  if (userId) {
    const user = await currentUser();
    email = user?.emailAddresses[0]?.emailAddress ?? null;
  } else {
    const body = await req.json().catch(() => ({}));
    email = body.email ?? null;
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  await sql`
    INSERT INTO waitlist (email) VALUES (${email})
    ON CONFLICT (email) DO NOTHING
  `;

  return NextResponse.json({ ok: true });
}
