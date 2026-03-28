import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary"/>
              <path d="M16 5L5 14h3v13h8v-8h4v8h4V14h3L16 5z" fill="white"/>
            </svg>
            <span className="font-bold text-lg">CounterPro</span>
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Home</Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mb-10">Last updated: March 28, 2026</p>

        <div className="prose prose-base max-w-none text-foreground leading-7
          prose-headings:text-foreground prose-headings:font-bold
          prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3
          prose-p:text-muted-foreground prose-li:text-muted-foreground">

          <p>
            CounterPro (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) operates counterproai.com. This Privacy Policy explains what information we collect, how we use it, and your rights regarding that information.
          </p>

          <h2>Information We Collect</h2>
          <p>We collect the following categories of information:</p>
          <ul>
            <li><strong>Account information</strong> — name and email address when you sign up, managed by Clerk (clerk.com).</li>
            <li><strong>Deal information</strong> — property addresses, asking prices, offer amounts, market conditions, priorities, and concerns you enter when generating a negotiation package.</li>
            <li><strong>Payment information</strong> — billing details are handled entirely by Stripe (stripe.com). We do not store your credit card number or payment credentials.</li>
            <li><strong>Usage data</strong> — pages visited, features used, and general interaction data collected automatically.</li>
            <li><strong>Waitlist email</strong> — if you submit your email to be notified about upcoming features, we store that address.</li>
          </ul>

          <h2>How We Use Your Information</h2>
          <ul>
            <li>To generate your negotiation package using AI (powered by Anthropic&rsquo;s Claude).</li>
            <li>To pull property and market data relevant to your deal (via Rentcast).</li>
            <li>To process payments and manage your subscription (via Stripe).</li>
            <li>To save your deal history so you can view past packages.</li>
            <li>To send transactional emails related to your account or subscription.</li>
            <li>To notify you about new features if you joined our waitlist.</li>
          </ul>

          <h2>Third-Party Services</h2>
          <p>CounterPro uses the following third-party services that may process your data:</p>
          <ul>
            <li><strong>Clerk</strong> — authentication and user account management. <Link href="https://clerk.com/privacy" className="underline" target="_blank">clerk.com/privacy</Link></li>
            <li><strong>Stripe</strong> — payment processing. <Link href="https://stripe.com/privacy" className="underline" target="_blank">stripe.com/privacy</Link></li>
            <li><strong>Anthropic</strong> — AI generation of negotiation packages. Your deal details are sent to Anthropic&rsquo;s API. <Link href="https://www.anthropic.com/privacy" className="underline" target="_blank">anthropic.com/privacy</Link></li>
            <li><strong>Rentcast</strong> — property and market data lookup.</li>
            <li><strong>Google Maps</strong> — address autocomplete on the deal form.</li>
            <li><strong>Neon</strong> — database hosting for deal history and account data.</li>
            <li><strong>Vercel</strong> — application hosting.</li>
          </ul>

          <h2>Data Retention</h2>
          <p>
            We retain your deal history and account information for as long as your account is active. If you delete your account, your personal data and deal history will be removed within 30 days. Waitlist emails are retained until you request removal.
          </p>

          <h2>Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal information we hold about you.</li>
            <li>Request correction or deletion of your data.</li>
            <li>Opt out of marketing communications at any time.</li>
            <li>Request removal from the waitlist at any time.</li>
          </ul>
          <p>To exercise any of these rights, email us at <a href="mailto:support@counterproai.com" className="underline">support@counterproai.com</a>.</p>

          <h2>Cookies</h2>
          <p>
            We use cookies necessary for authentication (managed by Clerk) and basic site functionality. We do not use third-party advertising cookies.
          </p>

          <h2>Children&rsquo;s Privacy</h2>
          <p>
            CounterPro is not directed at children under 13. We do not knowingly collect personal information from children under 13.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be communicated via email or a notice on the site. Continued use of CounterPro after changes constitutes your acceptance of the updated policy.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy? Email us at <a href="mailto:support@counterproai.com" className="underline">support@counterproai.com</a>.
          </p>
        </div>
      </main>

      <footer className="border-t py-6 px-6 text-center text-xs text-muted-foreground">
        <div className="flex justify-center gap-6">
          <Link href="/privacy" className="hover:text-foreground underline underline-offset-2">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground underline underline-offset-2">Terms</Link>
          <a href="mailto:support@counterproai.com" className="hover:text-foreground underline underline-offset-2">Support</a>
        </div>
      </footer>
    </div>
  );
}
