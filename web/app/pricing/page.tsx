"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { SupportEmail } from "@/components/support-email";
import { CheckoutSheet } from "@/components/checkout-sheet";

type Plan = "single" | "subscription" | "suite";

export default function PricingPage() {
  const router = useRouter();
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);


  const checkout = (plan: Plan) => setCheckoutPlan(plan);

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <CheckoutSheet
        plan={checkoutPlan}
        onClose={() => setCheckoutPlan(null)}
        onUnauth={() => { setCheckoutPlan(null); router.push("/sign-in?redirect_url=/pricing"); }}
      />
      <header className="border-b bg-background">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Logo size={44} href="/" />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3">Choose your plan</h1>
          <p className="text-muted-foreground text-lg">One deal could save you $10,000–$30,000</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-2xl w-full pt-4">
          <Card className="border-2 hover:border-primary/40 transition-colors">
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
                onClick={() => checkout("single")}
              >
                Get started — $50
              </Button>
            </CardContent>
          </Card>

          <Card className="border-2 border-primary relative overflow-visible shadow-md">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
              <Badge className="px-3 shadow-sm">Best value</Badge>
            </div>
            <CardHeader className="pt-7">
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
                onClick={() => checkout("subscription")}
              >
                Subscribe — $100/mo
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Enterprise */}
        <div className="mt-6 max-w-2xl w-full">
          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardContent className="py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-xl">$1,000<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
                  <Badge variant="outline" className="text-xs">Enterprise</Badge>
                </div>
                <p className="font-semibold">Team Plan for Brokerages</p>
                <p className="text-sm text-muted-foreground mt-1">
                  12 agent seats included. Unlimited deals, admin dashboard, and brokerage branding. $85/seat additional.
                </p>
              </div>
              <Link href="/enterprise" className="shrink-0">
                <Button variant="outline">Learn more →</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Full Negotiation Suite */}
        <div className="mt-4 max-w-2xl w-full">
          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardContent className="py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-xl">$300<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
                  <Badge className="text-xs">New</Badge>
                </div>
                <p className="font-semibold">Full Negotiation Suite</p>
                <p className="text-sm text-muted-foreground mt-1">
                  AI manages the full back-and-forth. You approve each response before it sends from your own email. Includes thread tracking, deadline alerts, and contingency management.
                </p>
              </div>
              <Button onClick={() => checkout("suite")} className="shrink-0">
                Subscribe →
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
      <p className="text-xs text-muted-foreground mt-8 text-center">
        Questions? <SupportEmail className="underline underline-offset-2 hover:text-foreground" />
      </p>
    </div>
  );
}
