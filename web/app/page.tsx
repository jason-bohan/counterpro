import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NotifyButton } from "@/components/notify-button";

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary"/>
        <path d="M16 5L5 14h3v13h8v-8h4v8h4V14h3L16 5z" fill="white"/>
        <path d="M19 20h3v3h-3v-3z" fill="white" opacity="0.6"/>
      </svg>
      <span className="font-bold text-xl tracking-tight">CounterPro</span>
    </div>
  );
}

const steps = [
  { step: "1", title: "Enter your deal", desc: "Tell us your role, the property, asking price, offer on the table, and your priorities." },
  { step: "2", title: "AI analyzes your leverage", desc: "CounterPro evaluates market conditions, the offer gap, contingencies, and your timeline." },
  { step: "3", title: "Get your package", desc: "Receive a counter-offer number, email script, verbal script, red flags, and your walk-away point." },
];

const features = [
  { title: "Specific counter-offer", desc: "Not a range. An exact number with the reasoning behind it." },
  { title: "Copy-paste email script", desc: "Ready to send. Professional, firm, and strategically worded." },
  { title: "Word-for-word verbal scripts", desc: "Know exactly what to say for every scenario — pushback, lowball, walk away." },
  { title: "Contingency strategy", desc: "Which terms to fight for, which to concede, and why." },
  { title: "Red flag detection", desc: "Financing risks, inspection leverage, market timing — flagged automatically." },
  { title: "Walk-away point", desc: "A clear number below which you should walk. No more second-guessing." },
];

