import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/gmail";
import { sql } from "@/lib/db";

// POST — set up (or renew) Gmail push watch
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gmailUser = process.env.GMAIL_USER;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const topicName = process.env.GMAIL_PUBSUB_TOPIC;
  if (!gmailUser || !projectId || !topicName) {
    return NextResponse.json(
      { error: "GMAIL_USER, GOOGLE_CLOUD_PROJECT, and GMAIL_PUBSUB_TOPIC must be set" },
      { status: 500 }
    );
  }

  const accessToken = await getAccessToken(userId);
  if (!accessToken) {
    return NextResponse.json({ error: "No Gmail token found for user" }, { status: 400 });
  }

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/watch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName: `projects/${projectId}/topics/${topicName}`,
        labelIds: ["INBOX"],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[gmail-watch] watch failed", err);
    return NextResponse.json({ error: "Gmail watch failed", detail: err }, { status: 500 });
  }

  const data = await res.json();

  // Persist watch expiration so admin can see status
  const expiresAt = data.expiration ? new Date(Number(data.expiration)) : null;
  await sql`
    INSERT INTO gmail_state (id, history_id, watch_expiration, watch_email, updated_at)
    VALUES (1, ${data.historyId ?? null}, ${expiresAt?.toISOString() ?? null}, ${gmailUser}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      history_id = EXCLUDED.history_id,
      watch_expiration = EXCLUDED.watch_expiration,
      watch_email = EXCLUDED.watch_email,
      updated_at = NOW()
  `;

  return NextResponse.json({ ok: true, expiration: data.expiration, historyId: data.historyId });
}

// GET — return current watch expiration info
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = await getAccessToken(userId);
  if (!accessToken) {
    return NextResponse.json({ error: "No Gmail token found for user" }, { status: 400 });
  }

  // Fetch profile which contains the historyId; watch expiration isn't directly queryable
  // but we can return the current inbox historyId as a proxy
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/profile`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Gmail profile fetch failed" }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json({ emailAddress: data.emailAddress, historyId: data.historyId });
}
