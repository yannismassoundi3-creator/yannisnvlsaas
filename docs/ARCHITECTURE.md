**English** · [Français](fr/ARCHITECTURE.md)

# Architecture

Narixia is a single Next.js application backed by Supabase (PostgreSQL and Auth) and Stripe. It is designed to be
run by one person: few moving parts, the database as the enforcement point for tenancy, and every financial rule in
one place with tests.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16.4 (App Router, Cache Components / partial prerendering, typed routes, `proxy.ts`), React 19.3, TypeScript |
| UI | Tailwind CSS 4 with design tokens, Radix UI primitives, Lucide icons, Recharts 3, Sonner toasts |
| Data | Supabase: PostgreSQL with Row Level Security, Supabase Auth (email and password), `@supabase/ssr` cookie sessions |
| Validation | zod 4 on every server action; constraints and checks in SQL |
| Billing | Stripe Billing (Checkout, customer portal, webhooks), `stripe` 23 |
| Files | papaparse (CSV, in the browser), pdfkit (PDF reports, on the server) |
| Dates | date-fns 4 with `@date-fns/tz`; every store has a reporting time zone |
| Tests | Vitest (unit, components with jsdom, database), Playwright with axe-core (end to end) |
| Hosting (suggested) | Vercel for the app and the daily cron, Supabase hosted project in the EU |

## Directory layout

```
src/
  app/
    (marketing)/        public site: home, pricing, glossary, legal pages, public calculator
    (auth)/             sign-in, sign-up, check-email, forgot/reset password
    auth/               email link confirmation route and error page
    onboarding/         four-step onboarding
    app/                the application (overview, products, advertising, transactions, imports,
                        reports, calculator, settings, billing), with Suspense skeletons and an error boundary
    api/                route handlers: Stripe webhook, exports, reports, account export, import issues, cron
  components/           UI primitives (ui/), charts, and feature components per section
  config/               plans.ts (prices, limits, trial), site.ts (company details, processors)
  lib/
    auth/               session and workspace resolution (requireUser / requireWorkspace / requireStore)
    data/               read models used by pages (one module per section)
    <feature>/actions.ts server actions (validated mutations) for products, transactions, advertising,
                        imports, billing, settings, onboarding, workspace
    finance/            money, decimals, tax, metrics, KPIs, insights, calculator (pure, unit-tested)
    analytics/          reference aggregation, date ranges, series bucketing, SQL row mapping, first-party events
    imports/            import schema, header mapping, parsing, normalisation
    billing/            Stripe client, webhook sync, entitlements
    reports/            PDF rendering and report data
    supabase/           server, browser, admin and proxy clients; generated database types
  proxy.ts              refreshes Supabase sessions on application routes
supabase/
  migrations/           schema, RLS policies and SQL functions, in order
  templates/            auth email templates
  config.toml           local stack configuration
scripts/seed.ts         local demo account
tests/                  unit/, components/, db/, e2e/
docs/                   this documentation
```

## Request flow

**Reads.** Pages are React Server Components. They call `requireStore()` (verifies the session token and loads the
organisation, role, entitlements and active store), then a read model in `src/lib/data`. Read models query Supabase
**with the user's session**, so RLS applies, and most aggregation happens in SQL report functions
(`report_daily_totals`, `report_product_catalog`, `report_campaign_breakdown`, …). Pages receive totals, not raw
rows: no request loads an unbounded dataset. Lists (products, orders, refunds, expenses) are paginated in SQL.

**Writes.** Forms call server actions (`src/lib/<feature>/actions.ts`). Each action resolves the workspace, checks
the role and entitlements, validates its input with zod, consumes a rate limit where relevant, writes through the
user's session (RLS), then calls `refresh()` so the page re-renders with fresh data. Audit and analytics events are
written after the response with `after()`, so they never slow down or break the action.

**Privileged paths.** The Stripe webhook, account deletion, audit and analytics writes, rate limiting and sample
store creation use the service-role client (`src/lib/supabase/admin.ts`). Each one authorises the caller first.

**Rendering.** Marketing pages are prerendered. Application pages are dynamic (they depend on the session cookie);
their static shell is prerendered and data sections stream in behind Suspense skeletons. `app/app/error.tsx` catches
unexpected failures with a retry button; paused analytics (expired plan) show a dedicated notice instead of an error.
Authenticated responses are sent with `Cache-Control: private, no-store`.

## Data model

