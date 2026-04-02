"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/app-header";
import { ArrowLeft, RotateCcw } from "lucide-react";

type ArchivedNegotiation = {
  id: number;
  address: string;
  role: string;
  status: string;
  counterparty_email: string | null;
  created_at: string;
  archived_at: string;
};

type ArchivedMessage = {
  id: number;
  direction: string;
  content: string;
  ai_draft: string | null;
  approved: boolean;
  sent_at: string | null;
  created_at: string;
};

export default function ArchivedNegotiationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [negotiation, setNegotiation] = useState<ArchivedNegotiation | null>(null);
  const [messages, setMessages] = useState<ArchivedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadArchivedNegotiation = async () => {
      try {
        const [negRes, msgRes] = await Promise.all([
          fetch(`/api/archive/negotiations/${id}`),
          fetch(`/api/archive/negotiations/${id}/messages`)
        ]);

        if (!negRes.ok || !msgRes.ok) {
          setError("Archived negotiation not found");
          return;
        }

        const negotiationData = await negRes.json();
        const messagesData = await msgRes.json();

        setNegotiation(negotiationData);
        setMessages(messagesData.messages || []);
      } catch {
        setError("Failed to load archived negotiation");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadArchivedNegotiation();
    }
  }, [id]);

  const handleRestore = async () => {
    if (!negotiation) return;
    
    setRestoring(true);
    try {
      await fetch(`/api/negotiate-suite/threads/${negotiation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      router.push(`/negotiate/${negotiation.id}`);
    } catch {
      setError("Failed to restore negotiation");
    } finally {
      setRestoring(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-muted-foreground">Loading archived negotiation...</div>
      </div>
    );
  }

  if (error || !negotiation) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-3">Error</h1>
          <p className="text-muted-foreground mb-6">{error || "Archived negotiation not found"}</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push("/archive")}>Back to Archive</Button>
            <Button variant="outline" onClick={() => router.push("/negotiate")}>Active Negotiations</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader right={<Badge variant="outline" className="text-xs">Archived</Badge>} />

      <main className="max-w-5xl mx-auto px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.push("/archive")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Archive
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{negotiation.address}</h1>
              <p className="text-muted-foreground text-sm capitalize">
                {negotiation.role} · Archived {new Date(negotiation.archived_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRestore}
              disabled={restoring}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {restoring ? "Restoring..." : "Restore"}
            </Button>
          </div>
        </div>

        {/* Warning Banner */}
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              <p className="text-sm text-amber-800">
                This negotiation is archived. To make changes or send messages, you must restore it first.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Messages */}
        <div className="space-y-4">
          {messages.map((message) => (
            <Card key={message.id} className="opacity-75">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs capitalize">
                        {message.direction === "inbound" ? "Counterparty" : "You"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.created_at).toLocaleDateString()}
                      </span>
                      {message.sent_at && (
                        <Badge variant="outline" className="text-xs">Sent</Badge>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {messages.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground text-sm">No messages in this archived negotiation.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
