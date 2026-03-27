"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Message = {
  id: number;
  direction: string;
  content: string;
  ai_draft: string | null;
  approved: boolean;
  sent_at: string | null;
  created_at: string;
};

export default function NegotiateThreadPage() {
  const { id } = useParams();
  const [negotiation, setNegotiation] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<{ draft: string; messageId: number } | null>(null);
  const [editedDraft, setEditedDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    fetch(`/api/negotiate-suite/threads/${id}`)
      .then(r => r.json())
      .then(d => {
        setNegotiation(d.negotiation);
        setMessages(d.messages ?? []);
      });
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const submitInbound = async () => {
    if (!newMsg.trim()) return;
    setDrafting(true);
    const res = await fetch("/api/negotiate-suite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ negotiationId: id, newMessage: newMsg }),
    });
    const { draft, messageId } = await res.json();
    setPendingDraft({ draft, messageId });
    setEditedDraft(draft);
    setNewMsg("");
    setDrafting(false);
    load();
  };

  const approveAndSend = async () => {
    if (!pendingDraft) return;
    setSending(true);
    await fetch("/api/negotiate-suite", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: pendingDraft.messageId, approved: true, editedDraft }),
    });
    setPendingDraft(null);
    setSending(false);
    load();
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/negotiate" className="text-sm text-muted-foreground hover:text-foreground">← Negotiations</Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-sm truncate max-w-xs">{negotiation?.address}</span>
          </div>
          {negotiation?.counterparty_email && (
            <span className="text-xs text-muted-foreground">{negotiation.counterparty_email}</span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 flex-1 w-full">
        {/* Message thread */}
        <div className="space-y-4 mb-6">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-lg rounded-2xl px-4 py-3 text-sm ${
                m.direction === "outbound"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border text-foreground"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs opacity-70">
                    {m.direction === "outbound" ? "You" : "Counterparty"} · {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                  {m.direction === "outbound" && m.sent_at && (
                    <Badge variant="secondary" className="text-xs h-4">Sent</Badge>
                  )}
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{m.direction === "outbound" ? m.content : m.content}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* AI Draft approval */}
        {pendingDraft && (
          <Card className="mb-6 border-primary border-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="text-xs">AI Draft — review before sending</Badge>
              </div>
              <Textarea
                rows={8}
                value={editedDraft}
                onChange={e => setEditedDraft(e.target.value)}
                className="mb-3 text-sm font-mono"
              />
              <div className="flex gap-3">
                <Button onClick={approveAndSend} disabled={sending}>
                  {sending ? "Sending..." : negotiation?.gmail_token ? "Approve & Send →" : "Approve (copy to send)"}
                </Button>
                <Button variant="outline" onClick={() => {
                  navigator.clipboard.writeText(editedDraft);
                }}>Copy</Button>
                <Button variant="ghost" onClick={() => setPendingDraft(null)}>Discard</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Input new inbound message */}
        {!pendingDraft && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-3">Paste the counterparty&apos;s latest message and AI will draft your response:</p>
              <Textarea
                rows={4}
                placeholder="Paste their email or message here..."
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                className="mb-3"
              />
              <Button onClick={submitInbound} disabled={drafting || !newMsg.trim()}>
                {drafting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Drafting response...
                  </span>
                ) : "Get AI response →"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
