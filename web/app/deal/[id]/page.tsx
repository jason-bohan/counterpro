"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const remarkGfm = require("remark-gfm").default ?? require("remark-gfm");

export default function DealViewPage() {
  const { id } = useParams();
  const [deal, setDeal] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/deals/${id}`)
      .then(r => r.json())
      .then(d => { setDeal(d.deal); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const stripMarkdown = (text: string) => text
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\|[^\n]+\|/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const copyEmailScript = async () => {
    const emailMatch = deal.result.match(/#+[^#\n]*email script[^\n]*\n([\s\S]*?)(?=\n#+\s|$)/i);
    const rawText = (emailMatch ? emailMatch[1] : deal.result).trim();
    const stripped = stripMarkdown(rawText);
    const subjectMatch = stripped.match(/^subject:\s*(.+)/im);
    const subjectLine = subjectMatch ? subjectMatch[1].trim() : `Counter-Offer — ${deal.address}`;
    const bodyText = stripped.replace(/^subject:[^\n]*\n*/im, "").replace(/^---\s*\n/m, "").trim().slice(0, 1800);
    const subject = encodeURIComponent(subjectLine);
    const body = encodeURIComponent(bodyText);
    const mailto = `mailto:?subject=${subject}&body=${body}`;
    const a = document.createElement("a");
    a.href = mailto;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    await navigator.clipboard.writeText(bodyText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const savePdf = () => {
    const slug = deal.address.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    const original = document.title;
    document.title = `CounterPro Deal Assessment - ${slug}`;
    window.print();
    setTimeout(() => { document.title = original; }, 1000);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!deal) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Deal not found.</div>;

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Negotiation Package</h1>
            <p className="text-sm text-muted-foreground mt-1 capitalize">
              {deal.role} · {new Date(deal.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="prose prose-base max-w-none text-foreground leading-7
              prose-headings:text-foreground prose-headings:font-bold
              prose-h2:text-xl prose-h2:border-b prose-h2:pb-2 prose-h2:mb-4
              prose-strong:text-foreground
              prose-table:text-sm prose-table:w-full
              prose-th:bg-primary prose-th:text-primary-foreground prose-th:px-3 prose-th:py-2 prose-th:text-left
              prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-border
              prose-tr:even:bg-muted/40
              prose-li:my-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{deal.result}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Button variant="outline" onClick={savePdf}>Save as PDF</Button>
          <Button onClick={copyEmailScript}>
            {copied ? "✓ Opening email..." : "Send email script →"}
          </Button>
        </div>

        <div className="flex justify-center mt-6">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">← Back to dashboard</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
