"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const searchParams = useSearchParams();
  const paymentSuccess = searchParams.get("payment") === "success";

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => r.json())
      .then((d) => {
        setDeals(d.deals ?? []);
        const p = d.plan ?? null;
        setPlan(p);
        // Suite users land on /negotiate on first login — but can return to dashboard freely
        if (p?.plan === "suite" && !paymentSuccess && !sessionStorage.getItem("suite_dashboard_visited")) {
          sessionStorage.setItem("suite_dashboard_visited", "1");
          router.replace("/negotiate");
        }
      })
      .catch(() => {});
  }, [router, paymentSuccess]);

  const [archiveTarget, setArchiveTarget] = useState<Deal | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      
      if (!res.ok) {
        console.error("Portal API error:", data.error);
        alert(data.error || "Unable to open subscription portal");
        return;
      }
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("No portal URL received");
      }
    } catch (error) {
      console.error("Portal error:", error);
      alert("Failed to open subscription portal");
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
      <AppHeader
        nav={[{ label: "Negotiations", href: "/negotiate" }]}
        right={
          <>
            {planLabel()}
            {(plan?.plan === "subscription" || plan?.plan === "suite" || plan?.plan === "single") && (
              <Button variant="ghost" size="sm" onClick={openPortal} disabled={portalLoading}>
                {portalLoading ? "Loading..." : plan?.plan === "single" ? "Billing" : "Manage subscription"}
              </Button>
            )}
          </>
        }
      />

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
                <div key={deal.id} className="group relative">
                  <Link href={`/deal/${deal.id}`}>
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
                          <span className="text-xs text-muted-foreground group-hover:hidden">View →</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                  <button
                    className="absolute right-4 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded"
                    onClick={e => { e.preventDefault(); setArchiveTarget(deal); }}
                  >
                    Archive
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <AlertDialog open={!!archiveTarget} onOpenChange={open => { if (!open) setArchiveTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this deal?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{archiveTarget?.address}&rdquo; will be moved to your archive. You can still view it there.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={archiving}
                onClick={async () => {
                  if (!archiveTarget) return;
                  setArchiving(true);
                  await fetch(`/api/deals/${archiveTarget.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ archived: true }),
                  });
                  setDeals(prev => prev.filter(d => d.id !== archiveTarget.id));
                  setArchiveTarget(null);
                  setArchiving(false);
                }}
              >
                {archiving ? "Archiving…" : "Archive"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Pricing */}
        <div data-section="pricing-cards" className="grid sm:grid-cols-2 gap-4">
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <Badge variant="outline" className="w-fit text-xs">Single deal</Badge>
              <div className="mt-3">
                <span className="text-4xl font-bold">$50</span>
              </div>
              <p className="text-sm text-muted-foreground">One-time, no subscription required.</p>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 gap-6 pt-2 pb-6">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Full negotiation strategy</li>
                <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Email & verbal scripts</li>
                <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Walk-away point analysis</li>
              </ul>
              <div className="mt-auto space-y-3">
                <Link href="/pricing">
                  <Button className="w-full" variant="outline">Get package</Button>
                </Link>
                <PromoCode onRedeemed={() => window.location.reload()} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary border-2 flex flex-col">
            <CardHeader className="pb-3">
              <Badge className="w-fit text-xs">Best value</Badge>
              <div className="mt-3">
                <span className="text-4xl font-bold">$100</span>
                <span className="text-base font-normal text-muted-foreground">/mo</span>
              </div>
              <p className="text-sm text-muted-foreground">Unlimited deals, cancel anytime.</p>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 gap-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Everything in Single deal</li>
                <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Unlimited deals per month</li>
                <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Ideal for investors & agents</li>
              </ul>
              <div className="mt-auto">
                <Link href="/pricing">
                  <Button className="w-full">Subscribe →</Button>
                </Link>
              </div>
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
