"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const checkout = async (plan: "single" | "subscription") => {
    setLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 401) { router.push("/sign-in?redirect_url=/pricing"); return; }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="border-b bg-background">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary"/>
              <path d="M16 5L5 14h3v13h8v-8h4v8h4V14h3L16 5z" fill="white"/>
            </svg>
            <span className="font-bold text-lg">CounterPro</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3">Choose your plan</h1>
          <p className="text-muted-foreground text-lg">One deal could save you $10,000–$30,000</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-2xl w-full">
          <Card className="border-2">
            <CardHeader>
              <Badge variant="outline" className="w-fit mb-2">Single deal</Badge>
              <CardTitle className="text-4xl font-bold">$50</CardTitle>
              <p className="text-muted-foreground text-sm">One-time payment</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>✓ Full negotiation package</li>
                <li>✓ Counter-offer with reasoning</li>
                <li>✓ Email + verbal scripts</li>
                <li>✓ Live comparable sales data</li>
                <li>✓ Red flags &amp; walk-away point</li>
                <li>✓ Download as PDF</li>
              </ul>
              <Button
                className="w-full"
                variant="outline"
                size="lg"
                disabled={loading === "single"}
                onClick={() => checkout("single")}
              >
                {loading === "single" ? "Redirecting..." : "Get started — $50"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-2 border-primary relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="px-3">Best value</Badge>
            </div>
            <CardHeader>
              <Badge variant="outline" className="w-fit mb-2">Subscription</Badge>
              <CardTitle className="text-4xl font-bold">
                $100<span className="text-lg font-normal text-muted-foreground">/mo</span>
              </CardTitle>
              <p className="text-muted-foreground text-sm">Unlimited deals</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>✓ Everything in Single deal</li>
                <li>✓ Unlimited negotiations</li>
                <li>✓ Deal history dashboard</li>
                <li>✓ Cancel anytime</li>
                <li>✓ Best for investors &amp; agents</li>
              </ul>
              <Button
                className="w-full"
                size="lg"
                disabled={loading === "subscription"}
                onClick={() => checkout("subscription")}
              >
                {loading === "subscription" ? "Redirecting..." : "Subscribe — $100/mo"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
