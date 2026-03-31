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

  if (!res.ok) {
    // invalid_grant means the refresh token was revoked or expired (e.g. app in Google "Testing" mode
    // causes refresh tokens to expire after 7 days). Clear the stale token so the user is prompted
    // to reconnect rather than silently failing on every send.
    const errData = await res.json().catch(() => ({}));
    if (errData.error === "invalid_grant") {
      console.warn(`[gmail] invalid_grant for user=${userId} — clearing stale token`);
      await sql`DELETE FROM user_gmail_tokens WHERE clerk_user_id = ${userId}`;
    }
    return null;
  }

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

export type GmailAttachment = {
  name: string;
  mimeType: string;
  data: Buffer;
};

export async function sendGmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
  from?: string,
  replyTo?: string,
  html?: string,
  threadId?: string,
  inReplyTo?: string,
  attachments?: GmailAttachment[]
): Promise<boolean> {
  const token = await getGmailToken(userId);
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

  const headers: string[] = [];
  if (from) headers.push(`From: ${from}`);
  headers.push(`To: ${to}`);
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }
  headers.push(`Subject: ${encodedSubject}`, `MIME-Version: 1.0`);

  const hasAttachments = attachments && attachments.length > 0;

  console.log("sendGmail: hasAttachments:", hasAttachments);
  if (hasAttachments) {
    console.log("sendGmail: attachments count:", attachments!.length);
    attachments!.forEach((att, i) => {
      console.log(`sendGmail: attachment ${i}:`, {
        name: att.name,
        mimeType: att.mimeType,
        dataSize: att.data.length
      });
    });
  }

  let bodySection: string;
  if (hasAttachments) {
    // multipart/mixed wraps the text body + each attachment
    const boundary = "boundary_mixed_cp";
    const textPart = [
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
    ].join("\r\n");
    const attachParts = attachments!.map(att => [
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.name}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${att.name}"`,
      ``,
      att.data.toString("base64").match(/.{1,76}/g)?.join("\r\n") || att.data.toString("base64"),
    ].join("\r\n")).join("\r\n");

    bodySection = [
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      textPart,
      attachParts,
      `--${boundary}--`,
    ].join("\r\n");
  } else if (html) {
    const boundary = "boundary_alt_cp";
    bodySection = [
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      html,
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    bodySection = [`Content-Type: text/plain; charset=utf-8`, ``, body].join("\r\n");
  }

  const raw = Buffer.from([...headers, "", bodySection].join("\r\n"), "utf8").toString("base64url");

  const sendPayload: Record<string, string> = { raw };
  if (threadId) sendPayload.threadId = threadId;

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sendPayload),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "(unreadable)");
    console.error(`[sendGmail] Gmail API error ${res.status} for user=${userId} to=${to}: ${errBody}`);
    return false;
  }

  return true;
}
