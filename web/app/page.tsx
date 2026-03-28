import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NotifyButton } from "@/components/notify-button";
import { Logo } from "@/components/logo";
import { t, getMessages } from "@/lib/i18n";

const messages = getMessages();

export default function LandingPage() {
  const { landing } = messages;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-4">
            <Link href="/enterprise" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              {t("common.nav.enterprise")}
            </Link>
            <Show when="signed-out">
              <Link href="/sign-in">
                <Button variant="ghost" size="sm">{t("common.nav.sign_in")}</Button>
              </Link>
              <Link href="/sign-up?redirect_url=%2Fdeal">
                <Button size="sm">{t("common.nav.get_started")}</Button>
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard">
                <Button size="sm">{t("common.nav.dashboard")}</Button>
              </Link>
            </Show>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section data-section="hero" className="py-20 px-6 bg-gradient-to-b from-muted/50 to-background">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-6 text-sm px-4 py-1" variant="outline">{landing.hero.badge}</Badge>
              <h1 className="text-5xl font-bold tracking-tight mb-6 leading-tight">
                {landing.hero.headline}<br />
                <span className="text-primary">{landing.hero.headline_highlight}</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                {landing.hero.subheadline}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Link href="/sign-up?redirect_url=%2Fdeal">
                  <Button size="lg" className="px-8 text-base h-12">{landing.hero.cta_single}</Button>
                </Link>
                <Link href="/sign-up?redirect_url=%2Fdeal">
                  <Button size="lg" variant="outline" className="px-8 text-base h-12">{landing.hero.cta_subscription}</Button>
                </Link>
              </div>
              <Link href="/sample" className="text-sm text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
                {landing.hero.cta_sample}
              </Link>
              <p className="text-sm text-muted-foreground">{landing.hero.social_proof}</p>
            </div>
            <div className="relative hidden lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=700&q=80&auto=format&fit=crop"
                alt={landing.hero.hero_image_alt}
                className="rounded-2xl shadow-2xl w-full object-cover"
                style={{ aspectRatio: "4/3" }}
              />
              <div className="absolute -bottom-4 -left-4 bg-white rounded-xl shadow-lg px-5 py-4 border">
                <p className="text-sm font-semibold text-primary">{landing.hero.average_savings_label}</p>
                <p className="text-3xl font-bold">{landing.hero.average_savings_value}</p>
                <p className="text-xs text-muted-foreground">{landing.hero.average_savings_unit}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <section data-section="stats-strip" className="border-y bg-muted/30 py-8 px-6">
          <div className="max-w-5xl mx-auto grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-primary">{landing.stats.single_price}</p>
              <p className="text-sm text-muted-foreground mt-1">{landing.stats.single_label}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary">{landing.stats.time_value}</p>
              <p className="text-sm text-muted-foreground mt-1">{landing.stats.time_label}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary">{landing.stats.commission_value}</p>
              <p className="text-sm text-muted-foreground mt-1">{landing.stats.commission_label}</p>
            </div>
          </div>
        </section>

        <Separator />

        {/* How it works */}
        <section data-section="how-it-works" className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">{landing.how_it_works.heading}</h2>
            <p className="text-muted-foreground text-center mb-12">{landing.how_it_works.subheading}</p>
            <div className="grid md:grid-cols-3 gap-8">
              {landing.how_it_works.steps.map((step) => (
                <div key={step.step} className="flex flex-col items-center text-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                    {step.step}
                  </div>
                  <h3 className="font-semibold text-lg">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Separator />

        {/* Features */}
        <section data-section="features" className="py-20 px-6 bg-muted/30">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">{landing.features.heading}</h2>
            <p className="text-muted-foreground text-center mb-12">{landing.features.subheading}</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {landing.features.items.map((feature) => (
                <Card key={feature.title}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <Separator />

        {/* Pricing */}
        <section data-section="pricing" className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">{landing.pricing.heading}</h2>
            <p className="text-muted-foreground text-center mb-12">{landing.pricing.subheading}</p>
            <div className="grid md:grid-cols-3 gap-6 pt-4">
              <Card className="border-2 hover:border-primary/40 transition-colors">
                <CardHeader>
                  <Badge variant="outline" className="w-fit mb-2">{landing.pricing.single.badge}</Badge>
                  <CardTitle className="text-4xl font-bold">{landing.pricing.single.price}</CardTitle>
                  <p className="text-muted-foreground text-sm">{landing.pricing.single.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    {landing.pricing.single.features.map((feature) => (
                      <li key={feature}>✓ {feature}</li>
                    ))}
                  </ul>
                  <Link href="/sign-up?redirect_url=%2Fdeal" className="block pt-2">
                    <Button className="w-full">{landing.pricing.single.cta}</Button>
                  </Link>
                  <Link href="/sign-up?redirect_url=%2Fdashboard" className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors pt-1">
                    Have a promo code? Sign up to redeem →
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary relative overflow-visible shadow-md">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="px-3 shadow-sm">{landing.pricing.best_value_badge}</Badge>
                </div>
                <CardHeader className="pt-7">
                  <CardTitle className="text-4xl font-bold">
                    {landing.pricing.subscription.price}
                    <span className="text-lg font-normal text-muted-foreground">{landing.pricing.subscription.period}</span>
                  </CardTitle>
                  <p className="text-muted-foreground text-sm">{landing.pricing.subscription.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    {landing.pricing.subscription.features.map((feature) => (
                      <li key={feature}>✓ {feature}</li>
                    ))}
                  </ul>
                  <Link href="/sign-up?redirect_url=%2Fdeal" className="block pt-2">
                    <Button className="w-full">{landing.pricing.subscription.cta}</Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-2 hover:border-primary/40 transition-colors">
                <CardHeader>
                  <Badge variant="outline" className="w-fit mb-2">{landing.pricing.enterprise.badge}</Badge>
                  <CardTitle className="text-4xl font-bold">
                    {landing.pricing.enterprise.price}
                    <span className="text-lg font-normal text-muted-foreground">{landing.pricing.enterprise.period}</span>
                  </CardTitle>
                  <p className="text-muted-foreground text-sm">{landing.pricing.enterprise.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    {landing.pricing.enterprise.features.map((feature) => (
                      <li key={feature}>✓ {feature}</li>
                    ))}
                  </ul>
                  <Link href="/enterprise" className="block pt-2">
                    <Button className="w-full" variant="outline">{landing.pricing.enterprise.cta}</Button>
                  </Link>
                </CardContent>
              </Card>
            </div>

            {/* Full Suite — Coming Soon */}
            <div className="mt-4 max-w-2xl mx-auto">
              <Card className="border-2 border-dashed border-muted-foreground/30">
                <CardContent className="py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-xl">
                        {landing.pricing.full_suite.price}
                        <span className="text-sm font-normal text-muted-foreground">{landing.pricing.full_suite.period}</span>
                      </span>
                      <Badge variant="outline" className="text-xs">{landing.pricing.full_suite.badge}</Badge>
                    </div>
                    <p className="font-semibold">{landing.pricing.full_suite.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{landing.pricing.full_suite.desc}</p>
                  </div>
                  <NotifyButton />
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <Separator />

        {/* FAQ */}
        <section data-section="faq" className="py-20 px-6 bg-muted/30">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">{landing.faq.heading}</h2>
            <div className="space-y-6">
              {landing.faq.items.map((item) => (
                <div key={item.q}>
                  <h3 className="font-semibold mb-2">{item.q}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section data-section="final-cta" className="py-20 px-6 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">{landing.cta.heading}</h2>
            <p className="text-muted-foreground mb-8">{landing.cta.subheading}</p>
            <Link href="/sign-up?redirect_url=%2Fdeal">
              <Button size="lg" className="px-10">{landing.cta.button}</Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Logo size={22} showName={false} />
            <span>{t("common.copyright")}</span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">{t("common.footer.privacy")}</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">{t("common.footer.terms")}</Link>
            <a href={`mailto:${t("common.support_email")}`} className="hover:text-foreground transition-colors">{t("common.footer.support")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
