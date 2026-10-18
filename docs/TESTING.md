**English** · [Français](fr/TESTING.md)

# Testing

Four layers, from fastest to slowest. Run the fast checks before every commit; run everything before a release.

```bash
npm run check            # lint + typecheck + unit and component tests (no services needed)
npm run test:db          # database tests (local Supabase stack)
npm run test:e2e         # end-to-end tests in Chromium (local stack + dev server)
npm run build            # production build
```

## Unit tests (`tests/unit`, Vitest, Node)

Pure logic, no network or database. `npm run test:unit`.

| Area | What is covered |
| --- | --- |
| Money and decimals | Exact decimal parsing (separators, signs, scientific notation, limits), currencies with 0, 2 and 3 decimals, unit costs in e4, half-away-from-zero rounding, largest-remainder allocation, formatting |
| Tax and metrics | Removing included tax (no tax, 20% VAT, rounding residue, exact totals across many random orders, impossible tax amounts), the profit waterfall, negative contribution, refunds larger than sales, completeness states, deltas, KPI delta semantics |
| Calculator | Gross to contribution margin, zero values, negative adjustments, refunds, fixed vs percentage inputs, missing costs, unusual currencies, exact break-even price and the "cannot break even" case |
| Aggregation reference | Demo generator determinism, time-zone date attribution, refunds dated separately, estimates, product allocation, insight rules on the demo store |
| Date ranges and series | Presets, custom ranges clipped to the plan's history, comparison periods, weekly/monthly buckets and partial buckets, SQL row mapping |
| Imports | Header recognition (Shopify, Meta, Google Ads), timestamps with offsets, local times across DST, day/month order detection and ambiguity, order grouping, order-discount split, tax-inclusive orders and refunds, whole-order hold-back, cancelled orders, other currencies, conflicting order-level values, Shopify variants, product matching like the database, ad and expense rows |
| Reseller mode | Sale numbers and item references (format, no ambiguous letters, uniqueness), the 60-day "lingering" rule, mode suggested by the platform, sales channels, default platform, loose name matching, item and sale validation (comma decimals, required fields, future dates, bounds, messages in both languages) |
| Inbound emails | Synthetic French and English sale emails (direct, Gmail, Apple Mail and Outlook forward wrappers, HTML only), platform detection, amount heuristics (notations, thousands, preferring sale words, avoiding fees), titles, Gmail forwarding confirmations (link and code), no amount found, non-euro stores, excerpt cleaning (no email addresses, phone numbers or postal addresses, 2,000 characters), inbound addresses and tokens |
 Access levels, trial countdown, grace period, plan limits, history start |
| Auth redirects | Only same-site relative `next` paths are accepted |
| Exports | CSV formula-injection neutralisation, BOM and CRLF, decimal cells, file names; PDF report renders (sample-store label included) |

## Component tests (`tests/components`, Vitest, jsdom, Testing Library)

Interface behaviour that matters for correctness and accessibility. `npm run test:components`.

- KPI tiles state the direction of a change in text and colour only meaningful changes.
- The profit breakdown keeps the sign of a negative contribution margin, marks incomplete costs and states that
  contribution margin is not net profit.
- Data notices explain missing costs and estimates with amounts and a link to fix them, and stay silent when data
  is complete.
- The inline cost editor opens with focus in the field and closes on Escape.

## Database tests (`tests/db`, Vitest against the local Supabase stack)

These run real SQL, RLS policies and functions as the `authenticated`, `anon` and `service_role` roles.
`npm run test:db` (needs `npx supabase start`; uses `SUPABASE_DB_URL` and the keys in `.env.local`).

