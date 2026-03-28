"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function EnterprisePage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", agents: "", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch("/api/enterprise-inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    setStatus(res?.ok ? "sent" : "error");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary"/>
              <path d="M16 5L5 14h3v13h8v-8h4v8h4V14h3L16 5z" fill="white"/>
            </svg>
            <span className="font-bold text-lg">CounterPro</span>
          </Link>
          <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Individual plans
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 w-full">
        {/* Hero */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4">Enterprise</Badge>
          <h1 className="text-4xl font-bold mb-4">CounterPro for Brokerages & Teams</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Give every agent on your team professional-grade negotiation packages. Seat-based pricing, centralized billing, admin dashboard.
          </p>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto mb-20 pt-4">

          {/* Seat-Based */}
          <Card className="border-2 border-primary relative overflow-visible shadow-md">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
              <Badge className="px-3 shadow-sm">Available now</Badge>
            </div>
            <CardHeader className="pt-7">
              <Badge variant="outline" className="w-fit mb-2">Team plan</Badge>
              <CardTitle className="text-4xl font-bold">
                $1,000<span className="text-lg font-normal text-muted-foreground">/mo</span>
              </CardTitle>
              <p className="text-muted-foreground text-sm">12 agent seats included — $85/seat additional</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>✓ Unlimited deals per seat</li>
                <li>✓ Centralized admin dashboard</li>
                <li>✓ Add / remove agents anytime</li>
                <li>✓ Shared deal history across team</li>
                <li>✓ Brokerage branding on packages</li>
                <li>✓ Priority support</li>
                <li>✓ Cancel anytime</li>
              </ul>
              <a href="#contact">
                <Button className="w-full" size="lg">Contact us to get started</Button>
              </a>
            </CardContent>
          </Card>

          {/* AI Enterprise */}
          <Card className="border-2 border-dashed border-muted-foreground/30">
            <CardHeader className="pt-6">
              <Badge variant="outline" className="w-fit mb-2">Coming soon</Badge>
              <CardTitle className="text-4xl font-bold">
                $5,000<span className="text-lg font-normal text-muted-foreground">/mo+</span>
              </CardTitle>
              <p className="text-muted-foreground text-sm">Custom pricing based on volume</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>✓ Everything in Team plan</li>
                <li>✓ Full AI negotiation suite per agent</li>
                <li>✓ AI drafts responses, agent approves</li>
                <li>✓ Thread tracking & deadline alerts</li>
                <li>✓ Contingency management</li>
                <li>✓ CRM integrations</li>
                <li>✓ Dedicated account manager</li>
              </ul>
              <a href="#contact">
                <Button className="w-full" size="lg" variant="outline">Join the waitlist</Button>
              </a>
            </CardContent>
          </Card>
        </div>

        {/* Why enterprise */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold text-center mb-10">Why brokerages choose CounterPro</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: "Level up every agent", desc: "Junior agents negotiate with the same data and scripts as your top producers. Consistency across your whole team." },
              { title: "Win more deals", desc: "Agents who know their walk-away point and have scripts ready close faster and with less back-and-forth." },
              { title: "NAR ruling ready", desc: "As buyer representation shifts, your agents need tools to help unrepresented buyers and sellers negotiate confidently." },
            ].map(f => (
              <Card key={f.title}>
                <CardContent className="pt-6">
                  <p className="font-semibold mb-2">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Contact form */}
        <div id="contact" className="max-w-xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-2">Get in touch</h2>
          <p className="text-muted-foreground text-center text-sm mb-8">
            Tell us about your team and we&apos;ll get back to you within one business day.
          </p>

          {status === "sent" ? (
            <div className="p-6 bg-green-50 border border-green-200 rounded-xl text-center">
              <p className="text-green-800 font-semibold text-lg mb-1">✓ Message received!</p>
              <p className="text-green-700 text-sm">We&apos;ll be in touch within one business day at {form.email}.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Your name</Label>
                      <Input id="name" placeholder="Jane Smith" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Work email</Label>
                      <Input id="email" type="email" placeholder="jane@brokerage.com" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company">Brokerage / company</Label>
                      <Input id="company" placeholder="Acme Realty" required value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agents">Number of agents</Label>
                      <Input id="agents" placeholder="12" value={form.agents} onChange={e => setForm({ ...form, agents: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Anything else? <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Textarea id="message" rows={3} placeholder="Tell us about your team, use case, or questions..." value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
                  </div>
                  {status === "error" && (
                    <p className="text-destructive text-sm">Something went wrong. Email us directly at <a href="mailto:support@counterproai.com" className="underline">support@counterproai.com</a></p>
                  )}
                  <Button type="submit" className="w-full" size="lg" disabled={status === "loading"}>
                    {status === "loading" ? "Sending..." : "Send inquiry →"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <footer className="border-t py-6 px-6 text-center text-xs text-muted-foreground mt-16">
        <div className="flex justify-center gap-6">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <a href="mailto:support@counterproai.com" className="hover:text-foreground">support@counterproai.com</a>
        </div>
      </footer>
    </div>
  );
}
