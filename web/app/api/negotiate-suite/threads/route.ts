import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";
import { generateAliasEmail } from "@/lib/constants";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const threads = await sql`
    SELECT n.*,
      (SELECT content FROM negotiation_messages WHERE negotiation_id = n.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM negotiation_messages WHERE negotiation_id = n.id AND approved = false AND direction = 'inbound') as pending_count
    FROM negotiations n
    WHERE n.clerk_user_id = ${userId}
    AND n.archived_at IS NULL
    ORDER BY n.updated_at DESC
  `;

  return NextResponse.json({ threads });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const { address, counterpartyEmail, dealId, role } = await req.json();
  const normalizedCounterpartyEmail =
    typeof counterpartyEmail === "string" && counterpartyEmail.trim() !== ""
      ? counterpartyEmail.trim().toLowerCase()
      : null;

  if (!address || typeof address !== "string" || address.trim() === "") {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const validRoles = ["buyer", "seller"];
  const resolvedRole = validRoles.includes(role) ? role : "buyer";

  const [thread] = await sql`
    INSERT INTO negotiations (clerk_user_id, deal_id, address, counterparty_email, role)
    VALUES (${userId}, ${dealId ?? null}, ${address.trim()}, ${normalizedCounterpartyEmail}, ${resolvedRole})
    RETURNING id
  `;

  const aliasEmail = generateAliasEmail(thread.id);
  const { randomBytes } = await import("crypto");
  const pairingToken = randomBytes(18).toString("base64url");
  await sql`
    UPDATE negotiations SET alias_email = ${aliasEmail}, pairing_token = ${pairingToken} WHERE id = ${thread.id}
  `;

  return NextResponse.json({ id: thread.id, alias_email: aliasEmail });
}
