import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const { id } = await params;
  const negotiationId = parseInt(id, 10);
  if (isNaN(negotiationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Verify ownership
  const [neg] = await sql`SELECT id FROM negotiations WHERE id = ${negotiationId} AND clerk_user_id = ${userId}`;
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deadlines = await sql`
    SELECT id, label, due_date, completed
    FROM negotiation_deadlines
    WHERE negotiation_id = ${negotiationId}
    ORDER BY due_date ASC
  `;

  return NextResponse.json({ deadlines });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const { id } = await params;
  const negotiationId = parseInt(id, 10);
  if (isNaN(negotiationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Verify ownership
  const [neg] = await sql`SELECT id FROM negotiations WHERE id = ${negotiationId} AND clerk_user_id = ${userId}`;
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { label, due_date } = body;

  if (!label || typeof label !== "string" || label.trim() === "") {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  const parsedDate = new Date(due_date);
  if (!due_date || isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: "due_date must be a valid ISO date" }, { status: 400 });
  }

  const [deadline] = await sql`
    INSERT INTO negotiation_deadlines (negotiation_id, label, due_date)
    VALUES (${negotiationId}, ${label.trim()}, ${parsedDate.toISOString()})
    RETURNING id, label, due_date, completed
  `;

  return NextResponse.json(deadline, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const { id } = await params;
  const negotiationId = parseInt(id, 10);
  if (isNaN(negotiationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Verify ownership
  const [neg] = await sql`SELECT id FROM negotiations WHERE id = ${negotiationId} AND clerk_user_id = ${userId}`;
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { id: deadlineId, completed } = body;

  if (typeof deadlineId !== "number" || typeof completed !== "boolean") {
    return NextResponse.json({ error: "id (number) and completed (boolean) are required" }, { status: 400 });
  }

  const [updated] = await sql`
    UPDATE negotiation_deadlines
    SET completed = ${completed}
    WHERE id = ${deadlineId} AND negotiation_id = ${negotiationId}
    RETURNING id, label, due_date, completed
  `;

  if (!updated) return NextResponse.json({ error: "Deadline not found" }, { status: 404 });

  return NextResponse.json(updated);
}
