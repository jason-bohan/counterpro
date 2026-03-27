"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Thread = {
  id: number;
  address: string;
  counterparty_email: string | null;
  status: string;
  updated_at: string;
  last_message: string | null;
  pending_count: number;
};

export default function NegotiateSuitePage() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/negotiate-suite/threads")
      .then(r => r.json())
      .then(d => setThreads(d.threads ?? []))
      .catch(() => {});
  }, []);

  const createThread = async () => {
    if (!address) return;
    setCreating(true);
    const res = await fetch("/api/negotiate-suite/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, counterpartyEmail: email || null }),
    });
    const { id } = await res.json();
    setCreating(false);
    router.push(`/negotiate/${id}`);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Dashboard</Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold text-sm">Negotiation Suite</span>
            <Badge className="text-xs">$300/mo</Badge>
          </div>
          <UserButton />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Active Negotiations</h1>
            <p className="text-muted-foreground text-sm mt-1">AI drafts each response — you approve before it sends.</p>
          </div>
          <Button onClick={() => setShowNew(true)}>+ New negotiation</Button>
        </div>

        {showNew && (
          <Card className="mb-8 border-primary border-2">
            <CardHeader><CardTitle className="text-base">Start a new negotiation thread</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Property address</Label>
                <Input placeholder="123 Main St, Austin TX" value={address} onChange={e => setAddress(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Counterparty email <span className="text-muted-foreground font-normal">(optional — needed to auto-send)</span></Label>
                <Input type="email" placeholder="buyer@email.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <Button onClick={createThread} disabled={creating || !address}>
                  {creating ? "Creating..." : "Start thread →"}
                </Button>
                <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {threads.length === 0 && !showNew ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-lg mb-2">No active negotiations yet.</p>
              <p className="text-sm mb-6">Start a thread for any property you&apos;re negotiating on.</p>
              <Button onClick={() => setShowNew(true)}>Start your first negotiation</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {threads.map(t => (
              <Link key={t.id} href={`/negotiate/${t.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{t.address}</p>
                        {Number(t.pending_count) > 0 && (
                          <Badge className="bg-red-500 text-white text-xs shrink-0">
                            {t.pending_count} awaiting approval
                          </Badge>
                        )}
                      </div>
                      {t.last_message && (
                        <p className="text-sm text-muted-foreground truncate">{t.last_message}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Updated {new Date(t.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {t.counterparty_email && ` · ${t.counterparty_email}`}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground ml-4 shrink-0">Open →</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
