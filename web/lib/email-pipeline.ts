/**
 * email-pipeline.ts
 * Pure functions for parsing and routing inbound negotiation emails.
 * Extracted from the Gmail webhook so they can be unit tested without
 * hitting the database, Gmail API, or Anthropic.
 */

export type GmailMessagePart = {
  mimeType: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
  headers?: Array<{ name: string; value: string }>;
};

export type GmailAttachmentPart = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

/** Walk the MIME tree and return every part that is a file attachment. */
export function extractAttachments(payload: GmailMessagePart): GmailAttachmentPart[] {
  const results: GmailAttachmentPart[] = [];

  function walk(part: GmailMessagePart) {
    const attachmentId = part.body?.attachmentId;
    if (attachmentId) {
      // Prefer filename from Content-Disposition, fall back to Content-Type name param
      const disposition = part.headers?.find(h => h.name.toLowerCase() === "content-disposition")?.value ?? "";
      const contentType = part.headers?.find(h => h.name.toLowerCase() === "content-type")?.value ?? "";
      const filename =
        disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)?.[1]?.trim() ||
        contentType.match(/name\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)?.[1]?.trim() ||
        `attachment-${attachmentId.slice(0, 8)}`;
      results.push({ attachmentId, filename, mimeType: part.mimeType, size: part.body?.size ?? 0 });
    }
    for (const child of part.parts ?? []) walk(child);
  }

  walk(payload);
  return results;
}

export type ParsedEmail = {
  to: string;
  from: string;
  subject: string;
  body: string;
};

export type InboundRouting =
  | { type: "negotiation"; negotiationId: number; sourceNegotiationId: number | null }
  | { type: "loop" }
  | { type: "unrelated" };

// ── Parsing helpers ────────────────────────────────────────────────────────

export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    // Block-level elements that signal a new line
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|tr|h[1-6]|blockquote)[^>]*>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    // Collapse runs of spaces (but preserve newlines)
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findPart(payload: GmailMessagePart, mimeType: string): GmailMessagePart | null {
  if (payload.mimeType === mimeType && payload.body?.data) return payload;
  for (const part of payload.parts ?? []) {
    const found = findPart(part, mimeType);
    if (found) return found;
  }
  return null;
}

export function extractBody(payload: GmailMessagePart): string {
  const plain = findPart(payload, "text/plain");
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);
  const html = findPart(payload, "text/html");
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

export function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string
): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function parseEmail(payload: GmailMessagePart): ParsedEmail {
  const headers = payload.headers ?? [];
  return {
    to: getHeader(headers, "To"),
    from: getHeader(headers, "From"),
    subject: getHeader(headers, "Subject"),
    body: extractBody(payload),
  };
}

// ── Routing ────────────────────────────────────────────────────────────────

const ALIAS_DOMAIN = "counterproai.com";
const ALIAS_PATTERN = new RegExp(`sales\\+neg(\\d+)@${ALIAS_DOMAIN.replace(".", "\\.")}`, "i");

export function extractNegotiationAliasId(value: string): number | null {
  const match = value.match(ALIAS_PATTERN);
  if (!match) return null;

  const negotiationId = parseInt(match[1], 10);
  return Number.isNaN(negotiationId) ? null : negotiationId;
}

export function routeInboundEmail(from: string, to: string): InboundRouting {
  const negotiationId = extractNegotiationAliasId(to);
  if (negotiationId == null) return { type: "unrelated" };

  const sourceNegotiationId = extractNegotiationAliasId(from);
  if (sourceNegotiationId === negotiationId) return { type: "loop" };

  // Keep blocking other internal mailbox traffic unless it comes from a
  // specific negotiation alias we can validate later.
  if (sourceNegotiationId == null && from.includes(`@${ALIAS_DOMAIN}`)) {
    return { type: "loop" };
  }

  return { type: "negotiation", negotiationId, sourceNegotiationId };
}

// ── First contact prompt builders ─────────────────────────────────────────

export function buildMarketResearchPrompt(address: string): string {
  return `You are a real estate market analyst. Analyze this property: ${address}

Based on the location and typical market conditions for this area, provide a JSON response with:
- Estimated fair market value range
- Suggested opening offer for a buyer (typically 3-8% below market to leave negotiation room)
- One sentence of reasoning

Respond ONLY with this exact JSON format, no other text:
{
  "market_value_low": 450000,
  "market_value_high": 480000,
  "suggested_offer": 435000,
  "reasoning": "Comparable homes in this area have sold for..."
}`;
}

export function buildFirstContactPrompt(
  address: string,
  role: "buyer" | "seller" | string,
  offerAmount: number,
  notes?: string
): string {
  const isBuyer = role === "buyer";
  return `You are CounterPro, helping a real estate ${role} initiate contact about the property at: ${address}

${isBuyer ? `Buyer's opening offer: $${offerAmount.toLocaleString()}` : `Seller's asking price: $${offerAmount.toLocaleString()}`}
${notes ? `Additional context: ${notes}` : ""}

Draft a professional first contact email that:
- ${isBuyer ? "Expresses genuine, serious interest in the property" : "Presents the property as an attractive opportunity"}
- States the ${isBuyer ? "offer" : "asking price"} confidently with brief market justification
- ${isBuyer ? "Shows flexibility on timeline/terms to compensate for the price" : "Highlights the property's strengths and favorable terms"}
- Creates mild urgency without being aggressive
- Ends with a clear, specific next step
- Is concise — 3 to 4 short paragraphs
- Do NOT include a subject line — just the email body`;
}

