"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PromoCode({ onRedeemed }: { onRedeemed?: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const redeem = async () => {
    if (!code.trim()) return;
    setStatus("loading");
    const res = await fetch("/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus("done");
      setMessage(`✓ Code applied! ${data.deals_granted} deal credit${data.deals_granted !== 1 ? "s" : ""} added to your account.`);
      onRedeemed?.();
    } else {
      setStatus("error");
      setMessage(data.error ?? "Something went wrong.");
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
      >
        Have a promo code?
      </button>
    );
  }

  if (status === "done") {
    return <p className="text-sm text-green-600 font-medium">{message}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/30 p-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Enter code"
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setStatus("idle"); setMessage(""); }}
          onKeyDown={e => e.key === "Enter" && redeem()}
          className={`uppercase tracking-[0.2em] bg-background ${status === "error" ? "border-destructive" : ""}`}
        />
        <Button variant="outline" onClick={redeem} disabled={status === "loading" || !code.trim()} className="sm:px-4">
          {status === "loading" ? "..." : "Apply"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(false)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Close promo code form"
        >
          ✕
        </Button>
        </div>
      </div>
      {status === "error" && <p className="text-xs text-destructive">{message}</p>}
    </div>
  );
}
