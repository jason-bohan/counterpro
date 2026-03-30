import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await sql`SELECT * FROM deals WHERE id = ${id} AND clerk_user_id = ${userId}`;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deal: rows[0] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { archived } = await req.json();

  const [row] = await sql`
    UPDATE deals
    SET archived_at = ${archived ? sql`NOW()` : null}
    WHERE id = ${id} AND clerk_user_id = ${userId}
    RETURNING id
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // Only allow deleting archived deals
  const [row] = await sql`
    DELETE FROM deals
    WHERE id = ${id} AND clerk_user_id = ${userId} AND archived_at IS NOT NULL
    RETURNING id
  `;
  if (!row) return NextResponse.json({ error: "Not found or not archived" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