| File | What is covered |
| --- | --- |
| `tenancy.test.ts` | Onboarding RPC; for every table, another tenant can neither read nor write; protected columns (trial dates, billing data) cannot be changed by users; expired accounts are read-only; trial and grace constants match `src/config/plans.ts` |
| `integrity.test.ts` | Cross-store references rejected (order lines, refunds, campaign links, ad spend); amount invariants (discount ≤ line amount); duplicate order numbers refused; product matching by SKU or name |
| `reporting.test.ts` | SQL totals, daily series, product and campaign breakdowns equal the TypeScript reference on a generated dataset, including allocation ties; another organisation's store returns nothing; reports pause after expiry while data stays exportable; invalid ranges rejected |
| `imports.test.ts` | Staging, finalize and duplicate rules for each kind (skip and update strategies), whole-order hold-back, batched commit, undo restoring replaced records, "only the latest import can be undone", access control |
| `billing.test.ts` | Pro only from a verified checkout event; grace period start and expiry; recovery after a retried payment; stale events ignored; cancellation; unknown organisations ignored; billing periods from subscription items; webhook signature verification (unsigned and wrongly signed requests rejected) and idempotent replays, using Stripe's own test signature helper |
| `reseller.test.ts` | Onboarding with the reseller mode (zero fee and shipping rules) and the old seven-argument call; mode, sales channel and purchase date constraints; unique sale numbers; a quick sale feeds the daily totals, the product report, the per-platform breakdown and the items list; refunds per platform; undoing a sale returns the item to stock; other tenants and anonymous callers see nothing; expired accounts cannot switch the mode |
| `photos-ai.test.ts` | `products.photo_path` stays in the item's own folder; the `item-photos` bucket is private (300 KB, JPEG/WebP); members read, upload and delete only in their organisation's folder, uploads need an existing item and an active trial; RLS on `ai_usage` (members read, nobody writes); `reserve_listing_analysis` counts down and stops at the cap, refuses non-members and expired organisations, and 24 concurrent calls never exceed a cap of 5; only the service role refunds, never below zero |
| `inbound.test.ts` | Inbound tokens (random, readable by members, never writable directly, rotated by owners only); the webhook route handler (503 until configured, basic auth required, unknown tokens answered like accepted ones, parsed pending rows, idempotent message ids, token in the recipient address, malformed and oversized payloads, Gmail confirmations); RLS on `inbound_emails` (members read and confirm or dismiss only, no inserts or deletes, same-store orders, read-only after expiry); 30/90-day retention |
 Store limit per plan enforced by the database; the sample store does not count |

The billing tests stub only the call that re-reads a subscription from Stripe; signatures are produced and verified
with the real Stripe SDK. They do not contact Stripe.

## End-to-end tests (`tests/e2e`, Playwright, Chromium)

`npm run test:e2e` starts `npm run dev` unless `E2E_BASE_URL` points at a running deployment. They need the local
Supabase stack (sign-up confirmation emails are read from its Mailpit inbox at `MAILPIT_URL`).

- **Public site:** home page content and no page errors; pricing, glossary, legal pages, contact and the public
  calculator render with HTTP 200; application pages and the data export require sign-in; security headers.
- **Merchant journey** (serial): sign up and confirm by email → onboarding → sample store → switch to the real store
  → import a Shopify CSV with one invalid row, review the error, confirm → overview figures and missing-cost notice →
  add a cost inline → undo the import → save cost rules → download the full data export → delete the account.
- **Reseller mode** (in French): sign up → onboarding with Vinted, which selects the reseller mode → add two items in a
  row → record a sale with « Vendu ! » and a comma price (18,50) → the home page shows the sale, what is left and one
  item in stock → My items shows it sold; axe checks on the home page and both dialogs, and no horizontal overflow at
  a 390 px phone width. Then sales received by email (when `INBOUND_*` is set in `.env.local`): a synthetic
  Postmark payload posted to the local webhook (wrong password refused) appears on the home page and in the inbox
  with a Gmail confirmation code; « Valider » opens the prefilled sale dialog and records the sale.
- **Item photos and AI listings** (in French, 390 px): a generated photo is enhanced on the device (square framing,
  before/after, download link); with the AI off the button says « Bientôt disponible »; with `LISTING_AI_FAKE=1` (set by
  `playwright.config.ts`, a canned listing marked as test data, Anthropic is never called) the result card shows the
  remaining quota, the price warning, copy to the clipboard and « Utiliser ce titre »; saving stores one thumbnail,
  shown in « Mes articles » and the sale picker, and deleting the item deletes the file; axe checks on the dialog.
  An undecodable file (HEIC-like) shows a clear message.
- **Accessibility:** axe-core (WCAG 2.0/2.1/2.2 A and AA rules) runs on the public pages, the dashboard and the
  import review and must report no violations.

## Writing tests

- New financial rules: unit tests first, with explicit minor-unit values (e.g. `-1_000` is −€10.00).
- New SQL or RLS: a database test that proves both the allowed and the refused case.
- Use fictional data only (`example.test` emails, invented products). Never copy real customer exports into fixtures.
