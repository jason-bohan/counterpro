import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";
import { buildDocumentBlobPath } from "@/lib/utils";
import { buildPropertyDetailsDocument, fetchRentcastPropertyContext, formatRentcastPropertyContext } from "@/lib/property-research";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const { id } = await params;
  const negotiationId = Number(id);
  if (!Number.isFinite(negotiationId)) {
    return NextResponse.json({ error: "Invalid negotiation id" }, { status: 400 });
  }

  const [neg] = await sql`
    SELECT id, address, clerk_user_id
    FROM negotiations
    WHERE id = ${negotiationId} AND clerk_user_id = ${userId}
  `;
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rentcastData = await fetchRentcastPropertyContext(neg.address);
  const propertyContext = formatRentcastPropertyContext(rentcastData);
  const propertyDoc = buildPropertyDetailsDocument(neg.address, rentcastData);
  const filename = `property-details-${new Date().toISOString().slice(0, 10)}.md`;
  const body = Buffer.from(propertyDoc, "utf8");
  const blobPath = buildDocumentBlobPath(userId, negotiationId, filename);
  const { url } = await put(blobPath, body, {
    access: "public",
    contentType: "text/markdown; charset=utf-8",
  });

  const [doc] = await sql`
    INSERT INTO negotiation_documents (negotiation_id, clerk_user_id, filename, blob_url, mime_type, size_bytes, direction, message_id)
    VALUES (${negotiationId}, ${userId}, ${filename}, ${url}, 'text/markdown', ${body.length}, 'received', null)
    RETURNING id, filename, blob_url, mime_type, size_bytes, direction, message_id, created_at
  `;

  await sql`
    UPDATE negotiations
    SET property_context = ${propertyContext || null}, updated_at = NOW()
    WHERE id = ${negotiationId}
  `;

  return NextResponse.json({
    ok: true,
    document: doc,
    property_context: propertyContext || null,
  });
}
