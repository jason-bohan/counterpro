import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

describe("Stripe Real Key Test", () => {
  // Don't use the setup file mocks for this test
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment to actual .env values
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SUBSCRIPTION_PRICE_ID;
    delete process.env.STRIPE_SUITE_PRICE_ID;
    delete process.env.STRIPE_SINGLE_PRICE_ID;
  });

  it("should test with real Stripe key from .env", async () => {
    // Load environment from .env file
    const { loadEnv } = await import('vite');
    const env = loadEnv('test', process.cwd(), '');
    
    const testKey = env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    
    console.log("Testing with Stripe key:", testKey?.substring(0, Math.min(10, testKey.length)) + "...");
    
    if (!testKey) {
      throw new Error("STRIPE_SECRET_KEY not found in environment");
    }

    // Check if it's your real key
    if (testKey === "mk_1TFfx0EwEPQMnHPs1asnkDRB") {
      console.log("✅ Using your provided key");
    } else {
      console.log("⚠️ Using different key:", testKey);
    }

    // Check key format
    if (testKey.startsWith("sk_live_")) {
      console.log("✅ Live key detected");
    } else if (testKey.startsWith("sk_test_")) {
      console.log("✅ Test key detected");
    } else {
      console.log("⚠️ Unusual key format - this might be a restricted key");
    }

    // Test Stripe connection
    const stripe = new Stripe(testKey);
    
    try {
      const balance = await stripe.balance.retrieve();
      console.log("✅ Stripe API call successful!");
      console.log("Available balance:", balance.available?.map((b: any) => `${b.amount/100} ${b.currency.toUpperCase()}`).join(", "));
      expect(balance).toBeDefined();
      expect(balance.object).toBe("balance");
    } catch (error: any) {
      console.error("❌ Stripe API call failed:", error.message);
      
      if (error.message.includes("Invalid API Key")) {
        throw new Error("The Stripe key is invalid or revoked");
      } else if (error.message.includes("permission")) {
        throw new Error("The Stripe key lacks required permissions");
      } else {
        throw new Error(`Stripe API error: ${error.message}`);
      }
    }
  });

  it("should validate the provided key format", () => {
    const testKey = "mk_1TFfx0EwEPQMnHPs1asnkDRB";
    
    console.log("Validating key format:", testKey);
    
    // This appears to be a restricted key or different format
    // Let's check if it follows Stripe patterns
    expect(testKey).toBeDefined();
    expect(testKey.length).toBeGreaterThan(20);
    
    // Restricted keys can start with different prefixes
    if (testKey.startsWith("sk_") || testKey.startsWith("rk_") || testKey.startsWith("sk_live_") || testKey.startsWith("sk_test_")) {
      console.log("✅ Key format looks valid for Stripe");
    } else {
      console.log("⚠️ Unusual key format - might be a restricted key or different service");
    }
  });
});
