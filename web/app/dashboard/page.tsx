"use client";

import { UserButton } from "@clerk/nextjs";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PromoCode } from "@/components/promo-code";

type Deal = {
  id: number;
  address: string;
  role: string;
  asking_price: number;
  offer_amount: number;
  created_at: string;
};

type Plan = {
  plan: "free" | "single" | "subscription" | "suite";
  deals_remaining: number;
  subscription_end: string | null;
};

function DashboardInner() {
  const { user } = useUser();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const searchParams = useSearchParams();
  const paymentSuccess = searchParams.get("payment") === "success";

  // Debug: Log user object to see its structure
  console.log("User object:", user);
  console.log("User firstName:", user?.firstName);
  console.log("User fullName:", user?.fullName);
  console.log("User username:", user?.username);
  console.log("User emailAddresses:", user?.emailAddresses);
  console.log("User primary email:", user?.emailAddresses?.[0]?.emailAddress);

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => r.json())
      .then((d) => {
        setDeals(d.deals ?? []);
        setPlan(d.plan ?? null);
      })
      .catch(() => {});
  }, []);

  const [portalLoading, setPortalLoading] = useState(false);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setPortalLoading(false);
    }
  };

  const planLabel = () => {
    if (!plan || plan.plan === "free") return null;
    if (plan.plan === "subscription") return <Badge className="bg-green-600 text-white">Unlimited subscription</Badge>;
    if (plan.plan === "suite") return <Badge className="bg-purple-600 text-white">Suite</Badge>;
    if (plan.plan === "single") return <Badge variant="outline">{plan.deals_remaining} deal credit{plan.deals_remaining !== 1 ? "s" : ""} remaining</Badge>;
    return null;
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
          <Logo size={44} href="/" />
          <div className="flex items-center gap-3">
            {planLabel()}
            {(plan?.plan === "subscription" || plan?.plan === "suite") && (
              <Button variant="ghost" size="sm" onClick={openPortal} disabled={portalLoading}>
                {portalLoading ? "Loading..." : "Manage subscription"}
              </Button>
            )}
            {user?.firstName ? (
              <span className="text-sm text-muted-foreground">
                {user.firstName}
              </span>
            ) : user?.username ? (
              <span className="text-sm text-muted-foreground">
                {user.username}
              </span>
            ) : user?.emailAddresses?.[0] ? (
              <span className="text-sm text-muted-foreground">
                {user.emailAddresses[0].emailAddress}
              </span>
            ) : null}
            <UserButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10">
        {paymentSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 font-medium">
            ✓ Payment successful! You&apos;re all set — start your negotiation below.
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-2xl font-bold">
            Welcome back{user?.firstName ? `, ${user.firstName}` : user?.username ? `, ${user.username}` : user?.emailAddresses?.[0] ? `, ${user.emailAddresses[0].emailAddress}` : ""}
          </h1>
          <p className="text-muted-foreground mt-1">Ready to negotiate your next deal?</p>
        </div>

        {/* Start new deal */}
        <Card data-section="new-deal-cta" className="border-2 border-primary mb-8">
          <CardHeader>
            <CardTitle>Start a new negotiation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm max-w-md">
              Enter your deal details and get a complete counter-offer strategy, email scripts, and verbal scripts in minutes.
            </p>
            <Link href="/deal">
              <Button size="lg" className="shrink-0">New deal →</Button>
            </Link>
          </CardContent>
        </Card>

        {/* Deal history */}
        {deals.length > 0 && (
          <div data-section="deal-history" className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Your deals</h2>
            <div className="flex flex-col gap-4">
              {deals.map((deal) => (
                <Link key={deal.id} href={`/deal/${deal.id}`}>
                  <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardContent className="py-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{deal.address}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {deal.role} · Asking ${Number(deal.asking_price).toLocaleString()} · Offer ${Number(deal.offer_amount).toLocaleString()} · {new Date(deal.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="capitalize">{deal.role}</Badge>
                        <span className="text-xs text-muted-foreground">View →</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Pricing */}
        <div data-section="pricing-cards" className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <Badge variant="outline" className="w-fit">Single deal</Badge>
              <CardTitle className="text-2xl mt-2">$50</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">One negotiation package. Full strategy, scripts, and analysis.</p>
              <Link href="/pricing">
                <Button className="w-full" variant="outline">Get package</Button>
              </Link>
              <PromoCode onRedeemed={() => window.location.reload()} />
            </CardContent>
          </Card>
          <Card className="border-primary border-2">
            <CardHeader className="pb-2">
              <Badge className="w-fit">Best value</Badge>
              <CardTitle className="text-2xl mt-2">$100<span className="text-base font-normal text-muted-foreground">/mo</span></CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">Unlimited deals per month. Ideal for investors and frequent buyers/sellers.</p>
              <Link href="/pricing">
                <Button className="w-full">Subscribe</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Full Negotiation Suite */}
        <Card data-section="full-suite-upsell" className="mt-4 border-2 border-dashed border-muted-foreground/30">
          <CardContent className="py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-xl">$300<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
                {plan?.plan !== "suite" && (
                  <Badge className="text-xs">New</Badge>
                )}
                {plan?.plan === "suite" && (
                  <Badge className="text-xs bg-purple-600 text-white">Active</Badge>
                )}
              </div>
              <p className="font-semibold">Full Negotiation Suite</p>
              <p className="text-sm text-muted-foreground mt-1">
                AI manages the full back-and-forth. You approve each response before it sends. Includes thread tracking, deadline alerts, and contingency management.
              </p>
            </div>
            {plan?.plan === "suite" ? (
              <Link href="/negotiate" className="shrink-0">
                <Button>Go to Suite →</Button>
              </Link>
            ) : (
              <Link href="/pricing" className="shrink-0">
                <Button variant="outline">Get started →</Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Enterprise Team Plan */}
        <Card data-section="enterprise-upsell" className="mt-4 border-2 hover:border-primary/40 transition-colors">
          <CardContent className="py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-xl">$1,000<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
                <Badge variant="outline" className="text-xs">Enterprise</Badge>
              </div>
              <p className="font-semibold">Team Plan for Brokerages</p>
              <p className="text-sm text-muted-foreground mt-1">
                12 agent seats included. Unlimited deals, admin dashboard, brokerage branding.
              </p>
            </div>
            <Link href="/enterprise" className="shrink-0">
              <Button variant="outline">Learn more →</Button>
            </Link>
          </CardContent>
        </Card>

      </main>

      <footer className="border-t py-5 px-6 text-center text-xs text-muted-foreground">
        Questions? <a href="mailto:support@counterproai.com" className="hover:text-foreground underline underline-offset-2">support@counterproai.com</a>
      </footer>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  );
}