```
auth.users ─┬─ profiles
            └─ organization_members ── organizations ─┬─ subscriptions, billing_customers   (Stripe state, webhook-written)
                                                      ├─ audit_events, product_events, feedback
                                                      └─ stores ─┬─ products
                                                                 ├─ orders ─┬─ order_items ── products
                                                                 │          └─ refunds
                                                                 ├─ expenses
                                                                 ├─ ad_campaigns ── ad_spend_daily   (campaign may link to one product)
                                                                 └─ import_jobs ── import_rows
billing_events (Stripe event log, service role only)       private.rate_limits
```

- **Ownership.** Every business table has `organization_id`; store-level tables also have `store_id` (order items
  and import rows belong to the store of their order or job). Composite foreign keys keep children in their parent's
  organisation; triggers keep cross-references in the same store.
- **Stores.** Currency (with its number of decimals), reporting time zone, whether prices include tax, the
  payment-fee rule (basis points + fixed fee), the default shipping cost, and `is_demo` for the sample store, which
  is never mixed with real stores in any view or report.
- **Orders** store amounts excluding tax in minor units, with optional recorded shipping cost and fees. **Order
  items** keep a cost snapshot (`unit_cost_e4`) taken when the line was recorded.
- **Provenance.** Records carry `source` (`manual`, `csv`, `demo`, and reserved values for future integrations) and
  `import_job_id`, which makes undo possible and prepares platform integrations.
- **Entitlements** are computed, never stored: the `organization_entitlements` view derives the access level from
  the trial dates and the latest subscription.

- **Reseller mode.** `stores.business_model` is `ecommerce` (imports orders, costs and ads) or `reseller` (people
  who resell items one by one on Vinted, Leboncoin, eBay or Vestiaire Collective). Reseller data reuses the same
  tables, so every report, export and policy applies unchanged: an item is a `products` row (purchase price per
  piece in `unit_cost_e4`, optional `acquired_on`, `stock_quantity` identical pieces, null meaning one; a lot price
  is divided exactly by the number of pieces, rounded to 4 decimals), a sale is an `orders` row with one
  `order_items` line (the pieces sold, the total received, cost snapshot per piece, generated number
  `V-YYYYMMDD-XXXXXX`) and `orders.sales_channel` records where it sold. Remaining pieces = `stock_quantity` − the
  quantities of the item's order lines; an item is in stock while one remains, sold once none does. Quick sales go
  through `public.reseller_record_sale`, which locks the item row and checks the remaining pieces before writing the
  order, so concurrent sales cannot oversell; a trigger keeps `stock_quantity` at or above the pieces sold. Writes go
  through `src/lib/reseller/actions.ts` (falling back to the shared `writeOrder` path, `src/lib/transactions/write.ts`,
  for single pieces while a database lacks the quantities migration); reads through
  `src/lib/data/reseller.ts` and the SQL functions `reseller_items`, `reseller_stock_summary` and
  `report_channel_breakdown`. The home page, navigation and onboarding adapt to the mode.
- **Sales received by email.** Sellers forward their sale-notification emails to a private address
  (`stores.inbound_token`); the inbound provider posts them to `/api/inbound/email`, which verifies basic-auth
  credentials, parses them heuristically (`src/lib/inbound/parse.ts`) and stores a pending row in `inbound_emails`
  with the service role. Confirming opens the sale dialog prefilled; the sale is recorded through the same quick-sale
  action, which marks the email confirmed. See [DEPLOYMENT.md](DEPLOYMENT.md) and [SECURITY.md](SECURITY.md).

Generated TypeScript types for the schema live in `src/lib/supabase/database.types.ts` (`npm run db:types`).

## Where the rules live

| Concern | Module |
| --- | --- |
| Metric formulas and definitions | `src/lib/finance/metrics.ts` (see [METRICS.md](METRICS.md)) |
| Aggregation (SQL) and its reference | `supabase/migrations/*reporting.sql`, `*app_queries.sql`, `src/lib/analytics/reference.ts` |
| Import validation and duplicates | `src/lib/imports/normalize.ts`, `public.import_finalize` (see [IMPORTS.md](IMPORTS.md)) |
| Access levels and limits | `private.org_access`, `src/lib/billing/entitlements.ts`, `src/config/plans.ts` (see [BILLING.md](BILLING.md)) |
| Tenancy | RLS policies in the migrations (see [SECURITY.md](SECURITY.md)) |

## Extending

- **Platform integrations** (Shopify Admin API, Meta, Google Ads): write records through import jobs with their own
  `source`, so duplicate detection, undo and the history work unchanged. Store OAuth tokens in a server-only table
  without user-facing policies. Run syncs from a scheduled job, not from page requests.
- **New metrics:** add the field to `PeriodTotals`, to the reference implementation and to the SQL functions; the
  database parity test will fail until all three agree.
- **New plan limits:** add them to `PlanLimits` in `src/config/plans.ts` and enforce them on the server.
