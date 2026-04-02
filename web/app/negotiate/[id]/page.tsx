"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppHeader } from "@/components/app-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2 } from "lucide-react";
import { AI_TONE_OPTIONS, REGIONAL_TONE_OPTIONS, REALTOR_PERSONALITY_OPTIONS } from "@/lib/email-pipeline";

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
  ai_tone: string;
  gmail_copy_enabled?: boolean;
  property_context?: string | null;
  gmail_token?: string | null;
  paired_counterparty_confirmed?: boolean;
  paired_counterparty_address?: string | null;
  paired_counterparty_role?: string | null;
};

const COUNTERPRO_ALIAS_PATTERN = /^sales\+neg\d+@counterproai\.com$/i;

function isCounterProAliasEmail(value: string | null | undefined): boolean {
  return typeof value === "string" && COUNTERPRO_ALIAS_PATTERN.test(value.trim());
}

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

const NEGOTIATION_TOUR_STORAGE_KEY = "counterpro:tour:negotiation:v1";
const NEGOTIATION_TOUR_DISMISSED_KEY = "counterpro:tour:negotiation:dismissed";
const SUITE_THREAD_VISITED_KEY = "counterpro:onboarding:thread-visited";
const SUITE_ALIAS_COPIED_KEY = "counterpro:onboarding:alias-copied";

function onboardingStorageKey(base: string, userId: string | null | undefined): string {
  return userId ? `${base}:${userId}` : base;
}

function getLatestPendingInboundDraft(messages: Message[]): Message | null {
  return [...messages]
    .reverse()
    .find((m) => Boolean(m.ai_draft) && !m.approved && m.direction === "inbound") ?? null;
}

function getLatestPendingProactiveDraft(messages: Message[]): Message | null {
  return [...messages]
    .reverse()
    .find((m) => Boolean(m.ai_draft) && !m.approved && m.direction === "proactive") ?? null;
}

function getMessageProvenanceBadge(message: Message): { label: string; className: string } | null {
  if (message.direction === "proactive" || message.direction === "outbound") {
    if (message.ai_draft == null) {
      return {
        label: "AI Reply",
        className: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
      };
    }

    if (message.ai_draft !== message.content) {
      return {
        label: "AI Refined",
        className: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
      };
    }

    return {
      label: "Manual",
      className: "bg-zinc-500/15 text-zinc-300 border border-zinc-500/25",
    };
  }

  return null;
}

