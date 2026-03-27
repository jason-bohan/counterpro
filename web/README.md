# CounterPro

AI-powered real estate negotiation coaching. Enter your deal details and get a complete counter-offer strategy, email scripts, verbal scripts, and real comparable sales data — in minutes.

Live at: **counterproai.com**

---

## Accounts & Services Required

| Service | Purpose | Link |
|---|---|---|
| **Anthropic** | Claude AI API — generates the negotiation package | console.anthropic.com |
| **Clerk** | User authentication (sign up, sign in, session management) | clerk.com |
| **Vercel** | Hosting and deployment | vercel.com |
| **Google Cloud Console** | Places API for address autocomplete on the deal form | console.cloud.google.com |
| **Rentcast** | Real estate data API — pulls live comparable sales and AVM for the address | rentcast.io |
| **Stripe** | Payments — $50 one-time deal, $100/month subscription | stripe.com |
| **Neon** | Postgres database — stores deals and user plan/entitlements | neon.tech |
| **GitHub** | Source code repository | github.com/jason-bohan/counterpro |
| **Cloudflare** | DNS for counterproai.com domain | cloudflare.com |

---

## Environment Variables

Create a `.env.local` file in the `web/` directory:

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_GOOGLE_MAPS_KEY=
RENTCAST_API_KEY=
DATABASE_URL=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SINGLE_PRICE_ID=
STRIPE_SUBSCRIPTION_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=https://counterproai.com
TEST_EMAILS=your@email.com
```

All variables must also be added in Vercel → Project Settings → Environment Variables.

---

## Stack

- **Next.js 16** (App Router)
- **Tailwind CSS v4** + **shadcn/ui** components
- **Clerk** for auth
- **Anthropic SDK** (claude-sonnet-4-6)
- **Rentcast API** for live property data and market stats
- **Google Maps Places API** for address autocomplete
- **Stripe** for payments (Checkout + webhooks)
- **Neon** serverless Postgres for deal history and user plans

---

## Local Development

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy

```bash
vercel --prod
```

---

## Database Schema

Two tables in Neon Postgres:

**`user_plans`** — tracks each user's payment status
- `clerk_user_id` — Clerk user ID (primary key)
- `plan` — `free`, `single`, or `subscription`
- `deals_remaining` — credits left for single-deal users
- `subscription_end` — expiry date for subscribers

**`deals`** — every deal ever submitted
- `id` — auto-increment
- `clerk_user_id` — which user ran it
- `address`, `role`, `asking_price`, `offer_amount`
- `result` — full AI-generated negotiation package text
- `created_at`

---

## Pricing

| Plan | Price | What it does |
|---|---|---|
| Single Deal | $50 one-time | Adds 1 deal credit to the user's account |
| Monthly Subscription | $100/month | Unlimited deals while subscription is active |

Payments go through Stripe Checkout. After a successful payment, the Stripe webhook fires `checkout.session.completed` which updates `user_plans` in Neon.

---

## Test Account

Add an email to the `TEST_EMAILS` env var (comma-separated) to bypass payment checks entirely:

```
TEST_EMAILS=you@example.com,colleague@example.com
```
