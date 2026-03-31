import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";

// Mock dependencies
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Refined message: I would like to offer $280,000 for the property." }],
      }),
    },
  })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "user_123" }),
}));

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
  setupDatabase: vi.fn().mockResolvedValue(undefined),
  canUserRunSuite: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/email-pipeline", () => ({
  buildProactivePrompt: vi.fn().mockReturnValue("Mock prompt"),
  SUITE_SYSTEM_PROMPT: "Mock system prompt",
}));

vi.mock("@/lib/constants", () => ({
  CLAUDE_MODEL: "claude-3-sonnet",
  SUITE_MAX_TOKENS: 4000,
}));

describe("/api/negotiate-suite/proactive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValueOnce({ userId: null });

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ negotiationId: 1, message: "Test message" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not on suite plan", async () => {
    const { canUserRunSuite } = await import("@/lib/db");
    vi.mocked(canUserRunSuite).mockResolvedValueOnce(false);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ negotiationId: 1, message: "Test message" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Suite plan required");
  });

  it("returns 404 when negotiation is not found", async () => {
    const { sql } = await import("@/lib/db");
    vi.mocked(sql).mockResolvedValueOnce([]);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ negotiationId: 1, message: "Test message" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Not found");
  });

  it("successfully creates a proactive message and draft", async () => {
    const { sql } = await import("@/lib/db");
    
    // Mock negotiation lookup
    vi.mocked(sql).mockResolvedValueOnce([{
      id: 1,
      address: "123 Main St",
      role: "buyer",
      counterparty_email: "seller@example.com",
    }]);

    // Mock message history
    vi.mocked(sql).mockResolvedValueOnce([
      { direction: "inbound", content: "Property is available" },
      { direction: "outbound", content: "Great, I'm interested" },
    ]);

    // Mock message insertion
    vi.mocked(sql).mockResolvedValueOnce([{ id: 123 }]);

    // Mock negotiation update
    vi.mocked(sql).mockResolvedValueOnce(undefined);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ 
        negotiationId: 1, 
        message: "I would like to offer $280,000" 
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty("draft");
    expect(data).toHaveProperty("messageId");
    expect(data.messageId).toBe(123);
    expect(data.draft).toBe("Refined message: I would like to offer $280,000 for the property.");
  });

  it("calls buildProactivePrompt with correct parameters", async () => {
    const { sql } = await import("@/lib/db");
    const { buildProactivePrompt } = await import("@/lib/email-pipeline");
    
    // Mock negotiation lookup
    vi.mocked(sql).mockResolvedValueOnce([{
      id: 1,
      address: "123 Main St",
      role: "buyer",
      counterparty_email: "seller@example.com",
    }]);

    // Mock message history
    vi.mocked(sql).mockResolvedValueOnce([
      { direction: "inbound", content: "Property is available" },
    ]);

    // Mock message insertion
    vi.mocked(sql).mockResolvedValueOnce([{ id: 123 }]);
    vi.mocked(sql).mockResolvedValueOnce(undefined);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ 
        negotiationId: 1, 
        message: "Test proactive message" 
      }),
      headers: { "Content-Type": "application/json" },
    });

    await POST(request);

    expect(buildProactivePrompt).toHaveBeenCalledWith(
      "123 Main St",
      [{ direction: "inbound", content: "Property is available" }],
      "Test proactive message"
    );
  });

  it("saves message with correct direction and content", async () => {
    const { sql } = await import("@/lib/db");
    
    // Mock negotiation lookup
    vi.mocked(sql).mockResolvedValueOnce([{
      id: 1,
      address: "123 Main St",
      role: "buyer",
      counterparty_email: "seller@example.com",
    }]);

    // Mock empty message history
    vi.mocked(sql).mockResolvedValueOnce([]);

    // Mock message insertion
    const mockInsert = vi.fn().mockResolvedValue([{ id: 456 }]);
    vi.mocked(sql).mockImplementationOnce(mockInsert);

    // Mock negotiation update
    vi.mocked(sql).mockResolvedValueOnce(undefined);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ 
        negotiationId: 1, 
        message: "Offer $250k" 
      }),
      headers: { "Content-Type": "application/json" },
    });

    await POST(request);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO negotiation_messages")
    );
  });
});
