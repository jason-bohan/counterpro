"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";

type Message = {
  id: number;
  direction: string;
  content: string;
  ai_draft: string | null;
  approved: boolean;
  sent_at: string | null;
  created_at: string;
};

type Deadline = {
  id: number;
  label: string;
  due_date: string;
  completed: boolean;
};

type Negotiation = {
  id: number;
  address: string;
  role: string;
  counterparty_email: string | null;
  alias_email: string | null;
  status: string;
  created_at: string;
  gmail_token?: string | null;
};

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(dueDateStr: string): boolean {
  return new Date(dueDateStr) < new Date();
}

export default function NegotiateThreadPage() {
  const { id } = useParams();
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Inbound message input
  const [showInbound, setShowInbound] = useState(false);
  const [newMsg, setNewMsg] = useState("");
  const [drafting, setDrafting] = useState(false);

  // Draft approval
  const [pendingDraft, setPendingDraft] = useState<{ draft: string; messageId: number } | null>(null);
  const [editedDraft, setEditedDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Counterparty email editing
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [aliasCopied, setAliasCopied] = useState(false);

  // Deadline form
  const [showDeadlineForm, setShowDeadlineForm] = useState(false);
  const [dlLabel, setDlLabel] = useState("");
  const [dlDate, setDlDate] = useState("");
  const [savingDeadline, setSavingDeadline] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    fetch(`/api/negotiate-suite/threads/${id}`)
      .then(r => {
        if (r.status === 403) { setAccessDenied(true); return null; }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setNegotiation(d.negotiation ?? null);
        setMessages(d.messages ?? []);
        setDeadlines(d.deadlines ?? []);
        setEmailValue(d.negotiation?.counterparty_email ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingDraft]);

  const submitInbound = async () => {
    if (!newMsg.trim()) return;
    setDrafting(true);
    try {
      const res = await fetch("/api/negotiate-suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negotiationId: id, newMessage: newMsg }),
      });
      if (res.status === 403) { setAccessDenied(true); return; }
      const { draft, messageId } = await res.json();
      setPendingDraft({ draft, messageId });
      setEditedDraft(draft);
      setNewMsg("");
      setShowInbound(false);
    } finally {
      setDrafting(false);
      load();
    }
  };

  const approveAndSend = async () => {
    if (!pendingDraft) return;
    setSending(true);
    try {
      await fetch("/api/negotiate-suite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: pendingDraft.messageId, approved: true, editedDraft }),
      });
      setPendingDraft(null);
      load();
    } finally {
      setSending(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editedDraft).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const saveEmail = async () => {
    setSavingEmail(true);
    try {
      await fetch(`/api/negotiate-suite/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterparty_email: emailValue }),
      });
      if (negotiation) setNegotiation({ ...negotiation, counterparty_email: emailValue || null });
      setEditingEmail(false);
    } finally {
      setSavingEmail(false);
    }
  };

  const addDeadline = async () => {
    if (!dlLabel || !dlDate) return;
    setSavingDeadline(true);
    try {
      await fetch(`/api/negotiate-suite/threads/${id}/deadlines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: dlLabel, due_date: dlDate }),
      });
      setDlLabel("");
      setDlDate("");
      setShowDeadlineForm(false);
      load();
    } finally {
      setSavingDeadline(false);
    }
  };

  const toggleDeadline = async (dlId: number, completed: boolean) => {
    await fetch(`/api/negotiate-suite/threads/${id}/deadlines`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dlId, completed }),
    });
    load();
  };

  const daysActive = negotiation
    ? Math.floor((new Date().getTime() - new Date(negotiation.created_at).getTime()) / 86400000)
    : 0;

  const hasEmail = !!(negotiation?.counterparty_email || emailValue);

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center px-6">
        <div className="max-w-md text-center">
          <Badge className="mb-4">Full Negotiation Suite</Badge>
          <h1 className="text-2xl font-bold mb-3">Upgrade to access the Suite</h1>
          <p className="text-muted-foreground text-sm mb-6">
            The Full Negotiation Suite is available on the $300/mo plan.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/pricing"><Button size="lg">View pricing →</Button></Link>
            <Link href="/dashboard"><Button variant="outline">Back to dashboard</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading negotiation...
      </div>
    );
  }

  if (!negotiation) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-muted-foreground text-sm gap-4">
        <p>Negotiation not found.</p>
        <Link href="/negotiate"><Button variant="outline">← Back to negotiations</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Logo size={36} href="/" />
            <Link
              href="/negotiate"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              ← All negotiations
            </Link>
            <span className="text-muted-foreground hidden sm:inline">/</span>
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <span className="font-medium text-sm truncate max-w-xs">{negotiation.address}</span>
              <Badge variant="secondary" className="text-xs capitalize shrink-0">{negotiation.role}</Badge>
            </div>
          </div>
          <Badge
            className={`text-xs shrink-0 ${
              negotiation.status === "active"
                ? "bg-green-100 text-green-800 border border-green-200"
                : "bg-muted text-muted-foreground"
            }`}
            variant="outline"
          >
            {negotiation.status === "active" ? "Active" : "Closed"}
          </Badge>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 flex-1 w-full">
        {/* Mobile title */}
        <div className="sm:hidden mb-4">
          <p className="font-semibold">{negotiation.address}</p>
          <p className="text-xs text-muted-foreground capitalize">{negotiation.role}</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT — Chat thread */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">

            {/* Message thread */}
            <div className="flex flex-col gap-3">
              {messages.length === 0 && !pendingDraft && (
                <div className="text-center text-muted-foreground text-sm py-10">
                  No messages yet. Paste the counterparty&apos;s first message below to get started.
                </div>
              )}

              {messages.map(m => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-xl rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      m.direction === "outbound"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs opacity-60">
                        {m.direction === "outbound" ? "You (via AI)" : "Counterparty"}
                        {" · "}
                        {relativeTime(m.created_at)}
                      </span>
                      {m.direction === "outbound" && m.sent_at && (
                        <Badge variant="secondary" className="text-xs h-4 shrink-0">Sent</Badge>
                      )}
                      {m.direction === "outbound" && !m.sent_at && m.approved && (
                        <Badge variant="outline" className="text-xs h-4 shrink-0">Approved</Badge>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  </div>
                </div>
              ))}

              <div ref={bottomRef} />
            </div>

            {/* AI Draft approval panel */}
            {pendingDraft && (
              <Card className="border-2 border-primary">
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">AI Draft</CardTitle>
                    <Badge className="text-xs">Review before sending</Badge>
                  </div>
                  {hasEmail && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Will send to: <span className="font-medium">{negotiation.counterparty_email || emailValue}</span>
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    rows={9}
                    value={editedDraft}
                    onChange={e => setEditedDraft(e.target.value)}
                    className="text-sm font-mono resize-y"
                  />
                  <div className="flex flex-wrap gap-3">
                    {hasEmail ? (
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={approveAndSend}
                        disabled={sending}
                      >
                        {sending ? (
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Sending...
                          </span>
                        ) : "Approve & send →"}
                      </Button>
                    ) : (
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => { approveAndSend(); copyToClipboard(); }}
                        disabled={sending}
                      >
                        {copied ? "✓ Copied!" : sending ? "Approving..." : "Approve & copy →"}
                      </Button>
                    )}
                    <Button variant="outline" onClick={copyToClipboard}>
                      {copied ? "✓ Copied" : "Copy to clipboard"}
                    </Button>
                    <Button variant="ghost" onClick={() => setPendingDraft(null)}>
                      Discard
                    </Button>
                  </div>
                  {!hasEmail && (
                    <p className="text-xs text-muted-foreground">
                      No counterparty email set — copy the draft and send it manually, or add their email in the sidebar.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Add their message */}
            {!pendingDraft && (
              <div>
                {!showInbound ? (
                  <Button variant="outline" onClick={() => setShowInbound(true)}>
                    + Add their message
                  </Button>
                ) : (
                  <Card>
                    <CardHeader className="pb-2 pt-4">
                      <CardTitle className="text-base">Paste the counterparty&apos;s latest message</CardTitle>
                      <p className="text-sm text-muted-foreground">AI will draft your response for review.</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        rows={5}
                        placeholder="Paste their email or message here..."
                        value={newMsg}
                        onChange={e => setNewMsg(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-3">
                        <Button
                          onClick={submitInbound}
                          disabled={drafting || !newMsg.trim()}
                        >
                          {drafting ? (
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              AI is drafting a response...
                            </span>
                          ) : "Get AI response →"}
                        </Button>
                        <Button variant="ghost" onClick={() => { setShowInbound(false); setNewMsg(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — Sidebar */}
          <div className="w-full lg:w-72 xl:w-80 shrink-0 flex flex-col gap-4">

            {/* Deal info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Deal Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Property</p>
                  <p className="font-medium leading-snug">{negotiation.address}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Your role</p>
                  <Badge variant="secondary" className="capitalize text-xs">{negotiation.role}</Badge>
                </div>
                {negotiation.alias_email && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Your negotiation email</p>
                    <p className="text-xs text-muted-foreground mb-1">Tell the other party to email this address</p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs break-all flex-1">{negotiation.alias_email}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(negotiation.alias_email!).catch(() => {});
                          setAliasCopied(true);
                          setTimeout(() => setAliasCopied(false), 2500);
                        }}
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        {aliasCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Counterparty email</p>
                  {editingEmail ? (
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={emailValue}
                        onChange={e => setEmailValue(e.target.value)}
                        className="h-7 text-xs"
                        placeholder="their@email.com"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={saveEmail}
                        disabled={savingEmail}
                      >
                        {savingEmail ? "..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2"
                        onClick={() => { setEditingEmail(false); setEmailValue(negotiation.counterparty_email ?? ""); }}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={negotiation.counterparty_email ? "text-foreground" : "text-muted-foreground"}>
                        {negotiation.counterparty_email || "Not set"}
                      </span>
                      <button
                        onClick={() => setEditingEmail(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-2xl font-bold">{messages.length}</p>
                  <p className="text-xs text-muted-foreground">Messages</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{daysActive}</p>
                  <p className="text-xs text-muted-foreground">Days active</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {messages.filter(m => m.direction === "inbound").length}
                  </p>
                  <p className="text-xs text-muted-foreground">Received</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {messages.filter(m => m.direction === "outbound" && m.approved).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Sent</p>
                </div>
              </CardContent>
            </Card>

            {/* Deadlines */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Deadlines
                  </CardTitle>
                  {!showDeadlineForm && (
                    <button
                      onClick={() => setShowDeadlineForm(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      + Add
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {deadlines.length === 0 && !showDeadlineForm && (
                  <p className="text-xs text-muted-foreground">No deadlines yet.</p>
                )}

                {deadlines.map(dl => {
                  const overdue = !dl.completed && isOverdue(dl.due_date);
                  return (
                    <div
                      key={dl.id}
                      className={`flex items-start gap-2 py-1 ${dl.completed ? "opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={dl.completed}
                        onChange={e => toggleDeadline(dl.id, e.target.checked)}
                        className="mt-0.5 shrink-0 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <p className={`text-xs font-medium leading-tight ${dl.completed ? "line-through" : ""} ${overdue ? "text-destructive" : ""}`}>
                          {dl.label}
                        </p>
                        <p className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {overdue ? "Overdue · " : ""}
                          {new Date(dl.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {showDeadlineForm && (
                  <div className="space-y-2 pt-1 border-t">
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={dlLabel}
                        onChange={e => setDlLabel(e.target.value)}
                        placeholder="e.g. Inspection deadline"
                        className="h-7 text-xs"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Due date</Label>
                      <Input
                        type="date"
                        value={dlDate}
                        onChange={e => setDlDate(e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={addDeadline}
                        disabled={savingDeadline || !dlLabel || !dlDate}
                      >
                        {savingDeadline ? "Saving..." : "Add"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => { setShowDeadlineForm(false); setDlLabel(""); setDlDate(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </main>
    </div>
  );
}
