"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserButton } from "@clerk/nextjs";

const MARKET_OPTIONS = [
  "Hot sellers market",
  "Balanced market",
  "Buyers market",
  "Slow / lots of inventory",
];

export default function DealPage() {
  const [form, setForm] = useState({
    role: "buyer",
    address: "",
    propertyType: "Single family home",
    askingPrice: "",
    offerAmount: "",
    market: "Balanced market",
    timeline: "",
    priorities: "",
    concerns: "",
    extra: "",
  });

  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const addressInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!apiKey || !addressInputRef.current) return;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => {
      const autocomplete = new (window as any).google.maps.places.Autocomplete(
        addressInputRef.current!,
        { types: ["address"], componentRestrictions: { country: "us" } }
      );
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.formatted_address) {
          setForm((f) => ({ ...f, address: place.formatted_address }));
        }
      });
    };
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult("");
    setError("");
    try {
      const res = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Something went wrong. Please try again.");
      const data = await res.json();
      setResult(data.package);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Dashboard
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-sm">New deal</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">AI</Badge>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {!result ? (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold mb-2">Tell us about your deal</h1>
              <p className="text-muted-foreground text-sm">
                We'll generate a complete counter-offer strategy and ready-to-send scripts.
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Role */}
                  <div className="space-y-2">
                    <Label>I am the</Label>
                    <div className="flex gap-3">
                      {["buyer", "seller"].map((r) => (
                        <Button
                          key={r}
                          type="button"
                          variant={form.role === r ? "default" : "outline"}
                          className="flex-1"
                          onClick={() => setForm({ ...form, role: r })}
                        >
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-2">
                    <Label htmlFor="address">Property address</Label>
                    <Input
                      id="address"
                      ref={addressInputRef}
                      placeholder="Start typing an address..."
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      required
                    />
                  </div>

                  {/* Prices */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="asking">Asking price ($)</Label>
                      <Input
                        id="asking"
                        type="number"
                        placeholder="350000"
                        value={form.askingPrice}
                        onChange={(e) => setForm({ ...form, askingPrice: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="offer">
                        {form.role === "seller" ? "Offer received ($)" : "Your offer ($)"}
                      </Label>
                      <Input
                        id="offer"
                        type="number"
                        placeholder="320000"
                        value={form.offerAmount}
                        onChange={(e) => setForm({ ...form, offerAmount: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {/* Market */}
                  <div className="space-y-2">
                    <Label>Market conditions</Label>
                    <Select value={form.market} onValueChange={(v) => setForm({ ...form, market: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MARKET_OPTIONS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Timeline + Priorities */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="timeline">Your timeline</Label>
                      <Input
                        id="timeline"
                        placeholder="Close in 30 days"
                        value={form.timeline}
                        onChange={(e) => setForm({ ...form, timeline: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="priorities">Your top priorities</Label>
                      <Input
                        id="priorities"
                        placeholder="Best price, fast close"
                        value={form.priorities}
                        onChange={(e) => setForm({ ...form, priorities: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {/* Concerns */}
                  <div className="space-y-2">
                    <Label htmlFor="concerns">Concerns or red flags</Label>
                    <Textarea
                      id="concerns"
                      rows={2}
                      placeholder="Roof is old, buyer seems shaky, on market 60 days..."
                      value={form.concerns}
                      onChange={(e) => setForm({ ...form, concerns: e.target.value })}
                      required
                    />
                  </div>

                  {/* Extra */}
                  <div className="space-y-2">
                    <Label htmlFor="extra">
                      Anything else? <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Textarea
                      id="extra"
                      rows={2}
                      placeholder="Cash offer, first time buyer, previous deal fell through..."
                      value={form.extra}
                      onChange={(e) => setForm({ ...form, extra: e.target.value })}
                    />
                  </div>

                  {error && <p className="text-destructive text-sm">{error}</p>}

                  <Button type="submit" className="w-full" size="lg" disabled={loading}>
                    {loading ? "Analyzing your deal..." : "Get my negotiation package →"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Your Negotiation Package</h1>
              <Button variant="ghost" size="sm" onClick={() => setResult("")}>
                ← New deal
              </Button>
            </div>
            <Card>
              <CardContent className="pt-6 prose prose-sm max-w-none whitespace-pre-wrap text-foreground leading-7">
                {result}
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob([result], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "counterpro-negotiation-package.txt";
                  a.click();
                }}
              >
                Download as text file
              </Button>
              <Button
                onClick={() => {
                  // Extract the email script section from the result
                  const emailMatch = result.match(/(?:Email Script|4\..*?Email Script)[^\n]*\n([\s\S]*?)(?=\n##|\n\*\*5\.|\n5\.|$)/i);
                  const emailBody = emailMatch ? emailMatch[1].trim() : result;
                  const subject = encodeURIComponent(`Offer for ${form.address}`);
                  const body = encodeURIComponent(emailBody);
                  window.location.href = `mailto:?subject=${subject}&body=${body}`;
                }}
              >
                Send email →
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
