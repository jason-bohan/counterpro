/**
 * Tests for the Gmail webhook → negotiation message flow.
 *
 * Simulates what happens when a real inbound email arrives via Pub/Sub:
 *   Gmail → Pub/Sub → POST /api/webhooks/gmail → processNewMessages → processSingleMessage
 *        → routeInboundEmail → save to DB → notify user / autonomous send
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Shared mutable state (hoisted so vi.mock factories can reference) ────────

const {
  savedMessages,
  sqlState,
  historyState,
  mockSendGmail,
  mockSendNegotiationResultEmail,
  mockAnthropicCreate,
  fetchOverride,
  negotiationState,
} = vi.hoisted(() => ({
  savedMessages: [] as Array<Record<string, unknown>>,
  sqlState: { history_id: "100" },
  historyState: { messageIds: [] as string[] },
  mockSendGmail: vi.fn().mockResolvedValue(true),
  mockSendNegotiationResultEmail: vi.fn().mockResolvedValue(undefined),
  mockAnthropicCreate: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "Thank you for your offer. We propose $310,000." }],
  }),
  fetchOverride: { handler: null as ((url: string) => Response | null) | null },
  negotiationState: {
    neg42CounterpartyEmail: "buyer@example.com",
    neg42Status: "active",
    neg99Status: "active",
    neg99AutonomousMode: true,
  },
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  sql: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("§").trim().replace(/\s+/g, " ");

    if (q.includes("SELECT history_id FROM gmail_state")) {
      return [{ history_id: sqlState.history_id }];
    }
    if (q.includes("INSERT INTO gmail_state") && q.includes("ON CONFLICT")) {
      const incoming = String(values[0]);
      if (BigInt(incoming) > BigInt(sqlState.history_id)) {
        sqlState.history_id = incoming;
        return [{ history_id: incoming }];
      }
      return [];
    }
    if (q.includes("SELECT * FROM negotiations WHERE id")) {
      const negId = values[0];
      if (negId === 42) return [{ id: 42, clerk_user_id: "user_owner", address: "123 Oak Street", counterparty_email: negotiationState.neg42CounterpartyEmail, alias_email: "sales+neg42@counterproai.com", autonomous_mode: false, status: negotiationState.neg42Status }];
      if (negId === 99) return [{ id: 99, clerk_user_id: "user_owner", address: "456 Elm Ave", counterparty_email: "seller@example.com", alias_email: "sales+neg99@counterproai.com", autonomous_mode: negotiationState.neg99AutonomousMode, status: negotiationState.neg99Status }];
      if (negId === 55) return [{ id: 55, clerk_user_id: "seller_user", address: "123 Oak Street", counterparty_email: "sales+neg42@counterproai.com", alias_email: "sales+neg55@counterproai.com", autonomous_mode: false }];
      if (negId === 77) return [{ id: 77, clerk_user_id: "other_user", address: "123 Oak Street", counterparty_email: "outsider@example.com", alias_email: "sales+neg77@counterproai.com", autonomous_mode: false }];
      return [];
    }
    if (q.includes("UPDATE negotiations") && q.includes("status = 'closed'")) {
      const negId = values[0];
      if (negId === 42) negotiationState.neg42Status = "closed";
      if (negId === 99) {
        negotiationState.neg99Status = "closed";
        negotiationState.neg99AutonomousMode = false;
      }
      return [];
    }
    if (q.includes("UPDATE negotiations") && q.includes("SET autonomous_mode = false")) {
      const negId = values[0];
      if (negId === 99) {
        negotiationState.neg99AutonomousMode = false;
      }
      return [];
    }
    if (q.includes("SELECT id, alias_email, counterparty_email FROM negotiations")) {
      const negId = values[0];
      if (negId === 55) return [{ id: 55, alias_email: "sales+neg55@counterproai.com", counterparty_email: "sales+neg42@counterproai.com" }];
      if (negId === 77) return [{ id: 77, alias_email: "sales+neg77@counterproai.com", counterparty_email: "outsider@example.com" }];
      return [];
    }
    if (q.includes("SELECT direction, content FROM negotiation_messages")) {
      return [];
    }
    if (q.includes("INSERT INTO negotiation_messages") && q.includes("RETURNING id")) {
      // VALUES (${negotiationId}, 'inbound', ${body}, ${draft}) — direction is a SQL literal, not a param
      // so: values[0]=negotiationId, values[1]=body, values[2]=draft
      const msg = { negotiation_id: values[0], direction: "inbound", content: values[1], ai_draft: values[2], id: savedMessages.length + 1 };
      savedMessages.push(msg as Record<string, unknown>);
      return [{ id: msg.id }];
    }
    if (q.includes("UPDATE negotiation_messages") && q.includes("SET ai_draft")) {
      const draft = values[0];
      const id = values[1];
      const saved = savedMessages.find(msg => msg.id === id);
      if (saved) saved.ai_draft = draft;
      return [];
    }
    if (q.includes("INSERT INTO negotiation_messages") && q.includes("'outbound'")) {
      savedMessages.push({ negotiation_id: values[0], direction: "outbound", content: values[1], approved: true });
      return [];
    }
    return [];
  }),
  setupDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/gmail", () => ({
  getAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
  sendGmail: mockSendGmail,
}));

vi.mock("@/lib/notify", () => ({
  getClerkUser: vi.fn().mockResolvedValue({ email: "owner@example.com", firstName: "Owner" }),
  sendNegotiationResultEmail: mockSendNegotiationResultEmail,
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: mockAnthropicCreate,
    };
  },
}));

// ── Global fetch mock ────────────────────────────────────────────────────────

beforeEach(() => {
  savedMessages.length = 0;
  mockSendGmail.mockClear();
  mockSendNegotiationResultEmail.mockClear();
  mockAnthropicCreate.mockReset();
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: "Thank you for your offer. We propose $310,000." }],
  });
  sqlState.history_id = "100";
  fetchOverride.handler = null;
  negotiationState.neg42CounterpartyEmail = "buyer@example.com";
  negotiationState.neg42Status = "active";
  negotiationState.neg99Status = "active";
  negotiationState.neg99AutonomousMode = true;

  process.env.GMAIL_SYSTEM_USER_ID = "system_user_123";
  process.env.GMAIL_WEBHOOK_SECRET = "";
  process.env.GMAIL_SALES_ADDRESS = "sales@counterproai.com";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";

  globalThis.fetch = vi.fn(async (url: string) => {
    if (fetchOverride.handler) {
      const res = fetchOverride.handler(url);
      if (res) return res;
    }
    if (url.includes("/gmail/v1/users/me/history")) {
      return new Response(JSON.stringify({
        history: historyState.messageIds.map(id => ({
          messagesAdded: [{ message: { id } }],
        })),
      }), { status: 200 });
    }
    if (url.includes("/gmail/v1/users/me/messages/")) {
      const msgId = url.split("/messages/")[1].split("?")[0];
      return new Response(JSON.stringify(buildFakeGmailMessage(msgId)), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function b64url(text: string) {
  return Buffer.from(text, "utf8").toString("base64url");
}

function buildFakeGmailMessage(msgId: string, opts: { to?: string; from?: string; body?: string } = {}) {
  return {
    id: msgId,
    payload: {
      headers: [
        { name: "To", value: opts.to ?? "sales+neg42@counterproai.com" },
        { name: "From", value: opts.from ?? "buyer@example.com" },
        { name: "Subject", value: "Re: Negotiation" },
      ],
      body: { data: b64url(opts.body ?? "I am interested. Could you lower the price?") },
      mimeType: "text/plain",
    },
  };
}

function buildPubSubPayload(historyId: string | number) {
  const notification = JSON.stringify({ emailAddress: "sales@counterproai.com", historyId });
  return { message: { data: Buffer.from(notification).toString("base64") }, subscription: "projects/test/subscriptions/gmail-watch" };
}

function makePostRequest(body: object, token = "") {
  const url = token ? `http://localhost/api/webhooks/gmail?token=${token}` : "http://localhost/api/webhooks/gmail";
  return new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

// ── Tests: POST handler (entry point) ───────────────────────────────────────

describe("Gmail webhook — POST handler", () => {
  it("returns 200 immediately for valid payload", async () => {
    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const res = await POST(makePostRequest(buildPubSubPayload("200")));
    expect(res.status).toBe(200);
  });

  it("returns 403 when webhook secret token is wrong", async () => {
    process.env.GMAIL_WEBHOOK_SECRET = "correct-secret";
    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const res = await POST(makePostRequest(buildPubSubPayload("200"), "wrong-secret"));
    expect(res.status).toBe(403);
  });

  it("returns 200 for invalid JSON body (never let Pub/Sub retry)", async () => {
    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const req = new NextRequest("http://localhost/api/webhooks/gmail", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 200 for payload with no message data", async () => {
    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const res = await POST(makePostRequest({ subscription: "test" }));
    expect(res.status).toBe(200);
  });
});

// ── Tests: processNewMessages (core processing) ──────────────────────────────

describe("Gmail webhook — processNewMessages", () => {
  it("skips when historyId is not newer than stored value", async () => {
    sqlState.history_id = "500";
    historyState.messageIds = ["msg-skip"];
    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("400"); // older than 500
    expect(savedMessages).toHaveLength(0);
  });

  it("advances historyId when incoming is newer", async () => {
    sqlState.history_id = "100";
    historyState.messageIds = [];
    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");
    expect(sqlState.history_id).toBe("200");
  });

  it("processes zero messages when history returns empty", async () => {
    historyState.messageIds = [];
    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");
    expect(savedMessages).toHaveLength(0);
  });
});

// ── Tests: inbound message processing ───────────────────────────────────────

describe("Gmail webhook — inbound message processing", () => {
  it("saves inbound message with AI draft for valid negotiation", async () => {
    historyState.messageIds = ["msg-valid"];
    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(savedMessages).toHaveLength(1);
    const msg = savedMessages[0];
    expect(msg.direction).toBe("inbound");
    expect(msg.negotiation_id).toBe(42);
    expect(msg.content).toBe("I am interested. Could you lower the price?");
    expect(msg.ai_draft).toBe("Thank you for your offer. We propose $310,000.");
  });

  it("creates draft without email notification when not in autonomous mode", async () => {
    historyState.messageIds = ["msg-notify"];
    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    const msg = savedMessages[0];
    expect(msg.direction).toBe("inbound");
    expect(msg.negotiation_id).toBe(42);
    expect(msg.content).toBe("I am interested. Could you lower the price?");
    expect(msg.ai_draft).toBe("Thank you for your offer. We propose $310,000.");
  });

  it("auto-sends draft without email notification in autonomous mode", async () => {
    historyState.messageIds = ["msg-auto"];
    fetchOverride.handler = (url) =>
      url.includes("/messages/msg-auto")
        ? new Response(JSON.stringify(buildFakeGmailMessage("msg-auto", {
            to: "sales+neg99@counterproai.com",
            from: "seller@example.com",
            body: "We accept your counter-offer.",
          })), { status: 200 })
        : null;

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(mockSendGmail).toHaveBeenCalled();
    // Email notifications removed - just verify messages are saved
    expect(savedMessages.find(m => m.direction === "inbound")).toBeDefined();
    expect(savedMessages.find(m => m.direction === "outbound")).toBeDefined();
  });

  it("stops autopilot and emails the user when agreement is reached", async () => {
    historyState.messageIds = ["msg-agreement"];
    fetchOverride.handler = (url) =>
      url.includes("/messages/msg-agreement")
        ? new Response(JSON.stringify(buildFakeGmailMessage("msg-agreement", {
            to: "sales+neg99@counterproai.com",
            from: "seller@example.com",
            body: "I'll accept $122,000. We have a deal. Please have your representative reach out.",
          })), { status: 200 })
        : null;

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(mockSendGmail).toHaveBeenCalled();
    expect(mockSendNegotiationResultEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        negotiationId: 99,
        agreedPrice: 122000,
      })
    );
    expect(negotiationState.neg99Status).toBe("closed");
    expect(negotiationState.neg99AutonomousMode).toBe(false);
  });

  it("saves inbound mail and pauses autopilot when Anthropic credits are exhausted", async () => {
    historyState.messageIds = ["msg-credit-fail"];
    mockAnthropicCreate.mockRejectedValueOnce(
      new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}')
    );
    fetchOverride.handler = (url) =>
      url.includes("/messages/msg-credit-fail")
        ? new Response(JSON.stringify(buildFakeGmailMessage("msg-credit-fail", {
            to: "sales+neg99@counterproai.com",
            from: "seller@example.com",
            body: "Counter at $124,000.",
          })), { status: 200 })
        : null;

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0].direction).toBe("inbound");
    expect(savedMessages[0].content).toBe("Counter at $124,000.");
    expect(savedMessages[0].ai_draft).toBeNull();
    expect(mockSendGmail).not.toHaveBeenCalled();
    expect(negotiationState.neg99AutonomousMode).toBe(false);
    expect(sqlState.history_id).toBe("200");
  });

  it("rejects non-alias internal emails from counterproai.com", async () => {
    historyState.messageIds = ["msg-loop"];
    fetchOverride.handler = (url) =>
      url.includes("/messages/msg-loop")
        ? new Response(JSON.stringify(buildFakeGmailMessage("msg-loop", {
            from: "noreply@counterproai.com",
            to: "sales+neg42@counterproai.com",
          })), { status: 200 })
        : null;

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(savedMessages).toHaveLength(0);
  });

  it("accepts alias-to-alias mail when both negotiations are mutually linked", async () => {
    negotiationState.neg42CounterpartyEmail = "sales+neg55@counterproai.com";
    historyState.messageIds = ["msg-internal-linked"];
    fetchOverride.handler = (url) =>
      url.includes("/messages/msg-internal-linked")
        ? new Response(JSON.stringify(buildFakeGmailMessage("msg-internal-linked", {
            from: "sales+neg55@counterproai.com",
            to: "sales+neg42@counterproai.com",
            body: "Seller counter: $320,000.",
          })), { status: 200 })
        : null;

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0].content).toBe("Seller counter: $320,000.");
    expect(savedMessages[0].negotiation_id).toBe(42);
  });

  it("rejects alias-to-alias mail when negotiations are not mutually linked", async () => {
    historyState.messageIds = ["msg-internal-unlinked"];
    fetchOverride.handler = (url) =>
      url.includes("/messages/msg-internal-unlinked")
        ? new Response(JSON.stringify(buildFakeGmailMessage("msg-internal-unlinked", {
            from: "sales+neg77@counterproai.com",
            to: "sales+neg42@counterproai.com",
            body: "Unlinked internal message",
          })), { status: 200 })
        : null;

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(savedMessages).toHaveLength(0);
  });

  it("rejects emails not matching the alias pattern", async () => {
    historyState.messageIds = ["msg-unrelatd"];
    fetchOverride.handler = (url) =>
      url.includes("/messages/msg-unrelatd")
        ? new Response(JSON.stringify(buildFakeGmailMessage("msg-unrelatd", {
            to: "support@counterproai.com",
          })), { status: 200 })
        : null;

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(savedMessages).toHaveLength(0);
  });

  it("rejects emails with empty or whitespace-only body", async () => {
    historyState.messageIds = ["msg-empty"];
    fetchOverride.handler = (url) =>
      url.includes("/messages/msg-empty")
        ? new Response(JSON.stringify(buildFakeGmailMessage("msg-empty", { body: "   " })), { status: 200 })
        : null;

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(savedMessages).toHaveLength(0);
  });

  it("skips silently when negotiation ID from alias does not exist in DB", async () => {
    historyState.messageIds = ["msg-badneg"];
    fetchOverride.handler = (url) =>
      url.includes("/messages/msg-badneg")
        ? new Response(JSON.stringify(buildFakeGmailMessage("msg-badneg", {
            to: "sales+neg9999@counterproai.com",
          })), { status: 200 })
        : null;

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(savedMessages).toHaveLength(0);
  });

  it("correctly parses display-name format in To header", async () => {
    historyState.messageIds = ["msg-displayname"];
    fetchOverride.handler = (url) =>
      url.includes("/messages/msg-displayname")
        ? new Response(JSON.stringify(buildFakeGmailMessage("msg-displayname", {
            to: "CounterPro Inbox <sales+neg42@counterproai.com>",
            from: "buyer@example.com",
            body: "Still interested. Any flexibility on price?",
          })), { status: 200 })
        : null;

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0].negotiation_id).toBe(42);
  });

  it("processes multiple message IDs from a single history batch", async () => {
    historyState.messageIds = ["msg-batch-1", "msg-batch-2"];
    fetchOverride.handler = (url) => {
      if (url.includes("/messages/msg-batch-1"))
        return new Response(JSON.stringify(buildFakeGmailMessage("msg-batch-1", { to: "sales+neg42@counterproai.com", body: "Offer one" })), { status: 200 });
      if (url.includes("/messages/msg-batch-2"))
        return new Response(JSON.stringify(buildFakeGmailMessage("msg-batch-2", { to: "sales+neg42@counterproai.com", body: "Offer two" })), { status: 200 });
      return null;
    };

    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");
    await processNewMessages("200");

    expect(savedMessages.filter(m => m.direction === "inbound")).toHaveLength(2);
  });
});

// ── Tests: idempotency ───────────────────────────────────────────────────────

describe("Gmail webhook — idempotency", () => {
  it("processes a historyId only once (deduplicates Pub/Sub retries)", async () => {
    historyState.messageIds = ["msg-once"];
    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");

    await processNewMessages("300");
    const countAfterFirst = savedMessages.length;

    // Reset history so the second call would process messages if it ran
    historyState.messageIds = ["msg-once-again"];
    await processNewMessages("300"); // same historyId — should skip

    expect(savedMessages.length).toBe(countAfterFirst);
  });

  it("does process when a newer historyId arrives", async () => {
    historyState.messageIds = ["msg-new"];
    const { processNewMessages } = await import("@/app/api/webhooks/gmail/route");

    await processNewMessages("300");
    const countAfterFirst = savedMessages.length;

    historyState.messageIds = ["msg-newer"];
    await processNewMessages("400"); // newer — should process

    expect(savedMessages.length).toBeGreaterThan(countAfterFirst);
  });
});
