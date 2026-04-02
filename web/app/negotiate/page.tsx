"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AppHeader } from "@/components/app-header";

type Thread = {
  id: number;
  address: string;
  role: string;
  counterparty_email: string | null;
  status: string;
  alias_email?: string | null;
  autonomous_mode?: boolean;
  updated_at: string;
  created_at: string;
  last_message: string | null;
  pending_count: number;
};

const SUITE_TOUR_STORAGE_KEY = "counterpro:tour:suite:v1";
const SUITE_TOUR_DISMISSED_KEY = "counterpro:tour:suite:dismissed";
const SUITE_THREAD_VISITED_KEY = "counterpro:onboarding:thread-visited";
const SUITE_ALIAS_COPIED_KEY = "counterpro:onboarding:alias-copied";
const SUITE_CHECKLIST_HIDDEN_KEY = "counterpro:onboarding:checklist-hidden";
const SUITE_CHECKLIST_COMPLETED_KEY = "counterpro:onboarding:checklist-completed";

function onboardingStorageKey(base: string, userId: string | null | undefined): string {
  return userId ? `${base}:${userId}` : base;
}

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
  const tourDismissedKey = onboardingStorageKey(SUITE_TOUR_DISMISSED_KEY, user?.id);
  const threadVisitedKey = onboardingStorageKey(SUITE_THREAD_VISITED_KEY, user?.id);
  const aliasCopiedKey = onboardingStorageKey(SUITE_ALIAS_COPIED_KEY, user?.id);
  const checklistHiddenKey = onboardingStorageKey(SUITE_CHECKLIST_HIDDEN_KEY, user?.id);
  const checklistCompletedKey = onboardingStorageKey(SUITE_CHECKLIST_COMPLETED_KEY, user?.id);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<string>("buyer");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Thread | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newAliasEmail, setNewAliasEmail] = useState<string | null>(null);
  const [aliasCopied, setAliasCopied] = useState(false);
  const [tourReady, setTourReady] = useState(false);
  const [tourDismissed, setTourDismissed] = useState(false);
  const [hasVisitedThread, setHasVisitedThread] = useState(false);
  const [hasCopiedAlias, setHasCopiedAlias] = useState(false);
  const [checklistHidden, setChecklistHidden] = useState(false);
  const [checklistCompleted, setChecklistCompleted] = useState(false);
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
    if (typeof window === "undefined") return;
    if (!user?.id) return;
    setTourDismissed(window.localStorage.getItem(tourDismissedKey) === "true");
    setHasVisitedThread(window.localStorage.getItem(threadVisitedKey) === "true");
    setHasCopiedAlias(window.localStorage.getItem(aliasCopiedKey) === "true");
    setChecklistHidden(window.localStorage.getItem(checklistHiddenKey) === "true");
    setChecklistCompleted(window.localStorage.getItem(checklistCompletedKey) === "true");
  }, [aliasCopiedKey, checklistCompletedKey, checklistHiddenKey, threadVisitedKey, tourDismissedKey, user?.id]);

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

  useEffect(() => {
    if (!loading && !accessDenied) {
      setTourReady(true);
    }
  }, [accessDenied, loading]);

  const startSuiteTour = (markSeen = false) => {
    if (typeof window === "undefined") return;

    const steps = [
      {
        element: "[data-tour='suite-hero']",
        popover: {
          title: "This is your AI suite hub",
          description: "Everything starts here: create negotiations, monitor activity, and jump into any live thread.",
          side: "bottom" as const,
          align: "start" as const,
        },
      },
      {
        element: "[data-tour='start-negotiation']",
        popover: {
          title: "Start a new negotiation",
          description: "Create one thread per deal. Set the address, choose buyer or seller, and optionally add an external counterparty email.",
          side: "bottom" as const,
          align: "start" as const,
        },
      },
      {
        element: "[data-tour='alias-handoff']",
        popover: {
          title: "CounterPro gives each deal its own alias",
          description: "After thread creation, CounterPro issues a unique email alias so replies can route into the correct negotiation automatically.",
          side: "bottom" as const,
          align: "start" as const,
        },
      },
      {
        element: "[data-tour='thread-list']",
        popover: {
          title: "Your active negotiations live here",
          description: "Open any thread to review messages, pair CounterPro-to-CounterPro deals, manage auto-pilot, and approve or monitor responses.",
          side: "top" as const,
          align: "start" as const,
        },
      },
    ].filter(step => document.querySelector(step.element));

    if (steps.length === 0) return;

    const walkthrough = driver({
      animate: true,
      allowClose: true,
      overlayOpacity: 0.55,
      showProgress: true,
      smoothScroll: true,
      doneBtnText: "Done",
      nextBtnText: "Next",
      prevBtnText: "Back",
      steps,
    });

    if (markSeen) {
      window.localStorage.setItem(SUITE_TOUR_STORAGE_KEY, "seen");
    }

    walkthrough.drive();
  };

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

  const firstThread = threads[0] ?? null;
  const hasCreatedNegotiation = threads.length > 0 || !!newAliasEmail;
  const hasConnectedCounterparty = threads.some(thread => Boolean(thread.counterparty_email));
  const hasEnabledAutopilot = threads.some(thread => Boolean(thread.autonomous_mode));
  const hasStartedConversation = threads.some(thread => Boolean(thread.last_message));
  const checklistItems = [
    {
      id: "create",
      label: "Create your first negotiation",
      description: "Set up one thread for each property or deal.",
      complete: hasCreatedNegotiation,
      actionLabel: showNew ? "Finish setup" : "Start now",
      action: () => setShowNew(true),
    },
    {
      id: "alias",
      label: "Copy the negotiation alias",
      description: "Share the generated alias so replies route into the right thread.",
      complete: hasCopiedAlias,
      actionLabel: newAliasEmail ? "Copy alias" : firstThread ? "Open thread" : "Create one first",
      action: () => {
        if (newAliasEmail && typeof window !== "undefined") {
          navigator.clipboard.writeText(newAliasEmail).catch(() => {});
          window.localStorage.setItem(aliasCopiedKey, "true");
          setHasCopiedAlias(true);
          setAliasCopied(true);
          window.setTimeout(() => setAliasCopied(false), 2500);
          return;
        }
        if (firstThread) router.push(`/negotiate/${firstThread.id}`);
      },
      disabled: !newAliasEmail && !firstThread,
    },
    {
      id: "open",
      label: "Open a negotiation workspace",
      description: "Jump into a live thread and review the deal sidebar.",
      complete: hasVisitedThread,
      actionLabel: firstThread ? "Open thread" : "Create one first",
      action: () => {
        if (firstThread) router.push(`/negotiate/${firstThread.id}`);
      },
      disabled: !firstThread,
    },
    {
      id: "connect",
      label: "Connect the other side",
      description: "Add an external email or pair another CounterPro thread.",
      complete: hasConnectedCounterparty,
      actionLabel: firstThread ? "Set it up" : "Create one first",
      action: () => {
        if (firstThread) router.push(`/negotiate/${firstThread.id}`);
      },
      disabled: !firstThread,
    },
    {
      id: "autopilot",
      label: "Turn on auto-pilot",
      description: "Let CounterPro reply automatically once the thread is configured.",
      complete: hasEnabledAutopilot,
      actionLabel: firstThread ? "Enable it" : "Create one first",
      action: () => {
        if (firstThread) router.push(`/negotiate/${firstThread.id}`);
      },
      disabled: !firstThread,
    },
    {
      id: "message",
      label: "Start the conversation",
      description: "Send the first message or wait for the first inbound reply.",
      complete: hasStartedConversation,
      actionLabel: firstThread ? "Open thread" : "Create one first",
      action: () => {
        if (firstThread) router.push(`/negotiate/${firstThread.id}`);
      },
      disabled: !firstThread,
    },
  ];
  const completedChecklistCount = checklistItems.filter(item => item.complete).length;
  const allChecklistComplete = completedChecklistCount === checklistItems.length;

  useEffect(() => {
    if (!allChecklistComplete || checklistCompleted || typeof window === "undefined") return;
    window.localStorage.setItem(checklistCompletedKey, "true");
    window.localStorage.setItem(checklistHiddenKey, "true");
    setChecklistCompleted(true);
    setChecklistHidden(true);
  }, [allChecklistComplete, checklistCompleted, checklistCompletedKey, checklistHiddenKey]);

  const hideChecklist = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(checklistHiddenKey, "true");
    }
    setChecklistHidden(true);
  };

  const showChecklist = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(checklistHiddenKey);
      window.localStorage.removeItem(checklistCompletedKey);
    }
    setChecklistHidden(false);
    setChecklistCompleted(false);
  };

  const dismissTourPrompt = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(tourDismissedKey, "true");
    }
    setTourDismissed(true);
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
        <div className="mb-10" data-tour="suite-hero">
          <div className="flex items-center gap-2 mb-3">
            <Badge className="text-xs bg-pink-600 text-white border-0">Full Negotiation Suite</Badge>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-3xl font-bold mb-2">Full Negotiation Suite</h1>
            <div className="flex items-center gap-2">
              {checklistHidden && !checklistCompleted && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={showChecklist}
                >
                  Show setup steps
                </Button>
              )}
              {tourReady && !tourDismissed && (
                <div className="group flex items-center rounded-md border border-transparent hover:border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => startSuiteTour(false)}
                  >
                    Take suite tour
                  </Button>
                  <button
                    type="button"
                    aria-label="Dismiss suite tour prompt"
                    className="mr-1 flex h-7 w-7 items-center justify-center rounded text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    onClick={dismissTourPrompt}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="text-muted-foreground max-w-xl">
            AI manages your negotiation. You approve every response.
          </p>
        </div>

        {!checklistHidden && (
        <Card className="mb-8 border-primary/20 bg-background/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base">Get set up</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Complete the core steps once, then the suite starts feeling automatic.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {completedChecklistCount}/{checklistItems.length} complete
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={hideChecklist}
                >
                  Hide
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {checklistItems.map((item, index) => (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 ${item.complete ? "border-green-200 bg-green-50/70" : "border-border bg-background"}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${item.complete ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}>
                      {item.complete ? "✓" : index + 1}
                    </span>
                    <p className={`text-sm font-medium ${item.complete ? "text-green-900" : "text-foreground"}`}>{item.label}</p>
                  </div>
                  <p className={`mt-1 text-sm ${item.complete ? "text-green-800/80" : "text-muted-foreground"}`}>{item.description}</p>
                </div>
                <div className="shrink-0">
                  {item.complete ? (
                    <Badge variant="outline" className="border-green-300 bg-white text-green-700">Done</Badge>
                  ) : (
                    <Button size="sm" variant="outline" disabled={item.disabled} onClick={item.action}>
                      {item.actionLabel}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-end">
              {tourReady && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => startSuiteTour(true)}
                >
                  Prefer a walkthrough?
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {/* Start new negotiation */}
        <div className="mb-8" data-tour="start-negotiation">
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
          <Card className="border-2 border-primary mb-6" data-tour="alias-handoff">
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
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem(aliasCopiedKey, "true");
                    }
                    setHasCopiedAlias(true);
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
          <div data-tour="thread-list">
            <h2 className="text-lg font-semibold mb-4">Active negotiations</h2>
            <div className="flex flex-col gap-3">
              {threads.map(t => (
                <div key={t.id} className="group">
                  <Link href={`/negotiate/${t.id}`}>
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                      <CardContent className="py-4 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
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
                          {t.last_message && (
                            <p className="text-sm text-muted-foreground truncate max-w-lg">
                              {t.last_message.slice(0, 80)}{t.last_message.length > 80 ? "…" : ""}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Started {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {" · "}Updated {relativeTime(t.updated_at)}
                            {t.counterparty_email && (
                              <> · <span className="text-muted-foreground">{t.counterparty_email}</span></>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span className="text-xs text-muted-foreground group-hover:hidden">Open →</span>
                          <button
                            className="hidden group-hover:flex text-xs text-muted-foreground hover:text-destructive transition-colors px-1"
                            onClick={e => { e.preventDefault(); setArchiveTarget(t); }}
                          >
                            Archive
                          </button>
                          <button
                            className="hidden group-hover:flex text-xs text-muted-foreground hover:text-destructive transition-colors px-1"
                            onClick={e => { e.preventDefault(); setDeleteTarget(t); }}
                          >
                            Delete
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <AlertDialog open={!!archiveTarget} onOpenChange={open => { if (!open) setArchiveTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this negotiation?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{archiveTarget?.address}&rdquo; will be moved to your archive. You can still view it there but it won&apos;t appear in your active list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={archiving}
                onClick={async () => {
                  if (!archiveTarget) return;
                  setArchiving(true);
                  await fetch(`/api/negotiate-suite/threads/${archiveTarget.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ archived: true }),
                  });
                  setThreads(prev => prev.filter(t => t.id !== archiveTarget.id));
                  setArchiveTarget(null);
                  setArchiving(false);
                }}
              >
                {archiving ? "Archiving…" : "Archive"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this negotiation?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{deleteTarget?.address}&rdquo; will be permanently deleted. This cannot be undone. Only negotiations with no sent messages can be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                className="bg-destructive hover:bg-destructive/90 text-white"
                onClick={async () => {
                  if (!deleteTarget) return;
                  setDeleting(true);
                  const res = await fetch(`/api/negotiate-suite/threads/${deleteTarget.id}`, { method: "DELETE" });
                  if (res.ok) {
                    setThreads(prev => prev.filter(t => t.id !== deleteTarget.id));
                  } else {
                    const err = await res.json().catch(() => ({}));
                    alert(err.error || "Could not delete this negotiation.");
                  }
                  setDeleteTarget(null);
                  setDeleting(false);
                }}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
