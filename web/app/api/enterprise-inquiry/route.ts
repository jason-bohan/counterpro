import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const { name, email, company, agents, message } = await req.json();

  if (!name || !email || !company) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Save to DB so no inquiries are lost
  await sql`
    CREATE TABLE IF NOT EXISTS enterprise_inquiries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT NOT NULL,
      agents TEXT,
      message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    INSERT INTO enterprise_inquiries (name, email, company, agents, message)
    VALUES (${name}, ${email}, ${company}, ${agents || null}, ${message || null})
  `;

  console.log("Enterprise inquiry received:", { name, email, company, agents });

  return NextResponse.json({ ok: true });
}
