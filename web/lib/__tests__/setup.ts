import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Stripe
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}));

// Mock Clerk
vi.mock("@clerk/nextjs", () => ({
  auth: vi.fn(() => Promise.resolve({ userId: "test-user" })),
  currentUser: vi.fn(() => Promise.resolve({ 
    id: "test-user",
    emailAddresses: [{ emailAddress: "test@example.com" }]
  })),
  useUser: vi.fn(() => ({
    user: {
      id: "test-user",
      emailAddresses: [{ emailAddress: "test@example.com" }]
    }
  })),
  UserButton: () => "div",
}));

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Mock environment variables
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.STRIPE_SECRET_KEY = "sk_test_123";
process.env.STRIPE_SUBSCRIPTION_PRICE_ID = "price_test_subscription";
process.env.STRIPE_SUITE_PRICE_ID = "price_test_suite";
process.env.STRIPE_SINGLE_PRICE_ID = "price_test_single";
