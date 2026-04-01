"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const remarkGfm = require("remark-gfm").default ?? require("remark-gfm");

const SAMPLE_ADDRESS = "742 Evergreen Terrace, Springfield, IL 62704";

const SAMPLE_PACKAGE = `# CounterPro Negotiation Package
### 742 Evergreen Terrace, Springfield, IL 62704

---

## 1. DEAL ASSESSMENT

**Bottom Line: You have strong leverage. Do not pay asking price.**

The sellers listed at $385,000 on a home that has sat 47 days — nearly 4× the local median days on market of 12. The $360,000 offer on the table is reasonable but you can do better.

| Data Point | Value | What It Means For You |
|---|---|---|
| Asking price | $385,000 | Listed above area median |
| Your offer | $360,000 | 6.5% below asking |
| Avg sale price (62704) | $341,200 | Seller is priced above market |
| Median $/sqft (area) | $148/sqft | At 1,950 sqft = $288,600 implied value |
| Days on market | 47 days | 4× local median — seller is motivated |
| Price reductions | 1 reduction ($10K) | They already blinked once |
| Assessed value (2024) | $318,500 | County puts value well below ask |

**Your leverage points:**
- 🏆 **47 days on market** is the strongest signal you have. Motivated sellers don't hold firm.
- 🏆 **One price cut already.** They moved $10,000 without an offer. They'll move again with one.
- 🏆 **Area comps support $340–$355K**, not $385K. You have the data on your side.
- 🏆 **Assessed value is $318,500.** Even the county disagrees with the listing price.

---

## 2. RECOMMENDED COUNTER-OFFER

### Counter at **$347,000**

**The reasoning:**

- Splits the difference between your offer ($360K) and comp-supported value ($341K) — feels fair to both sides
- $38,000 below asking gives you room for the seller to counter back and still land under $360K
- At $347,000 you're paying $178/sqft — above the area median, which is defensible if the home is in good condition
- If they counter at $370K, come back at $354K. Your ceiling should be **$362,000** — beyond that you're overpaying relative to comps.

---

## 3. CONTINGENCY STRATEGY

| Contingency | Recommendation | Why |
|---|---|---|
| Inspection | **Keep it — non-negotiable** | 47 DOM suggests deferred maintenance possible |
| Financing | Keep standard | Protects you if appraisal comes in low (it likely will) |
| Appraisal | **Flag this one** | At $347K+ you may face a gap if bank appraises at comp value |
| Sale of your home | Waive if possible | Weakens your offer significantly |
| Closing date | Offer 30–45 days | Shows seriousness without rushing |

**Red flags to watch:**
- ⚠️ **Appraisal risk is real.** If you offer $360K+ and the bank appraises at $340K, you'll need to cover the gap in cash or renegotiate.
- ⚠️ **Ask why it sat 47 days.** Prior deal fell through? Inspection issues? Get the disclosure docs before going under contract.
- ⚠️ **One price cut already happened.** Ask your agent if there were any prior offers that fell through.

---

## 4. EMAIL SCRIPT

**Subject:** Counter-Offer — 742 Evergreen Terrace, Springfield, IL 62704

Dear [Listing Agent's Name],

Thank you for the opportunity to present an offer on 742 Evergreen Terrace. We remain very interested in the property and have done our homework on the local market.

After reviewing recent comparable sales in the 62704 zip code — where the average sale price is $341,200 and the median price per square foot supports a value in the low-to-mid $340s — we are submitting a counter-offer of **$347,000**.

We believe this is a strong, well-supported offer that reflects current market conditions. We are pre-approved, motivated buyers with flexibility on the closing date. We'd love to make this work and are happy to discuss terms that work for both parties.

We look forward to your response.

Sincerely,
[Your Name]
[Your Phone Number]

---

## 5. VERBAL SCRIPTS

**When the agent says "The sellers won't go below $375,000":**

> "I understand, and I respect their position. But the comps simply don't support that number — the average sale price in this zip is $341,200, and the home has been on market 47 days. We're at $347,000, which we think is fair and well above what the data supports. Is there any flexibility at all?"

**When the agent says "We have another offer coming in":**

> "That's great to hear — it means they have a desirable property. Our offer is $347,000, we're pre-approved, and we can close in 30 days. If the other offer is higher, we wish them well. But if it falls through, we're here."

**When the agent says "They already dropped $10,000, they're done moving":**

> "I understand they've already made a concession, and I appreciate that. But the market data puts value 10–15% below their current ask. We're not trying to steal the home — $347,000 is a fair offer that any appraiser would support. We'd love to close this deal."

**Walk-away script:**

> "We've enjoyed the process and we genuinely like the home. But at [X price] we'd be paying above what the market supports, and we're not comfortable with that risk. We're going to keep looking. If circumstances change on your end, please reach out."

---

## 6. WALK-AWAY POINT

**Do not pay more than $362,000.**

Beyond that price point:
- You're above every comparable sale in the zip code
- Appraisal gap risk increases significantly
- You lose all negotiating leverage on repairs after inspection

If they won't come below $362,000, thank them and walk. Homes in this zip are moving — you will find another one within 30–60 days.
`;

