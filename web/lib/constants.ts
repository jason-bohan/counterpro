// ── AI ─────────────────────────────────────────────────────────────────────
export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const SUITE_MAX_TOKENS = 800;
export const DEAL_MAX_TOKENS = 2500;

// ── Plans ──────────────────────────────────────────────────────────────────
export const PLAN = {
  FREE: "free",
  SINGLE: "single",
  SUBSCRIPTION: "subscription",
  SUITE: "suite",
} as const;

export type PlanType = typeof PLAN[keyof typeof PLAN];

// ── Email / aliases ────────────────────────────────────────────────────────
export const ALIAS_DOMAIN = "counterproai.com";
export const ALIAS_PREFIX = "sales+neg";

export function generateAliasEmail(negotiationId: number): string {
  return `${ALIAS_PREFIX}${negotiationId}@${ALIAS_DOMAIN}`;
}

// ── Subscription ───────────────────────────────────────────────────────────
export function nextMonthEnd(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}
