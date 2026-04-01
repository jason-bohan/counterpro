import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { CLAUDE_MODEL } from "@/lib/constants";

type StatusLevel = "ok" | "warn" | "error";

interface ApiCheck {
  name: string;
  status: StatusLevel;
  detail: string;
  hint?: string;
}

async function checkNeon(): Promise<ApiCheck> {
  try {
    await sql`SELECT 1`;
    return { name: "Neon (Database)", status: "ok", detail: "Connected successfully" };
  } catch (err) {
    return {
      name: "Neon (Database)",
      status: "error",
      detail: err instanceof Error ? err.message : "Connection failed",
      hint: "Check DATABASE_URL env var",
    };
  }
}

function checkEnvKey(
  name: string,
  envVar: string,
  options?: { prefix?: string; warnIfMissing?: boolean }
): ApiCheck {
  const val = process.env[envVar];
  if (!val) {
    return {
      name,
      status: options?.warnIfMissing ? "warn" : "error",
      detail: `${envVar} is not set`,
      hint: `Add ${envVar} to your environment variables`,
    };
  }
  if (options?.prefix && !val.startsWith(options.prefix)) {
    return {
      name,
      status: "warn",
      detail: `${envVar} set but unexpected format (expected prefix: ${options.prefix})`,
      hint: "Double-check you copied the right key",
    };
  }
  const prefix = val.slice(0, 8);
  return {
    name,
    status: "ok",
    detail: `${envVar} set (${prefix}…)`,
  };
}

async function checkAnthropicApi(): Promise<ApiCheck> {
  const base = checkEnvKey("Anthropic (Claude AI)", "ANTHROPIC_API_KEY", { prefix: "sk-ant-" });
  if (base.status !== "ok") return base;

  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
    });
    if (res.ok) {
      return { ...base, detail: `${base.detail} · API reachable` };
    }
    const err = await res.json().catch(() => ({}));
    return {
      name: "Anthropic (Claude AI)",
      status: "warn",
      detail: `Key set but API returned ${res.status}: ${err.error?.message ?? "unknown"}`,
    };
  } catch {
    return { ...base, detail: `${base.detail} · Could not reach API` };
  }
}

async function checkAnthropicModelRequest(): Promise<ApiCheck> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      name: "Anthropic model request",
      status: "warn",
      detail: "Skipped because ANTHROPIC_API_KEY is not set",
      hint: "Set ANTHROPIC_API_KEY to validate real Claude request health",
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply with OK" }],
      }),
    });

    if (res.ok) {
      return {
        name: "Anthropic model request",
        status: "ok",
        detail: `${CLAUDE_MODEL} test request succeeded`,
      };
    }

    const err = await res.json().catch(() => ({}));
    const message = err?.error?.message ?? "unknown error";
    const lowCredits =
      typeof message === "string" &&
      message.toLowerCase().includes("credit balance is too low");

    return {
      name: "Anthropic model request",
      status: lowCredits ? "error" : "warn",
      detail: `${CLAUDE_MODEL} request failed (${res.status}): ${message}`,
      hint: lowCredits ? "Anthropic billing or credits need attention before AI replies will work" : undefined,
    };
  } catch (err) {
    return {
      name: "Anthropic model request",
      status: "warn",
      detail: err instanceof Error ? err.message : "Request failed",
      hint: "The API key exists, but a real Claude request could not be completed",
    };
  }
}

async function checkStripe(): Promise<ApiCheck> {
  const base = checkEnvKey("Stripe (Payments)", "STRIPE_SECRET_KEY", { prefix: "sk_" });
  if (base.status !== "ok") return base;

  const isLive = process.env.STRIPE_SECRET_KEY!.startsWith("sk_live_");
  return {
    ...base,
    detail: `${base.detail} · Mode: ${isLive ? "live" : "test"}`,
    status: isLive ? "ok" : "warn",
    hint: isLive ? undefined : "Using Stripe test mode — switch to live key for production",
  };
}

function checkBlob(): ApiCheck {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return {
      name: "Vercel Blob (Documents)",
      status: "error",
      detail: "BLOB_READ_WRITE_TOKEN not set",
      hint: "Document attachments won't be saved — connect Blob store in Vercel dashboard",
    };
  }
  return {
    name: "Vercel Blob (Documents)",
    status: "ok",
    detail: `Token set (${token.slice(0, 16)}…)`,
  };
}

function checkGmail(): ApiCheck {
  const systemUserId = process.env.GMAIL_SYSTEM_USER_ID;
  const salesAddress = process.env.GMAIL_SALES_ADDRESS;
  if (!systemUserId && !salesAddress) {
    return {
      name: "Gmail (Negotiation Emails)",
      status: "warn",
      detail: "GMAIL_SYSTEM_USER_ID and GMAIL_SALES_ADDRESS not set",
      hint: "System Gmail fallback won't work — users must connect their own Gmail",
    };
  }
  const parts: string[] = [];
  if (systemUserId) parts.push(`system user: ${systemUserId.slice(0, 12)}…`);
  if (salesAddress) parts.push(`from: ${salesAddress}`);
  return {
    name: "Gmail (Negotiation Emails)",
    status: "ok",
    detail: parts.join(" · "),
  };
}

function checkClerk(): ApiCheck {
  const secret = process.env.CLERK_SECRET_KEY;
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!secret) {
    return { name: "Clerk (Auth)", status: "error", detail: "CLERK_SECRET_KEY not set" };
  }
  if (!publishable) {
    return { name: "Clerk (Auth)", status: "warn", detail: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY not set" };
  }
  const isLive = publishable.startsWith("pk_live_");
  return {
    name: "Clerk (Auth)",
    status: isLive ? "ok" : "warn",
    detail: `Keys set · Mode: ${isLive ? "live" : "development"}`,
    hint: isLive ? undefined : "Using Clerk development mode",
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Simple admin check — same pattern as /api/admin
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (adminIds.length > 0 && !adminIds.includes(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [neon, anthropicApi, anthropicModel, stripe] = await Promise.all([
    checkNeon(),
    checkAnthropicApi(),
    checkAnthropicModelRequest(),
    checkStripe(),
  ]);

  const checks: ApiCheck[] = [
    neon,
    anthropicApi,
    anthropicModel,
    stripe,
    checkClerk(),
    checkGmail(),
    checkBlob(),
    checkEnvKey("Rentcast (Property Data)", "RENTCAST_API_KEY", { warnIfMissing: true }),
  ];

  const summary = {
    ok: checks.filter(c => c.status === "ok").length,
    warn: checks.filter(c => c.status === "warn").length,
    error: checks.filter(c => c.status === "error").length,
  };

  return NextResponse.json({ checks, summary });
}
