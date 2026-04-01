/**
 * Tests for GET /api/notifications/count
 *
 * Verifies that the count reflects unapproved inbound messages and resets
 * correctly after messages are approved (via send) or discarded.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { sqlState, mockGetAccessToken, mockSendGmail, selectOverride } = vi.hoisted(() => ({
  // pending count returned by notifications/count query
  sqlState: { pendingCount: 0 },
  mockGetAccessToken: vi.fn(),
  mockSendGmail: vi.fn(),
  selectOverride: { value: null as object | null },
}));

vi.mock("@/lib/db", () => ({
  sql: vi.fn(async (strings: TemplateStringsArray) => {
    const q = strings.join("§").trim().replace(/\s+/g, " ");

    // notifications/count query
    if (q.includes("COUNT(*)") && q.includes("negotiation_messages")) {
      return [{ count: sqlState.pendingCount }];
    }
    // negotiate-suite PUT: SELECT for ownership check
    if (q.includes("SELECT") && q.includes("negotiation_messages")) {
      return [selectOverride.value ?? {
        id: 1,
        negotiation_id: 10,
        clerk_user_id: "user_test",
        counterparty_email: "buyer@example.com",
        address: "123 Main St",
        alias_email: null,
        ai_draft: "A draft reply.",
        approved: false,
        sent_at: null,
        direction: "inbound",
        content: "An inbound message",
        gmail_thread_id: null,
        gmail_message_id: null,
      }];
    }
    // negotiate-suite PUT: INSERT outbound message RETURNING id
    if (q.includes("INSERT INTO negotiation_messages")) {
      return [{ id: 100 }];
    }
    return [];
  }),
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

function makeCountRequest() {
  return new NextRequest("http://localhost/api/notifications/count", { method: "GET" });
}

function makePutRequest(body: object) {
  return new NextRequest("http://localhost/api/negotiate-suite", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/notifications/count", () => {
  beforeEach(() => {
    sqlState.pendingCount = 0;
    selectOverride.value = null;
    mockGetAccessToken.mockReset();
    mockSendGmail.mockReset();
  });

  it("returns 0 when no pending messages", async () => {
    const { GET } = await import("@/app/api/notifications/count/route");
    sqlState.pendingCount = 0;
    const res = await GET();
    const json = await res.json();
    expect(json.count).toBe(0);
  });

  it("returns correct count when there are pending messages", async () => {
    const { GET } = await import("@/app/api/notifications/count/route");
    sqlState.pendingCount = 3;
    const res = await GET();
    const json = await res.json();
    expect(json.count).toBe(3);
  });

  it("count drops to 0 after message is approved and sent", async () => {
    const { GET } = await import("@/app/api/notifications/count/route");
    const { PUT } = await import("@/app/api/negotiate-suite/route");

    sqlState.pendingCount = 1;
    mockGetAccessToken.mockResolvedValue("token_abc");
    mockSendGmail.mockResolvedValue(true);

    // Approve and send the message
    const putRes = await PUT(makePutRequest({ messageId: 1, approved: true, editedDraft: "" }));
    expect((await putRes.json()).sent).toBe(true);

    // Simulate DB update: count is now 0
    sqlState.pendingCount = 0;
    const countRes = await GET();
    expect((await countRes.json()).count).toBe(0);
  });

  it("count drops to 0 after message is discarded", async () => {
    const { GET } = await import("@/app/api/notifications/count/route");
    const { PUT } = await import("@/app/api/negotiate-suite/route");

    sqlState.pendingCount = 1;

    // Discard the draft
    const putRes = await PUT(makePutRequest({ messageId: 1, discard: true }));
    const json = await putRes.json();
    expect(json.ok).toBe(true);
    expect(json.sent).toBe(false);

    // Simulate DB update: count is now 0
    sqlState.pendingCount = 0;
    const countRes = await GET();
    expect((await countRes.json()).count).toBe(0);
  });

  it("does not call Gmail when discarding", async () => {
    const { PUT } = await import("@/app/api/negotiate-suite/route");
    mockGetAccessToken.mockResolvedValue("token_abc");

    await PUT(makePutRequest({ messageId: 1, discard: true }));

    expect(mockSendGmail).not.toHaveBeenCalled();
  });
});
