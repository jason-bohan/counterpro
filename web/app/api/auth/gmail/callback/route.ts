import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { setupGmailTokensTable } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  // Decode clerk_user_id from state
  let clerkUserId: string;
  try {
    clerkUserId = Buffer.from(state, "base64").toString("utf-8");
  } catch {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const redirectUri = `${process.env.GOOGLE_REDIRECT_URI}/api/auth/gmail/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.json({ error: "Token exchange failed" }, { status: 500 });
  }

  const tokenData = await tokenRes.json();
  const accessToken: string = tokenData.access_token;
  const refreshToken: string | null = tokenData.refresh_token ?? null;
  const expiresIn: number = tokenData.expires_in ?? 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await setupGmailTokensTable();

  await sql`
    INSERT INTO user_gmail_tokens (clerk_user_id, access_token, refresh_token, expires_at, updated_at)
    VALUES (${clerkUserId}, ${accessToken}, ${refreshToken}, ${expiresAt.toISOString()}, NOW())
    ON CONFLICT (clerk_user_id) DO UPDATE
      SET access_token = EXCLUDED.access_token,
          refresh_token = COALESCE(EXCLUDED.refresh_token, user_gmail_tokens.refresh_token),
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
  `;

  return NextResponse.redirect(new URL("/negotiate", process.env.GOOGLE_REDIRECT_URI!));
}
