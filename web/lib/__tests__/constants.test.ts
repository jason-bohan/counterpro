import { describe, it, expect } from "vitest";
import { generateAliasEmail, nextMonthEnd, PLAN, ALIAS_DOMAIN, ALIAS_PREFIX } from "../constants";

describe("generateAliasEmail", () => {
  it("generates the correct alias for a negotiation ID", () => {
    expect(generateAliasEmail(1)).toBe("sales+neg1@counterproai.com");
    expect(generateAliasEmail(42)).toBe("sales+neg42@counterproai.com");
    expect(generateAliasEmail(999)).toBe("sales+neg999@counterproai.com");
  });

  it("uses the exported domain and prefix constants", () => {
    expect(generateAliasEmail(7)).toBe(`${ALIAS_PREFIX}7@${ALIAS_DOMAIN}`);
  });
});

describe("nextMonthEnd", () => {
  it("returns a date roughly 1 month from now", () => {
    const result = nextMonthEnd();
    const now = new Date();
    const diffMs = result.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(27);
    expect(diffDays).toBeLessThan(32);
  });

  it("returns a new Date each call", () => {
    const a = nextMonthEnd();
    const b = nextMonthEnd();
    expect(a).not.toBe(b);
  });
});

describe("PLAN", () => {
  it("has all expected plan types", () => {
    expect(PLAN.FREE).toBe("free");
    expect(PLAN.SINGLE).toBe("single");
    expect(PLAN.SUBSCRIPTION).toBe("subscription");
    expect(PLAN.SUITE).toBe("suite");
  });
});
