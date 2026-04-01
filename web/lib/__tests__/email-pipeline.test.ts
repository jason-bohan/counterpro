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
  buildProactivePrompt,
  stripMarkdown,
  extractAttachments,
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
    expect(result).toEqual({ type: "negotiation", negotiationId: 42, sourceNegotiationId: null });
  });

  it("is case-insensitive on the alias", () => {
    const result = routeInboundEmail("x@x.com", "Sales+Neg7@COUNTERPROAI.COM");
    expect(result).toEqual({ type: "negotiation", negotiationId: 7, sourceNegotiationId: null });
  });

  it("detects loop (email from our own domain)", () => {
    const result = routeInboundEmail("sales@counterproai.com", "sales+neg1@counterproai.com");
    expect(result).toEqual({ type: "loop" });
  });

  it("captures source negotiation for alias-to-alias mail", () => {
    const result = routeInboundEmail("sales+neg2@counterproai.com", "sales+neg1@counterproai.com");
    expect(result).toEqual({ type: "negotiation", negotiationId: 1, sourceNegotiationId: 2 });
  });

  it("detects loop when an alias emails itself", () => {
    const result = routeInboundEmail("sales+neg2@counterproai.com", "sales+neg2@counterproai.com");
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
    expect(result).toEqual({ type: "negotiation", negotiationId: 12, sourceNegotiationId: null });
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

// ── buildProactivePrompt ─────────────────────────────────────────────────────

describe("buildProactivePrompt", () => {
  it("includes property address", () => {
    const prompt = buildProactivePrompt("123 Main St", [], "I want to offer $280k");
    expect(prompt).toContain("123 Main St");
  });

  it("shows no prior messages when history is empty", () => {
    const prompt = buildProactivePrompt("123 Main St", [], "First proactive message");
    expect(prompt).toContain("(No prior messages)");
  });

  it("includes the user's proactive message in quotes", () => {
    const prompt = buildProactivePrompt("123 Main St", [], "I want to offer $280k");
    expect(prompt).toContain('"I want to offer $280k"');
  });

  it("formats inbound messages as COUNTERPARTY", () => {
    const history = [{ direction: "inbound", content: "We offer $280k" }];
    const prompt = buildProactivePrompt("123 Main St", history, "I want to counter");
    expect(prompt).toContain("[COUNTERPARTY]: We offer $280k");
  });

  it("formats outbound messages as YOU", () => {
    const history = [{ direction: "outbound", content: "We need at least $300k" }];
    const prompt = buildProactivePrompt("123 Main St", history, "Let's meet in the middle");
    expect(prompt).toContain("[YOU]: We need at least $300k");
  });

  it("orders full conversation correctly before user message", () => {
    const history = [
      { direction: "inbound", content: "Offer $280k" },
      { direction: "outbound", content: "Counter $310k" },
      { direction: "inbound", content: "How about $295k?" },
    ];
    const prompt = buildProactivePrompt("123 Main St", history, "I accept $295k");
    const counterpartyIdx = prompt.indexOf("[COUNTERPARTY]: Offer $280k");
    const youIdx = prompt.indexOf("[YOU]: Counter $310k");
    const secondIdx = prompt.indexOf("[COUNTERPARTY]: How about $295k?");
    const userMsgIdx = prompt.indexOf("I accept $295k");
    expect(counterpartyIdx).toBeLessThan(youIdx);
    expect(youIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(userMsgIdx);
  });

  it("includes instructions for refining the message", () => {
    const prompt = buildProactivePrompt("123 Main St", [], "Offer $250k");
    expect(prompt).toContain("Refine this message into a professional, strategic email");
    expect(prompt).toContain("Maintains the professional tone");
    expect(prompt).toContain("concise and impactful");
    expect(prompt).toContain("clear next step");
  });

  it("handles complex user messages", () => {
    const userMessage = "I think we should meet in person to discuss the property, maybe this weekend? I'm flexible on price but need quick closing.";
    const prompt = buildProactivePrompt("123 Main St", [], userMessage);
    expect(prompt).toContain(userMessage);
    expect(prompt).toContain("professional, strategic email");
  });

  it("works with existing conversation context", () => {
    const history = [
      { direction: "inbound", content: "Is the property still available?" },
      { direction: "outbound", content: "Yes, it is. Are you interested in viewing?" },
    ];
    const prompt = buildProactivePrompt("123 Main St", history, "I'd like to schedule a viewing for Saturday afternoon");
    expect(prompt).toContain("[COUNTERPARTY]: Is the property still available?");
    expect(prompt).toContain("[YOU]: Yes, it is. Are you interested in viewing?");
    expect(prompt).toContain("schedule a viewing for Saturday afternoon");
  });
});

// ── extractAttachments ─────────────────────────────────────────────────────

function attachmentPart(opts: {
  attachmentId: string;
  mimeType: string;
  size?: number;
  contentDisposition?: string;
  contentType?: string;
}): GmailMessagePart {
  return {
    mimeType: opts.mimeType,
    body: { attachmentId: opts.attachmentId, size: opts.size ?? 1024 },
    headers: [
      ...(opts.contentDisposition ? [{ name: "Content-Disposition", value: opts.contentDisposition }] : []),
      ...(opts.contentType ? [{ name: "Content-Type", value: opts.contentType }] : []),
    ],
  };
}

describe("extractAttachments", () => {
  it("returns empty array when there are no attachments", () => {
    const payload: GmailMessagePart = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("Hello") } },
        { mimeType: "text/html", body: { data: b64url("<p>Hello</p>") } },
      ],
    };
    expect(extractAttachments(payload)).toEqual([]);
  });

  it("extracts a single PDF attachment with Content-Disposition filename", () => {
    const payload: GmailMessagePart = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("See attached.") } },
        attachmentPart({
          attachmentId: "att-abc123",
          mimeType: "application/pdf",
          size: 80000,
          contentDisposition: 'attachment; filename="contract.pdf"',
          contentType: "application/pdf",
        }),
      ],
    };
    const result = extractAttachments(payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      attachmentId: "att-abc123",
      filename: "contract.pdf",
      mimeType: "application/pdf",
      size: 80000,
    });
  });

  it("falls back to Content-Type name param when Content-Disposition is absent", () => {
    const payload = attachmentPart({
      attachmentId: "att-xyz",
      mimeType: "image/jpeg",
      contentType: 'image/jpeg; name="photo.jpg"',
    });
    const [att] = extractAttachments(payload);
    expect(att.filename).toBe("photo.jpg");
  });

  it("falls back to attachment-{id} when no filename header exists", () => {
    const payload = attachmentPart({ attachmentId: "abc12345xyz", mimeType: "application/octet-stream" });
    const [att] = extractAttachments(payload);
    expect(att.filename).toBe("attachment-abc12345");
  });

  it("extracts multiple attachments from a multipart payload", () => {
    const payload: GmailMessagePart = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("See attached files.") } },
        attachmentPart({ attachmentId: "att-1", mimeType: "image/png", contentDisposition: 'attachment; filename="photo.png"' }),
        attachmentPart({ attachmentId: "att-2", mimeType: "application/pdf", contentDisposition: 'attachment; filename="report.pdf"' }),
      ],
    };
    const result = extractAttachments(payload);
    expect(result).toHaveLength(2);
    expect(result.map(a => a.filename)).toEqual(["photo.png", "report.pdf"]);
  });

  it("finds attachments nested inside multipart/related", () => {
    const payload: GmailMessagePart = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/related",
          parts: [
            { mimeType: "text/html", body: { data: b64url("<p>hi</p>") } },
            attachmentPart({ attachmentId: "inline-img", mimeType: "image/gif", contentDisposition: 'inline; filename="logo.gif"' }),
          ],
        },
      ],
    };
    const result = extractAttachments(payload);
    expect(result).toHaveLength(1);
    expect(result[0].attachmentId).toBe("inline-img");
    expect(result[0].filename).toBe("logo.gif");
  });

  it("ignores parts that have body.data but no attachmentId", () => {
    const payload: GmailMessagePart = {
      mimeType: "text/plain",
      body: { data: b64url("just text") },
    };
    expect(extractAttachments(payload)).toEqual([]);
  });

  it("reports the correct size from body.size", () => {
    const payload = attachmentPart({
      attachmentId: "sized-att",
      mimeType: "application/zip",
      size: 512000,
      contentDisposition: 'attachment; filename="archive.zip"',
    });
    expect(extractAttachments(payload)[0].size).toBe(512000);
  });
});