export default function SamplePage() {
  const printAsPDF = () => window.print();

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background print:hidden">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo size={44} href="/" />
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">Sample deal</Badge>
          </div>
        </div>
      </header>

      {/* Sample banner */}
      <div className="bg-primary text-primary-foreground text-center py-3 px-6 text-sm font-medium print:hidden">
        This is a sample negotiation package. Your real package is generated live with actual market data for your address.{" "}
        <Link href="/sign-up?redirect_url=%2Fdeal" className="underline underline-offset-2 font-semibold ml-1">
          Get yours →
        </Link>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Deal summary bar */}
        <div className="mb-6 p-4 bg-background border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Sample deal · Buyer</p>
            <p className="font-semibold">{SAMPLE_ADDRESS}</p>
            <p className="text-sm text-muted-foreground">Asking $385,000 · Offer $360,000 · Balanced market</p>
          </div>
          <Link href="/sign-up?redirect_url=%2Fdeal">
            <Button size="sm">Analyze my deal →</Button>
          </Link>
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Sample Negotiation Package</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="prose prose-base max-w-none text-foreground leading-7
              prose-headings:text-foreground prose-headings:font-bold
              prose-h1:text-2xl prose-h2:text-xl prose-h2:border-b prose-h2:pb-2 prose-h2:mb-4
              prose-strong:text-foreground
              prose-table:text-sm prose-table:w-full
              prose-th:bg-primary prose-th:text-primary-foreground prose-th:px-3 prose-th:py-2 prose-th:text-left
              prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-border
              prose-tr:even:bg-muted/40
              prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:py-1
              prose-code:bg-muted prose-code:px-1 prose-code:rounded
              prose-li:my-0.5"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{SAMPLE_PACKAGE}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="mt-8 p-6 bg-primary text-primary-foreground rounded-xl text-center print:hidden">
          <h2 className="text-xl font-bold mb-2">Ready to negotiate your deal?</h2>
          <p className="text-primary-foreground/80 text-sm mb-4">
            Get a package like this generated live with real market data for your property — in under 2 minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sign-up?redirect_url=%2Fdeal">
              <Button size="lg" variant="secondary" className="px-8">Get started — $50</Button>
            </Link>
            <Link href="/sign-up?redirect_url=%2Fdeal">
              <Button size="lg" variant="outline" className="px-8 bg-transparent border-primary-foreground/60 text-primary-foreground hover:bg-primary-foreground/15">
                Unlimited — $100/mo
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-4 print:hidden">
          <Button variant="outline" className="w-full" onClick={printAsPDF}>Save sample as PDF</Button>
        </div>
      </main>
    </div>
  );
}
