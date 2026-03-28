"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserButton } from "@clerk/nextjs";

type PromoCode = { code: string; deals_granted: number; uses_remaining: number; created_at: string };
type Inquiry = { id: number; name: string; email: string; company: string; agents: string; message: string; created_at: string };
type WaitlistEntry = { id: number; email: string; created_at: string };
type UserPlan = { clerk_user_id: string; plan: string; deals_remaining: number; subscription_end: string | null; updated_at: string };

export default function AdminPage() {
  const [data, setData] = useState<{
    promoCodes: PromoCode[];
    inquiries: Inquiry[];
    waitlist: WaitlistEntry[];
    recentPlans: UserPlan[];
  } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  // Promo form state
  const [promoCode, setPromoCode] = useState("");
  const [promoDeals, setPromoDeals] = useState("1");
  const [promoUses, setPromoUses] = useState("1");
  const [promoMsg, setPromoMsg] = useState("");

  // Grant credits state
  const [grantUserId, setGrantUserId] = useState("");
  const [grantCredits, setGrantCredits] = useState("1");
  const [grantMsg, setGrantMsg] = useState("");

  const [activeTab, setActiveTab] = useState<"promos" | "inquiries" | "waitlist" | "users">("promos");

  const load = async () => {
    const res = await fetch("/api/admin");
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const d = await res.json();
    setData(d);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const api = async (body: object) => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const createPromo = async () => {
    if (!promoCode.trim()) return;
    const r = await api({ action: "create_promo", code: promoCode, deals_granted: Number(promoDeals), max_uses: Number(promoUses) });
    setPromoMsg(r.ok ? `✓ Code "${promoCode.toUpperCase()}" created` : r.error);
    setPromoCode(""); load();
  };

  const deletePromo = async (code: string) => {
    if (!confirm(`Delete code "${code}"?`)) return;
    await api({ action: "delete_promo", code });
    load();
  };

  const grantCreditsToUser = async () => {
    if (!grantUserId.trim()) return;
    const r = await api({ action: "grant_credits", clerk_user_id: grantUserId, credits: Number(grantCredits) });
    setGrantMsg(r.ok ? `✓ Granted ${grantCredits} credit(s) to ${grantUserId}` : r.error);
    setGrantUserId(""); load();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (forbidden) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <p className="text-2xl font-bold">Access denied</p>
      <p className="text-muted-foreground">Your account is not authorized to view this page.</p>
      <Link href="/dashboard"><Button variant="outline">← Dashboard</Button></Link>
    </div>
  );

  const tabs = [
    { id: "promos", label: "Promo Codes", count: data?.promoCodes.length },
    { id: "inquiries", label: "Enterprise Inquiries", count: data?.inquiries.length },
    { id: "waitlist", label: "Waitlist", count: data?.waitlist.length },
    { id: "users", label: "Grant Credits", count: null },
  ] as const;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Dashboard</Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold text-sm">Admin</span>
          </div>
          <UserButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Support Dashboard</h1>
          <p className="text-muted-foreground text-sm">Manage promo codes, enterprise inquiries, and user credits.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active promo codes", value: data?.promoCodes.filter(p => p.uses_remaining > 0).length ?? 0 },
            { label: "Enterprise inquiries", value: data?.inquiries.length ?? 0 },
            { label: "Waitlist signups", value: data?.waitlist.length ?? 0 },
            { label: "Paid users", value: data?.recentPlans.filter(p => p.plan !== "free").length ?? 0 },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-4">
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(t => (
            <Button
              key={t.id}
              variant={activeTab === t.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}{t.count != null ? ` (${t.count})` : ""}
            </Button>
          ))}
        </div>

        {/* Promo Codes */}
        {activeTab === "promos" && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Create promo code</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label>Code</Label>
                    <Input placeholder="WELCOME" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} className="uppercase tracking-widest" />
                  </div>
                  <div className="space-y-1">
                    <Label>Deals granted</Label>
                    <Input type="number" min={1} value={promoDeals} onChange={e => setPromoDeals(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Max uses</Label>
                    <Input type="number" min={1} value={promoUses} onChange={e => setPromoUses(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={createPromo} disabled={!promoCode.trim()}>Create code</Button>
                  {promoMsg && <p className="text-sm text-green-600">{promoMsg}</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Existing codes</CardTitle></CardHeader>
              <CardContent>
                {data?.promoCodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No promo codes yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data?.promoCodes.map(p => (
                      <div key={p.code} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold tracking-widest">{p.code}</span>
                          <Badge variant={p.uses_remaining > 0 ? "default" : "secondary"}>
                            {p.uses_remaining} use{p.uses_remaining !== 1 ? "s" : ""} left
                          </Badge>
                          <span className="text-sm text-muted-foreground">{p.deals_granted} deal{p.deals_granted !== 1 ? "s" : ""} per use</span>
                        </div>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deletePromo(p.code)}>
                          Delete
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Enterprise Inquiries */}
        {activeTab === "inquiries" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Enterprise inquiries</CardTitle></CardHeader>
            <CardContent>
              {!data?.inquiries.length ? (
                <p className="text-sm text-muted-foreground">No inquiries yet.</p>
              ) : (
                <div className="space-y-4">
                  {data.inquiries.map(i => (
                    <div key={i.id} className="p-4 border rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{i.name} — {i.company}</p>
                        <span className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                      <a href={`mailto:${i.email}`} className="text-sm text-primary underline">{i.email}</a>
                      {i.agents && <p className="text-sm text-muted-foreground">{i.agents} agents</p>}
                      {i.message && <p className="text-sm text-muted-foreground mt-1 border-t pt-2">{i.message}</p>}
                      <a href={`mailto:${i.email}?subject=Re: CounterPro Enterprise&body=Hi ${i.name},%0D%0A%0D%0AThanks for your interest in CounterPro for ${i.company}.`}>
                        <Button size="sm" variant="outline" className="mt-2">Reply →</Button>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Waitlist */}
        {activeTab === "waitlist" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Waitlist ({data?.waitlist.length ?? 0})</CardTitle>
                <Button size="sm" variant="outline" onClick={() => {
                  const emails = data?.waitlist.map(w => w.email).join("\n") ?? "";
                  navigator.clipboard.writeText(emails);
                }}>Copy all emails</Button>
              </div>
            </CardHeader>
            <CardContent>
              {!data?.waitlist.length ? (
                <p className="text-sm text-muted-foreground">No waitlist signups yet.</p>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {data.waitlist.map(w => (
                    <div key={w.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <span className="text-sm">{w.email}</span>
                      <span className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Grant Credits */}
        {activeTab === "users" && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Grant deal credits to a user</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Use this to manually credit a user for a refund, support issue, or free trial. Find the Clerk user ID in the Clerk dashboard.</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-1">
                    <Label>Clerk user ID</Label>
                    <Input placeholder="user_2abc..." value={grantUserId} onChange={e => setGrantUserId(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Credits to add</Label>
                    <Input type="number" min={1} value={grantCredits} onChange={e => setGrantCredits(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={grantCreditsToUser} disabled={!grantUserId.trim()}>Grant credits</Button>
                  {grantMsg && <p className="text-sm text-green-600">{grantMsg}</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Recent paid users</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data?.recentPlans.filter(p => p.plan !== "free").map(p => (
                    <div key={p.clerk_user_id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                      <span className="font-mono text-xs text-muted-foreground truncate max-w-xs">{p.clerk_user_id}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={p.plan === "subscription" ? "default" : "secondary"}>{p.plan}</Badge>
                        {p.plan === "single" && <span className="text-muted-foreground">{p.deals_remaining} left</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
