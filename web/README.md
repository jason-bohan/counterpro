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
| **GitHub** | Source code repository | github.com/jason-bohan/counterpro |
| **Cloudflare** | DNS for counterproai.com domain | cloudflare.com |

---

## Environment Variables

Create a `.env.local` file in the `web/` directory with:

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_GOOGLE_MAPS_KEY=
RENTCAST_API_KEY=
```

All of these also need to be added as environment variables in your Vercel project settings.

---

## Stack

- **Next.js 16** (App Router)
- **Tailwind CSS v4** + **shadcn/ui** components
- **Clerk** for auth
- **Anthropic SDK** (claude-sonnet-4-6)
- **Rentcast API** for live comps
- **Google Maps Places API** for address autocomplete

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
