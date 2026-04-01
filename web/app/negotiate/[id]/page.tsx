"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AppHeader } from "@/components/app-header";

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

type NegotiationDocument = {
  id: number;
  filename: string;
  blob_url: string;
  mime_type: string;
  size_bytes: number | null;
  direction: "sent" | "received";
  message_id: number | null;
  created_at: string;
};

type Negotiation = {
  id: number;
  address: string;
  role: string;
  counterparty_email: string | null;
  alias_email: string | null;
  status: string;
  created_at: string;
  autonomous_mode: boolean;
  gmail_token?: string | null;
};

function getQuoteDepth(line: string): number {
  const match = line.match(/^\s*((?:>\s*)+)/);
  if (!match) return 0;
  return (match[1].match(/>/g) ?? []).length;
}

function isQuoteHeader(line: string): boolean {
  const normalized = line.replace(/^\s*(?:>\s*)+/, "").trim();
  return /^On .+ wrote:$/i.test(normalized);
}

function normalizeInboundEmailForDisplay(text: string): string {
  const lines = text.split("\n");
  const contentLines = lines.filter(line => line.trim().length > 0);

  if (contentLines.length === 0) return text;

  const meaningfulLines = contentLines.filter(line => !isQuoteHeader(line));
  const shouldStripOneLevel =
    meaningfulLines.length > 0 && meaningfulLines.every(line => getQuoteDepth(line) > 0);

  if (!shouldStripOneLevel) return text;

    return lines
      .map(line => line.replace(/^(\s*)>\s?/, "$1"))
      .join("\n");
}

function extractVisibleInboundReply(text: string): string {
  const normalized = normalizeInboundEmailForDisplay(text);
  const lines = normalized.split("\n");
  const visible: string[] = [];

  for (const line of lines) {
    if (isQuoteHeader(line) || getQuoteDepth(line) > 0) {
      if (visible.some(entry => entry.trim().length > 0)) break;
      continue;
    }

    visible.push(line);
  }

  const cleaned = visible.join("\n").trim();
  return cleaned || normalized;
}

