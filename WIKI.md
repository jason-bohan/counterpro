# CounterPro — Project Wiki

> AI-powered real estate negotiation coaching platform.
> This document covers architecture, services, setup, and day-to-day operations.

---

## Table of Contents

1. [What CounterPro Does](#1-what-counterpro-does)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [External Services & APIs](#5-external-services--apis)
   - [Anthropic (Claude)](#anthropic-claude)
   - [Clerk (Auth)](#clerk-auth)
   - [Stripe (Payments)](#stripe-payments)
   - [Neon (Postgres)](#neon-postgres)
   - [Google Gmail & Pub/Sub](#google-gmail--pubsub)
   - [Google Maps](#google-maps)
   - [Rentcast (Property Data)](#rentcast-property-data)
   - [Vercel Blob (File Storage)](#vercel-blob-file-storage)
6. [Environment Variables](#6-environment-variables)
7. [Routes & Pages Reference](#7-routes--pages-reference)
8. [Pricing & Plans](#8-pricing--plans)
9. [Cron Jobs & Webhooks](#9-cron-jobs--webhooks)
10. [Local Development Setup](#10-local-development-setup)
11. [Deployment (Vercel)](#11-deployment-vercel)
12. [Database Migrations](#12-database-migrations)
13. [Gmail Integration Setup](#13-gmail-integration-setup)
14. [Testing](#14-testing)
15. [Admin Tools](#15-admin-tools)

---

## 1. What CounterPro Does

CounterPro lets real estate buyers and sellers negotiate their own deals without needing a broker. There are two main product tiers:

**Simple Negotiation Package ($50 one-time)**
User enters their deal details (address, role, asking price, offer amount). The app pulls live market data from Rentcast and uses Claude to generate:
- Counter-offer strategy
- Email scripts + verbal scripts
- Contingency recommendations
- Red flags and walk-away point

**Full Negotiation Suite ($300/month)**
An ongoing, multi-email AI negotiation manager:
- Creates a negotiation thread per deal
- Routes inbound counterparty emails to the right thread (via Gmail alias addresses)
- Claude drafts replies that the user reviews and approves before sending
- Autonomous mode: Claude replies automatically without user approval
- Deadline tracking, document management, first-contact email generation
- Market research per thread

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS v4, shadcn/ui, Radix UI |
| Icons | lucide-react |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Auth | Clerk |
| Payments | Stripe |
| Database | Neon (serverless Postgres) |
| File Storage | Vercel Blob |
| Email | Gmail API (Google Cloud) |
| Property Data | Rentcast API |
| Maps | Google Maps Places API |
| Testing | Vitest, jsdom |
| Deployment | Vercel |

---

## 3. Project Structure

```
counterpro/
├── web/                          # Next.js application
│   ├── app/
│   │   ├── (marketing)/          # Landing, pricing, enterprise, sample pages
│   │   ├── deal/                 # Simple deal entry form
│   │   ├── dashboard/            # User dashboard
│   │   ├── negotiate/            # Suite thread list
│   │   ├── negotiate/[id]/       # Suite thread detail
│   │   ├── archive/              # Archived deals & negotiations
│   │   ├── admin/                # Admin tools
│   │   └── api/                  # All API routes (see §7)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives
│   │   ├── app-header.tsx        # Shared nav header
│   │   ├── promo-code.tsx        # Promo code redemption
│   │   └── support-email.tsx     # Support email with mailto/Gmail fallback
│   └── lib/
│       ├── db.ts                 # Neon client + all SQL queries + setupDatabase()
│       ├── gmail.ts              # Gmail OAuth, send, watch helpers
│       ├── email-pipeline.ts     # AI prompt builders, text processing
│       └── constants.ts          # Claude model name, token limits, etc.
```

---

## 4. Database Schema

All tables are created automatically on first run by `setupDatabase()` in `lib/db.ts`. Each table is created with `CREATE TABLE IF NOT EXISTS`, so migrations are additive and safe to re-run.

### `user_plans`
Tracks each user's subscription status.

| Column | Type | Notes |
|--------|------|-------|
| `clerk_user_id` | TEXT (PK) | Clerk user ID |
| `plan` | TEXT | `free`, `single`, `subscription`, `suite` |
| `deals_remaining` | INTEGER | Credits left for single-deal users |
| `subscription_end` | TIMESTAMPTZ | Subscription expiry |
| `stripe_customer_id` | TEXT | For Stripe portal / webhook matching |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `deals`
One-time negotiation package results.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL (PK) | |
| `clerk_user_id` | TEXT | |
| `address` | TEXT | Property address |
| `role` | TEXT | `buyer` or `seller` |
| `asking_price` | INTEGER | |
| `offer_amount` | INTEGER | |
| `result` | TEXT | Full AI-generated negotiation package |
| `archived_at` | TIMESTAMPTZ | NULL = active |
| `created_at` | TIMESTAMPTZ | |

### `negotiations`
Suite negotiation threads. Each thread is one deal with one counterparty.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL (PK) | |
| `clerk_user_id` | TEXT | |
| `deal_id` | INTEGER | Optional link to a `deals` row |
| `address` | TEXT | Property address |
| `role` | TEXT | `buyer` or `seller` |
| `counterparty_email` | TEXT | Who emails are sent to/received from |
| `alias_email` | TEXT | `sales+neg{id}@counterproai.com` — inbound emails route here |
| `status` | TEXT | `active`, etc. |
| `deadline_date` | TIMESTAMPTZ | Key deal deadline |
| `contingencies` | JSONB | Array of contingency terms |
| `autonomous_mode` | BOOLEAN | If true, AI replies auto-send without approval |
| `archived_at` | TIMESTAMPTZ | NULL = active |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `negotiation_messages`
Every message in a thread — inbound emails, outbound replies, AI drafts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL (PK) | |
| `negotiation_id` | INTEGER (FK) | → negotiations.id |
| `direction` | TEXT | `inbound`, `outbound`, `proactive` |
| `content` | TEXT | Actual message text |
| `ai_draft` | TEXT | Claude's draft reply (awaiting approval) |
| `approved` | BOOLEAN | false = pending in user's queue |
| `gmail_thread_id` | TEXT | Gmail thread for reply threading |
| `gmail_message_id` | TEXT | Unique Gmail message ID (UNIQUE index) |
| `sent_at` | TIMESTAMPTZ | NULL = not yet sent |
| `created_at` | TIMESTAMPTZ | |

### `negotiation_documents`
Files attached to or received in negotiations (stored in Vercel Blob).

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL (PK) | |
| `negotiation_id` | INTEGER (FK) | |
| `message_id` | INTEGER (FK) | Optional — which message it was attached to |
| `clerk_user_id` | TEXT | |
| `filename` | TEXT | |
| `blob_url` | TEXT | Vercel Blob public URL |
| `mime_type` | TEXT | |
| `size_bytes` | INTEGER | |
| `direction` | TEXT | `sent` or `received` |
| `created_at` | TIMESTAMPTZ | |

### `negotiation_deadlines`
Milestones/deadlines tracked per thread.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL (PK) | |
| `negotiation_id` | INTEGER (FK) | |
| `label` | TEXT | e.g., "Inspection deadline" |
| `due_date` | TIMESTAMPTZ | |
| `completed` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

### `user_gmail_tokens`
Gmail OAuth tokens per user (for Suite users who connect their own Gmail).

| Column | Type | Notes |
|--------|------|-------|
| `clerk_user_id` | TEXT (PK) | |
| `access_token` | TEXT | |
| `refresh_token` | TEXT | Used to refresh expired tokens |
| `expires_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `gmail_state`
Single row tracking the system Gmail watch.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER (PK, default 1) | Always row 1 |
| `history_id` | TEXT | Latest Gmail history ID processed |
| `watch_expiration` | TIMESTAMPTZ | When the push subscription expires |
| `watch_email` | TEXT | Which Gmail account is being watched |
| `updated_at` | TIMESTAMPTZ | |

### `webhook_logs`
Debug log for incoming webhooks.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL (PK) | |
| `event_type` | TEXT | |
| `detail` | TEXT | |
| `status` | TEXT | `ok` or error |
| `error` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

---

## 5. External Services & APIs

### Anthropic (Claude)

**Purpose:** Generates negotiation strategies, counter-offer scripts, and AI email drafts.
**Model used:** `claude-sonnet-4-6` (configured in `lib/constants.ts`)
**Docs:** https://docs.anthropic.com

**How to get API key:**
1. Go to https://console.anthropic.com
2. Sign in or create an account
3. Navigate to **API Keys** → **Create Key**
4. Set `ANTHROPIC_API_KEY` in your environment

**Where it's used:**
- `POST /api/negotiate` — Generates the full simple-deal package
- `POST /api/negotiate-suite` — Generates AI reply drafts for inbound messages
- `POST /api/negotiate-suite/threads/[id]/first-contact` — Drafts opening email
- `POST /api/negotiate-suite/proactive` — Refines user-composed messages
- Gmail webhook handler — Auto-generates drafts on inbound emails

---

### Clerk (Auth)

**Purpose:** User authentication — sign-up, sign-in, sessions, user metadata.
**Docs:** https://clerk.com/docs

**How to get keys:**
1. Go to https://dashboard.clerk.com
2. Create a new application
3. Go to **API Keys** in the sidebar
4. Copy **Publishable Key** and **Secret Key**
5. Under **Redirects**, set the sign-in/sign-up redirect URLs

**Environment variables needed:**
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

**Auth is enforced** in `web/proxy.ts` using `clerkMiddleware()`. Public routes (cron, webhooks, Stripe webhook) are explicitly exempted.

---

### Stripe (Payments)

**Purpose:** One-time and recurring payments for all three paid plans.
**Docs:** https://stripe.com/docs

**How to get keys:**
1. Go to https://dashboard.stripe.com
2. **Developers → API Keys** — copy **Publishable key** and **Secret key**
3. Create three Products:
   - **Single Deal** — $50 one-time (get the Price ID)
   - **Monthly Subscription** — $100/month recurring (get the Price ID)
   - **Suite** — $300/month recurring (get the Price ID)
4. **Developers → Webhooks** → **Add endpoint**
   - URL: `https://yourapp.com/api/stripe/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `invoice.payment_succeeded`
     - `customer.subscription.deleted`
   - Copy the **Signing secret**

**Environment variables needed:**
```
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SINGLE_PRICE_ID=price_...
STRIPE_SUBSCRIPTION_PRICE_ID=price_...
STRIPE_SUITE_PRICE_ID=price_...
```

**Webhook handler:** `app/api/stripe/webhook/route.ts`
- `checkout.session.completed` → creates/updates `user_plans` row
- `invoice.payment_succeeded` → extends `subscription_end` date
- `customer.subscription.deleted` → downgrades user to `free`

---

### Neon (Postgres)

**Purpose:** All persistent data — users, deals, negotiations, messages, documents.
**Docs:** https://neon.tech/docs

**How to get connection string:**
1. Go to https://console.neon.tech
2. Create a new project
3. Copy the **Connection string** from the dashboard (looks like `postgresql://user:pass@host/db?sslmode=require`)
4. Set `DATABASE_URL` in your environment

**Optional (for admin tools):**
```
NEON_API_KEY=       # From https://console.neon.tech/app/settings/api-keys
NEON_PROJECT_ID=    # From project settings URL
NEON_DATABASE_NAME= # Usually "neondb"
```

**Schema is auto-created:** On every cold start, `setupDatabase()` runs and creates any missing tables/columns. It's safe to run repeatedly — all statements use `IF NOT EXISTS` or are wrapped in error-tolerant helpers.

---

### Google Gmail & Pub/Sub

**Purpose:**
- Send negotiation emails from alias addresses (`sales+neg123@counterproai.com`)
- Receive and route inbound counterparty emails to the right thread
- Gmail push notifications via Google Cloud Pub/Sub

**Docs:**
- Gmail API: https://developers.google.com/gmail/api
- Google Cloud Console: https://console.cloud.google.com
- Pub/Sub: https://cloud.google.com/pubsub/docs

**Setup steps:**

1. **Create a Google Cloud project**
   - Go to https://console.cloud.google.com
   - Create a new project, note the Project ID

2. **Enable APIs**
   - Enable **Gmail API**
   - Enable **Cloud Pub/Sub API**

3. **Create OAuth credentials**
   - Go to **APIs & Services → Credentials**
   - **Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Add authorized redirect URI: `https://yourapp.com/api/auth/gmail/callback`
   - Copy **Client ID** and **Client Secret**

4. **Create Pub/Sub topic**
   - Go to **Pub/Sub → Topics → Create Topic**
   - Name it (e.g., `gmail-push`)
   - Note the full topic name: `projects/{project-id}/topics/gmail-push`
   - Create a **subscription** on that topic (push type) pointed at `https://yourapp.com/api/webhooks/gmail`
   - Grant the Gmail service account publish rights:
     Add `gmail-api-push@system.gserviceaccount.com` as **Pub/Sub Publisher** on the topic

5. **Connect system Gmail account**
   - After deploying, visit `/api/auth/gmail` while signed in as the admin user
   - Complete Google OAuth flow
   - This stores tokens in `user_gmail_tokens` and sets `GMAIL_SYSTEM_USER_ID`

**Environment variables needed:**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://yourapp.com/api/auth/gmail/callback
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GMAIL_PUBSUB_TOPIC=projects/your-gcp-project-id/topics/gmail-push
GMAIL_USER=your-system-gmail@gmail.com
GMAIL_SYSTEM_USER_ID=clerk_user_id_of_admin
GMAIL_SALES_ADDRESS=sales@counterproai.com
GMAIL_WEBHOOK_SECRET=random-secret-string
```

**How inbound routing works:**
Each negotiation gets an alias like `sales+neg42@counterproai.com`. When the counterparty replies, Gmail receives it, Pub/Sub pushes the notification to `/api/webhooks/gmail`, which parses the `To:` header, extracts the negotiation ID from the alias, and saves the message to that thread.

**Gmail watch expiry:** Gmail push subscriptions expire after 7 days. A Vercel cron job at `/api/cron/gmail-watch` runs every 6 days to renew it.

---

### Google Maps

**Purpose:** Address autocomplete on the deal entry form.
**Docs:** https://developers.google.com/maps/documentation/javascript/places

**How to get API key:**
1. Go to https://console.cloud.google.com
2. Enable **Maps JavaScript API** and **Places API**
3. **APIs & Services → Credentials → Create API Key**
4. Restrict the key to your domain + those two APIs

```
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIza...
```

---

### Rentcast (Property Data)

**Purpose:** Live property data — comparable sales, AVM (automated valuation), market stats, price trends. Used in the simple deal flow to give Claude real market context.
**Docs:** https://app.rentcast.io/developers

**How to get API key:**
1. Sign up at https://app.rentcast.io
2. Go to **Account → API Access**
3. Copy your API key

```
RENTCAST_API_KEY=
```

**What's fetched per deal:**
- Property details for the address
- Comparable sales in the zip code
- Market statistics (median price, days on market)
- Price trend over time
- AVM (estimated value)

---

### Vercel Blob (File Storage)

**Purpose:** Stores documents uploaded or generated during negotiations (PDFs, email attachments).
**Docs:** https://vercel.com/docs/storage/vercel-blob

**How to get token:**
1. In your Vercel project, go to **Storage → Connect Store → Blob**
2. Or run `vercel blob` via CLI
3. Vercel auto-injects `BLOB_READ_WRITE_TOKEN` into your environment

```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

Files are stored at paths like `docs/{userId}/{negotiationId}/{filename}` and served via public URLs.

---

## 6. Environment Variables

Full list of all environment variables. Copy this as your `.env.local` template:

```bash
# ── Anthropic ──────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── Clerk ──────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# ── Stripe ─────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SINGLE_PRICE_ID=price_...
STRIPE_SUBSCRIPTION_PRICE_ID=price_...
STRIPE_SUITE_PRICE_ID=price_...

# ── Neon Postgres ───────────────────────────────────────
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
NEON_API_KEY=                     # optional, for admin tools
NEON_PROJECT_ID=                  # optional, for admin tools
NEON_DATABASE_NAME=neondb         # optional, for admin tools

# ── Google / Gmail ──────────────────────────────────────
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIza...
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://yourapp.com/api/auth/gmail/callback
GOOGLE_CLOUD_PROJECT=
GMAIL_PUBSUB_TOPIC=projects/{project-id}/topics/{topic-name}
GMAIL_USER=your-gmail@gmail.com
GMAIL_SYSTEM_USER_ID=             # Clerk user ID of the admin who authorized Gmail
GMAIL_SALES_ADDRESS=sales@counterproai.com
GMAIL_WEBHOOK_SECRET=             # Random secret for webhook validation

# ── Rentcast ───────────────────────────────────────────
RENTCAST_API_KEY=

# ── Vercel Blob ────────────────────────────────────────
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# ── App Config ─────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://www.counterproai.com
CRON_SECRET=                      # Random secret — sent in Authorization header by Vercel cron
SETUP_SECRET=                     # Random secret for /api/setup endpoint

# ── Dev / Testing ──────────────────────────────────────
TEST_EMAILS=you@example.com,partner@example.com   # Bypass payment checks
TEST_USER_IDS=user_abc123                          # Bypass suite plan check
ADMIN_EMAILS=admin@example.com
ADMIN_USER_IDS=user_abc123
```

---

## 7. Routes & Pages Reference

### Pages

| Route | Description |
|-------|-------------|
| `/` | Marketing landing page |
| `/pricing` | Pricing page (Single, Monthly, Suite) |
| `/enterprise` | Enterprise/Suite landing page |
| `/sample` | Demo output — shows what a negotiation package looks like |
| `/sign-in` | Clerk sign-in page |
| `/sign-up` | Clerk sign-up page |
| `/dashboard` | User home — past deals, plan badge, start new deal |
| `/deal` | Enter deal details to generate a negotiation package |
| `/deal/[id]` | View a completed negotiation package |
| `/negotiate` | Suite thread list |
| `/negotiate/[id]` | Suite thread detail — messages, AI draft, deadlines, docs |
| `/archive` | Archived deals and negotiations |
| `/archive/negotiations/[id]` | Archived negotiation detail |
| `/admin` | Admin dashboard |
| `/admin/neon` | Run raw Neon SQL queries |
| `/admin/api-status` | Check health of all external APIs |

### API Routes

**Payments**

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/stripe/checkout` | Create Stripe checkout session |
| POST | `/api/stripe/portal` | Open Stripe billing portal |
| POST | `/api/stripe/webhook` | Stripe event handler |

**Negotiation (Simple)**

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/negotiate` | Generate a negotiation package (uses Rentcast + Claude) |

**Negotiation Suite**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/negotiate-suite/threads` | List user's negotiations |
| POST | `/api/negotiate-suite/threads` | Create a new negotiation thread |
| GET | `/api/negotiate-suite/threads/[id]` | Get thread detail + messages |
| PATCH | `/api/negotiate-suite/threads/[id]` | Update negotiation settings |
| POST | `/api/negotiate-suite` | Generate AI draft for inbound/proactive message |
| PUT | `/api/negotiate-suite` | Approve/send or discard a pending draft |
| PATCH | `/api/negotiate-suite` | Retry failed outbound message |
| POST | `/api/negotiate-suite/threads/[id]/first-contact` | Draft + send opening email |
| GET | `/api/negotiate-suite/threads/[id]/research` | Pull market research for thread |
| POST/PUT/DELETE | `/api/negotiate-suite/threads/[id]/deadlines` | Manage deadlines |
| GET | `/api/negotiate-suite/documents/[docId]` | Download a document |
| POST | `/api/negotiate-suite/documents/[docId]` | Upload a document |
| POST | `/api/negotiate-suite/proactive` | Refine a user-composed proactive message |

**Gmail**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/auth/gmail` | Start Gmail OAuth flow |
| GET | `/api/auth/gmail/callback` | OAuth callback — stores tokens |
| POST | `/api/negotiate-suite/gmail-watch` | Set up Gmail push watch |
| POST | `/api/webhooks/gmail` | Receive Gmail Pub/Sub push notifications |
| GET | `/api/cron/gmail-watch` | Renew Gmail watch (called by Vercel cron) |

**Deals & Archive**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/deals` | List user's deals (and plan info) |
| GET | `/api/deals/[id]` | Single deal |
| PATCH | `/api/deals/[id]` | Archive a deal |
| GET | `/api/negotiations/[id]` | Single negotiation (for archive view) |
| PATCH | `/api/negotiations/[id]` | Archive a negotiation |

**Other**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/notifications/count` | Count of pending AI drafts awaiting review |
| POST | `/api/redeem` | Redeem a promo code |
| POST | `/api/notify` | Send notification email |
| POST | `/api/enterprise-inquiry` | Collect enterprise interest |
| POST | `/api/setup` | Run database migrations (requires `SETUP_SECRET`) |

---

## 8. Pricing & Plans

| Plan | Price | What you get |
|------|-------|-------------|
| Free | $0 | Browse, no deal generation |
| Single Deal | $50 one-time | 1 full negotiation package |
| Monthly Subscription | $100/month | Unlimited simple packages |
| Full Negotiation Suite | $300/month | Suite threading, AI email drafts, Gmail integration, autonomous mode |

**Plan stored in:** `user_plans.plan` — values: `free`, `single`, `subscription`, `suite`

**Test bypass:** Set `TEST_EMAILS` or `TEST_USER_IDS` env vars to skip plan checks in development.

---

## 9. Cron Jobs & Webhooks

### Cron: Gmail Watch Renewal

Gmail push notification subscriptions expire after **7 days**. The cron renews them every 6 days.

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/gmail-watch", "schedule": "0 0 */6 * *" }
  ]
}
```

- Vercel sends a `GET` request with `Authorization: Bearer {CRON_SECRET}` header
- Handler validates the secret, calls the Gmail watch API to renew, updates `gmail_state`

### Webhook: Stripe

`POST /api/stripe/webhook`
Verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`.

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Insert/update `user_plans` row with plan + expiry |
| `invoice.payment_succeeded` | Extend `subscription_end` by 1 month |
| `customer.subscription.deleted` | Set plan back to `free` |

### Webhook: Gmail (Pub/Sub)

`POST /api/webhooks/gmail`
Google Cloud Pub/Sub pushes to this endpoint when a new email arrives.

Flow:
1. Validate `GMAIL_WEBHOOK_SECRET` in the `token` query param
2. Decode the base64 Pub/Sub message — contains `historyId`
3. Compare to last processed `historyId` in `gmail_state` — skip if not newer
4. Fetch Gmail history to get new message IDs
5. For each message, fetch full email content
6. Parse the `To:` header for an alias like `sales+neg42@counterproai.com`
7. Look up negotiation #42
8. Save the email body as a new `inbound` message row
9. If `autonomous_mode = true`, generate and auto-send an AI reply
10. Otherwise, generate a draft and email the user a notification

---

## 10. Local Development Setup

### Prerequisites

- Node.js 20+
- A Neon account (or any Postgres instance with the connection string)
- Clerk account
- Stripe account (or use test mode)
- Anthropic API key

### Steps

```bash
# 1. Clone and install
git clone <repo>
cd counterpro/web
npm install

# 2. Create .env.local
cp .env.example .env.local   # or create from the template in §6
# Fill in at minimum: DATABASE_URL, ANTHROPIC_API_KEY, Clerk keys

# 3. Run dev server
npm run dev
# App runs at http://localhost:3000

# 4. Database is set up automatically on first API call
# Or trigger it manually:
curl -X POST http://localhost:3000/api/setup \
  -H "Authorization: Bearer $SETUP_SECRET"
```

### Minimum viable local setup

To get the basic app running without all services:
- **Required:** `DATABASE_URL`, `ANTHROPIC_API_KEY`, Clerk keys
- **Payments:** Use Stripe test mode keys; use `TEST_EMAILS` to skip payment for your dev account
- **Gmail:** Not needed for simple deal flow; only needed for Suite
- **Rentcast:** Without this, the deal form will still work but market data will be missing
- **Google Maps:** Without this, address autocomplete won't work but you can type manually

---

## 11. Deployment (Vercel)

### Initial deploy

```bash
npm i -g vercel
vercel login
vercel link          # Connect to your Vercel project
vercel env pull      # Pull env vars to .env.local (if already set in Vercel)
vercel --prod        # Deploy to production
```

### Setting environment variables in Vercel

```bash
vercel env add ANTHROPIC_API_KEY production
vercel env add DATABASE_URL production
# ... repeat for all vars in §6
```

Or set them in the Vercel Dashboard under **Project → Settings → Environment Variables**.

### After deploying

1. Update your Stripe webhook endpoint URL to the production domain
2. Update Google OAuth redirect URI to the production domain
3. Visit `/api/auth/gmail` as admin to connect the system Gmail account
4. The Gmail watch cron will run automatically via Vercel cron

---

## 12. Database Migrations

Migrations run automatically via `setupDatabase()` in `lib/db.ts`. Every table creation uses `CREATE TABLE IF NOT EXISTS` and every column addition uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

Individual steps that could fail (e.g., creating unique indexes) are wrapped in a resilient `m()` helper that logs and continues on error, so one bad migration never breaks all routes.

**To run manually:**
```bash
curl -X POST https://yourapp.com/api/setup \
  -H "Authorization: Bearer $SETUP_SECRET"
```

**To add a new migration:**
Add a new `m("label", sql`...`)` call at the bottom of `setupDatabase()` in `lib/db.ts`.

---

## 13. Gmail Integration Setup

This is the most complex part of the setup. Follow these steps carefully.

### 1. Google Cloud setup (one-time)

1. Create project at https://console.cloud.google.com
2. Enable **Gmail API** and **Cloud Pub/Sub API**
3. Create **OAuth 2.0 credentials** (Web application type)
4. Set redirect URI: `https://yourapp.com/api/auth/gmail/callback`
5. Create a Pub/Sub **topic** named `gmail-push`
6. Add `gmail-api-push@system.gserviceaccount.com` as **Pub/Sub Publisher** on the topic
7. Create a **push subscription** on the topic pointed at `https://yourapp.com/api/webhooks/gmail?token=YOUR_GMAIL_WEBHOOK_SECRET`

### 2. Authorize the system Gmail account

The system account is used to send emails from `sales+neg{id}@counterproai.com` aliases.

1. Set all Google env vars (see §6)
2. Deploy your app
3. Sign in to CounterPro as the admin user
4. Visit `https://yourapp.com/api/auth/gmail`
5. Complete the Google OAuth flow — allow Gmail access
6. Note the Clerk user ID of the admin — set it as `GMAIL_SYSTEM_USER_ID`

### 3. Activate Gmail watch

After authorizing:
```bash
curl -X POST https://yourapp.com/api/negotiate-suite/gmail-watch \
  -H "Authorization: Bearer <clerk-session-token>"
```

Or do this from the admin dashboard. The watch will auto-renew via cron.

### How alias routing works

- Each negotiation gets `alias_email = sales+neg{id}@counterproai.com`
- When the counterparty replies to that address, Gmail receives it
- Pub/Sub notifies `/api/webhooks/gmail`
- The handler parses the alias to extract the negotiation ID
- Routes the email to the correct thread

---

## 14. Testing

```bash
npm test              # Run all tests once
npm test -- --watch   # Watch mode
npm test -- --reporter=verbose  # Detailed output
```

Tests are in `lib/__tests__/` and `app/api/*/__tests__/`. Key test files:

| File | What it tests |
|------|--------------|
| `negotiate-suite-send.test.ts` | PUT handler — approve/send/discard, Gmail send, file attachments |
| `notifications-count.test.ts` | GET /api/notifications/count — pending draft counts |
| `gmail-webhook.test.ts` | Inbound email processing, idempotency, routing |
| `stripe/checkout/__tests__/simple.test.ts` | Basic checkout sanity checks |

**Test accounts:** Set `TEST_EMAILS` or `TEST_USER_IDS` to bypass plan checks in development.

---

## 15. Admin Tools

Accessible at `/admin` (requires admin email/user ID in env vars).

| Tool | URL | Description |
|------|-----|-------------|
| Admin Home | `/admin` | Login, user list |
| Neon Query | `/admin/neon` | Run raw SQL against the production database |
| API Status | `/admin/api-status` | Health checks for Anthropic, Stripe, Rentcast, Neon, Gmail |

**To add yourself as admin:**
```bash
ADMIN_EMAILS=your@email.com
ADMIN_USER_IDS=user_clerk_id_here
```

---

*Last updated: April 2026*
