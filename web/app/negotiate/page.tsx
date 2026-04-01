"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppHeader } from "@/components/app-header";

type Thread = {
  id: number;
  address: string;
  role: string;
  counterparty_email: string | null;
  status: string;
  updated_at: string;
  last_message: string | null;
  pending_count: number;
};

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NegotiateSuitePage() {
  const router = useRouter();
  const { user } = useUser();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<string>("buyer");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newAliasEmail, setNewAliasEmail] = useState<string | null>(null);
  const [aliasCopied, setAliasCopied] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/negotiate-suite/threads")
      .then(r => {
        if (r.status === 403) { setAccessDenied(true); return null; }
        if (!r.ok) { setLoadError(true); setLoading(false); return null; }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setThreads(d.threads ?? []);
        setLoading(false);
      })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!showNew) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!apiKey || !addressInputRef.current) return;
    if (window.google?.maps?.places) {
      const ac = new window.google.maps.places.Autocomplete(
        addressInputRef.current,
        { types: ["address"], componentRestrictions: { country: "us" } }
      );
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (place.formatted_address) setAddress(place.formatted_address);
      });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => {
      if (!addressInputRef.current) return;
      const ac = new window.google.maps.places.Autocomplete(
        addressInputRef.current,
        { types: ["address"], componentRestrictions: { country: "us" } }
      );
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (place.formatted_address) setAddress(place.formatted_address);
      });
    };
    document.head.appendChild(script);
  }, [showNew]);

  const createThread = async () => {
    if (!address || !role) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/negotiate-suite/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, role, counterpartyEmail: email || null }),
      });
      if (res.status === 403) { setAccessDenied(true); return; }
      if (!res.ok) throw new Error("Failed to create thread.");
      const { id, alias_email } = await res.json();
      if (alias_email) {
        setNewAliasEmail(alias_email);
        setCreating(false);
        // Redirect after a short delay to let user see/copy the alias
        setTimeout(() => router.push(`/negotiate/${id}`), 8000);
        return;
      }
      router.push(`/negotiate/${id}`);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Something went wrong.");
      setCreating(false);
    }
  };

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center px-6">
        <div className="max-w-md text-center">
          <Badge className="mb-4">Full Negotiation Suite</Badge>
          <h1 className="text-2xl font-bold mb-3">Upgrade to access the Suite</h1>
          <p className="text-muted-foreground text-sm mb-6">
            The Full Negotiation Suite is available on the $300/mo plan. AI manages your full negotiation — you approve every response.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/pricing">
              <Button size="lg">View pricing →</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader
        nav={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Archive", href: "/archive" },
        ]}
      />

      <main className="max-w-5xl mx-auto px-8 py-10">
        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="text-xs">Full Negotiation Suite</Badge>
          </div>
          <h1 className="text-3xl font-bold mb-2">Full Negotiation Suite</h1>
          <p className="text-muted-foreground max-w-xl">
            AI manages your negotiation. You approve every response.
          </p>
        </div>

        {/* Start new negotiation */}
        <div className="mb-8">
          {!showNew ? (
            <Button size="lg" onClick={() => setShowNew(true)}>
              + Start new negotiation
            </Button>
          ) : (
            <Card className="border-2 border-primary">
              <CardHeader>
                <CardTitle className="text-base">Start a new negotiation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-address">Property address <span className="text-destructive">*</span></Label>
                    <Input
                      id="new-address"
                      ref={addressInputRef}
                      placeholder="Start typing an address..."
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-role">Your role <span className="text-destructive">*</span></Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger id="new-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buyer">Buyer</SelectItem>
                        <SelectItem value="seller">Seller</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-email">
                    Counterparty email <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="new-email"
                    type="email"
                    placeholder="Their agent's or owner's email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                {createError && (
                  <p className="text-destructive text-sm">{createError}</p>
                )}
                <div className="flex gap-3">
                  <Button
                    onClick={createThread}
                    disabled={creating || !address || !role}
                  >
                    {creating ? (
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Creating...
                      </span>
                    ) : "Start negotiation →"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setShowNew(false); setCreateError(""); }}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Alias email prompt — shown immediately after thread creation */}
        {newAliasEmail && (
          <Card className="border-2 border-primary mb-6">
            <CardContent className="py-6 space-y-3">
              <div className="flex items-center gap-2">
                <Badge>New negotiation created</Badge>
              </div>
              <h3 className="font-semibold text-base">Give this email address to the other party</h3>
              <p className="text-sm text-muted-foreground">
                Tell the counterparty to email this address. CounterPro will automatically receive their messages, draft AI responses, and notify you for approval.
              </p>
              <div className="flex items-center gap-3 bg-muted rounded-md px-4 py-3">
                <span className="font-mono text-sm font-medium flex-1 break-all">{newAliasEmail}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(newAliasEmail).catch(() => {});
                    setAliasCopied(true);
                    setTimeout(() => setAliasCopied(false), 2500);
                  }}
                >
                  {aliasCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Redirecting to your negotiation in a moment...</p>
            </CardContent>
          </Card>
        )}

        {/* Thread list */}
        {loading ? (
          <div className="text-muted-foreground text-sm py-12 text-center">Loading negotiations...</div>
        ) : loadError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-destructive font-medium mb-2">Failed to load negotiations</p>
              <p className="text-muted-foreground text-sm mb-4">There was a problem connecting to the server. Try refreshing the page.</p>
              <Button variant="outline" onClick={() => window.location.reload()}>Refresh</Button>
            </CardContent>
          </Card>
        ) : threads.length === 0 && !showNew ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="text-4xl mb-4">🤝</div>
              <h2 className="text-lg font-semibold mb-2">No negotiations yet</h2>
              <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
                Start a thread for any property you&apos;re negotiating on. AI will draft each response — you stay in full control.
              </p>
              <Button onClick={() => setShowNew(true)}>Start your first negotiation</Button>
            </CardContent>
          </Card>
        ) : threads.length > 0 ? (
          <div>
            <h2 className="text-lg font-semibold mb-4">Active negotiations</h2>
            <div className="flex flex-col gap-3">
              {threads.map(t => (
                <Link key={t.id} href={`/negotiate/${t.id}`}>
                  <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardContent className="py-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Top row: address + badges */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-medium truncate">{t.address}</p>
                          <Badge variant="secondary" className="text-xs capitalize shrink-0">
                            {t.role ?? "Buyer"}
                          </Badge>
                          <Badge
                            className={`text-xs shrink-0 ${
                              t.status === "active"
                                ? "bg-green-100 text-green-800 border border-green-200"
                                : "bg-muted text-muted-foreground"
                            }`}
                            variant="outline"
                          >
                            {t.status === "active" ? "Active" : "Closed"}
                          </Badge>
                          {Number(t.pending_count) > 0 && (
                            <Badge className="text-xs shrink-0 bg-orange-500 text-white border-0">
                              {Number(t.pending_count)} new
                            </Badge>
                          )}
                        </div>
                        {/* Last message preview */}
                        {t.last_message && (
                          <p className="text-sm text-muted-foreground truncate max-w-lg">
                            {t.last_message.slice(0, 80)}{t.last_message.length > 80 ? "…" : ""}
                          </p>
                        )}
                        {/* Meta row */}
                        <p className="text-xs text-muted-foreground mt-1">
                          Updated {relativeTime(t.updated_at)}
                          {t.counterparty_email && (
                            <> · <span className="text-muted-foreground">{t.counterparty_email}</span></>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">Open →</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
