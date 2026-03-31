import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildProactivePrompt } from "@/lib/email-pipeline";

// Simple tests that verify the core logic without complex API mocking
describe("Proactive Message Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildProactivePrompt creates correct prompt for simple offer", () => {
    const prompt = buildProactivePrompt(
      "123 Main St", 
      [], 
      "I want to offer $280,000"
    );

    expect(prompt).toContain("123 Main St");
    expect(prompt).toContain("I want to offer $280,000");
    expect(prompt).toContain("professional, strategic email");
    expect(prompt).toContain("(No prior messages)");
  });

  it("buildProactivePrompt handles existing conversation context", () => {
    const history = [
      { direction: "inbound", content: "Is the property still available?" },
      { direction: "outbound", content: "Yes, it is. Are you interested in viewing?" },
      { direction: "inbound", content: "Yes, when can I see it?" },
    ];

    const prompt = buildProactivePrompt(
      "456 Oak Ave", 
      history, 
      "I'd like to schedule a viewing this Saturday afternoon"
    );

    expect(prompt).toContain("456 Oak Ave");
    expect(prompt).toContain("schedule a viewing this Saturday afternoon");
    expect(prompt).toContain("[COUNTERPARTY]: Is the property still available?");
    expect(prompt).toContain("[YOU]: Yes, it is. Are you interested in viewing?");
    expect(prompt).toContain("[COUNTERPARTY]: Yes, when can I see it?");
  });

  it("buildProactivePrompt maintains proper conversation flow", () => {
    const history = [
      { direction: "inbound", content: "Offer $250k" },
      { direction: "outbound", content: "Too low, need $300k" },
      { direction: "inbound", content: "How about $275k?" },
    ];

    const prompt = buildProactivePrompt(
      "789 Pine St", 
      history, 
      "I can meet at $285k if we close quickly"
    );

    const lines = prompt.split('\n');
    
    // Verify conversation order is preserved
    expect(prompt).toContain("Offer $250k");
    expect(prompt).toContain("Too low, need $300k");
    expect(prompt).toContain("How about $275k?");
    expect(prompt).toContain("I can meet at $285k if we close quickly");
    
    // Verify the order by checking positions
    const offerIndex = prompt.indexOf("Offer $250k");
    const tooLowIndex = prompt.indexOf("Too low, need $300k");
    const howAboutIndex = prompt.indexOf("How about $275k?");
    
    expect(offerIndex).toBeLessThan(tooLowIndex);
    expect(tooLowIndex).toBeLessThan(howAboutIndex);
  });

  it("buildProactivePrompt includes all refinement instructions", () => {
    const prompt = buildProactivePrompt(
      "321 Elm St", 
      [], 
      "Simple message"
    );

    expect(prompt).toContain("Refine this message into a professional, strategic email");
    expect(prompt).toContain("Maintains the professional tone");
    expect(prompt).toContain("concise and impactful");
    expect(prompt).toContain("clear next step");
    expect(prompt).toContain("conversation context");
  });

  it("buildProactivePrompt handles complex user messages", () => {
    const complexMessage = "I've been pre-approved for a loan up to $350k, I'm flexible on closing date, and I really love this property. Would you consider $320k?";
    
    const prompt = buildProactivePrompt(
      "555 Maple Dr", 
      [], 
      complexMessage
    );

    expect(prompt).toContain("555 Maple Dr");
    expect(prompt).toContain(complexMessage);
    expect(prompt).toContain("professional, strategic email");
  });

  it("buildProactivePrompt works with mixed conversation history", () => {
    const history = [
      { direction: "outbound", content: "Property listed at $300k" },
      { direction: "inbound", content: "That's too high for me" },
      { direction: "outbound", content: "What's your budget?" },
      { direction: "inbound", content: "Around $250k" },
    ];

    const prompt = buildProactivePrompt(
      "999 Cedar Ln", 
      history, 
      "I could do $260k with a quick close"
    );

    expect(prompt).toContain("[YOU]: Property listed at $300k");
    expect(prompt).toContain("[COUNTERPARTY]: That's too high for me");
    expect(prompt).toContain("[YOU]: What's your budget?");
    expect(prompt).toContain("[COUNTERPARTY]: Around $250k");
    expect(prompt).toContain("I could do $260k with a quick close");
  });
});