// ── AI prompt builder ──────────────────────────────────────────────────────

export function buildNegotiationPrompt(
  address: string,
  history: Array<{ direction: string; content: string }>,
  newMessage: string
): string {
  const historyText = history
    .map(m => `[${m.direction === "inbound" ? "COUNTERPARTY" : "YOU"}]: ${m.content}`)
    .join("\n\n");

  return `Property: ${address}

Negotiation history so far:
${historyText || "(No prior messages)"}

New message from counterparty:
${newMessage}

Draft my response:`;
}

export function buildProactivePrompt(
  address: string,
  history: Array<{ direction: string; content: string }>,
  userMessage: string
): string {
  const historyText = history
    .map(m => `[${m.direction === "inbound" ? "COUNTERPARTY" : "YOU"}]: ${m.content}`)
    .join("\n\n");

  return `Property: ${address}

Negotiation history so far:
${historyText || "(No prior messages)"}

User wants to send this proactive message:
"${userMessage}"

Refine this message into a professional, strategic email that:
- Maintains the professional tone of the negotiation
- Is concise and impactful
- Ends with a clear next step if appropriate
- Fits naturally into the existing conversation context

Return the refined message as the email body (no subject line needed):`;
}

const AGREEMENT_PATTERNS = [
  /\bwe have a deal\b/i,
  /\bi(?:'| wi)?ll accept\b/i,
  /\baccepted\b/i,
  /\bagree(?:d|ment)?\b/i,
  /\bready to move forward\b/i,
  /\bformal contract\b/i,
  /\bnext steps\b/i,
];

export function detectAgreementReached(text: string): boolean {
  const normalized = text.trim();
  return AGREEMENT_PATTERNS.some(pattern => pattern.test(normalized));
}

export function extractCurrencyAmount(text: string): number | null {
  const matches = Array.from(text.matchAll(/\$?\s*(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d{2})?/g));
  if (matches.length === 0) return null;
  const raw = matches[matches.length - 1][1];
  const numeric = Number(raw.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

// ── Markdown stripping ─────────────────────────────────────────────────────

/**
 * Convert markdown-formatted text to plain text suitable for email.
 * Strips headers, bold/italic, inline code, links, and list markers.
 */
export function stripMarkdown(text: string): string {
  return text
    // ATX headers (## Heading) → just the heading text
    .replace(/^#{1,6}\s+/gm, "")
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Bold/italic (*** or ** or * or ___ or __ or _)
    .replace(/(\*{1,3}|_{1,3})(.+?)\1/g, "$2")
    // Inline code
    .replace(/`([^`]+)`/g, "$1")
    // Fenced code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Images ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Blockquotes
    .replace(/^>\s*/gm, "")
    // Unordered list markers
    .replace(/^[\s]*[-*+]\s+/gm, "")
    // Ordered list markers
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Collapse 3+ consecutive newlines to 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Strips common AI preamble phrases that should never appear in a sent email.
// Applied at send time only — draft review UI keeps the original text.
export function stripAiPreamble(text: string): string {
  return text
    .replace(/^(here'?s? (is )?(a |my )?(draft|suggested|sample) (response|reply|email)[:\s]*\n*)/i, "")
    .replace(/^(draft (response|reply|email)[:\s]*\n*)/i, "")
    .trimStart();
}

export const SUITE_SYSTEM_PROMPT = `You are CounterPro, an expert real estate negotiation coach.
You are helping a user manage an ongoing negotiation thread.
Given the full conversation history and the latest message from the counterparty,
draft the ideal response for the user to send.

Rules:
- Be strategic, professional, and firm but not aggressive
- Reference prior messages and any concessions already made
- Keep responses concise — real estate emails are short
- Use specific numbers, not ranges
- End with a clear next step or deadline
- Do NOT include a subject line — just the email body
- Do NOT include any preamble like "Here's a draft response:" or "Here is my suggested reply:" — start directly with the email content

Critical limitations — you CANNOT do any of the following, so never promise or imply that you will:
- Attach, send, or reference any documents, contracts, or files of any kind
- Draft a purchase agreement, contract, or any legal document
- Schedule calls, meetings, or appointments
- Look up property records, title status, or legal information in real time
- Connect to any external systems

When a deal reaches verbal agreement and the counterparty asks for paperwork or next steps:
- Acknowledge the agreement and congratulate both sides
- Tell the counterparty that the user's attorney or representative will be in touch to coordinate the formal contract and next steps
- Do NOT promise a timeline for documents you cannot deliver
- Do NOT say "I will have it to you by..." or "the agreement is being finalized" — you have no way to do this`;
