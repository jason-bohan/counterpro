"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NotifyButton() {
  const { isSignedIn } = useUser();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  const notify = async () => {
    setStatus("loading");
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
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
    <div className="flex gap-2 shrink-0">
      <Input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-44"
        onKeyDown={(e) => e.key === "Enter" && email && notify()}
      />
      <Button
        variant="outline"
        disabled={status === "loading" || !email}
        onClick={notify}
      >
        {status === "loading" ? "..." : "Notify me"}
      </Button>
    </div>
  );
}
