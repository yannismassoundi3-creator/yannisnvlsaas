# Narixia

**Understand your real margins. Make better business decisions.**

Narixia is profitability analytics for small e-commerce businesses: Shopify merchants, independent online stores and
small brands that use paid advertising. It brings sales, product costs, shipping, payment fees, advertising and other
expenses into one clear view of contribution margin, by store and by product.

Narixia is a decision-support tool, not accounting software. Every metric has a published definition, estimates and
missing data are always labelled, and contribution margin is never presented as net profit.

## Features

- **Overview dashboard:** gross sales, discounts, refunds, net sales, COGS, shipping and payment costs, advertising,
  contribution margin and margin %, orders and average order value; comparison with the previous period; revenue and
  margin chart; profit breakdown; rule-based insights that show their evidence; data-quality notices.
- **Products:** search, sort, filters (missing cost, loss-making, archived), pagination, detail pages with daily
  sales, inline cost editing. Store-wide advertising is never spread arbitrarily over products.
- **Advertising:** spend, platform ROAS, blended ROAS and break-even ROAS per campaign; link a campaign to the product
  it promotes; manual daily spend entry.
- **Transactions and costs:** orders, refunds and expenses with manual entry and correction.
- **CSV imports:** orders, products and costs, ad spend and expenses, with templates, automatic recognition of Shopify,
  Meta and Google Ads exports, column mapping, row-level validation, duplicate detection, review before saving,
  batched commit, history and undo. The file is read in the browser; only mapped columns are uploaded.
- **Reports:** PDF (summary, products, advertising) and CSV (summary, daily), with the period, definitions and
  data-quality notes; CSV exports of products and campaigns, protected against formula injection.
- **Profitability calculator** with an exact break-even price, in the app and as a public tool.
- **Sample store** with clearly labelled demo data, separate from real stores.
- **Accounts:** email and password with verification and password reset, four-step onboarding, organisations with
  roles, several stores (Pro), full data export and account deletion.
- **Billing:** 14-day trial without a card, Pro plan via Stripe Checkout and the customer portal, verified and
  idempotent webhooks, grace period on failed payments, entitlements enforced by the database.
- **Marketing site** with pricing, FAQ, glossary of financial terms, legal pages, sitemap and social images.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Radix UI · Recharts · Supabase (PostgreSQL with
Row Level Security, Auth) · Stripe · pdfkit · zod · Vitest · Playwright. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local setup

Requirements: Node.js 20.9+ (22 recommended), npm, Docker (for the local Supabase stack). Optional: the Stripe CLI.

```bash
git clone <repository-url> narixia && cd narixia
npm install

# 1. Start the local Supabase stack (Postgres, Auth, Mailpit) and apply the migrations
npx supabase start
npm run db:reset

# 2. Configure the environment
cp .env.example .env.local
npx supabase status          # copy API_URL, PUBLISHABLE_KEY and SECRET_KEY into .env.local

# 3. Create a demo account (optional)
npm run seed                 # demo@narixia.test / margins2026ok

# 4. Run the app
npm run dev                  # http://localhost:3000
```

Emails sent by the local stack (sign-up confirmation, password reset) appear in Mailpit at http://127.0.0.1:54324.

Billing works locally once Stripe test keys are set and `stripe listen --forward-to localhost:3000/api/stripe/webhook`
is running; see [docs/BILLING.md](docs/BILLING.md). Without Stripe keys, the app runs normally and the Billing page
says that payments are not set up.

## Environment variables

Every variable is listed and explained in [`.env.example`](.env.example). The essentials:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | yes | Public origin (auth redirects, Stripe return URLs, SEO) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase project |
| `SUPABASE_SECRET_KEY` | yes | Server-only key for webhooks, deletion, audit and rate limits |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY` | for billing | Stripe test or live keys |
| `STRIPE_LIVE_ENABLED` | for live payments | Explicit opt-in before live keys can start checkouts |
| `CRON_SECRET` | in production | Protects the daily maintenance endpoint |
| `NEXT_PUBLIC_COMPANY_*`, `NEXT_PUBLIC_SUPPORT_EMAIL` | before launch | Company details on the legal pages |

Never commit real credentials: `.env*` files are gitignored except `.env.example`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit and component tests |
| `npm run test:db` | Database tests against the local stack (RLS, SQL reports, imports, billing sync) |
| `npm run test:e2e` | End-to-end tests in Chromium, including accessibility checks |
| `npm run check` | Lint, typecheck, unit and component tests |
| `npm run db:start` / `npm run db:reset` | Start the local stack / recreate the local database from the migrations |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` |
| `npm run seed` | Create the local demo account (refuses to run against a non-local project) |

## Tests

```bash
npm run check          # fast, no services
npm run test:db        # needs `npx supabase start`
npm run test:e2e       # needs the local stack; starts the dev server
```

What each layer covers is described in [docs/TESTING.md](docs/TESTING.md).

## Deployment

Hosted Supabase project (migrations with `npx supabase db push`), Vercel for the app and the daily cron, Stripe for
billing. Step-by-step instructions, migrations workflow, backups and recovery, and operations are in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| Document | Contents |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, layout, request flow, data model, extension points |
| [METRICS.md](docs/METRICS.md) | Every formula, aggregation rule, tax method, calculator and insight rule |
| [IMPORTS.md](docs/IMPORTS.md) | The import pipeline, templates, duplicate rules, undo, limits |
| [BILLING.md](docs/BILLING.md) | Plans, entitlements, Stripe setup, webhooks, test procedure, live-payment requirements |
| [SECURITY.md](docs/SECURITY.md) | Tenancy, RLS, auth, headers, rate limits, privacy, known gaps |
| [DESIGN.md](docs/DESIGN.md) | Design tokens, contrast, charts, components, accessibility |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Supabase, Vercel, Stripe, migrations, backups, recovery, operations |
| [TESTING.md](docs/TESTING.md) | Test layers and how to run them |
| [LAUNCH.md](docs/LAUNCH.md) | Launch checklist, known limitations, incomplete features, next features |

## Status

The product is implemented end to end and tested locally (unit, component, database and end-to-end tests, production
build). It has not yet been deployed to production or connected to a real Stripe account, and the legal pages need
professional review. The remaining work is listed in [docs/LAUNCH.md](docs/LAUNCH.md).
