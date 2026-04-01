"use client";

import { useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type Plan = "single" | "subscription" | "suite";

const planLabels: Record<Plan, string> = {
  single: "Single Deal — $50",
  subscription: "Unlimited — $100/mo",
  suite: "Full Negotiation Suite — $300/mo",
};

interface CheckoutSheetProps {
  plan: Plan | null;
  onClose: () => void;
  onUnauth: () => void;
}

export function CheckoutSheet({ plan, onClose, onUnauth }: CheckoutSheetProps) {
  const [error, setError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, embedded: true }),
    });
    if (res.status === 401) {
      onUnauth();
      return "";
    }
    if (!res.ok) {
      setError("Failed to load checkout. Please try again.");
      return "";
    }
    const { clientSecret } = await res.json();
    return clientSecret ?? "";
  }, [plan, onUnauth]);

  return (
    <Sheet open={!!plan} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>{plan ? planLabels[plan] : ""}</SheetTitle>
        </SheetHeader>
        <div className="p-4">
          {error ? (
            <p className="text-sm text-destructive text-center py-8">{error}</p>
          ) : plan ? (
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ fetchClientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
