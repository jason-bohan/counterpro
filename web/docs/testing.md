# Testing Guide

## Test Account (No Payment Required)

Add your email to the `TEST_EMAILS` environment variable to bypass all payment checks:

```
TEST_EMAILS=you@example.com
```

Test accounts get unlimited deal runs with no Stripe interaction.

---

## Testing Clerk Phone OTP

Clerk provides built-in test phone numbers for development mode only.

| Field | Value |
|---|---|
| Test phone number | `+1 (000) 000-0000` (any number in the `+1 000 000 XXXX` range) |
| OTP code | `424242` |

> Only works against the Clerk **development** instance (`*.clerk.accounts.dev`). Production sends real SMS.

To enable phone OTP:
1. clerk.com → your app → **Configure** → **User & Authentication** → **Email, Phone, Username**
2. Enable **Phone number** as an identifier
3. Enable **SMS verification code** as a sign-in method

---

## Testing Stripe Payments

All Stripe keys in `.env.local` and Vercel are **test/sandbox keys** — no real money moves.

### Test Card Numbers

| Card Number | Result |
|---|---|
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0000 0000 0002` | Card declined |
| `4000 0025 0000 3155` | Requires 3D Secure authentication |

Use any future expiry date (e.g. `12/29`) and any 3-digit CVC.

### Testing a One-Time Deal ($50)

1. Sign in with a non-test email account
2. Go to `/deal` — you should be redirected to `/pricing`
3. Click **Get started — $50**
4. Use card `4242 4242 4242 4242`
5. After payment, you land on `/dashboard?payment=success`
6. Go to `/deal` — you should now be able to submit
7. After submitting, your `deals_remaining` drops from 1 to 0
8. Try `/deal` again — you should be redirected to `/pricing`

### Testing a Subscription ($100/mo)

1. Sign in with a non-test email account
2. Go to `/pricing` → click **Subscribe**
3. Use card `4242 4242 4242 4242`
4. After payment, go to `/deal` — unlimited access
5. Check Neon database: `user_plans` row should show `plan = 'subscription'`

### Verifying the Webhook Fired

1. Go to Stripe Dashboard → **Developers → Webhooks**
2. Click on your CounterPro endpoint
3. Under **Recent deliveries**, you should see `checkout.session.completed` with status `200`

If the webhook shows a failure (non-200), the user's plan won't be updated. Check Vercel function logs.

---

## Testing the Deal Form

### Address Autocomplete
- Type a partial US address in the address field
- Google Places suggestions should appear as a dropdown
- Selecting one auto-fills the full formatted address

### Rentcast Data
- Use a real US residential address (e.g. a house in your area)
- After submitting, the AI package should reference local market data (median price, days on market, etc.)
- If Rentcast can't find the address, the package still generates without market data

### Rentcast Coverage
Rentcast covers most US residential addresses. Rural or very new properties may return 404. The API call fails silently and the deal still processes.

---

## Testing the Result Page

| Feature | How to test |
|---|---|
| Markdown rendering | Submit a deal — output should show formatted headers, bold text, and tables |
| Tables | Look for the "Negotiating Range" and market data tables — they should have a navy header row and striped rows |
| Save as PDF | Click "Save as PDF" — browser print dialog opens, choose "Save as PDF" |
| Copy email script | Click "Copy email script" — button should flash "✓ Email script copied!" and clipboard should have the email section |

---

## Testing with Stripe CLI (Advanced)

To test webhooks locally without deploying:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Trigger a test event
stripe trigger checkout.session.completed
```

---

## External APIs Used

| API | Free Tier | What we use |
|---|---|---|
| **Anthropic Claude** | Pay per token | `claude-sonnet-4-6` — generates negotiation package |
| **Rentcast** | 50 requests/month | `/v1/properties` (property details), `/v1/markets` (zip stats) |
| **Google Maps Places** | 28,500 req/month | Places Autocomplete on address field |
| **Stripe** | Free (% per transaction) | Checkout Sessions, webhooks |
| **Clerk** | 10,000 MAU free | Auth, user sessions |
| **Neon** | 0.5GB free | Postgres — deals + user_plans tables |

---

## Database Queries (Useful for Debugging)

Connect to Neon and run these to inspect state:

```sql
-- See all users and their plans
SELECT * FROM user_plans ORDER BY updated_at DESC;

-- See all deals
SELECT clerk_user_id, address, role, asking_price, offer_amount, created_at
FROM deals ORDER BY created_at DESC;

-- Manually grant a subscription (for testing)
INSERT INTO user_plans (clerk_user_id, plan, deals_remaining, subscription_end)
VALUES ('user_abc123', 'subscription', 0, NOW() + INTERVAL '1 month')
ON CONFLICT (clerk_user_id) DO UPDATE
SET plan = 'subscription', subscription_end = NOW() + INTERVAL '1 month';

-- Manually grant a single deal credit
INSERT INTO user_plans (clerk_user_id, plan, deals_remaining)
VALUES ('user_abc123', 'single', 1)
ON CONFLICT (clerk_user_id) DO UPDATE
SET plan = 'single', deals_remaining = user_plans.deals_remaining + 1;
```

To find a user's Clerk ID: go to **clerk.com → Users → click user → copy User ID**.
