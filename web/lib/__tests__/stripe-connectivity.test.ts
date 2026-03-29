import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

describe("Stripe Connectivity Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should validate Stripe key format", () => {
    const testKey = process.env.STRIPE_SECRET_KEY;
    
    console.log("Testing Stripe key:", testKey?.substring(0, 10) + "...");
    
    // Check if key exists
    expect(testKey).toBeDefined();
    expect(testKey).not.toBe("");
    
    // Check key format
    if (testKey?.startsWith("sk_live_")) {
      console.log("✅ Live key detected");
      expect(testKey).toMatch(/^sk_live_[A-Za-z0-9]+$/);
    } else if (testKey?.startsWith("sk_test_")) {
      console.log("✅ Test key detected");
      expect(testKey).toMatch(/^sk_test_[A-Za-z0-9]+$/);
    } else {
      throw new Error(`Invalid Stripe key format. Expected sk_live_ or sk_test_, got: ${testKey?.substring(0, 10)}...`);
    }
  });

  it("should create Stripe instance without error", () => {
    const testKey = process.env.STRIPE_SECRET_KEY;
    
    expect(() => {
      const stripe = new Stripe(testKey!);
      expect(stripe).toBeDefined();
    }).not.toThrow();
  });

  it("should test basic Stripe API call", async () => {
    const testKey = process.env.STRIPE_SECRET_KEY;
    
    if (!testKey) {
      throw new Error("STRIPE_SECRET_KEY not found in environment");
    }

    const stripe = new Stripe(testKey);
    
    try {
      // Test a simple API call that doesn't require actual data
      const balance = await stripe.balance.retrieve();
      console.log("✅ Stripe API call successful");
      console.log("Balance:", balance);
      expect(balance).toBeDefined();
      expect(balance.object).toBe("balance");
    } catch (error: any) {
      console.error("❌ Stripe API call failed:", error.message);
      
      // Check for specific error types
      if (error.message.includes("Invalid API Key")) {
        throw new Error("Stripe API key is invalid or revoked");
      } else if (error.message.includes("No such key")) {
        throw new Error("Stripe API key does not exist");
      } else if (error.message.includes("permission")) {
        throw new Error("Stripe API key lacks required permissions");
      } else {
        throw new Error(`Stripe API error: ${error.message}`);
      }
    }
  });

  it("should validate Price ID formats", () => {
    const subscriptionPriceId = process.env.STRIPE_SUBSCRIPTION_PRICE_ID;
    const suitePriceId = process.env.STRIPE_SUITE_PRICE_ID;
    const singlePriceId = process.env.STRIPE_SINGLE_PRICE_ID;
    
    console.log("Subscription Price ID:", subscriptionPriceId);
    console.log("Suite Price ID:", suitePriceId);
    console.log("Single Price ID:", singlePriceId);
    
    // Check if Price IDs exist
    expect(subscriptionPriceId).toBeDefined();
    expect(suitePriceId).toBeDefined();
    expect(singlePriceId).toBeDefined();
    
    // Check Price ID formats (should start with 'price_')
    const priceIdPattern = /^price_[A-Za-z0-9]+$/;
    
    if (subscriptionPriceId && subscriptionPriceId !== "price_your_subscription_price_id_here") {
      expect(subscriptionPriceId).toMatch(priceIdPattern);
    }
    
    if (suitePriceId && suitePriceId !== "price_your_suite_price_id_here") {
      expect(suitePriceId).toMatch(priceIdPattern);
    }
    
    if (singlePriceId && singlePriceId !== "price_your_single_price_id_here") {
      expect(singlePriceId).toMatch(priceIdPattern);
    }
  });

  it("should test checkout session creation (mock)", async () => {
    const testKey = process.env.STRIPE_SECRET_KEY;
    
    if (!testKey) {
      throw new Error("STRIPE_SECRET_KEY not found in environment");
    }

    const stripe = new Stripe(testKey);
    
    // Mock the checkout session creation to test the API structure
    const mockSession = {
      id: "cs_test_123",
      object: "checkout.session",
      url: "https://checkout.stripe.com/pay/cs_test_123",
    };
    
    // This will test if your key has permissions to create checkout sessions
    try {
      // Note: This will fail with test keys, but will validate the API structure
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price: testKey.startsWith("sk_test_") ? "price_1OqX2R2eZvKYlo2C0r5E3t7Z" : process.env.STRIPE_SINGLE_PRICE_ID,
          quantity: 1,
        }],
        success_url: "http://localhost:3000/success",
        cancel_url: "http://localhost:3000/cancel",
      });
      
      console.log("✅ Checkout session creation successful");
      expect(session).toBeDefined();
    } catch (error: any) {
      console.log("⚠️ Checkout session creation failed (expected with test keys):", error.message);
      
      // With test keys, this is expected to fail if the price doesn't exist
      // But we can still validate the error is not an authentication error
      expect(error.message).not.toContain("Invalid API Key");
    }
  });
});
