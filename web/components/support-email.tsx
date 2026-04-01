"use client";

import { useState } from "react";

const EMAIL = "support@counterproai.com";
const GMAIL_COMPOSE = `https://mail.google.com/mail/?view=cm&to=${EMAIL}`;

export function SupportEmail({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Try mailto first; if no mail client opens, the user stays on-tab and we
    // fall back to Gmail compose while copying the address for convenience.
    navigator.clipboard.writeText(EMAIL).catch(() => {});

    const startTime = Date.now();
    const onVisibility = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (document.hidden) return;
      if (Date.now() - startTime < 600) {
        window.open(GMAIL_COMPOSE, "_blank");
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    setTimeout(() => document.removeEventListener("visibilitychange", onVisibility), 1500);

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    void e;
  };

  return (
    <a
      href={`mailto:${EMAIL}`}
      className={className}
      onClick={handleClick}
      title={copied ? "Copied!" : "Opens mail app or Gmail if none configured"}
    >
      {copied ? "Copied!" : EMAIL}
    </a>
  );
}
