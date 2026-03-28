import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getGmailToken, refreshGmailToken } from "@/lib/gmail";

async function getAccessToken(userId: string): Promise<string | null> {
  let token = await getGmailToken(userId);
  if (!token) return null;
  const needsRefresh =
    token.expires_at !== null && token.expires_at.getTime() - Date.now() < 5 * 60 * 1000;
  if (needsRefresh) {
    const refreshed = await refreshGmailToken(userId);
    if (refreshed) return refreshed;
  }
  return token.access_token;
}

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
