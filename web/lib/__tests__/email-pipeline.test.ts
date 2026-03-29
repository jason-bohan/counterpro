import { describe, it, expect } from "vitest";
import {
  decodeBase64Url,
  stripHtml,
  findPart,
  extractBody,
  getHeader,
  parseEmail,
  routeInboundEmail,
  buildNegotiationPrompt,
  stripMarkdown,
  type GmailMessagePart,
} from "../email-pipeline";

// ── Helpers ────────────────────────────────────────────────────────────────

function b64url(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function plainPart(text: string): GmailMessagePart {
  return { mimeType: "text/plain", body: { data: b64url(text) } };
}

function htmlPart(html: string): GmailMessagePart {
  return { mimeType: "text/html", body: { data: b64url(html) } };
}

// ── decodeBase64Url ────────────────────────────────────────────────────────

describe("decodeBase64Url", () => {
  it("decodes a base64url encoded string", () => {
    const encoded = b64url("Hello, world!");
    expect(decodeBase64Url(encoded)).toBe("Hello, world!");
  });

  it("handles + and / characters (standard base64 → base64url)", () => {
    const text = "I want to buy your house for $280,000. Let me know!";
    expect(decodeBase64Url(b64url(text))).toBe(text);
  });
});

// ── stripHtml ──────────────────────────────────────────────────────────────

describe("stripHtml", () => {
  it("strips basic tags", () => {
    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
  });

  it("removes style and script blocks entirely", () => {
    const html = "<style>.foo{color:red}</style><p>Keep this</p><script>alert(1)</script>";
    expect(stripHtml(html)).toBe("Keep this");
  });

  it("decodes HTML entities", () => {
    expect(stripHtml("Offer &amp; counter &lt;$300k&gt;")).toBe("Offer & counter <$300k>");
  });

  it("collapses multiple spaces", () => {
    expect(stripHtml("<p>  too   many   spaces  </p>")).toBe("too many spaces");
  });
});

// ── findPart ───────────────────────────────────────────────────────────────

describe("findPart", () => {
  it("finds a direct part match", () => {
    const part = plainPart("hello");
    expect(findPart(part, "text/plain")).toBe(part);
  });

  it("finds a nested part", () => {
    const inner = plainPart("nested text");
    const outer: GmailMessagePart = {
      mimeType: "multipart/mixed",
      parts: [{ mimeType: "text/html", body: { data: b64url("<p>html</p>") } }, inner],
    };
    expect(findPart(outer, "text/plain")).toBe(inner);
  });

  it("returns null when not found", () => {
    const part: GmailMessagePart = { mimeType: "multipart/mixed", parts: [] };
    expect(findPart(part, "text/plain")).toBeNull();
  });

  it("returns null for part with no body.data", () => {
    const part: GmailMessagePart = { mimeType: "text/plain", body: { size: 0 } };
    expect(findPart(part, "text/plain")).toBeNull();
  });
});

// ── extractBody ────────────────────────────────────────────────────────────

describe("extractBody", () => {
  it("prefers text/plain over text/html", () => {
    const payload: GmailMessagePart = {
      mimeType: "multipart/alternative",
      parts: [
        htmlPart("<p>HTML version</p>"),
        plainPart("Plain version"),
      ],
    };
    expect(extractBody(payload)).toBe("Plain version");
  });

  it("falls back to text/html when no plain part", () => {
    const payload: GmailMessagePart = {
      mimeType: "multipart/alternative",
      parts: [htmlPart("<p>Only HTML</p>")],
    };
    expect(extractBody(payload)).toBe("Only HTML");
  });

  it("falls back to top-level body", () => {
    const payload: GmailMessagePart = {
      mimeType: "text/plain",
      body: { data: b64url("Top level body") },
    };
    expect(extractBody(payload)).toBe("Top level body");
  });

  it("returns empty string when no body found", () => {
    const payload: GmailMessagePart = { mimeType: "multipart/mixed", parts: [] };
    expect(extractBody(payload)).toBe("");
  });

  it("handles deeply nested plain part", () => {
    const payload: GmailMessagePart = {
      mimeType: "multipart/mixed",
      parts: [{
        mimeType: "multipart/alternative",
        parts: [plainPart("Deep plain text")],
      }],
    };
    expect(extractBody(payload)).toBe("Deep plain text");
  });
});

// ── getHeader ──────────────────────────────────────────────────────────────

describe("getHeader", () => {
  const headers = [
    { name: "To", value: "sales+neg3@counterproai.com" },
    { name: "From", value: "buyer@example.com" },
    { name: "Subject", value: "Offer on your property" },
  ];

  it("finds header by exact name", () => {
    expect(getHeader(headers, "To")).toBe("sales+neg3@counterproai.com");
  });

  it("is case-insensitive", () => {
    expect(getHeader(headers, "from")).toBe("buyer@example.com");
    expect(getHeader(headers, "SUBJECT")).toBe("Offer on your property");
  });

  it("returns empty string for missing header", () => {
    expect(getHeader(headers, "Reply-To")).toBe("");
  });
});

// ── parseEmail ─────────────────────────────────────────────────────────────

describe("parseEmail", () => {
  it("extracts all fields from a simple message", () => {
    const payload: GmailMessagePart = {
      mimeType: "text/plain",
      headers: [
        { name: "To", value: "sales+neg5@counterproai.com" },
        { name: "From", value: "agent@realty.com" },
        { name: "Subject", value: "Counter offer" },
      ],
      body: { data: b64url("We can do $295,000 final.") },
    };
    const result = parseEmail(payload);
    expect(result.to).toBe("sales+neg5@counterproai.com");
    expect(result.from).toBe("agent@realty.com");
    expect(result.subject).toBe("Counter offer");
    expect(result.body).toBe("We can do $295,000 final.");
  });
});

// ── routeInboundEmail ──────────────────────────────────────────────────────

describe("routeInboundEmail", () => {
  it("routes to correct negotiation ID", () => {
    const result = routeInboundEmail("buyer@gmail.com", "sales+neg42@counterproai.com");
    expect(result).toEqual({ type: "negotiation", negotiationId: 42 });
  });

  it("is case-insensitive on the alias", () => {
    const result = routeInboundEmail("x@x.com", "Sales+Neg7@COUNTERPROAI.COM");
    expect(result).toEqual({ type: "negotiation", negotiationId: 7 });
  });

  it("detects loop (email from our own domain)", () => {
    const result = routeInboundEmail("sales@counterproai.com", "sales+neg1@counterproai.com");
    expect(result).toEqual({ type: "loop" });
  });

  it("detects loop for alias-to-alias", () => {
    const result = routeInboundEmail("sales+neg2@counterproai.com", "sales+neg1@counterproai.com");
    expect(result).toEqual({ type: "loop" });
  });

  it("marks unrelated email (no alias match)", () => {
    const result = routeInboundEmail("someone@gmail.com", "support@counterproai.com");
    expect(result).toEqual({ type: "unrelated" });
  });

  it("marks unrelated email (random domain)", () => {
    const result = routeInboundEmail("x@x.com", "info@somethingelse.com");
    expect(result).toEqual({ type: "unrelated" });
  });

  it("handles To header with display name", () => {
    const result = routeInboundEmail(
      "buyer@gmail.com",
      "CounterPro <sales+neg12@counterproai.com>"
    );
    expect(result).toEqual({ type: "negotiation", negotiationId: 12 });
  });
});

// ── buildNegotiationPrompt ─────────────────────────────────────────────────

describe("buildNegotiationPrompt", () => {
  it("includes property address", () => {
    const prompt = buildNegotiationPrompt("123 Main St", [], "Hello");
    expect(prompt).toContain("123 Main St");
  });

  it("shows no prior messages when history is empty", () => {
    const prompt = buildNegotiationPrompt("123 Main St", [], "First message");
    expect(prompt).toContain("(No prior messages)");
  });

  it("formats inbound messages as COUNTERPARTY", () => {
    const history = [{ direction: "inbound", content: "We offer $280k" }];
    const prompt = buildNegotiationPrompt("123 Main St", history, "Follow up");
    expect(prompt).toContain("[COUNTERPARTY]: We offer $280k");
  });

  it("formats outbound messages as YOU", () => {
    const history = [{ direction: "outbound", content: "We need at least $300k" }];
    const prompt = buildNegotiationPrompt("123 Main St", history, "New message");
    expect(prompt).toContain("[YOU]: We need at least $300k");
  });

  it("includes the new inbound message", () => {
    const prompt = buildNegotiationPrompt("123 Main St", [], "Final offer: $295k");
    expect(prompt).toContain("Final offer: $295k");
  });

  it("orders full conversation correctly", () => {
    const history = [
      { direction: "inbound", content: "Offer $280k" },
      { direction: "outbound", content: "Counter $310k" },
      { direction: "inbound", content: "How about $295k?" },
    ];
    const prompt = buildNegotiationPrompt("123 Main St", history, "Final answer");
    const counterpartyIdx = prompt.indexOf("[COUNTERPARTY]: Offer $280k");
    const youIdx = prompt.indexOf("[YOU]: Counter $310k");
    const secondIdx = prompt.indexOf("[COUNTERPARTY]: How about $295k?");
    expect(counterpartyIdx).toBeLessThan(youIdx);
    expect(youIdx).toBeLessThan(secondIdx);
  });
});

// ── stripMarkdown ──────────────────────────────────────────────────────────

describe("stripMarkdown", () => {
  it("removes ATX headers", () => {
    expect(stripMarkdown("## Hello\nWorld")).toBe("Hello\nWorld");
  });

  it("removes bold markers", () => {
    expect(stripMarkdown("This is **bold** text")).toBe("This is bold text");
  });

  it("removes italic markers", () => {
    expect(stripMarkdown("This is *italic* text")).toBe("This is italic text");
  });

  it("removes inline code", () => {
    expect(stripMarkdown("Use `npm install`")).toBe("Use npm install");
  });

  it("removes markdown links", () => {
    expect(stripMarkdown("[click here](https://example.com)")).toBe("click here");
  });

  it("removes unordered list markers", () => {
    const result = stripMarkdown("- Item one\n- Item two");
    expect(result).toBe("Item one\nItem two");
  });

  it("removes ordered list markers", () => {
    const result = stripMarkdown("1. First\n2. Second");
    expect(result).toBe("First\nSecond");
  });

  it("removes blockquotes", () => {
    expect(stripMarkdown("> Quoted text")).toBe("Quoted text");
  });

  it("preserves plain text unchanged", () => {
    const plain = "Dear John,\n\nWe are pleased to offer $300,000.\n\nBest regards";
    expect(stripMarkdown(plain)).toBe(plain);
  });

  it("handles a full AI draft with mixed formatting", () => {
    const draft = "## Counter Offer\n\nDear buyer,\n\nWe **cannot** accept below $300k. Our final offer:\n\n- Price: $300,000\n- Closing: 30 days\n\nPlease respond by **Friday**.";
    const result = stripMarkdown(draft);
    expect(result).not.toContain("##");
    expect(result).not.toContain("**");
    expect(result).not.toContain("- Price");
    expect(result).toContain("Counter Offer");
    expect(result).toContain("cannot");
    expect(result).toContain("300,000");
    expect(result).toContain("Friday");
  });
});
