import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql, setupDatabase, canUserRunSuite } from "@/lib/db";
import { del } from "@vercel/blob";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setupDatabase();

  const allowed = await canUserRunSuite(userId);
  if (!allowed) return NextResponse.json({ error: "Suite plan required" }, { status: 403 });

  const { docId } = await params;
  const id = parseInt(docId, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [doc] = await sql`
    SELECT id, blob_url FROM negotiation_documents
    WHERE id = ${id} AND clerk_user_id = ${userId}
  `;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sql`DELETE FROM negotiation_documents WHERE id = ${id}`;

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM negotiation_documents
    WHERE blob_url = ${doc.blob_url}
  `;

  if ((count ?? 0) === 0) {
    try {
      await del(doc.blob_url);
    } catch {
      // Blob may already be gone — DB record is already removed
    }
  }

  return NextResponse.json({ ok: true, deleted_blob: (count ?? 0) === 0 });
}
