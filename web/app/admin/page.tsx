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
type GmailState = { history_id: string | null; watch_expiration: string | null; watch_email: string | null; updated_at: string };
type GmailToken = { clerk_user_id: string; expires_at: string | null; updated_at: string };
type WebhookLog = { id: number; event_type: string; detail: string | null; status: string; error: string | null; created_at: string };

export default function AdminPage() {
  const [data, setData] = useState<{
    promoCodes: PromoCode[];
    inquiries: Inquiry[];
    waitlist: WaitlistEntry[];
    recentPlans: UserPlan[];
    gmailState: GmailState | null;
    gmailTokens: GmailToken[];
    webhookLogs: WebhookLog[];
    userEmails: Record<string, string>;
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

  // Grant suite state
  const [suiteUserId, setSuiteUserId] = useState("");
  const [suiteDays, setSuiteDays] = useState("14");
  const [suiteMsg, setSuiteMsg] = useState("");

  // Users tab state
  const [userSearch, setUserSearch] = useState("");
  const [userPlanFilter, setUserPlanFilter] = useState("all");

  // Gmail watch state
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchMsg, setWatchMsg] = useState("");

  // Simulate inbound email state
  const [simNegId, setSimNegId] = useState("");
  const [simBody, setSimBody] = useState("");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<{ draft?: string; error?: string } | null>(null);

  const [activeTab, setActiveTab] = useState<"promos" | "inquiries" | "waitlist" | "users" | "email" | "allUsers">("promos");

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

  const grantSuite = async () => {
    if (!suiteUserId.trim()) return;
    const r = await api({ action: "grant_suite", clerk_user_id: suiteUserId, trial_days: suiteDays ? Number(suiteDays) : null });
    const label = suiteDays ? `${suiteDays}-day trial` : "permanent access";
    setSuiteMsg(r.ok ? `✓ Suite ${label} granted to ${suiteUserId}` : r.error);
    setSuiteUserId(""); load();
  };

  const activateWatch = async () => {
    setWatchLoading(true); setWatchMsg("");
    const res = await fetch("/api/negotiate-suite/gmail-watch", { method: "POST" });
    const d = await res.json();
    if (d.ok) {
      setWatchMsg(`✓ Watch active — expires ${new Date(Number(d.expiration)).toLocaleString()}`);
    } else {
      const detail = d.detail ? ` — ${typeof d.detail === "string" ? d.detail.slice(0, 200) : JSON.stringify(d.detail).slice(0, 200)}` : "";
      setWatchMsg(`Error: ${d.error}${detail}`);
    }
    setWatchLoading(false); load();
  };

  const simulateInbound = async () => {
    if (!simNegId || !simBody) return;
    setSimLoading(true); setSimResult(null);
    const r = await api({ action: "simulate_inbound", negotiation_id: Number(simNegId), message_body: simBody });
    setSimResult(r);
    setSimLoading(false); load();
  };

  const stopWatch = async () => {
    setWatchLoading(true); setWatchMsg("");
    const r = await api({ action: "gmail_watch_stop" });
    setWatchMsg(r.ok ? "Watch record cleared." : r.error);
    setWatchLoading(false); load();
  };

  const deleteGmailToken = async (clerk_user_id: string) => {
    if (!confirm("Delete this Gmail token?")) return;
    const r = await api({ action: "delete_gmail_token", clerk_user_id });
    if (r.ok) load();
    else alert(r.error);
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
    { id: "allUsers", label: "Users", count: data?.recentPlans.length },
    { id: "users", label: "Grant Credits", count: null },
    { id: "email", label: "Email Bot", count: null },
  ] as const;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Dashboard</Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold text-sm">Admin</span>
            <span className="text-muted-foreground">/</span>
            <Link href="/admin/api-status" className="text-sm text-muted-foreground hover:text-foreground transition-colors">API Status</Link>
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
            { label: "Active promo codes", value: data?.promoCodes.filter(p => p.uses_remaining > 0).length ?? 0, tab: "promos" as const },
            { label: "Enterprise inquiries", value: data?.inquiries.length ?? 0, tab: "inquiries" as const },
            { label: "Waitlist signups", value: data?.waitlist.length ?? 0, tab: "waitlist" as const },
            { label: "Paid users", value: data?.recentPlans.filter(p => p.plan !== "free").length ?? 0, tab: "allUsers" as const },
          ].map(s => (
            <Card key={s.label} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveTab(s.tab)}>
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

        {/* Email Bot */}
        {activeTab === "email" && (() => {
          const gs = data?.gmailState ?? null;
          const expiry = gs?.watch_expiration ? new Date(gs.watch_expiration) : null;
          const isActive = expiry !== null && expiry > new Date();
          const expiresIn = expiry ? Math.round((expiry.getTime() - Date.now()) / 1000 / 60 / 60) : 0;
          return (
            <div className="space-y-6">
              {/* Watch status card */}
              <Card>
                <CardHeader><CardTitle className="text-base">Gmail Push Watch</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isActive ? "bg-green-500" : "bg-gray-300"}`} />
                      <span className="font-medium text-sm">{isActive ? "Active" : "Inactive"}</span>
                    </div>
                    {gs?.watch_email && (
                      <span className="text-sm text-muted-foreground font-mono">{gs.watch_email}</span>
                    )}
                    {isActive && expiry && (
                      <Badge variant="outline" className="text-xs">
                        Expires in ~{expiresIn}h ({expiry.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })})
                      </Badge>
                    )}
                    {!isActive && gs?.watch_expiration && (
                      <Badge variant="secondary" className="text-xs">
                        Expired {new Date(gs.watch_expiration).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Badge>
                    )}
                  </div>
                  {gs?.history_id && (
                    <p className="text-xs text-muted-foreground">History ID: {gs.history_id} · Last updated {gs.updated_at ? new Date(gs.updated_at).toLocaleString() : "—"}</p>
                  )}
                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={activateWatch} disabled={watchLoading}>
                      {watchLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Working...
                        </span>
                      ) : isActive ? "Renew watch" : "Activate watch"}
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => { window.location.href = "/api/auth/gmail?returnTo=/admin"; }}>
                        {data?.gmailTokens.length ? "Reconnect Gmail" : "Connect Gmail →"}
                      </Button>
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className={`w-2 h-2 rounded-full ${data?.gmailTokens.length ? "bg-green-500" : "bg-red-400"}`} />
                        <span className="text-muted-foreground">{data?.gmailTokens.length ? "Connected" : "Not connected"}</span>
                      </div>
                    </div>
                    {isActive && (
                      <Button variant="ghost" onClick={stopWatch} disabled={watchLoading}>
                        Clear record
                      </Button>
                    )}
                  </div>
                  {watchMsg && <p className={`text-sm ${watchMsg.startsWith("✓") ? "text-green-600" : "text-destructive"}`}>{watchMsg}</p>}
                </CardContent>
              </Card>

              {/* OAuth tokens */}
              <Card>
                <CardHeader><CardTitle className="text-base">Gmail OAuth Tokens</CardTitle></CardHeader>
                <CardContent>
                  {!data?.gmailTokens.length ? (
                    <p className="text-sm text-muted-foreground">No Gmail tokens stored. Connect Gmail via /api/auth/gmail first.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.gmailTokens.map(t => {
                        const tokenExpiry = t.expires_at ? new Date(t.expires_at) : null;
                        const tokenOk = tokenExpiry ? tokenExpiry > new Date() : true;
                        return (
                          <div key={t.clerk_user_id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{data?.userEmails[t.clerk_user_id] ?? "—"}</p>
                              <p className="font-mono text-xs text-muted-foreground truncate">{t.clerk_user_id}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${tokenOk ? "bg-green-500" : "bg-red-400"}`} />
                                <span className="text-xs text-muted-foreground">
                                  {tokenExpiry ? `Expires ${tokenExpiry.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No expiry"}
                                </span>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => deleteGmailToken(t.clerk_user_id)} className="h-6 px-2 text-xs">Delete</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Simulate inbound email */}
              <Card>
                <CardHeader><CardTitle className="text-base">Simulate inbound email</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">Inject a fake inbound message directly — bypasses Gmail/Pub/Sub. Use to test AI drafts end-to-end.</p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Negotiation ID</Label>
                      <Input placeholder="1" value={simNegId} onChange={e => setSimNegId(e.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Message body</Label>
                      <Input placeholder="Hi, we'd like to offer $280,000..." value={simBody} onChange={e => setSimBody(e.target.value)} />
                    </div>
                  </div>
                  <Button onClick={simulateInbound} disabled={simLoading || !simNegId || !simBody}>
                    {simLoading ? "Simulating..." : "Send test message →"}
                  </Button>
                  {simResult?.error && <p className="text-sm text-destructive">{simResult.error}</p>}
                  {simResult?.draft && (
                    <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                      <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">AI Draft</p>
                      <p className="whitespace-pre-wrap">{simResult.draft}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Webhook logs */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Webhook logs</CardTitle>
                    <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!data?.webhookLogs.length ? (
                    <p className="text-sm text-muted-foreground">No logs yet. Send a test email or use Simulate above.</p>
                  ) : (
                    <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
                      {data.webhookLogs.map(l => (
                        <div key={l.id} className={`flex gap-3 py-1.5 border-b last:border-0 ${l.status === "error" ? "text-destructive" : l.status === "skip" ? "text-muted-foreground" : ""}`}>
                          <span className="shrink-0 text-muted-foreground">{new Date(l.created_at).toLocaleTimeString()}</span>
                          <span className={`shrink-0 w-20 font-medium ${l.status === "error" ? "text-red-600" : l.status === "skip" ? "text-yellow-600" : "text-green-600"}`}>{l.event_type}</span>
                          <span className="truncate">{l.detail}</span>
                          {l.error && <span className="shrink-0 text-destructive truncate max-w-xs">{l.error}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          );
        })()}

        {/* All Users */}
        {activeTab === "allUsers" && (() => {
          const planColors: Record<string, string> = {
            suite: "bg-purple-100 text-purple-800 border-purple-200",
            subscription: "bg-blue-100 text-blue-800 border-blue-200",
            single: "bg-green-100 text-green-800 border-green-200",
            free: "bg-gray-100 text-gray-600 border-gray-200",
          };
          const filtered = (data?.recentPlans ?? []).filter(p => {
            const matchesPlan = userPlanFilter === "all" || p.plan === userPlanFilter;
            const matchesSearch = !userSearch || p.clerk_user_id.toLowerCase().includes(userSearch.toLowerCase());
            return matchesPlan && matchesSearch;
          });
          return (
            <div className="space-y-4">
              <div className="flex gap-3 flex-wrap">
                <Input
                  placeholder="Search by user ID..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="max-w-xs"
                />
                <div className="flex gap-1">
                  {["all", "suite", "subscription", "single", "free"].map(p => (
                    <Button
                      key={p}
                      size="sm"
                      variant={userPlanFilter === p ? "default" : "outline"}
                      onClick={() => setUserPlanFilter(p)}
                      className="capitalize"
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</p>
              <div className="space-y-2">
                {filtered.map(p => (
                  <div key={p.clerk_user_id} className="flex items-center justify-between p-3 border rounded-lg text-sm bg-background">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{data?.userEmails[p.clerk_user_id] ?? "—"}</p>
                      <p className="font-mono text-xs text-muted-foreground truncate">{p.clerk_user_id}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {p.subscription_end && (
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          {new Date(p.subscription_end) > new Date() ? "Renews" : "Expired"} {new Date(p.subscription_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      )}
                      {p.plan === "single" && (
                        <span className="text-xs text-muted-foreground">{p.deals_remaining} credit{p.deals_remaining !== 1 ? "s" : ""}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium capitalize ${planColors[p.plan] ?? planColors.free}`}>
                        {p.plan}
                      </span>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setGrantUserId(p.clerk_user_id); setActiveTab("users"); }}>
                        Edit →
                      </Button>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No users match your filter.</p>}
              </div>
            </div>
          );
        })()}

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
              <CardHeader><CardTitle className="text-base">Grant Suite trial</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Give a user free Suite access for a set number of days. Leave days blank for permanent access.</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-1">
                    <Label>Clerk user ID</Label>
                    <Input placeholder="user_2abc..." value={suiteUserId} onChange={e => setSuiteUserId(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Trial days</Label>
                    <Input type="number" min={1} placeholder="14" value={suiteDays} onChange={e => setSuiteDays(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={grantSuite} disabled={!suiteUserId.trim()}>Grant Suite trial</Button>
                  {suiteMsg && <p className="text-sm text-green-600">{suiteMsg}</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Recent paid users</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data?.recentPlans.filter(p => p.plan !== "free").map(p => (
                    <div key={p.clerk_user_id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{data?.userEmails[p.clerk_user_id] ?? "—"}</p>
                        <p className="font-mono text-xs text-muted-foreground truncate">{p.clerk_user_id}</p>
                      </div>
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
