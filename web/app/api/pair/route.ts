import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";

// GET /api/pair?token=xxx — returns negotiation info for the pairing page (no auth required)
export async function GET(req: NextRequest) {
  await setupDatabase();

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const [neg] = await sql`
    SELECT id, address, role, alias_email, counterparty_email
    FROM negotiations
    WHERE pairing_token = ${token}
      AND archived_at IS NULL
  `;

  if (!neg) return NextResponse.json({ error: "Invalid or expired pairing link" }, { status: 404 });

  // "Paired" means counterparty_email is a CounterPro alias (set by the pairing flow),
  // not a manually-entered real email address.
  const alreadyPaired = typeof neg.counterparty_email === "string" &&
    neg.counterparty_email.toLowerCase().includes("@counterproai.com");

  // Fetch the first sent message so the counterparty sees context
  const [firstMsg] = await sql`
    SELECT content, ai_draft
    FROM negotiation_messages
    WHERE negotiation_id = ${neg.id}
    ORDER BY created_at ASC
    LIMIT 1
  `;
  const rawPreview = firstMsg
    ? (firstMsg.content === "[First contact]" ? firstMsg.ai_draft : firstMsg.content) ?? null
    : null;
  // Strip the CounterPro footer (everything from "---" onward)
  const previewMessage = rawPreview
    ? rawPreview.replace(/\n---\n[\s\S]*$/, "").trim()
    : null;

  return NextResponse.json({
    negotiationId: neg.id,
    address: neg.address,
    role: neg.role,
    alreadyPaired,
    previewMessage,
  });
}

// POST /api/pair — links two negotiations together (auth required)
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const { token, myNegotiationId } = await req.json();
  if (!token || !myNegotiationId) {
    return NextResponse.json({ error: "token and myNegotiationId required" }, { status: 400 });
  }

  // Look up the initiator's negotiation from the token
  const [theirs] = await sql`
    SELECT id, address, role, alias_email, clerk_user_id, counterparty_email
    FROM negotiations
    WHERE pairing_token = ${token}
      AND archived_at IS NULL
  `;
  if (!theirs) return NextResponse.json({ error: "Invalid or expired pairing link" }, { status: 404 });

  // Can't pair with yourself
  if (theirs.clerk_user_id === userId) {
    return NextResponse.json({ error: "You cannot pair a negotiation with yourself" }, { status: 400 });
  }

  // Verify the user owns their negotiation
  const [mine] = await sql`
    SELECT id, address, role, alias_email, counterparty_email
    FROM negotiations
    WHERE id = ${myNegotiationId}
      AND clerk_user_id = ${userId}
      AND archived_at IS NULL
  `;
  if (!mine) return NextResponse.json({ error: "Your negotiation not found" }, { status: 404 });

  if (!mine.alias_email || !theirs.alias_email) {
    return NextResponse.json({ error: "One or both negotiations is missing an alias email" }, { status: 400 });
  }

  // Link them — each negotiation's counterparty_email points to the other's alias
  await sql`
    UPDATE negotiations SET counterparty_email = ${theirs.alias_email}, updated_at = NOW()
    WHERE id = ${mine.id}
  `;
  await sql`
    UPDATE negotiations SET counterparty_email = ${mine.alias_email}, updated_at = NOW()
    WHERE id = ${theirs.id}
  `;

  return NextResponse.json({ ok: true, pairedAddress: theirs.address });
}
