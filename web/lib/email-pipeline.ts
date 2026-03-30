/**
 * email-pipeline.ts
 * Pure functions for parsing and routing inbound negotiation emails.
 * Extracted from the Gmail webhook so they can be unit tested without
 * hitting the database, Gmail API, or Anthropic.
 */

export type GmailMessagePart = {
  mimeType: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
  headers?: Array<{ name: string; value: string }>;
};

export type ParsedEmail = {
  to: string;
  from: string;
  subject: string;
  body: string;
};

export type InboundRouting =
  | { type: "negotiation"; negotiationId: number }
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
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
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

export function routeInboundEmail(from: string, to: string): InboundRouting {
  // Block loops: emails from our own domain
  if (from.includes(`@${ALIAS_DOMAIN}`)) return { type: "loop" };

  const match = to.match(ALIAS_PATTERN);
  if (!match) return { type: "unrelated" };

  const negotiationId = parseInt(match[1], 10);
  if (isNaN(negotiationId)) return { type: "unrelated" };

  return { type: "negotiation", negotiationId };
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
- Do NOT include any preamble like "Here's a draft response:" or "Here is my suggested reply:" — start directly with the email content`;
