import { setupDatabase } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.SETUP_SECRET !== "run") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await setupDatabase();
  return NextResponse.json({ ok: true, message: "Database tables created" });
}