export default function NegotiateThreadPage() {
  const { id } = useParams();
  const { user } = useUser();
  const threadVisitedKey = onboardingStorageKey(SUITE_THREAD_VISITED_KEY, user?.id);
  const aliasCopiedKey = onboardingStorageKey(SUITE_ALIAS_COPIED_KEY, user?.id);
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
  const [editingPairing, setEditingPairing] = useState(false);
  const [pairingAliasValue, setPairingAliasValue] = useState("");
  const [savingPairing, setSavingPairing] = useState(false);

  // Resend / delete failed messages
  const [resending, setResending] = useState<number | null>(null);
  const [deletingFailed, setDeletingFailed] = useState<number | null>(null);

  // Autonomous mode
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [togglingGmailCopy, setTogglingGmailCopy] = useState(false);
  const [fetchingPropertyDetails, setFetchingPropertyDetails] = useState(false);

  // Archive confirmation
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  // First contact
  const [showFirstContact, setShowFirstContact] = useState(false);
  const [researching, setResearching] = useState(false);
  const [research, setResearch] = useState<{ market_value_low: number; market_value_high: number; suggested_offer: number; reasoning: string } | null>(null);
  const [researchError, setResearchError] = useState<string>("");
  const [offerAmount, setOfferAmount] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [offerTone, setOfferTone] = useState("professional");
  const [offerCustomTone, setOfferCustomTone] = useState("");
  const [generatingFirst, setGeneratingFirst] = useState(false);
  const [generatingReply, setGeneratingReply] = useState(false);
  const [quickReplying, setQuickReplying] = useState(false);

  // AI Settings
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiTone, setAiTone] = useState("professional");
  const [aiCustomTone, setAiCustomTone] = useState("");
  const [aiRegionalTone, setAiRegionalTone] = useState("none");
  const [aiRealtorPersonality, setAiRealtorPersonality] = useState("none");
  const [savingAiTone, setSavingAiTone] = useState(false);

  // Draft refine panel
  const [showRefine, setShowRefine] = useState(false);
  const [draftToneOverride, setDraftToneOverride] = useState("none");
  const [draftCustomToneOverride, setDraftCustomToneOverride] = useState("");
  const [draftHints, setDraftHints] = useState("");

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
        const nextCounterpartyEmail = d.negotiation?.counterparty_email ?? "";
        setEmailValue(isCounterProAliasEmail(nextCounterpartyEmail) ? "" : nextCounterpartyEmail);
        setPairingAliasValue(isCounterProAliasEmail(nextCounterpartyEmail) ? nextCounterpartyEmail : "");
        const savedTone = d.negotiation?.ai_tone ?? "professional";
        
        // Parse combined tone format (base_tone|regional_tone|personality_tone)
        const toneParts = savedTone.split("|");
        const baseTone = toneParts[0];
        const regionalTone = toneParts[1] ?? "";
        const personalityTone = toneParts[2] ?? "";
        
        // Determine if base tone is custom
        const isCustom = !AI_TONE_OPTIONS.some(o => o.value === baseTone || o.value === "custom" && baseTone === "professional");
        if (isCustom && baseTone !== "professional") {
          setAiTone("custom");
          setAiCustomTone(baseTone);
        } else {
          setAiTone(baseTone);
        }
        
        // Set regional and personality tones if present
        setAiRegionalTone(regionalTone || "none");
        setAiRealtorPersonality(personalityTone || "none");
        // Sync pending draft from DB
        const pendingInbound = getLatestPendingInboundDraft(d.messages ?? []);
        if (pendingInbound) {
          setPendingDraft({ draft: pendingInbound.ai_draft!, messageId: pendingInbound.id });
          setEditedDraft(pendingInbound.ai_draft!);
        } else {
          setPendingDraft(null);
        }

        const pendingProactive = getLatestPendingProactiveDraft(d.messages ?? []);
        if (pendingProactive) {
          setRefinedDraft({
            text: pendingProactive.ai_draft!,
            messageId: pendingProactive.id,
            original: pendingProactive.content,
          });
          setShowProactive(true);
        } else {
          setRefinedDraft(null);
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
            const nextNegotiation = d.negotiation ?? null;

            if (nextNegotiation) {
              setNegotiation(prev => {
                if (!prev) return nextNegotiation;
                if (
                  prev.counterparty_email !== nextNegotiation.counterparty_email ||
                  prev.autonomous_mode !== nextNegotiation.autonomous_mode ||
                  prev.gmail_copy_enabled !== nextNegotiation.gmail_copy_enabled ||
                  prev.status !== nextNegotiation.status ||
                  prev.paired_counterparty_confirmed !== nextNegotiation.paired_counterparty_confirmed ||
                  prev.paired_counterparty_address !== nextNegotiation.paired_counterparty_address ||
                  prev.paired_counterparty_role !== nextNegotiation.paired_counterparty_role
                ) {
                  return nextNegotiation;
                }
                return prev;
              });

              const nextCounterpartyEmail = nextNegotiation.counterparty_email ?? "";
              if (!editingEmail) {
                setEmailValue(isCounterProAliasEmail(nextCounterpartyEmail) ? "" : nextCounterpartyEmail);
              }
              if (!editingPairing) {
                setPairingAliasValue(isCounterProAliasEmail(nextCounterpartyEmail) ? nextCounterpartyEmail : "");
              }
            }

            if (nextMessages.length !== messages.length) {
              setMessages(nextMessages);
              setDocuments(nextDocuments);

              const pending = getLatestPendingInboundDraft(nextMessages);
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

              const pendingProactive = getLatestPendingProactiveDraft(nextMessages);
              if (pendingProactive) {
                setRefinedDraft(prev =>
                  prev?.messageId === pendingProactive.id
                    ? prev
                    : {
                        text: pendingProactive.ai_draft!,
                        messageId: pendingProactive.id,
                        original: pendingProactive.content,
                      }
                );
              } else {
                setRefinedDraft(null);
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
  }, [id, pendingDraft, editedDraft, documents.length, messages.length, editingEmail, editingPairing]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingDraft]);

  const latestInboundAwaitingReply = [...messages]
    .reverse()
    .find(m => m.direction === "inbound");

  const regeneratePendingReply = async () => {
    if (!pendingDraft || !id) return;
    setGeneratingReply(true);
    try {
      const toneOverride = draftToneOverride === "custom"
        ? draftCustomToneOverride || undefined
        : (draftToneOverride && draftToneOverride !== "none") ? draftToneOverride : undefined;
      const res = await fetch("/api/negotiate-suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          negotiationId: Number(id),
          replyToMessageId: pendingDraft.messageId,
          toneOverride,
          hints: draftHints.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to regenerate AI reply.");
      const { draft, messageId } = await res.json();
      setPendingDraft({ draft, messageId });
      setEditedDraft(draft);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to regenerate AI reply.");
    } finally {
      setGeneratingReply(false);
    }
  };

  const generateReplyFromLatestInbound = async () => {
    if (!latestInboundAwaitingReply || !id) return;
    setGeneratingReply(true);
    try {
      const res = await fetch("/api/negotiate-suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          negotiationId: Number(id),
          replyToMessageId: latestInboundAwaitingReply.id,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate AI reply.");
      const { draft, messageId } = await res.json();
      setPendingDraft({ draft, messageId });
      setEditedDraft(draft);
      setShowInbound(false);
      setShowProactive(false);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate AI reply.");
    } finally {
      setGeneratingReply(false);
    }
  };

  // Reply with AI: generate + approve + send immediately (no review step)
  const replyWithAiNow = async () => {
    if (!latestInboundAwaitingReply || !id) return;
    setQuickReplying(true);
    try {
      const genRes = await fetch("/api/negotiate-suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          negotiationId: Number(id),
          replyToMessageId: latestInboundAwaitingReply.id,
        }),
      });
      if (!genRes.ok) throw new Error("Failed to generate AI reply.");
      const { messageId } = await genRes.json();

      const sendRes = await fetch("/api/negotiate-suite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, approved: true }),
      });
      if (!sendRes.ok) throw new Error("Failed to send reply.");
      window.dispatchEvent(new Event("notifications-updated"));
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send AI reply.");
    } finally {
      setQuickReplying(false);
    }
  };

  useEffect(() => {
    if (loading || !negotiation) return;
    if (typeof window === "undefined") return;
    if (!user?.id) return;

    window.localStorage.setItem(threadVisitedKey, "true");
  }, [loading, negotiation, threadVisitedKey, user?.id]);

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
      load();
    } finally {
      setProactiveDrafting(false);
    }
  };

  const discardRefinedDraftMessage = async (messageId: number) => {
    await fetch("/api/negotiate-suite", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, discard: true }),
    });
  };

  const quickSendProactive = async () => {
    if (!proactiveMsg.trim() || !id) return;
    setQuickSending(true);
    try {
      if (refinedDraft) {
        await discardRefinedDraftMessage(refinedDraft.messageId);
        setRefinedDraft(null);
      }

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
      const res = await fetch("/api/negotiate-suite", { method: "PUT", headers, body });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `Send failed (${res.status}). Please try again.`);
        return;
      }
      setPendingDraft(null);
      setAttachedFile(null);
      window.dispatchEvent(new Event("notifications-updated"));
      load();
    } catch {
      alert("Network error — please check your connection and try again.");
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

  const deleteFailedMessage = async (messageId: number) => {
    setDeletingFailed(messageId);
    try {
      await fetch("/api/negotiate-suite", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      load();
    } finally {
      setDeletingFailed(null);
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
      if (negotiation) {
        setNegotiation({
          ...negotiation,
          counterparty_email: emailValue || null,
          paired_counterparty_confirmed: false,
          paired_counterparty_address: null,
          paired_counterparty_role: null,
        });
      }
      setEditingEmail(false);
    } finally {
      setSavingEmail(false);
    }
  };

  const savePairing = async () => {
    setSavingPairing(true);
    try {
      await fetch(`/api/negotiate-suite/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterparty_email: pairingAliasValue }),
      });
      setEditingPairing(false);
      load();
    } finally {
      setSavingPairing(false);
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
    setResearchError("");
    try {
      const res = await fetch(`/api/negotiate-suite/threads/${id}/research`);
      const data = await res.json();
      if (!res.ok) {
        setResearch(null);
        setOfferAmount("");
        setResearchError(typeof data?.error === "string" ? data.error : "Could not estimate market value right now.");
        return;
      }

      const hasEstimate =
        typeof data?.market_value_low === "number" &&
        typeof data?.market_value_high === "number" &&
        typeof data?.suggested_offer === "number";

      if (!hasEstimate) {
        setResearch(null);
        setOfferAmount("");
        setResearchError("Research came back incomplete. You can still enter an offer manually.");
        return;
      }

      setResearch(data);
      setOfferAmount(String(data.suggested_offer));
    } catch {
      setResearch(null);
      setOfferAmount("");
      setResearchError("Could not estimate market value right now.");
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
        body: JSON.stringify({ 
          offerAmount: amount, 
          notes: offerNotes || undefined,
          tone: offerTone 
        }),
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

  const toggleGmailCopy = async () => {
    if (!negotiation) return;
    setTogglingGmailCopy(true);
    const next = !negotiation.gmail_copy_enabled;
    try {
      await fetch(`/api/negotiate-suite/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail_copy_enabled: next }),
      });
      setNegotiation({ ...negotiation, gmail_copy_enabled: next });
    } finally {
      setTogglingGmailCopy(false);
    }
  };

  const fetchPropertyDetails = async () => {
    if (!id) return;
    setFetchingPropertyDetails(true);
    try {
      const res = await fetch(`/api/negotiate-suite/threads/${id}/property-details`, {
        method: "POST",
      });
      if (res.status === 403) {
        setAccessDenied(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not fetch property details right now.");
        return;
      }
      load();
    } finally {
      setFetchingPropertyDetails(false);
    }
  };

  const saveAiTone = async () => {
    if (!negotiation || !id) return;
    setSavingAiTone(true);
    try {
      // Build combined tone from base tone + regional + personality
      let toneValue = aiTone === "custom" ? aiCustomTone : aiTone;
      
      // Add regional and personality prefixes if selected ("none" = no selection)
      const components = [toneValue];
      if (aiRegionalTone && aiRegionalTone !== "none") components.push(aiRegionalTone);
      if (aiRealtorPersonality && aiRealtorPersonality !== "none") components.push(aiRealtorPersonality);
      
      // Store as combined string with pipe delimiter
      toneValue = components.join("|");
      
      await fetch(`/api/negotiate-suite/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_tone: toneValue }),
      });
      setNegotiation({ ...negotiation, ai_tone: toneValue });
      setShowAiSettings(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save AI tone");
    } finally {
      setSavingAiTone(false);
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
  const isPairedCounterparty = isCounterProAliasEmail(negotiation?.counterparty_email);

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
          <div className="flex-1 min-w-0 flex flex-col gap-4" data-tour="thread">

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
                    {researchError && !researching && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Market research unavailable</p>
                        <p className="text-sm text-amber-900">{researchError}</p>
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

                    {/* AI Tone */}
                    <div className="space-y-1">
                      <Label className="text-sm">
                        AI Tone <span className="text-muted-foreground font-normal">(for this message only)</span>
                      </Label>
                      <Select value={offerTone} onValueChange={setOfferTone}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select tone" />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_TONE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Button variant="ghost" onClick={() => { setShowFirstContact(false); setResearch(null); setResearchError(""); setOfferAmount(""); setOfferNotes(""); setOfferTone("professional"); }}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {messages
                .filter(m => m.content !== "[First contact]" && !(m.direction === "proactive" && !m.approved))
                .map(m => {
                const provenanceBadge = getMessageProvenanceBadge(m);
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
                        {provenanceBadge && (
                          <Badge variant="secondary" className={`text-xs h-4 shrink-0 ${provenanceBadge.className}`}>
                            {provenanceBadge.label}
                          </Badge>
                        )}
                        {(m.direction === "outbound" || m.direction === "proactive") && m.sent_at && (
                          <Badge variant="secondary" className="text-xs h-4 shrink-0">Sent</Badge>
                        )}
                        {(m.direction === "outbound" || m.direction === "proactive") && !m.sent_at && m.approved && (
                          <>
                            <Badge className="text-xs h-4 shrink-0 bg-red-500/20 text-red-300 border border-red-500/30">Send failed</Badge>
                            <button
                              onClick={() => resendMessage(m.id)}
                              disabled={resending === m.id || deletingFailed === m.id}
                              className="text-xs text-primary-foreground/70 hover:text-primary-foreground underline underline-offset-2 disabled:opacity-50 shrink-0"
                            >
                              {resending === m.id ? "Sending..." : "Retry"}
                            </button>
                            <button
                              onClick={() => deleteFailedMessage(m.id)}
                              disabled={deletingFailed === m.id || resending === m.id}
                              className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 disabled:opacity-50 shrink-0"
                            >
                              {deletingFailed === m.id ? "Deleting..." : "Delete"}
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

                  {/* Refine panel */}
                  <div className="rounded-md border border-border bg-muted/40">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowRefine(v => !v)}
                    >
                      <span className="flex items-center gap-1.5">
                        <Settings2 className="w-3.5 h-3.5" />
                        Refine AI response
                      </span>
                      <span>{showRefine ? "▲" : "▼"}</span>
                    </button>
                    {showRefine && (
                      <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Tone override</label>
                          <Select value={draftToneOverride} onValueChange={setDraftToneOverride}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Use negotiation default" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Use negotiation default</SelectItem>
                              {AI_TONE_OPTIONS.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {draftToneOverride === "custom" && (
                            <Input
                              className="h-8 text-xs mt-1"
                              placeholder="Describe the tone..."
                              value={draftCustomToneOverride}
                              onChange={e => setDraftCustomToneOverride(e.target.value)}
                            />
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Keywords / extra context for AI</label>
                          <Input
                            className="text-xs h-8"
                            placeholder="e.g. mention inspection contingency, be firm on price"
                            value={draftHints}
                            onChange={e => setDraftHints(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

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
                    <Button variant="outline" onClick={regeneratePendingReply} disabled={sending || generatingReply}>
                      {generatingReply ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Regenerating...
                        </span>
                      ) : "Regenerate"}
                    </Button>
                    {/* File attachment */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp"
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
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={() => setShowInbound(true)}>
                      + Add their message
                    </Button>
                    <Button variant="outline" onClick={() => { setShowProactive(true); setShowInbound(false); }}>
                      Write your own
                    </Button>
                    <Button variant="outline" onClick={generateReplyFromLatestInbound} disabled={generatingReply || quickReplying}>
                      {generatingReply ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Composing...
                        </span>
                      ) : "Compose with AI"}
                    </Button>
                    {latestInboundAwaitingReply && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={replyWithAiNow}
                        disabled={quickReplying || generatingReply}
                        className="text-muted-foreground hover:text-foreground text-xs"
                        title="Generate and send immediately without review"
                      >
                        {quickReplying ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Sending...
                          </span>
                        ) : "Quick Reply ↑"}
                      </Button>
                    )}
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
                        {refinedDraft ? "AI-polished draft" : "Write your own message"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {refinedDraft
                          ? "Review and edit before sending, or go back to your original."
                          : "Type your message and send it as-is, or press \"Polish with AI\" to have AI refine the tone and wording first."}
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
                              onClick={async () => {
                                // Restore original message so user can edit
                                await discardRefinedDraftMessage(refinedDraft.messageId);
                                setProactiveMsg(refinedDraft.original);
                                setRefinedDraft(null);
                                load();
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
                          <div className="flex gap-3 flex-wrap">
                            <Button
                              onClick={quickSendProactive}
                              disabled={quickSending || proactiveDrafting || !proactiveMsg.trim()}
                            >
                              {quickSending ? (
                                <span className="flex items-center gap-2">
                                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  Sending...
                                </span>
                              ) : "Send →"}
                            </Button>
                            <Button
                              onClick={submitProactive}
                              disabled={proactiveDrafting || quickSending || !proactiveMsg.trim()}
                              variant="outline"
                            >
                              {proactiveDrafting ? (
                                <span className="flex items-center gap-2">
                                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  Polishing...
                                </span>
                              ) : "Polish with AI"}
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
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Deal Info
                  </CardTitle>
                  <button
                    onClick={() => setShowAiSettings(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="AI Settings"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                </div>
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
                  <div data-tour="alias-email">
                    <p className="text-xs text-muted-foreground mb-0.5">Your negotiation email</p>
                    <p className="text-xs text-muted-foreground mb-1">Tell the other party to email this address</p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs break-all flex-1">{negotiation.alias_email}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(negotiation.alias_email!).catch(() => {});
                          if (typeof window !== "undefined") {
                            window.localStorage.setItem(aliasCopiedKey, "true");
                          }
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
                  <p className="text-xs text-muted-foreground mb-0.5">External counterparty email</p>
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
                        {emailValue || "Not set"}
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
                <div className="pt-2 border-t" data-tour="pairing">
                  <p className="text-xs text-muted-foreground mb-0.5">CounterPro pairing</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Link this negotiation to another CounterPro thread using its alias email.
                  </p>
                  {editingPairing ? (
                    <div className="space-y-2">
                      <Input
                        type="email"
                        value={pairingAliasValue}
                        onChange={e => setPairingAliasValue(e.target.value)}
                        className="h-8 text-xs"
                        placeholder="sales+neg123@counterproai.com"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={savePairing}
                          disabled={savingPairing || !pairingAliasValue.trim()}
                        >
                          {savingPairing ? "..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2"
                          onClick={() => {
                            setEditingPairing(false);
                            setPairingAliasValue(isPairedCounterparty ? negotiation.counterparty_email ?? "" : "");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={isPairedCounterparty ? "text-foreground font-mono text-xs break-all" : "text-muted-foreground"}>
                          {isPairedCounterparty ? negotiation.counterparty_email : "Not paired"}
                        </span>
                        <button
                          onClick={() => setEditingPairing(true)}
                          className="text-xs text-primary hover:underline shrink-0"
                        >
                          {isPairedCounterparty ? "Change" : "Pair"}
                        </button>
                      </div>
                      {isPairedCounterparty && (
                        <>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${negotiation.paired_counterparty_confirmed ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
                          >
                            {negotiation.paired_counterparty_confirmed ? "Reciprocal pairing confirmed" : "Waiting for reciprocal pairing"}
                          </Badge>
                          {!negotiation.paired_counterparty_confirmed && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                Waiting for the other CounterPro thread to pair back. This updates automatically.
                              </p>
                              <button
                                onClick={() => load()}
                                className="text-xs text-primary hover:underline shrink-0"
                              >
                                Check now
                              </button>
                            </div>
                          )}
                          {negotiation.paired_counterparty_address && (
                            <p className="text-xs text-muted-foreground">
                              Linked to {negotiation.paired_counterparty_role ?? "counterparty"} thread:
                              {" "}
                              {negotiation.paired_counterparty_address}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {isPairedCounterparty && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-tight">Email me copies</p>
                        <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                          Forward paired-thread activity to your Gmail for record-keeping
                        </p>
                      </div>
                      <button
                        onClick={toggleGmailCopy}
                        disabled={togglingGmailCopy}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50 ${
                          negotiation.gmail_copy_enabled ? "bg-blue-600" : "bg-muted-foreground/30"
                        }`}
                        role="switch"
                        aria-checked={Boolean(negotiation.gmail_copy_enabled)}
                      >
                        <span
                          className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                            negotiation.gmail_copy_enabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-tight">Property details</p>
                      <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                        Pull live property facts and market data into Documents for this negotiation.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2 shrink-0"
                      onClick={fetchPropertyDetails}
                      disabled={fetchingPropertyDetails}
                    >
                      {fetchingPropertyDetails ? "Fetching..." : "Fetch"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {negotiation.property_context
                      ? "Property details are available and AI can use them when polishing messages."
                      : "Fetch this once when you want negotiation drafts grounded in facts like last sale, size, and zip-level stats."}
                  </p>
                </div>
                {/* Autonomous mode toggle */}
                <div className="pt-2 border-t" data-tour="autopilot">
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
                {/* AI Tone Settings */}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-tight">AI Tone</p>
                      <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                        {aiTone === "custom" ? aiCustomTone : AI_TONE_OPTIONS.find(o => o.value === aiTone)?.label || "Professional"}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowAiSettings(true)}
                      className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1"
                    >
                      <Settings2 className="w-3 h-3" />
                      Configure
                    </button>
                  </div>
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
              This will remove the negotiation from your active list. You can still access it from the archive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={archiveNegotiation}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Settings Dialog */}
      <Dialog open={showAiSettings} onOpenChange={setShowAiSettings}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>AI Settings</DialogTitle>
            <DialogDescription>
              Configure how AI behaves in this negotiation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2 overflow-y-auto flex-1 pr-1">
            {/* Default Tone */}
            <div className="space-y-2">
              <div>
                <label className="text-sm font-medium">Default Response Tone</label>
                <p className="text-xs text-muted-foreground">Applied to all AI-generated replies unless overridden</p>
              </div>
              <Select value={aiTone} onValueChange={setAiTone}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a tone" />
                </SelectTrigger>
                <SelectContent>
                  {AI_TONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {aiTone === "custom" && (
                <Textarea
                  placeholder="e.g., Be very friendly and casual, use emojis, and keep sentences short..."
                  value={aiCustomTone}
                  onChange={(e) => setAiCustomTone(e.target.value)}
                  rows={3}
                />
              )}
            </div>

            {/* Regional Style */}
            <div className="space-y-2">
              <div>
                <label className="text-sm font-medium">Regional Style</label>
                <p className="text-xs text-muted-foreground">Market-specific communication approach</p>
              </div>
              <Select value={aiRegionalTone} onValueChange={setAiRegionalTone}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {REGIONAL_TONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Realtor Personality */}
            <div className="space-y-2">
              <div>
                <label className="text-sm font-medium">Realtor Personality</label>
                <p className="text-xs text-muted-foreground">Sales approach and communication style</p>
              </div>
              <Select value={aiRealtorPersonality} onValueChange={setAiRealtorPersonality}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {REALTOR_PERSONALITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span>{option.label}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">{option.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setShowAiSettings(false)}>
              Cancel
            </Button>
            <Button onClick={saveAiTone} disabled={savingAiTone || (aiTone === "custom" && !aiCustomTone.trim())}>
              {savingAiTone ? "Saving..." : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
