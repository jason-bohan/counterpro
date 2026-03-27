"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

export function NotifyButton() {
  const { isSignedIn } = useUser();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  const notify = async () => {
    if (!isSignedIn && !isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setStatus("loading");
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (res && !res.ok) {
      setError("Something went wrong. Try again.");
      setStatus("idle");
      return;
    }
    setStatus("done");
  };

  if (status === "done") {
    return <p className="text-sm text-green-600 font-medium shrink-0">✓ You&apos;re on the list!</p>;
  }

  if (isSignedIn) {
    return (
      <Button
        variant="outline"
        className="shrink-0"
        disabled={status === "loading"}
        onClick={notify}
      >
        {status === "loading" ? "Saving..." : "Notify me"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1 shrink-0">
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(""); }}
          className={`w-44 ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
          onKeyDown={(e) => e.key === "Enter" && notify()}
        />
        <Button
          variant="outline"
          disabled={status === "loading"}
          onClick={notify}
        >
          {status === "loading" ? "..." : "Notify me"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
