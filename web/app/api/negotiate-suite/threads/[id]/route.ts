import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const { id } = await params;
  const [neg] = await sql`SELECT * FROM negotiations WHERE id = ${id} AND clerk_user_id = ${userId}`;
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await sql`
    SELECT * FROM negotiation_messages
    WHERE negotiation_id = ${id}
    ORDER BY created_at ASC
  `;

  const deadlines = await sql`
    SELECT id, label, due_date, completed
    FROM negotiation_deadlines
    WHERE negotiation_id = ${id}
    ORDER BY due_date ASC
  `;

  return NextResponse.json({ negotiation: neg, messages, deadlines });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const { id } = await params;
  const negotiationId = parseInt(id, 10);
  if (isNaN(negotiationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Verify ownership
  const [neg] = await sql`SELECT id FROM negotiations WHERE id = ${negotiationId} AND clerk_user_id = ${userId}`;
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { status, counterparty_email, deadline_date, autonomous_mode, archived } = body;

  const validStatuses = ["active", "pending", "closed", "won", "lost"];
  if (status !== undefined && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
  }

  if (autonomous_mode !== undefined && typeof autonomous_mode !== "boolean") {
    return NextResponse.json({ error: "autonomous_mode must be a boolean" }, { status: 400 });
  }

  let parsedDeadline: string | null = null;
  if (deadline_date !== undefined) {
    const parsed = new Date(deadline_date);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "deadline_date must be a valid ISO date" }, { status: 400 });
    }
    parsedDeadline = parsed.toISOString();
  }

  const [updated] = await sql`
    UPDATE negotiations
    SET
      status = COALESCE(${status ?? null}, status),
      counterparty_email = COALESCE(${counterparty_email ?? null}, counterparty_email),
      deadline_date = COALESCE(${parsedDeadline}, deadline_date),
      autonomous_mode = COALESCE(${autonomous_mode !== undefined ? autonomous_mode : null}::boolean, autonomous_mode),
      archived_at = ${archived === true ? sql`NOW()` : archived === false ? null : sql`archived_at`},
      updated_at = NOW()
    WHERE id = ${negotiationId} AND clerk_user_id = ${userId}
    RETURNING id, status, counterparty_email, deadline_date, autonomous_mode, updated_at
  `;

  return NextResponse.json({ ok: true, negotiation: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const { id } = await params;
  const negotiationId = parseInt(id, 10);
  if (isNaN(negotiationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Only allow deleting archived negotiations
  const [row] = await sql`
    DELETE FROM negotiations
    WHERE id = ${negotiationId} AND clerk_user_id = ${userId} AND archived_at IS NOT NULL
    RETURNING id
  `;
  if (!row) return NextResponse.json({ error: "Not found or not archived" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
