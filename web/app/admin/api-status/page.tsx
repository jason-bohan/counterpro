"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";

type StatusLevel = "ok" | "warn" | "error";

type ApiCheck = {
  name: string;
  status: StatusLevel;
  detail: string;
  hint?: string;
};

type StatusData = {
  checks: ApiCheck[];
  summary: { ok: number; warn: number; error: number };
};

function StatusBadge({ status }: { status: StatusLevel }) {
  if (status === "ok") return <Badge className="bg-green-600 text-white border-0">OK</Badge>;
  if (status === "warn") return <Badge className="bg-yellow-500 text-white border-0">Warn</Badge>;
  return <Badge className="bg-red-600 text-white border-0">Error</Badge>;
}

export default function ApiStatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetch("/api/admin/api-status")
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(load, []);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
          <Logo size={44} href="/" />
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Admin
            </Link>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">API Status</h1>
            <p className="text-muted-foreground mt-1 text-sm">Environment variables and external service health.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? "Checking…" : "Refresh"}
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            Failed to load: {error}
            {error === "403" && " — you need to be in ADMIN_USER_IDS"}
          </div>
        )}

        {data && (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{data.summary.ok}</p>
                  <p className="text-sm text-muted-foreground mt-1">OK</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-3xl font-bold text-yellow-500">{data.summary.warn}</p>
                  <p className="text-sm text-muted-foreground mt-1">Warnings</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{data.summary.error}</p>
                  <p className="text-sm text-muted-foreground mt-1">Errors</p>
                </CardContent>
              </Card>
            </div>

            {/* Individual checks */}
            <div className="flex flex-col gap-3">
              {data.checks.map(check => (
                <Card key={check.name} className={
                  check.status === "error" ? "border-red-300" :
                  check.status === "warn" ? "border-yellow-300" : ""
                }>
                  <CardContent className="py-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{check.name}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 font-mono">{check.detail}</p>
                      {check.hint && (
                        <p className="text-xs text-yellow-700 mt-1">{check.hint}</p>
                      )}
                    </div>
                    <StatusBadge status={check.status} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {loading && !data && (
          <div className="text-muted-foreground text-sm py-12 text-center">Checking APIs…</div>
        )}

        <div className="mt-8 flex gap-3">
          <Link href="/admin">
            <Button variant="outline" size="sm">← Admin</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
