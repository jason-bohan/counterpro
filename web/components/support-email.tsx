"use client";

import { useState } from "react";

const EMAIL = "support@counterproai.com";
const GMAIL_COMPOSE = `https://mail.google.com/mail/?view=cm&to=${EMAIL}`;

export function SupportEmail({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Try mailto: first. If the browser can't handle it (no mail client),
    // it fires a visibilitychange within ~500ms as focus never leaves the tab.
    // In that case we fall back to Gmail compose and copy the address.
    navigator.clipboard.writeText(EMAIL).catch(() => {});

    const startTime = Date.now();
    const onVisibility = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (document.hidden) return; // tab actually left — mail client opened
      // Tab stayed visible → no mail client; open Gmail compose
      if (Date.now() - startTime < 600) {
        window.open(GMAIL_COMPOSE, "_blank");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Clean up listener if the user never triggers it
    setTimeout(() => document.removeEventListener("visibilitychange", onVisibility), 1500);

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    // Let the default mailto: attempt proceed
    void e;
  };

  return (
    <a
      href={`mailto:${EMAIL}`}
      className={className}
      onClick={handleClick}
      title={copied ? "Copied!" : "Opens mail app — or Gmail if none configured"}
    >
      {copied ? "Copied!" : EMAIL}
    </a>
  );
}
