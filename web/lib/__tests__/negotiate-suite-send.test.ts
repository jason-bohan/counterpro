import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
// Use undici's own File class — the global File may differ across Node.js versions
// and won't pass undici's internal webidl.is.File() check in older releases.
import { File as UndiciFile } from "undici";

// Hoisted so they're accessible inside vi.mock factories
const { sqlUpdates, mockGetAccessToken, mockSendGmail, mockBlobPut, selectOverride } = vi.hoisted(() => {
  return {
    sqlUpdates: [] as Array<{ sentAt: unknown }>,
    mockGetAccessToken: vi.fn(),
    mockSendGmail: vi.fn(),
    mockBlobPut: vi.fn(),
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
      const override = selectOverride.value;
      selectOverride.value = null; // reset after use
      // Return empty array to simulate "not found" when override is explicitly set to approved:true
      if (override && (override as Record<string, unknown>).approved === true) {
        return Promise.resolve([]);
      }
      const row = override ?? {
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
      return Promise.resolve([row]);
    }
    if (q.includes("UPDATE negotiation_messages")) {
      sqlUpdates.push({ sentAt: values[1] });
    }
    // Return a row with an id for INSERT INTO negotiation_messages (outbound message insert uses RETURNING id)
    if (q.includes("INSERT INTO negotiation_messages")) {
      return Promise.resolve([{ id: 100 }]);
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

vi.mock("@vercel/blob", () => ({
  put: mockBlobPut,
}));

// Add a simple test to verify the mock is working
it("verifies blob mock is working", async () => {
  mockBlobPut.mockResolvedValue({ url: "test-url" });
  const { put } = await import("@vercel/blob");
  const result = await put("test-path", Buffer.from("test"), { access: "public" });
  expect(result.url).toBe("test-url");
  expect(mockBlobPut).toHaveBeenCalled();
});

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

function makeFormRequest(fields: Record<string, string>, file?: { name: string; type: string; content: string }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  // Use undici's own File class — ensures webidl.is.File() passes in all Node.js/undici versions
  if (file) form.append("attachment", new UndiciFile([file.content], file.name, { type: file.type }));
  return new NextRequest("http://localhost/api/negotiate-suite", { method: "PUT", body: form });
}

describe("negotiate-suite PUT — sent_at", () => {
  beforeEach(() => {
    sqlUpdates.length = 0;
    mockGetAccessToken.mockReset();
    mockSendGmail.mockReset();
    mockBlobPut.mockReset();
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

describe("negotiate-suite PUT — duplicate prevention", () => {
  beforeEach(() => {
    sqlUpdates.length = 0;
    mockGetAccessToken.mockReset();
    mockSendGmail.mockReset();
    mockBlobPut.mockReset();
  });

  it("returns 404 when the message is already approved (approved = true)", async () => {
    selectOverride.value = { ...mockMsg, approved: true };

    const res = await PUT(makeRequest({ messageId: 99, approved: true, editedDraft: "" }));

    expect(res.status).toBe(404);
    expect(mockSendGmail).not.toHaveBeenCalled();
  });

  it("returns 404 on the second call with the same messageId (no-row SELECT)", async () => {
    // Simulate the SELECT returning no rows (message already approved / consumed)
    selectOverride.value = null; // will return default row (approved: false) for first call
    mockGetAccessToken.mockResolvedValue("token_abc");
    mockSendGmail.mockResolvedValue(true);

    // First approval succeeds
    const res1 = await PUT(makeRequest({ messageId: 99, approved: true, editedDraft: "" }));
    expect(res1.status).toBe(200);

    // Second attempt: message now has approved=true so SELECT returns nothing
    selectOverride.value = { ...mockMsg, approved: true };
    const res2 = await PUT(makeRequest({ messageId: 99, approved: true, editedDraft: "" }));
    expect(res2.status).toBe(404);
    // Gmail should only have been called once
    expect(mockSendGmail).toHaveBeenCalledOnce();
  });
});

describe("negotiate-suite PUT — discard", () => {
  beforeEach(() => {
    sqlUpdates.length = 0;
    mockGetAccessToken.mockReset();
    mockSendGmail.mockReset();
  });

  it("returns ok:true and sent:false without calling Gmail", async () => {
    const res = await PUT(makeRequest({ messageId: 99, discard: true }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.sent).toBe(false);
    expect(mockSendGmail).not.toHaveBeenCalled();
  });

  it("writes an UPDATE to the DB so the message leaves the pending queue", async () => {
    await PUT(makeRequest({ messageId: 99, discard: true }));
    expect(sqlUpdates.length).toBeGreaterThan(0);
  });
});

describe("negotiate-suite PUT — file attachment", () => {
  beforeEach(() => {
    sqlUpdates.length = 0;
    mockGetAccessToken.mockReset();
    mockSendGmail.mockReset();
    mockBlobPut.mockReset();
    mockBlobPut.mockResolvedValue({ url: "https://blob.vercel.com/test/agreement.pdf" });
  });

  it("sends the email with an attachment when a file is included", async () => {
    mockGetAccessToken.mockResolvedValue("token_abc");
    mockSendGmail.mockResolvedValue(true);
    mockBlobPut.mockResolvedValue({ url: "https://mock-blob-url.com/file.pdf" });

    await PUT(makeFormRequest(
      { messageId: "99", approved: "true", editedDraft: "Please see attached." },
      { name: "agreement.pdf", type: "application/pdf", content: "%PDF-1.4 test content" },
    ));

    expect(mockSendGmail).toHaveBeenCalledOnce();
    const callArgs = mockSendGmail.mock.calls[0];
    // Last arg is the attachments array
    const attachments = callArgs[callArgs.length - 1];
    expect(Array.isArray(attachments)).toBe(true);
    expect(attachments[0].mimeType).toBe("application/pdf");
    expect(Buffer.isBuffer(attachments[0].data)).toBe(true);
  });

  it("uploads the file to Blob after a successful send", async () => {
    mockGetAccessToken.mockResolvedValue("token_abc");
    mockSendGmail.mockResolvedValue(true);
    mockBlobPut.mockResolvedValue({ url: "https://mock-blob-url.com/file.pdf" });

    await PUT(makeFormRequest(
      { messageId: "99", approved: "true", editedDraft: "" },
      { name: "agreement.pdf", type: "application/pdf", content: "%PDF-1.4 test" },
    ));

    expect(mockBlobPut).toHaveBeenCalledOnce();
    const [path, data, opts] = mockBlobPut.mock.calls[0];
    expect(path).toMatch(/^documents\/user_test\/\d+\//);
    expect(Buffer.isBuffer(data)).toBe(true);
    expect(opts.access).toBe("public");
    expect(opts.contentType).toBe("application/pdf");
  });

  it("does NOT upload to Blob when Gmail send fails", async () => {
    mockGetAccessToken.mockResolvedValue("token_abc");
    mockSendGmail.mockResolvedValue(false);

    await PUT(makeFormRequest(
      { messageId: "99", approved: "true", editedDraft: "" },
      { name: "agreement.pdf", type: "application/pdf", content: "%PDF-1.4 test" },
    ));

    expect(mockBlobPut).not.toHaveBeenCalled();
  });

  it("still returns ok if Blob upload throws — send is not blocked", async () => {
    mockGetAccessToken.mockResolvedValue("token_abc");
    mockSendGmail.mockResolvedValue(true);
    mockBlobPut.mockRejectedValue(new Error("Blob service unavailable"));

    const response = await PUT(makeFormRequest(
      { messageId: "99", approved: "true", editedDraft: "" },
      { name: "agreement.pdf", type: "application/pdf", content: "%PDF-1.4 test" },
    ));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.sent).toBe(true);
  });

  it("sends normally without attachment when no file provided", async () => {
    mockGetAccessToken.mockResolvedValue("token_abc");
    mockSendGmail.mockResolvedValue(true);

    await PUT(makeFormRequest({ messageId: "99", approved: "true", editedDraft: "No attachment." }));

    expect(mockSendGmail).toHaveBeenCalledOnce();
    expect(mockBlobPut).not.toHaveBeenCalled();
  });
});
