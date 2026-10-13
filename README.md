# InvoiceFlow SaaS

Multi-tenant invoice generator with **Supabase** (auth + DB + RLS) and **Paddle** billing.

## Plans

| Plan | Price | Limits |
|------|-------|--------|
| Free | $0 | 10 invoices/mo · 20 customers · 20 products · 1 template |
| Starter | $5/mo | 100 invoices/mo · 500 customers · 3 templates · 2 users |
| Pro | $15/mo | Unlimited invoices · 5k customers · 10 users · Reports · WhatsApp |
| Business | $29/mo | Unlimited · 50k customers · 25 users · API · Multi-business · 100 GB |

**Subscription expiry:** when a trial ends or a paid subscription is canceled / past due / period ended, the app **automatically downgrades the user to Free** (limits re-apply) until they subscribe again.

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env with Supabase + Paddle keys

# 3. Database
# Supabase SQL Editor → run supabase/schema.sql
# (Existing projects: also run supabase/migration_subscription_ends.sql)

# 4. Run
npm run dev
```

Open http://localhost:5173

### Static hosting (no Node build)

You can still open `index.html` or deploy the folder as static files.
Put keys directly in `js/config.js` fallbacks if you skip `.env`.

## Deploy to Vercel (so buttons work)

This is a **static** app. If Vercel uses the Vite preset, JS files 404 and **nothing is clickable**.

### Correct Vercel settings

1. Import the GitHub repo
2. Before deploy set:
   - **Framework Preset:** `Other` (not Vite)
   - **Build Command:** leave **empty**
   - **Output Directory:** leave **empty** (or `.`)
   - **Install Command:** leave empty
3. Put real Supabase + Paddle keys in `js/config.js` (fallback values), commit, push
4. Deploy

Check: open site → F12 → Network → refresh.  
`/js/config.js` and `/js/app.js` must be **200**. If **404**, Framework/Output is still wrong — fix and redeploy.

### Optional: Vite build + env vars

Framework = Vite · Build = `npm run build` · Output = `dist`  
Then add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, etc. in Vercel env.

### CLI

```bash
npx vercel
# choose no framework / empty build when asked
```

## What you configure

1. **Supabase** — project URL + anon key; run `schema.sql`
2. **Paddle** — client token + 3 monthly price IDs (Starter / Pro / Business)
3. **Webhooks (recommended)** — Paddle → your endpoint or Supabase Edge Function:
   - On `subscription.activated` / `subscription.updated`: set `subscription_status=active`, `subscription_plan`, `subscription_ends_at`, `paddle_subscription_id`
   - On `subscription.canceled` / `subscription.past_due`: set status accordingly (app also self-heals on login if period ended)

Without webhooks, you can still mark plans manually in the `profiles` table for testing. The client **always** enforces Free when trial/period is expired.

## Auth fields

Sign in and sign up fields start **empty**. Users must type their own email and password (no prefilled demo credentials).

## Project structure

```
invoiceflow-saas/
├── package.json
├── vite.config.js
├── .env.example
├── .gitignore
├── index.html
├── css/styles.css
├── js/
│   ├── config.js      # env + plan limits
│   ├── supabase.js    # auth, data, subscription expiry
│   ├── app.js         # UI
│   ├── utils.js
│   └── pdf.js
├── supabase/
│   ├── schema.sql
│   └── migration_subscription_ends.sql
└── README.md
```

## Support email

Set `VITE_SUPPORT_EMAIL` in `.env` (used in legal policies).
