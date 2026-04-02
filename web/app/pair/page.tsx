"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";

type PairInfo = {
  negotiationId: number;
  address: string;
  role: string;
  alreadyPaired: boolean;
  previewMessage: string | null;
};

type MyThread = {
  id: number;
  address: string;
  role: string;
};

function PairPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const token = searchParams.get("token");

  const [pairInfo, setPairInfo] = useState<PairInfo | null>(null);
  const [myThreads, setMyThreads] = useState<MyThread[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pairing, setPairing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [paired, setPaired] = useState(false);
  const [pairedNegId, setPairedNegId] = useState<number | null>(null);
  const [hasSuite, setHasSuite] = useState<boolean | null>(null);
  const [showFullMessage, setShowFullMessage] = useState(false);

  // Fetch pairing info (no auth needed)
  useEffect(() => {
    if (!token) { setLoadError("Invalid pairing link — no token found."); return; }
    fetch(`/api/pair?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setLoadError(d.error); return; }
        setPairInfo(d);
      })
      .catch(() => setLoadError("Failed to load pairing info."));
  }, [token]);

  // Once user is loaded and signed in, fetch their negotiations
  useEffect(() => {
    if (!isLoaded || !user) return;
    fetch("/api/negotiate-suite/threads")
      .then(r => {
        if (r.status === 403) { setHasSuite(false); return null; }
        setHasSuite(true);
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setMyThreads(d.threads ?? []);
      })
      .catch(() => {});
  }, [isLoaded, user]);

  const handlePair = async (negId: number) => {
    if (!token) return;
    setPairing(true);
    try {
      const res = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, myNegotiationId: negId }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Pairing failed."); return; }
      setPairedNegId(negId);
      setPaired(true);
    } finally {
      setPairing(false);
    }
  };

  // Create a new negotiation for this property then immediately pair it
  const handleCreateAndPair = async () => {
    if (!token || !pairInfo) return;
    setCreating(true);
    try {
      const counterRole = pairInfo.role === "buyer" ? "seller" : "buyer";
      const createRes = await fetch("/api/negotiate-suite/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: pairInfo.address, role: counterRole }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { alert(createData.error || "Failed to create negotiation."); return; }
      await handlePair(createData.id);
    } finally {
      setCreating(false);
    }
  };

  const counterRole = pairInfo?.role === "buyer" ? "seller" : "buyer";

  const previewText = pairInfo?.previewMessage ?? null;
  const PREVIEW_LIMIT = 220;
  const previewTruncated = previewText && previewText.length > PREVIEW_LIMIT;
  const previewDisplay = previewText
    ? (showFullMessage || !previewTruncated ? previewText : previewText.slice(0, PREVIEW_LIMIT) + "…")
    : null;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="border-b bg-background">
        <div className="max-w-xl mx-auto px-6 h-16 flex items-center">
          <Logo size={40} href="/" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg space-y-6">

          {loadError ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {loadError}
              </CardContent>
            </Card>
          ) : !pairInfo ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading…
              </CardContent>
            </Card>
          ) : paired ? (
            <Card className="border-green-200">
              <CardContent className="py-8 text-center space-y-4">
                <p className="text-2xl">🎉</p>
                <p className="font-semibold text-lg">Negotiations linked!</p>
                <p className="text-muted-foreground text-sm">
                  Your negotiation for <span className="font-medium">{pairInfo.address}</span> is now synced.
                  Messages will route automatically between both parties.
                </p>
                <Button onClick={() => router.push(`/negotiate/${pairedNegId}`)}>
                  Go to your negotiation →
                </Button>
              </CardContent>
            </Card>
          ) : pairInfo.alreadyPaired ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">This negotiation is already paired.</p>
                <p className="text-sm">The pairing link has already been used.</p>
                {user && <Button variant="outline" onClick={() => router.push("/negotiate")}>Go to your negotiations</Button>}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Property info */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="capitalize">{counterRole} invite</Badge>
                  </div>
                  <CardTitle className="text-xl">{pairInfo.address}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    The {pairInfo.role} on this property is using CounterPro and wants to sync negotiations with you.
                    Once paired, messages route automatically — no manual copy-pasting needed.
                  </p>
                </CardHeader>

                {/* Initial message preview */}
                {previewDisplay && (
                  <CardContent className="pt-0">
                    <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground text-xs uppercase tracking-wide mb-2">Their opening message</p>
                      <p className="whitespace-pre-wrap leading-relaxed">{previewDisplay}</p>
                      {previewTruncated && (
                        <button
                          onClick={() => setShowFullMessage(v => !v)}
                          className="mt-2 text-xs underline underline-offset-2 hover:text-foreground transition-colors"
                        >
                          {showFullMessage ? "Show less" : "Show full message"}
                        </button>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>

              {!isLoaded ? null : !user ? (
                <Card>
                  <CardContent className="py-6 space-y-3 text-center">
                    <p className="text-sm text-muted-foreground">Sign in to link your CounterPro negotiation.</p>
                    <Button onClick={() => router.push(`/sign-in?redirect_url=${encodeURIComponent(`/pair?token=${token}`)}`)}>
                      Sign in to continue →
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Don&apos;t have an account?{" "}
                      <Link href={`/sign-up?redirect_url=${encodeURIComponent(`/pair?token=${token}`)}`} className="underline underline-offset-2 hover:text-foreground">
                        Sign up free
                      </Link>
                    </p>
                  </CardContent>
                </Card>
              ) : hasSuite === false ? (
                <Card>
                  <CardContent className="py-6 space-y-3 text-center">
                    <p className="font-medium">Full Negotiation Suite required</p>
                    <p className="text-sm text-muted-foreground">
                      Automatic thread pairing is a Suite feature. Upgrade to link negotiations and have replies route automatically.
                    </p>
                    <Link href="/pricing">
                      <Button>Get the Suite →</Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Link your negotiation</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Select an existing negotiation for this property, or create one now.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {myThreads.length > 0 && (
                      <div className="space-y-2">
                        {myThreads.map(t => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedId(t.id)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                              selectedId === t.id
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <p className="font-medium text-sm">{t.address}</p>
                            <p className="text-xs text-muted-foreground capitalize">{t.role}</p>
                          </button>
                        ))}
                        <Button
                          className="w-full"
                          disabled={!selectedId || pairing || creating}
                          onClick={() => selectedId && handlePair(selectedId)}
                        >
                          {pairing ? "Linking…" : "Link selected negotiation →"}
                        </Button>
                        <div className="relative flex items-center gap-2 py-1">
                          <div className="flex-1 border-t border-border" />
                          <span className="text-xs text-muted-foreground">or</span>
                          <div className="flex-1 border-t border-border" />
                        </div>
                      </div>
                    )}

                    {/* Inline create + pair */}
                    <Button
                      variant={myThreads.length > 0 ? "outline" : "default"}
                      className="w-full"
                      disabled={creating || pairing}
                      onClick={handleCreateAndPair}
                    >
                      {creating ? "Creating & linking…" : `+ Create negotiation for ${pairInfo.address} & link`}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      You&apos;ll be added as the <span className="font-medium capitalize">{counterRole}</span> on this property.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense>
      <PairPageInner />
    </Suspense>
  );
}
