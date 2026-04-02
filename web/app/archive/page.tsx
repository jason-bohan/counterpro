"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/app-header";

type ArchivedDeal = {
  id: number;
  address: string;
  role: string;
  asking_price: number | null;
  offer_amount: number | null;
  created_at: string;
  archived_at: string;
};

type ArchivedNegotiation = {
  id: number;
  address: string;
  role: string;
  status: string;
  counterparty_email: string | null;
  created_at: string;
  archived_at: string;
};

// Key format: "deal-{id}" or "neg-{id}"
type ConfirmKey = `deal-${number}` | `neg-${number}`;

export default function ArchivePage() {
  const [deals, setDeals] = useState<ArchivedDeal[]>([]);
  const [negotiations, setNegotiations] = useState<ArchivedNegotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmKey | null>(null);

  useEffect(() => {
    fetch("/api/archive")
      .then(r => r.json())
      .then(d => {
        setDeals(d.deals ?? []);
        setNegotiations(d.negotiations ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const restoreDeal = async (id: number) => {
    setWorking(`restore-deal-${id}`);
    await fetch(`/api/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    setDeals(prev => prev.filter(d => d.id !== id));
    setWorking(null);
  };

  const deleteDeal = async (id: number) => {
    setWorking(`delete-deal-${id}`);
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    setDeals(prev => prev.filter(d => d.id !== id));
    setConfirmDelete(null);
    setWorking(null);
  };

  const restoreNegotiation = async (id: number) => {
    setWorking(`restore-neg-${id}`);
    await fetch(`/api/negotiate-suite/threads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    setNegotiations(prev => prev.filter(n => n.id !== id));
    setWorking(null);
  };

  const deleteNegotiation = async (id: number) => {
    setWorking(`delete-neg-${id}`);
    await fetch(`/api/negotiate-suite/threads/${id}`, { method: "DELETE" });
    setNegotiations(prev => prev.filter(n => n.id !== id));
    setConfirmDelete(null);
    setWorking(null);
  };

  const isEmpty = !loading && deals.length === 0 && negotiations.length === 0;

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Archive</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Restore items to make them active again, or permanently delete.
          </p>
        </div>

        {loading && (
          <div className="text-muted-foreground text-sm py-12 text-center">Loading...</div>
        )}

        {isEmpty && (
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground text-sm">No archived items.</p>
              <div className="flex gap-3 justify-center mt-4">
                <Link href="/dashboard">
                  <Button variant="outline" size="sm">Dashboard</Button>
                </Link>
                <Link href="/negotiate">
                  <Button variant="outline" size="sm">Negotiations</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {negotiations.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              Negotiations
            </h2>
            <div className="flex flex-col gap-3">
              {negotiations.map(n => {
                const key: ConfirmKey = `neg-${n.id}`;
                const isConfirming = confirmDelete === key;
                const isWorking = working !== null;
                return (
                  <Card key={n.id}>
                    <CardContent className="py-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{n.address}</p>
                        <p className="text-sm text-muted-foreground mt-0.5 capitalize">
                          {n.role}
                          {n.counterparty_email && <> · {n.counterparty_email}</>}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Archived {new Date(n.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isConfirming ? (
                          <>
                            <span className="text-sm text-muted-foreground">Delete permanently?</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isWorking}
                              onClick={() => deleteNegotiation(n.id)}
                            >
                              {working === `delete-neg-${n.id}` ? "Deleting..." : "Yes, delete"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isWorking}
                              onClick={() => restoreNegotiation(n.id)}
                            >
                              {working === `restore-neg-${n.id}` ? "Restoring..." : "Restore"}
                            </Button>
                            <Link href={`/archive/negotiations/${n.id}`}>
                              <Button size="sm" variant="ghost" disabled={isWorking}>
                                View
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={isWorking}
                              onClick={() => setConfirmDelete(key)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {deals.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              Deals
            </h2>
            <div className="flex flex-col gap-3">
              {deals.map(d => {
                const key: ConfirmKey = `deal-${d.id}`;
                const isConfirming = confirmDelete === key;
                const isWorking = working !== null;
                return (
                  <Card key={d.id}>
                    <CardContent className="py-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{d.address}</p>
                        <p className="text-sm text-muted-foreground mt-0.5 capitalize">
                          {d.role}
                          {d.asking_price != null && <> · Asking ${Number(d.asking_price).toLocaleString()}</>}
                          {d.offer_amount != null && <> · Offer ${Number(d.offer_amount).toLocaleString()}</>}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Archived {new Date(d.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isConfirming ? (
                          <>
                            <span className="text-sm text-muted-foreground">Delete permanently?</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isWorking}
                              onClick={() => deleteDeal(d.id)}
                            >
                              {working === `delete-deal-${d.id}` ? "Deleting..." : "Yes, delete"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isWorking}
                              onClick={() => restoreDeal(d.id)}
                            >
                              {working === `restore-deal-${d.id}` ? "Restoring..." : "Restore"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={isWorking}
                              onClick={() => setConfirmDelete(key)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t py-5 px-6 text-center text-xs text-muted-foreground">
        <Badge variant="outline" className="text-xs mr-2">Archive</Badge>
        <Link href="/dashboard" className="hover:text-foreground underline underline-offset-2">Back to dashboard</Link>
      </footer>
    </div>
  );
}
