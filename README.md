# Shopee Affiliate Report

Track Shopee affiliate commissions: import orders from screenshots via Gemini AI, manage clients, and export monthly commission reports to Excel.

**Stack:** Next.js 16 · Supabase · Gemini AI · xlsx · Tailwind CSS

---

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io) 9+
- A [Supabase](https://supabase.com) project
- A [Gemini API key](https://aistudio.google.com/) (free tier works)

---

## Local Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Supabase — Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Gemini — https://aistudio.google.com/
GEMINI_API_KEY=<your-gemini-api-key>
```

> **Note:** The Supabase publishable key is labelled **Publishable key** in the dashboard (formerly "anon key"). The env var name stays `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The **service_role** key is a server-only secret — never commit it or expose it to the browser.

### 3. Apply the database migrations

Either paste each file from `supabase/migrations/` into the [Supabase SQL Editor](https://supabase.com/dashboard) in order, or use the CLI:

```bash
brew install supabase/tap/supabase   # one-time
supabase login                       # browser flow
supabase link --project-ref <your-project-ref>
supabase db push
```

`001_initial.sql` creates the 5 tables (`reports`, `orders`, `order_statuses`, `clients`, `report_clients`) and seeds the order statuses. `20260514120000_enable_rls.sql` enables Row-Level Security on every table so the Data API is locked down — all access happens server-side via the `service_role` key.

### 4. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Run tests

```bash
pnpm exec jest
```

---

## Deployment (Vercel)

### 1. Push to GitHub

```bash
git push origin main
```

### 2. Import on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `shopee-affiliate-report` repository
3. Add the following environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key (mark as **Sensitive**) |
| `GEMINI_API_KEY` | Your Gemini API key |

4. Click **Deploy**

### 3. Apply the database migrations

If you haven't already, run `supabase/migrations/001_initial.sql` and then `supabase/migrations/20260514120000_enable_rls.sql` in the Supabase SQL Editor for your production project.

---

## Features

- **Reports** — Create monthly reports, upload Shopee commission screenshots, and let Gemini AI parse orders automatically
- **Order management** — Review parsed orders, edit details, add orders manually
- **Clients** — Assign orders to clients, set per-report commission percentage
- **Excel export** — Download a formatted `.xlsx` file for any client × report combination