function renderInboundEmail(text: string): React.ReactNode {
  return <p className="whitespace-pre-wrap leading-relaxed">{extractVisibleInboundReply(text)}</p>;
}

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
  const [documents, setDocuments] = useState<NegotiationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Inbound message input
  const [showInbound, setShowInbound] = useState(false);
  const [newMsg, setNewMsg] = useState("");
  const [drafting, setDrafting] = useState(false);

  // Proactive message input
  const [showProactive, setShowProactive] = useState(false);
  const [proactiveMsg, setProactiveMsg] = useState("");
  const [proactiveDrafting, setProactiveDrafting] = useState(false);
  const [quickSending, setQuickSending] = useState(false);
  const [proactiveAttachment, setProactiveAttachment] = useState<File | null>(null);
  // After AI refinement, hold the result here for in-panel approve/dismiss
  const [refinedDraft, setRefinedDraft] = useState<{ text: string; messageId: number; original: string } | null>(null);

  // Draft approval
  const [pendingDraft, setPendingDraft] = useState<{ draft: string; messageId: number } | null>(null);
  const [editedDraft, setEditedDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Counterparty email editing
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [aliasCopied, setAliasCopied] = useState(false);

  // Resend
  const [resending, setResending] = useState<number | null>(null);

  // Autonomous mode
  const [togglingAuto, setTogglingAuto] = useState(false);

  // Archive confirmation
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  // First contact
  const [showFirstContact, setShowFirstContact] = useState(false);
  const [researching, setResearching] = useState(false);
  const [research, setResearch] = useState<{ market_value_low: number; market_value_high: number; suggested_offer: number; reasoning: string } | null>(null);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [generatingFirst, setGeneratingFirst] = useState(false);

  // Deadline form
  const [showDeadlineForm, setShowDeadlineForm] = useState(false);
  const [dlLabel, setDlLabel] = useState("");
  const [dlDate, setDlDate] = useState("");
  const [savingDeadline, setSavingDeadline] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch(`/api/negotiate-suite/threads/${id}`)
      .then(r => {
        if (r.status === 403) { setAccessDenied(true); return null; }
        if (r.status === 301) { // Archived negotiation
          return r.json().then(data => {
            if (data.archiveUrl) {
              window.location.href = data.archiveUrl;
            }
            return null;
          });
        }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setNegotiation(d.negotiation ?? null);
        setMessages(d.messages ?? []);
        setDeadlines(d.deadlines ?? []);
        setDocuments(d.documents ?? []);
        setEmailValue(d.negotiation?.counterparty_email ?? "");
        // Sync pending draft from DB
        const pending = (d.messages ?? []).find(
          (m: Message) => m.direction === "inbound" && m.ai_draft && !m.approved
        );
        if (pending) {
          setPendingDraft({ draft: pending.ai_draft!, messageId: pending.id });
          setEditedDraft(pending.ai_draft!);
        } else {
          setPendingDraft(null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Poll for new inbound messages every 20 seconds.
  // Skips the poll while the user is actively editing a draft to avoid disrupting their work.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!pendingDraft || editedDraft === pendingDraft.draft) {
        // Silent background refresh — don't touch loading state
        fetch(`/api/negotiate-suite/threads/${id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (!d) return;
            const nextMessages = d.messages ?? [];
            const nextDocuments = d.documents ?? [];

            if (nextMessages.length !== messages.length) {
              setMessages(nextMessages);
              setDocuments(nextDocuments);

              const pending = nextMessages.find(
                (m: Message) => m.direction === "inbound" && m.ai_draft && !m.approved
              );
              if (pending) {
                setPendingDraft(prev =>
                  prev?.messageId === pending.id ? prev : { draft: pending.ai_draft!, messageId: pending.id }
                );
                setEditedDraft(prev =>
                  prev === (pendingDraft?.draft ?? "") ? pending.ai_draft! : prev
                );
              } else {
                setPendingDraft(null);
              }
              return;
            }

            if (nextDocuments.length !== documents.length) {
              setDocuments(nextDocuments);
            }
          })
          .catch(() => {});
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [id, pendingDraft, editedDraft, documents.length, messages.length]);

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

  const submitProactive = async () => {
    if (!proactiveMsg.trim() || !id) return;
    setProactiveDrafting(true);
    try {
      const formData = new FormData();
      formData.append("negotiationId", id.toString());
      formData.append("message", proactiveMsg);
      if (proactiveAttachment) {
        formData.append("attachment", proactiveAttachment);
      }

      const res = await fetch("/api/negotiate-suite/proactive", {
        method: "POST",
        body: formData,
      });
      if (res.status === 403) { setAccessDenied(true); return; }
      const { draft, messageId } = await res.json();
      // Show the refined draft inside the compose panel for approve/dismiss
      setRefinedDraft({ text: draft, messageId, original: proactiveMsg });
    } finally {
      setProactiveDrafting(false);
    }
  };

  const quickSendProactive = async () => {
    if (!proactiveMsg.trim() || !id) return;
    setQuickSending(true);
    try {
      // For Quick Send, skip AI and use the user's message directly
      const formData = new FormData();
      formData.append("negotiationId", id.toString());
      formData.append("message", proactiveMsg);
      formData.append("skipAI", "true"); // Flag to skip AI refinement
      if (proactiveAttachment) {
        formData.append("attachment", proactiveAttachment);
      }

      const res = await fetch("/api/negotiate-suite/proactive", {
        method: "POST",
        body: formData,
      });
      if (res.status === 403) { setAccessDenied(true); return; }
      const { messageId } = await res.json();
      
      // Auto-approve and send without review
      let sendBody: BodyInit;
      let sendHeaders: Record<string, string> | undefined;
      if (proactiveAttachment) {
        const sendForm = new FormData();
        sendForm.append("messageId", String(messageId));
        sendForm.append("approved", "true");
        sendForm.append("editedDraft", proactiveMsg); // Use original message
        sendForm.append("attachment", proactiveAttachment);
        sendBody = sendForm;
      } else {
        sendBody = JSON.stringify({ 
          messageId, 
          approved: "true", 
          editedDraft: proactiveMsg // Use original message
        });
        sendHeaders = { "Content-Type": "application/json" };
      }
      
      await fetch("/api/negotiate-suite", { 
        method: "PUT", 
        headers: sendHeaders,
        body: sendBody
      });
      
      setProactiveMsg("");
      setProactiveAttachment(null);
      setShowProactive(false);
      // Clear file input
      const fileInput = document.getElementById('proactive-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      window.dispatchEvent(new Event("notifications-updated"));
    } finally {
      setQuickSending(false);
      load();
    }
  };

  const approveAndSend = async () => {
    if (!pendingDraft) return;
    setSending(true);
    try {
      let body: BodyInit;
      let headers: Record<string, string> | undefined;
      if (attachedFile) {
        const form = new FormData();
        form.append("messageId", String(pendingDraft.messageId));
        form.append("approved", "true");
        form.append("editedDraft", editedDraft);
        form.append("attachment", attachedFile);
        body = form;
      } else {
        body = JSON.stringify({ messageId: pendingDraft.messageId, approved: true, editedDraft });
        headers = { "Content-Type": "application/json" };
      }
      await fetch("/api/negotiate-suite", { method: "PUT", headers, body });
      setPendingDraft(null);
      setAttachedFile(null);
      window.dispatchEvent(new Event("notifications-updated"));
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

  const resendMessage = async (messageId: number) => {
    setResending(messageId);
    try {
      await fetch("/api/negotiate-suite", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      load();
    } finally {
      setResending(null);
    }
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

  const runMarketResearch = async () => {
    setResearching(true);
    try {
      const res = await fetch(`/api/negotiate-suite/threads/${id}/research`);
      const data = await res.json();
      setResearch(data);
      setOfferAmount(String(data.suggested_offer ?? ""));
    } finally {
      setResearching(false);
    }
  };

  const generateFirstContact = async () => {
    const amount = parseInt(offerAmount.replace(/[^0-9]/g, ""), 10);
    if (!amount) return;
    setGeneratingFirst(true);
    try {
      const res = await fetch(`/api/negotiate-suite/threads/${id}/first-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerAmount: amount, notes: offerNotes || undefined }),
      });
      const { draft, messageId } = await res.json();
      setPendingDraft({ draft, messageId });
      setEditedDraft(draft);
      setShowFirstContact(false);
      load();
    } finally {
      setGeneratingFirst(false);
    }
  };

  const toggleAutonomousMode = async () => {
    if (!negotiation) return;
    setTogglingAuto(true);
    const next = !negotiation.autonomous_mode;
    try {
      await fetch(`/api/negotiate-suite/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autonomous_mode: next }),
      });
      setNegotiation({ ...negotiation, autonomous_mode: next });
    } finally {
      setTogglingAuto(false);
    }
  };

  const archiveNegotiation = async () => {
    await fetch(`/api/negotiate-suite/threads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    window.location.href = "/negotiate";
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
      <AppHeader
        nav={[{ label: "← All negotiations", href: "/negotiate" }]}
        right={
          <div className="flex items-center gap-2">
            {negotiation.autonomous_mode && (
              <Badge className="text-xs bg-violet-100 text-violet-800 border border-violet-200" variant="outline">
                Auto-pilot ON
              </Badge>
            )}
            <Badge
              className={`text-xs ${
                negotiation.status === "active"
                  ? "bg-green-100 text-green-800 border border-green-200"
                  : "bg-muted text-muted-foreground"
              }`}
              variant="outline"
            >
              {negotiation.status === "active" ? "Active" : "Closed"}
            </Badge>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setShowArchiveDialog(true)}>
              Archive
            </Button>
          </div>
        }
      />

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
                <div className="text-center text-muted-foreground text-sm py-6 space-y-3">
                  <p>No messages yet.</p>
                  {negotiation.counterparty_email && !showFirstContact && (
                    <button
                      onClick={() => { setShowFirstContact(true); runMarketResearch(); }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Generate opening offer →
                    </button>
                  )}
                  {!negotiation.counterparty_email && (
                    <p className="text-xs">Add the counterparty&apos;s email in the sidebar to send an opening offer, or paste their message below.</p>
                  )}
                </div>
              )}

              {/* First contact panel */}
              {showFirstContact && !pendingDraft && (
                <Card className="border-2 border-primary">
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-base">Generate opening offer</CardTitle>
                    <p className="text-sm text-muted-foreground">AI researches the market and drafts your first message.</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Market research result */}
                    {researching && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Researching market value for {negotiation.address}...
                      </div>
                    )}
                    {research && !researching && (
                      <div className="rounded-lg bg-muted/60 px-4 py-3 space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">AI Market Estimate</p>
                        <p className="text-sm font-semibold">
                          ${research.market_value_low?.toLocaleString() ?? "—"} – ${research.market_value_high?.toLocaleString() ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">{research.reasoning}</p>
                      </div>
                    )}

                    {/* Offer amount */}
                    <div className="space-y-1">
                      <Label className="text-sm">
                        {negotiation.role === "seller" ? "Asking price" : "Your opening offer"}
                        {research && (
                          <span className="ml-2 text-xs text-muted-foreground font-normal">
                            (AI suggests ${research.suggested_offer?.toLocaleString() ?? "—"})
                          </span>
                        )}
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          className="pl-7"
                          placeholder="e.g. 450000"
                          value={offerAmount}
                          onChange={e => setOfferAmount(e.target.value.replace(/[^0-9]/g, ""))}
                        />
                      </div>
                    </div>

                    {/* Optional notes */}
                    <div className="space-y-1">
                      <Label className="text-sm">
                        Any context for the AI? <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Input
                        placeholder="e.g. flexible on closing date, cash buyer, seen the property twice"
                        value={offerNotes}
                        onChange={e => setOfferNotes(e.target.value)}
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={generateFirstContact}
                        disabled={generatingFirst || !offerAmount || researching}
                      >
                        {generatingFirst ? (
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Drafting...
                          </span>
                        ) : "Draft opening message →"}
                      </Button>
                      <Button variant="ghost" onClick={() => { setShowFirstContact(false); setResearch(null); setOfferAmount(""); setOfferNotes(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {messages.filter(m => m.content !== "[First contact]").map(m => {
                const messageDocuments = documents.filter(doc =>
                  doc.message_id != null
                    ? doc.message_id === m.id
                    : Math.abs(new Date(doc.created_at).getTime() - new Date(m.created_at).getTime()) < 5000 &&
                      doc.direction === (m.direction === "outbound" || m.direction === "proactive" ? "sent" : "received")
                );
                return (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === "outbound" || m.direction === "proactive" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-xl rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        m.direction === "outbound" || m.direction === "proactive"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs opacity-60">
                          {m.direction === "proactive" || m.direction === "outbound" ? "You" : "Counterparty"}
                          {" · "}
                          {relativeTime(m.created_at)}
                        </span>
                        {(m.direction === "outbound" || (m.direction === "proactive" && m.ai_draft && m.ai_draft !== m.content)) && (
                          <Badge variant="secondary" className="text-xs h-4 shrink-0 bg-blue-500/20 text-blue-300 border border-blue-500/30">AI</Badge>
                        )}
                        {(m.direction === "outbound" || m.direction === "proactive") && m.sent_at && (
                          <Badge variant="secondary" className="text-xs h-4 shrink-0">Sent</Badge>
                        )}
                        {(m.direction === "outbound" || m.direction === "proactive") && !m.sent_at && m.approved && (
                          <>
                            <Badge className="text-xs h-4 shrink-0 bg-red-500/20 text-red-300 border border-red-500/30">Send failed</Badge>
                            <button
                              onClick={() => resendMessage(m.id)}
                              disabled={resending === m.id}
                              className="text-xs text-primary-foreground/70 hover:text-primary-foreground underline underline-offset-2 disabled:opacity-50 shrink-0"
                            >
                              {resending === m.id ? "Sending..." : "Retry"}
                            </button>
                          </>
                        )}
                      </div>
                      {m.direction === "inbound" ? (
                        renderInboundEmail(m.content)
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      )}
                      {messageDocuments.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-current border-opacity-20 flex flex-wrap gap-2">
                          {messageDocuments.map(doc => {
                            const icon = doc.mime_type === "application/pdf" ? "📄" : doc.mime_type.startsWith("image/") ? "🖼️" : "📎";
                            const isOutbound = m.direction === "outbound" || m.direction === "proactive";
                            return (
                              <div key={doc.id} className="inline-flex items-center gap-1 group">
                                <a
                                  href={doc.blob_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                                    isOutbound
                                      ? "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground"
                                      : "bg-muted hover:bg-muted/80 text-foreground"
                                  }`}
                                  title={`${doc.filename}${doc.size_bytes ? ` (${Math.round(doc.size_bytes / 1024)}KB)` : ""}`}
                                >
                                  <span className="text-sm">{icon}</span>
                                  <span className="truncate max-w-[200px]">{doc.filename}</span>
                                </a>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Delete "${doc.filename}"?`)) return;
                                    await fetch(`/api/negotiate-suite/documents/${doc.id}`, { method: "DELETE" });
                                    load();
                                  }}
                                  className={`opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1 rounded ${
                                    isOutbound ? "text-primary-foreground/60 hover:text-primary-foreground" : "text-muted-foreground hover:text-destructive"
                                  }`}
                                  title="Delete document"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

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
                    {/* File attachment */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={e => setAttachedFile(e.target.files?.[0] ?? null)}
                    />
                    {attachedFile ? (
                      <div className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-muted/50">
                        <span className="truncate max-w-[160px]">{attachedFile.name}</span>
                        <button
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => { setAttachedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                        Attach file
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        if (!pendingDraft) return;
                        const id = pendingDraft.messageId;
                        setPendingDraft(null);
                        setAttachedFile(null);
                        await fetch("/api/negotiate-suite", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ messageId: id, discard: true }),
                        });
                        window.dispatchEvent(new Event("notifications-updated"));
                      }}
                    >
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
              <div className="flex flex-col gap-2">
                {!showInbound && !showProactive ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowInbound(true)}>
                      + Add their message
                    </Button>
                    <Button variant="outline" onClick={() => setShowProactive(true)}>
                      + Compose new message
                    </Button>
                  </div>
                ) : showInbound ? (
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
                ) : (
                  <Card>
                    <CardHeader className="pb-2 pt-4">
                      <CardTitle className="text-base">
                        {refinedDraft ? "AI refined your message" : "Compose a new message"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {refinedDraft ? "Review and send, or go back to edit your original." : "AI will refine your message for review."}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {refinedDraft ? (
                        <>
                          <Textarea
                            rows={9}
                            value={refinedDraft.text}
                            onChange={e => setRefinedDraft(r => r ? { ...r, text: e.target.value } : r)}
                            className="text-sm font-mono resize-y"
                          />
                          {proactiveAttachment && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{proactiveAttachment.type === "application/pdf" ? "📄" : proactiveAttachment.type.startsWith("image/") ? "🖼️" : "📎"}</span>
                              <span className="truncate max-w-[240px]">{proactiveAttachment.name}</span>
                              <span className="text-muted-foreground/60">will be attached</span>
                            </div>
                          )}
                          <div className="flex gap-3 flex-wrap">
                            <Button
                              className="bg-green-600 hover:bg-green-700 text-white"
                              disabled={quickSending}
                              onClick={async () => {
                                if (!refinedDraft) return;
                                setQuickSending(true);
                                try {
                                  let sendBody: BodyInit;
                                  let sendHeaders: Record<string, string> | undefined;
                                  if (proactiveAttachment) {
                                    const f = new FormData();
                                    f.append("messageId", String(refinedDraft.messageId));
                                    f.append("approved", "true");
                                    f.append("editedDraft", refinedDraft.text);
                                    f.append("attachment", proactiveAttachment);
                                    sendBody = f;
                                  } else {
                                    sendBody = JSON.stringify({ messageId: refinedDraft.messageId, approved: true, editedDraft: refinedDraft.text });
                                    sendHeaders = { "Content-Type": "application/json" };
                                  }
                                  await fetch("/api/negotiate-suite", { method: "PUT", headers: sendHeaders, body: sendBody });
                                  setRefinedDraft(null);
                                  setProactiveMsg("");
                                  setProactiveAttachment(null);
                                  setShowProactive(false);
                                  window.dispatchEvent(new Event("notifications-updated"));
                                  load();
                                } finally {
                                  setQuickSending(false);
                                }
                              }}
                            >
                              {quickSending ? (
                                <span className="flex items-center gap-2">
                                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  Sending...
                                </span>
                              ) : "Send →"}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                // Restore original message so user can edit
                                setProactiveMsg(refinedDraft.original);
                                setRefinedDraft(null);
                              }}
                            >
                              ← Edit original
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={async () => {
                                const msgId = refinedDraft.messageId;
                                setRefinedDraft(null);
                                setProactiveMsg("");
                                setProactiveAttachment(null);
                                setShowProactive(false);
                                await fetch("/api/negotiate-suite", {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ messageId: msgId, discard: true }),
                                });
                                load();
                              }}
                            >
                              Discard
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <Textarea
                            rows={5}
                            placeholder="Type your message here... (e.g. 'I want to offer $350k' or 'Can we schedule a viewing?')"
                            value={proactiveMsg}
                            onChange={e => setProactiveMsg(e.target.value)}
                            autoFocus
                          />
                          {/* File attachment */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                id="proactive-file"
                                className="hidden"
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  if (file) setProactiveAttachment(file);
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => document.getElementById('proactive-file')?.click()}
                                className="text-xs"
                              >
                                📎 Attach document
                              </Button>
                              {proactiveAttachment && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>📄 {proactiveAttachment.name}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setProactiveAttachment(null);
                                      const fileInput = document.getElementById('proactive-file') as HTMLInputElement;
                                      if (fileInput) fileInput.value = '';
                                    }}
                                    className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                  >
                                    ×
                                  </Button>
                                </div>
                              )}
                            </div>
                            {proactiveAttachment && (
                              <p className="text-xs text-muted-foreground">
                                Document will be attached to the Gmail thread when sent
                              </p>
                            )}
                          </div>
                          <div className="flex gap-3">
                            <Button
                              onClick={submitProactive}
                              disabled={proactiveDrafting || quickSending || !proactiveMsg.trim()}
                              variant="outline"
                            >
                              {proactiveDrafting ? (
                                <span className="flex items-center gap-2">
                                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  AI is refining...
                                </span>
                              ) : "Refine with AI →"}
                            </Button>
                            <Button
                              onClick={quickSendProactive}
                              disabled={quickSending || proactiveDrafting || !proactiveMsg.trim()}
                            >
                              {quickSending ? (
                                <span className="flex items-center gap-2">
                                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  Sending...
                                </span>
                              ) : "Quick Send"}
                            </Button>
                            <Button variant="ghost" onClick={() => {
                              setShowProactive(false);
                              setProactiveMsg("");
                              setProactiveAttachment(null);
                              const fileInput = document.getElementById('proactive-file') as HTMLInputElement;
                              if (fileInput) fileInput.value = '';
                            }}>
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}
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
                {/* Autonomous mode toggle */}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-tight">Auto-pilot mode</p>
                      <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                        AI replies automatically without your approval
                      </p>
                    </div>
                    <button
                      onClick={toggleAutonomousMode}
                      disabled={togglingAuto}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50 ${
                        negotiation.autonomous_mode ? "bg-violet-600" : "bg-muted-foreground/30"
                      }`}
                      role="switch"
                      aria-checked={negotiation.autonomous_mode}
                    >
                      <span
                        className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                          negotiation.autonomous_mode ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  {negotiation.autonomous_mode && (
                    <p className="text-xs text-violet-700 mt-1.5 bg-violet-50 rounded px-2 py-1">
                      AI is managing this negotiation autonomously.
                    </p>
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
                  <p className="text-2xl font-bold">{messages.filter(m => m.content !== "[First contact]").length}</p>
                  <p className="text-xs text-muted-foreground">Messages</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{daysActive}</p>
                  <p className="text-xs text-muted-foreground">Days active</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {messages.filter(m => m.direction === "inbound" && m.content !== "[First contact]").length}
                  </p>
                  <p className="text-xs text-muted-foreground">Received</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {messages.filter(m => (m.direction === "outbound" || m.direction === "proactive") && m.approved).length}
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

            {/* Documents */}
            {documents.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Documents
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {documents.map(doc => {
                    const icon = doc.mime_type === "application/pdf" ? "📄" : doc.mime_type.startsWith("image/") ? "🖼️" : "📎";
                    return (
                      <a
                        key={doc.id}
                        href={doc.blob_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-muted transition-colors group"
                      >
                        <span className="text-base shrink-0">{icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                            {doc.filename}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.direction === "sent" ? "Sent" : "Received"} · {relativeTime(doc.created_at)}
                            {doc.size_bytes ? ` · ${Math.round(doc.size_bytes / 1024)}KB` : ""}
                          </p>
                        </div>
                      </a>
                    );
                  })}
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </main>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this negotiation?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{negotiation?.address}&rdquo; will be moved to your archive. You can still view it there but it won&apos;t appear in your active list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={archiveNegotiation}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
