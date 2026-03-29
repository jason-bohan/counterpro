import { NextResponse } from "next/server";
import { sql, setupDatabase } from "@/lib/db";
import { getAccessToken } from "@/lib/gmail";

// GET — called by Vercel cron every 6 days to renew the Gmail watch (expires every 7 days)
// Vercel cron config (add to vercel.json):
// {
//   "crons": [{ "path": "/api/cron/gmail-watch", "schedule": "0 0 */6 * *" }]
// }
export async function GET(req: Request) {
  // Verify this is coming from Vercel cron (or our own secret)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setupDatabase();

  const gmailUser = process.env.GMAIL_USER;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const topicName = process.env.GMAIL_PUBSUB_TOPIC;
  if (!gmailUser || !projectId || !topicName) {
    console.error("[cron/gmail-watch] Missing env vars");
    return NextResponse.json({ error: "Missing required env vars" }, { status: 500 });
  }

  // Use the system Gmail user ID stored via env
  const systemUserId = process.env.GMAIL_SYSTEM_USER_ID;
  if (!systemUserId) {
    console.error("[cron/gmail-watch] GMAIL_SYSTEM_USER_ID not set");
    return NextResponse.json({ error: "GMAIL_SYSTEM_USER_ID not set" }, { status: 500 });
  }

  const accessToken = await getAccessToken(systemUserId);
  if (!accessToken) {
    return NextResponse.json({ error: "No Gmail token found for system user" }, { status: 400 });
  }

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/watch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName: `projects/${projectId}/topics/${topicName}`,
      labelIds: ["INBOX"],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[cron/gmail-watch] watch renewal failed", err);
    return NextResponse.json({ error: "Watch renewal failed", detail: err }, { status: 500 });
  }

  const data = await res.json();
  console.log("[cron/gmail-watch] renewed, expiration:", data.expiration);

  // Update gmail_state with the new historyId baseline if we got one
  if (data.historyId) {
    await sql`
      INSERT INTO gmail_state (id, history_id, updated_at)
      VALUES (1, ${data.historyId}, NOW())
      ON CONFLICT (id) DO UPDATE SET history_id = ${data.historyId}, updated_at = NOW()
    `;
  }

  return NextResponse.json({ ok: true, expiration: data.expiration });
}
