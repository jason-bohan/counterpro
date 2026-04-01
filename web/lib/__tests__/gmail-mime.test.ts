/**
 * Tests for buildRawEmail — verifies the RFC 2822 MIME structure is correct
 * so email clients can parse attachments, HTML parts, and plain text.
 *
 * These are pure-function tests: no mocking, no network calls.
 */

import { describe, it, expect, vi } from "vitest";

// gmail.ts imports db.ts which connects to Neon at module load — mock it out
// since buildRawEmail is a pure function that doesn't touch the database.
vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
  setupDatabase: vi.fn(),
}));

import { buildRawEmail } from "../gmail";

// Parse the raw string into { headerBlock, body } split on the first blank line
function parseRaw(raw: string) {
  const blankLine = raw.indexOf("\r\n\r\n");
  if (blankLine === -1) throw new Error("No blank line found in raw email");
  return {
    headerBlock: raw.slice(0, blankLine),
    body: raw.slice(blankLine + 4),
  };
}

function makeAttachment(name = "doc.pdf", mimeType = "application/pdf", content = "PDF content") {
  return { name, mimeType, data: Buffer.from(content, "utf8") };
}

// ── Plain text ──────────────────────────────────────────────────────────────

describe("buildRawEmail — plain text", () => {
  it("places Content-Type: text/plain in the header block", () => {
    const raw = buildRawEmail({ to: "buyer@example.com", subject: "Test", body: "Hello" });
    const { headerBlock } = parseRaw(raw);
    expect(headerBlock).toContain("Content-Type: text/plain; charset=utf-8");
  });

  it("body section is just the plain text", () => {
    const raw = buildRawEmail({ to: "buyer@example.com", subject: "Test", body: "Hello there" });
    const { body } = parseRaw(raw);
    expect(body).toBe("Hello there");
  });

  it("includes To and Subject headers", () => {
    const raw = buildRawEmail({ to: "seller@example.com", subject: "Counter offer", body: "Hi" });
    const { headerBlock } = parseRaw(raw);
    expect(headerBlock).toContain("To: seller@example.com");
    expect(headerBlock).toContain("Subject:");
  });

  it("includes From when provided", () => {
    const raw = buildRawEmail({ to: "buyer@example.com", subject: "S", body: "B", from: "sales@co.com" });
    const { headerBlock } = parseRaw(raw);
    expect(headerBlock).toContain("From: sales@co.com");
  });

  it("includes Reply-To when provided", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", replyTo: "alias@co.com" });
    const { headerBlock } = parseRaw(raw);
    expect(headerBlock).toContain("Reply-To: alias@co.com");
  });

  it("includes In-Reply-To and References when inReplyTo is provided", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", inReplyTo: "<msg123@gmail.com>" });
    const { headerBlock } = parseRaw(raw);
    expect(headerBlock).toContain("In-Reply-To: <msg123@gmail.com>");
    expect(headerBlock).toContain("References: <msg123@gmail.com>");
  });
});

// ── HTML (multipart/alternative) ────────────────────────────────────────────

describe("buildRawEmail — HTML (multipart/alternative)", () => {
  it("places Content-Type: multipart/alternative in the header block", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "Plain", html: "<p>HTML</p>" });
    const { headerBlock } = parseRaw(raw);
    expect(headerBlock).toContain("Content-Type: multipart/alternative");
  });

  it("does NOT put Content-Type in the body section", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "Plain", html: "<p>HTML</p>" });
    const { body } = parseRaw(raw);
    // The body starts with the boundary, not a Content-Type header
    expect(body.trimStart()).toMatch(/^--boundary_alt_cp/);
  });

  it("body contains both plain and html parts", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "Plain text", html: "<p>Rich text</p>" });
    const { body } = parseRaw(raw);
    expect(body).toContain("Plain text");
    expect(body).toContain("<p>Rich text</p>");
    expect(body).toContain("Content-Type: text/plain");
    expect(body).toContain("Content-Type: text/html");
  });

  it("closes boundary with --boundary--", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", html: "<p>H</p>" });
    const { body } = parseRaw(raw);
    expect(body).toContain("--boundary_alt_cp--");
  });
});

// ── Attachments (multipart/mixed) ───────────────────────────────────────────

describe("buildRawEmail — attachments (multipart/mixed)", () => {
  it("places Content-Type: multipart/mixed in the header block", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", attachments: [makeAttachment()] });
    const { headerBlock } = parseRaw(raw);
    expect(headerBlock).toContain("Content-Type: multipart/mixed");
  });

  it("does NOT put Content-Type multipart/mixed in the body", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", attachments: [makeAttachment()] });
    const { body } = parseRaw(raw);
    expect(body).not.toContain("Content-Type: multipart/mixed");
  });

  it("body starts with the MIME boundary", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", attachments: [makeAttachment()] });
    const { body } = parseRaw(raw);
    expect(body.trimStart()).toMatch(/^--boundary_mixed_cp/);
  });

  it("attachment part has a blank line between its headers and base64 data", () => {
    const att = makeAttachment("test.pdf", "application/pdf", "PDF DATA");
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", attachments: [att] });
    const { body } = parseRaw(raw);
    // The Content-Disposition header must be followed by \r\n\r\n before the base64 data
    const dispositionIdx = body.indexOf('Content-Disposition: attachment; filename="test.pdf"');
    expect(dispositionIdx).toBeGreaterThan(-1);
    const afterDisposition = body.slice(dispositionIdx);
    expect(afterDisposition).toMatch(/Content-Disposition:[^\r\n]+\r\n\r\n/);
  });

  it("includes Content-Transfer-Encoding: base64 in the attachment part", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", attachments: [makeAttachment()] });
    const { body } = parseRaw(raw);
    expect(body).toContain("Content-Transfer-Encoding: base64");
  });

  it("attachment data is valid base64", () => {
    const content = "Hello PDF world";
    const att = makeAttachment("file.pdf", "application/pdf", content);
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", attachments: [att] });
    const { body } = parseRaw(raw);
    const expectedB64 = Buffer.from(content, "utf8").toString("base64");
    expect(body).toContain(expectedB64);
  });

  it("wraps base64 at 76 characters per line for large attachments", () => {
    const largeContent = "A".repeat(500);
    const att = makeAttachment("big.pdf", "application/pdf", largeContent);
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", attachments: [att] });
    const { body } = parseRaw(raw);
    // Every non-empty, non-boundary, non-header line in the attachment should be ≤76 chars
    const lines = body.split("\r\n").filter(l => l.length > 76);
    const longDataLines = lines.filter(l => !l.startsWith("--") && !l.includes(":"));
    expect(longDataLines).toHaveLength(0);
  });

  it("includes the text body before the attachment part", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "Please see attached.", attachments: [makeAttachment()] });
    const { body } = parseRaw(raw);
    expect(body).toContain("Please see attached.");
  });

  it("closes with --boundary-- terminator", () => {
    const raw = buildRawEmail({ to: "x@x.com", subject: "S", body: "B", attachments: [makeAttachment()] });
    const { body } = parseRaw(raw);
    expect(body).toContain("--boundary_mixed_cp--");
  });

  it("handles multiple attachments", () => {
    const raw = buildRawEmail({
      to: "x@x.com", subject: "S", body: "B",
      attachments: [
        makeAttachment("doc1.pdf", "application/pdf"),
        makeAttachment("photo.jpg", "image/jpeg"),
      ],
    });
    const { body } = parseRaw(raw);
    expect(body).toContain('filename="doc1.pdf"');
    expect(body).toContain('filename="photo.jpg"');
  });
});