const faqs = [
  { q: "Is this legal?", a: "Yes. Anyone can negotiate their own real estate deal — this is called FSBO (For Sale By Owner) on the seller side, or an unrepresented buyer on the buyer side. CounterPro is a coaching tool, not a broker." },
  { q: "Do I need a real estate agent?", a: "No. That's the point. CounterPro gives you the strategy and scripts to negotiate confidently on your own, potentially saving you the 2-3% agent commission." },
  { q: "How accurate is the advice?", a: "CounterPro is powered by Claude, Anthropic's AI. It provides strategy based on the details you enter. It's not a substitute for a licensed attorney on complex legal matters, but for negotiation strategy it's exceptionally thorough." },
  { q: "What if I need more than one deal?", a: "Subscribe for $100/month and run unlimited deals. If you're an investor or buying and selling frequently, the subscription pays for itself on the first deal." },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-4">
            <Link href="/enterprise" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              Enterprise
            </Link>
            <Show when="signed-out">
              <Link href="/sign-in">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/sign-up?redirect_url=%2Fdeal">
                <Button size="sm">Get started</Button>
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard">
                <Button size="sm">Dashboard</Button>
              </Link>
            </Show>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 px-6 bg-gradient-to-b from-muted/50 to-background">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-6 text-sm px-4 py-1" variant="outline">No real estate agent needed</Badge>
              <h1 className="text-5xl font-bold tracking-tight mb-6 leading-tight">
                Negotiate your real estate deal<br />
                <span className="text-primary">like a pro</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Get a tailored counter-offer strategy, ready-to-send email scripts, and word-for-word
                verbal scripts — powered by AI. One deal could save you $10,000–$30,000.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Link href="/sign-up?redirect_url=%2Fdeal">
                  <Button size="lg" className="px-8 text-base h-12">Negotiate my deal — $50</Button>
                </Link>
                <Link href="/sign-up?redirect_url=%2Fdeal">
                  <Button size="lg" variant="outline" className="px-8 text-base h-12">Unlimited — $100/mo</Button>
                </Link>
              </div>
              <Link href="/sample" className="text-sm text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
                See a sample package first →
              </Link>
              <p className="text-sm text-muted-foreground">
                Takes 2 minutes. No agent. No commission.
              </p>
            </div>
            <div className="relative hidden lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=700&q=80&auto=format&fit=crop"
                alt="Beautiful family home"
                className="rounded-2xl shadow-2xl w-full object-cover"
                style={{ aspectRatio: "4/3" }}
              />
              <div className="absolute -bottom-4 -left-4 bg-white rounded-xl shadow-lg px-5 py-4 border">
                <p className="text-sm font-semibold text-primary">Average savings</p>
                <p className="text-3xl font-bold">$18,500</p>
                <p className="text-xs text-muted-foreground">per negotiation</p>
              </div>
            </div>
          </div>
        </section>

        {/* Social proof strip */}
        <section className="border-y bg-muted/30 py-8 px-6">
          <div className="max-w-5xl mx-auto grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-primary">$50</p>
              <p className="text-sm text-muted-foreground mt-1">One-time, one deal</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary">2 min</p>
              <p className="text-sm text-muted-foreground mt-1">To get your package</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary">$0</p>
              <p className="text-sm text-muted-foreground mt-1">Agent commission</p>
            </div>
          </div>
        </section>

        <Separator />

        {/* How it works */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">How it works</h2>
            <p className="text-muted-foreground text-center mb-12">Three steps to your negotiation package</p>
            <div className="grid md:grid-cols-3 gap-8">
              {steps.map((s) => (
                <div key={s.step} className="flex flex-col items-center text-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                    {s.step}
                  </div>
                  <h3 className="font-semibold text-lg">{s.title}</h3>
                  <p className="text-muted-foreground text-sm">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Separator />

        {/* Features */}
        <section className="py-20 px-6 bg-muted/30">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">Everything in your package</h2>
            <p className="text-muted-foreground text-center mb-12">One submission. Complete negotiation strategy.</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f) => (
                <Card key={f.title}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <Separator />

        {/* Pricing */}
        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">Simple pricing</h2>
            <p className="text-muted-foreground text-center mb-12">Pay per deal or subscribe for unlimited access</p>
            <div className="grid md:grid-cols-3 gap-6 pt-4">
              <Card className="border-2 hover:border-primary/40 transition-colors">
                <CardHeader>
                  <Badge variant="outline" className="w-fit mb-2">Single deal</Badge>
                  <CardTitle className="text-4xl font-bold">$50</CardTitle>
                  <p className="text-muted-foreground text-sm">One-time payment</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li>✓ Full negotiation package</li>
                    <li>✓ Counter-offer with reasoning</li>
                    <li>✓ Email + verbal scripts</li>
                    <li>✓ Red flags & walk-away point</li>
                    <li>✓ Download as PDF</li>
                  </ul>
                  <Link href="/sign-up?redirect_url=%2Fdeal" className="block pt-2">
                    <Button className="w-full">Get started</Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary relative overflow-visible shadow-md">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="px-3 shadow-sm">Best value</Badge>
                </div>
                <CardHeader className="pt-7">
                  <CardTitle className="text-4xl font-bold">$100<span className="text-lg font-normal text-muted-foreground">/mo</span></CardTitle>
                  <p className="text-muted-foreground text-sm">Unlimited deals</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li>✓ Everything in Single deal</li>
                    <li>✓ Unlimited negotiations</li>
                    <li>✓ Deal history dashboard</li>
                    <li>✓ Cancel anytime</li>
                    <li>✓ Best for investors & agents</li>
                  </ul>
                  <Link href="/sign-up?redirect_url=%2Fdeal" className="block pt-2">
                    <Button className="w-full">Subscribe</Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-2 hover:border-primary/40 transition-colors">
                <CardHeader>
                  <Badge variant="outline" className="w-fit mb-2">Enterprise</Badge>
                  <CardTitle className="text-4xl font-bold">$1,000<span className="text-lg font-normal text-muted-foreground">/mo</span></CardTitle>
                  <p className="text-muted-foreground text-sm">Seat-based for teams</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li>✓ Up to 10 agent seats</li>
                    <li>✓ Unlimited deals per agent</li>
                    <li>✓ Admin dashboard</li>
                    <li>✓ Brokerage branding</li>
                    <li>✓ Priority support</li>
                  </ul>
                  <Link href="/enterprise" className="block pt-2">
                    <Button className="w-full" variant="outline">Contact us</Button>
                  </Link>
                </CardContent>
              </Card>
            </div>

            {/* Coming Soon — Full Suite */}
            <div className="mt-4 max-w-2xl mx-auto">
              <Card className="border-2 border-dashed border-muted-foreground/30">
                <CardContent className="py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-xl">$300<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
                      <Badge variant="outline" className="text-xs">Coming soon</Badge>
                    </div>
                    <p className="font-semibold">Full Negotiation Suite</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      AI manages the full back-and-forth. You approve each response before it sends from your own email. Includes thread tracking, deadline alerts, and contingency management.
                    </p>
                  </div>
                  <NotifyButton />
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <Separator />

        {/* FAQ */}
        <section className="py-20 px-6 bg-muted/30">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Frequently asked questions</h2>
            <div className="space-y-6">
              {faqs.map((f) => (
                <div key={f.q}>
                  <h3 className="font-semibold mb-2">{f.q}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">Ready to negotiate?</h2>
            <p className="text-muted-foreground mb-8">Stop leaving money on the table. Get your negotiation package in minutes.</p>
            <Link href="/sign-up?redirect_url=%2Fdeal">
              <Button size="lg" className="px-10">Get started — $50</Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary"/>
              <path d="M16 5L5 14h3v13h8v-8h4v8h4V14h3L16 5z" fill="white"/>
            </svg>
            <span>© 2026 CounterPro. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <a href="mailto:support@counterproai.com" className="hover:text-foreground transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
