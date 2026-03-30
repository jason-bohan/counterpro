import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Hoisted so they're accessible inside vi.mock factories
const { sqlUpdates, mockGetAccessToken, mockSendGmail, selectOverride } = vi.hoisted(() => {
  return {
    sqlUpdates: [] as Array<{ sentAt: unknown }>,
    mockGetAccessToken: vi.fn(),
    mockSendGmail: vi.fn(),
    // Set this to override what the SELECT query returns for a single test
    selectOverride: { value: null as object | null },
  };
});

const mockMsg = {
  id: 99,
  negotiation_id: 1,
  clerk_user_id: "user_test",
  counterparty_email: "buyer@example.com",
  address: "123 Main St",
  alias_email: null,
  ai_draft: "Dear buyer, we propose $295k.",
  approved: false,
  sent_at: null,
  direction: "inbound",
  content: "Make an offer",
};

vi.mock("@/lib/db", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings[0];
    if (q.includes("SELECT")) {
      const row = selectOverride.value ?? {
        id: 99,
        negotiation_id: 1,
        clerk_user_id: "user_test",
        counterparty_email: "buyer@example.com",
        address: "123 Main St",
        alias_email: null,
        ai_draft: "Dear buyer, we propose $295k.",
        approved: false,
        sent_at: null,
        direction: "inbound",
        content: "Make an offer",
      };
      selectOverride.value = null; // reset after use
      return Promise.resolve([row]);
    }
    if (q.includes("UPDATE negotiation_messages")) {
      // values: [finalText, sentAt, messageId]
      sqlUpdates.push({ sentAt: values[1] });
    }
    return Promise.resolve([]);
  },
  setupDatabase: vi.fn().mockResolvedValue(undefined),
  canUserRunSuite: vi.fn().mockResolvedValue(true),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "user_test" }),
}));

vi.mock("@/lib/gmail", () => ({
  getAccessToken: mockGetAccessToken,
  sendGmail: mockSendGmail,
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: vi.fn().mockResolvedValue({ content: [] }) };
  },
}));

import { PUT } from "../../app/api/negotiate-suite/route";

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/negotiate-suite", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("negotiate-suite PUT — sent_at", () => {
  beforeEach(() => {
    sqlUpdates.length = 0;
    mockGetAccessToken.mockReset();
    mockSendGmail.mockReset();
  });

  it("stamps sent_at when Gmail send succeeds", async () => {
    mockGetAccessToken.mockResolvedValue("token_abc");
    mockSendGmail.mockResolvedValue(true);

    const res = await PUT(makeRequest({ messageId: 99, approved: true, editedDraft: "" }));
    const json = await res.json();

    expect(json.sent).toBe(true);
    // sent_at should be the result of sql`NOW()` — a non-null Promise/object
    expect(sqlUpdates[0].sentAt).not.toBeNull();
  });

  it("leaves sent_at null when Gmail returns false", async () => {
    mockGetAccessToken.mockResolvedValue("token_abc");
    mockSendGmail.mockResolvedValue(false);

    const res = await PUT(makeRequest({ messageId: 99, approved: true, editedDraft: "" }));
    const json = await res.json();

    expect(json.sent).toBe(false);
    expect(sqlUpdates[0].sentAt).toBeNull();
  });

  it("leaves sent_at null when Gmail throws", async () => {
    mockGetAccessToken.mockResolvedValue("token_abc");
    mockSendGmail.mockRejectedValue(new Error("Gmail API error"));

    const res = await PUT(makeRequest({ messageId: 99, approved: true, editedDraft: "" }));
    const json = await res.json();

    expect(json.sent).toBe(false);
    expect(sqlUpdates[0].sentAt).toBeNull();
  });

  it("leaves sent_at null when no Gmail access token", async () => {
    mockGetAccessToken.mockResolvedValue(null);

    const res = await PUT(makeRequest({ messageId: 99, approved: true, editedDraft: "" }));
    const json = await res.json();

    expect(json.sent).toBe(false);
    expect(sqlUpdates[0].sentAt).toBeNull();
  });

  it("does not attempt Gmail send when no counterparty email", async () => {
    selectOverride.value = { ...mockMsg, counterparty_email: null };

    const res = await PUT(makeRequest({ messageId: 99, approved: true, editedDraft: "" }));
    const json = await res.json();

    expect(json.sent).toBe(false);
    expect(mockSendGmail).not.toHaveBeenCalled();
    expect(sqlUpdates[0].sentAt).toBeNull();
  });
});
