import { sql } from "@/lib/db";

export async function setupGmailTokensTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_gmail_tokens (
      clerk_user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function getGmailToken(userId: string): Promise<{ access_token: string; refresh_token: string | null; expires_at: Date | null } | null> {
  await setupGmailTokensTable();
  const rows = await sql`
    SELECT access_token, refresh_token, expires_at
    FROM user_gmail_tokens
    WHERE clerk_user_id = ${userId}
  `;
  if (!rows[0]) return null;
  return {
    access_token: rows[0].access_token,
    refresh_token: rows[0].refresh_token ?? null,
    expires_at: rows[0].expires_at ? new Date(rows[0].expires_at) : null,
  };
}

/** Get a valid access token for a user, refreshing automatically if needed. */
export async function getAccessToken(userId: string): Promise<string | null> {
  const token = await getGmailToken(userId);
  if (!token) return null;
  const needsRefresh =
    token.expires_at !== null && token.expires_at.getTime() - Date.now() < 5 * 60 * 1000;
  if (needsRefresh) {
    const refreshed = await refreshGmailToken(userId);
    if (refreshed) return refreshed;
  }
  return token.access_token;
}

export async function refreshGmailToken(userId: string): Promise<string | null> {
  const token = await getGmailToken(userId);
  if (!token?.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const newAccessToken: string = data.access_token;
  const expiresIn: number = data.expires_in ?? 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await sql`
    UPDATE user_gmail_tokens
    SET access_token = ${newAccessToken}, expires_at = ${expiresAt.toISOString()}, updated_at = NOW()
    WHERE clerk_user_id = ${userId}
  `;

  return newAccessToken;
}

export async function sendGmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
  from?: string,
  replyTo?: string
): Promise<boolean> {
  let token = await getGmailToken(userId);
  if (!token) {
    console.error(`[sendGmail] No Gmail token found for user=${userId}`);
    return false;
  }

  // Refresh if expired or within 5 minutes of expiry
  const needsRefresh =
    token.expires_at !== null && token.expires_at.getTime() - Date.now() < 5 * 60 * 1000;
  let accessToken = token.access_token;
  if (needsRefresh) {
    const refreshed = await refreshGmailToken(userId);
    if (refreshed) {
      accessToken = refreshed;
    }
  }

  // Encode subject for non-ASCII characters (RFC 2047)
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;

  const emailLines: string[] = [];
  if (from) {
    emailLines.push(`From: ${from}`);
  }
  emailLines.push(`To: ${to}`);
  if (replyTo) {
    emailLines.push(`Reply-To: ${replyTo}`);
  }
  emailLines.push(
    `Subject: ${encodedSubject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    body,
  );
  const raw = Buffer.from(emailLines.join("\r\n"), "utf8").toString("base64url");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "(unreadable)");
    console.error(`[sendGmail] Gmail API error ${res.status} for user=${userId} to=${to}: ${errBody}`);
    return false;
  }

  return true;
}
