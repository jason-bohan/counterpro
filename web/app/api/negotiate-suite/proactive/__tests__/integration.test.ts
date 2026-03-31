import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the email pipeline function directly
import { buildProactivePrompt } from "@/lib/email-pipeline";

vi.mock("@/lib/email-pipeline", () => ({
  buildProactivePrompt: vi.fn(),
  SUITE_SYSTEM_PROMPT: "Mock system prompt",
}));

describe("Proactive Message Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildProactivePrompt creates correct prompt structure", () => {
    const { buildProactivePrompt } = require("@/lib/email-pipeline");
    
    const address = "123 Main St";
    const history = [
      { direction: "inbound", content: "Is the property still available?" },
      { direction: "outbound", content: "Yes, it is. Are you interested in viewing?" },
    ];
    const userMessage = "I'd like to offer $280,000";

    const prompt = buildProactivePrompt(address, history, userMessage);

    expect(prompt).toContain("123 Main St");
    expect(prompt).toContain("I'd like to offer $280,000");
    expect(prompt).toContain("professional, strategic email");
    expect(prompt).toContain("[COUNTERPARTY]: Is the property still available?");
    expect(prompt).toContain("[YOU]: Yes, it is. Are you interested in viewing?");
  });

  it("buildProactivePrompt handles empty history", () => {
    const { buildProactivePrompt } = require("@/lib/email-pipeline");
    
    const prompt = buildProactivePrompt("456 Oak Ave", [], "First proactive message");

    expect(prompt).toContain("456 Oak Ave");
    expect(prompt).toContain("First proactive message");
    expect(prompt).toContain("(No prior messages)");
  });

  it("buildProactivePrompt maintains conversation order", () => {
    const { buildProactivePrompt } = require("@/lib/email-pipeline");
    
    const history = [
      { direction: "inbound", content: "Offer $250k" },
      { direction: "outbound", content: "Too low, need $300k" },
      { direction: "inbound", content: "How about $275k?" },
      { direction: "outbound", content: "Still too low" },
    ];
    const userMessage = "I can meet at $285k";

    const prompt = buildProactivePrompt("789 Pine St", history, userMessage);

    // Check that conversation order is preserved
    const lines = prompt.split('\n');
    const historySection = lines.slice(
      lines.findIndex(line => line.includes("Negotiation history so far:")) + 1,
      lines.findIndex(line => line.includes("User wants to send this proactive message:"))
    ).join('\n');

    expect(historySection).toMatch(/\[COUNTERPARTY\]: Offer \$250k.*\[YOU\]: Too low, need \$300k.*\[COUNTERPARTY\]: How about \$275k\?.*\[YOU\]: Still too low/s);
  });

  it("buildProactivePrompt includes refinement instructions", () => {
    const { buildProactivePrompt } = require("@/lib/email-pipeline");
    
    const prompt = buildProactivePrompt("321 Elm St", [], "Simple message");

    expect(prompt).toContain("Refine this message into a professional, strategic email");
    expect(prompt).toContain("Maintains the professional tone");
    expect(prompt).toContain("concise and impactful");
    expect(prompt).toContain("clear next step");
    expect(prompt).toContain("conversation context");
  });
});
