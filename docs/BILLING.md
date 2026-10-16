**English** · [Français](fr/BILLING.md)

# Billing, trial and entitlements

Narixia uses **Stripe Billing** with Stripe-hosted Checkout and the Stripe customer portal. Card details are entered
on Stripe's pages only; Narixia never sees or stores them. Access to paid features is granted **only from verified
webhook events**, never from the redirect back from Checkout.

> Status of this integration: implemented and covered by automated tests that use Stripe's own signature scheme
> and realistic event payloads (`tests/db/billing.test.ts`). It has **not** been run against a real Stripe account
> from this repository, because no Stripe credentials were available. Follow the test-mode procedure below before
> relying on it, and the launch checklist before taking real payments.

## Commercial terms (configurable)

Defined in `src/config/plans.ts`. The displayed Pro price comes from `NEXT_PUBLIC_PRO_PRICE_MINOR` /
`NEXT_PUBLIC_PRO_PRICE_CURRENCY`; **the amount charged always comes from the Stripe Price** in
`STRIPE_PRICE_PRO_MONTHLY`, so keep them identical.

| | Free trial | Pro (proposed €19/month) |
| --- | --- | --- |
| Length | 14 days from workspace creation, no card | Monthly subscription |
| Real stores | 1 (the sample store does not count) | 3 |
| Rows per CSV file / per month | 5,000 / 20,000 | 100,000 / 1,000,000 |
| History in dashboards and reports | Last 90 days | Last 3 years |
| CSV exports, PDF and CSV reports | — | Yes |
| Product and campaign filters | — | Yes |

The trial length (14 days) and payment grace period (7 days) are defined both in `src/config/plans.ts` and in
`private.trial_period()` / `private.payment_grace_period()` in the database, which enforces them. A database test
fails if the two drift apart.

## Access levels

The database computes the access level of each organisation (`private.org_access`), and Row Level Security uses it:

| Level | When | Effect |
| --- | --- | --- |
| `pro` | A subscription is `active` or `trialing` | Pro limits |
| `grace` | A subscription is `past_due` for less than 7 days | Pro limits, banner asking to update the payment method |
| `trial` | No live subscription and the 14-day trial has not ended | Trial limits, countdown banner (caution in the last 3 days) |
| `expired` | Otherwise | Data is kept but read-only: no imports or edits (enforced by RLS), dashboards and reports paused. Billing, settings and the full data export stay available. |

`src/lib/billing/entitlements.ts` turns the level into plan limits and interface state. Plan limits are enforced on
the server: store count by a database trigger, import sizes in the import actions, exports and reports in their
routes. Hiding a button is never the only control.

## Flows

### Subscribe

1. The owner clicks **Subscribe** on Billing. `startCheckout` (server action) checks the role, the current access
   level and a rate limit, creates or reuses the Stripe customer (idempotency key per organisation), and creates a
   Checkout Session in `subscription` mode.
2. While the free trial has more than two days left, the subscription is created with `trial_end` set to the end
   of the Narixia trial: the card is collected now and **the first charge happens when the trial ends**, as the
   button and the page state. With two days or less left (Stripe requires a trial end at least 48 hours ahead),
   the subscription starts immediately.
3. Stripe redirects to `/app/billing?checkout=success`. The page shows "waiting for confirmation" and refreshes
   until the webhook has recorded the subscription. The redirect itself grants nothing.

### Manage, cancel, update the card

The **Manage billing** button opens the Stripe customer portal (`openBillingPortal`). Cancellation, payment-method
updates and invoices are handled there. A cancellation at period end keeps Pro until the end of the paid period;
Billing shows the end date.

### Failed payments

When a renewal fails, Stripe marks the subscription `past_due` and retries according to your Stripe settings.
Narixia keeps full access for 7 days from the first failure (`grace`), then the account becomes `expired` until a
payment succeeds. No data is deleted.

### Billing history

Billing lists the last 12 invoices from Stripe with links to Stripe's hosted invoice and PDF.

### Account deletion

Deleting the account (Settings → Data) first cancels every live subscription immediately, without proration or a
final invoice. If Stripe cannot be reached, nothing is deleted and the user is told to retry or contact support.

## Webhooks

Endpoint: `POST /api/stripe/webhook` (`src/app/api/stripe/webhook/route.ts`).

| Event | Handling |
| --- | --- |
| `checkout.session.completed`, `checkout.session.async_payment_succeeded` | Links the Stripe customer to the organisation, then syncs the subscription |
| `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.pending_update_applied`, `.pending_update_expired` | Syncs the subscription |
| `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.marked_uncollectible` | Syncs the invoice's subscription and records the invoice outcome |
| anything else | Recorded as `ignored` |

Guarantees:

- **Authenticity.** The signature is verified on the raw body with `STRIPE_WEBHOOK_SECRET` before anything else;
  invalid or missing signatures get `400`.
- **Idempotency.** Each event id is stored once in `billing_events`. An event already `processed` or `ignored` is
  acknowledged without work; concurrent deliveries of the same event are safe.
- **Ordering.** The subscription is re-read from the Stripe API (the event payload may be stale) and applied only
  if no newer event was applied first (`stripe_event_at`).
- **Retries.** Processing errors return `500` so Stripe retries with backoff; the error is kept on the event row
  for support.
- **Audit.** `billing_events` keeps the type, outcome, organisation and a summary (status, invoice id and amount)
  of every event. It is readable only with the service role.

The SDK (`stripe` 23) is pinned to API version **`2026-09-30.endive`**. Create the webhook endpoint with the same
API version so payloads match the code (Invoice → subscription is read from `invoice.parent.subscription_details`,
billing periods from subscription items).

## Setup in Stripe test mode

1. Create a Stripe account and stay in **test mode**.
2. **Product and price:** Product catalogue → Add product "Narixia Pro" → recurring price, monthly, €19.00 (or your
   price). Copy the price id (`price_…`) into `STRIPE_PRICE_PRO_MONTHLY`, and set `NEXT_PUBLIC_PRO_PRICE_MINOR` and
   `NEXT_PUBLIC_PRO_PRICE_CURRENCY` to match.
3. **API key:** Developers → API keys → secret key (`sk_test_…`) into `STRIPE_SECRET_KEY`. A restricted key
   (`rk_test_…`) also works if it allows Customers, Checkout Sessions, Subscriptions, Invoices and Billing Portal.
4. **Customer portal:** Settings → Billing → Customer portal. Enable cancellation (at period end recommended),
   payment-method updates and invoice history. Save, otherwise portal sessions fail.
5. **Webhook, local development:** install the Stripe CLI, then
   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
6. **Webhook, deployed:** Developers → Webhooks → Add endpoint `https://<your-domain>/api/stripe/webhook`, API
   version `2026-09-30.endive`, with the events in the table above. Copy its signing secret into
   `STRIPE_WEBHOOK_SECRET` in the host's environment.
7. **Tax (optional):** to let Stripe compute VAT, activate Stripe Tax, add your registrations, set the price's tax
   behaviour, and set `STRIPE_AUTOMATIC_TAX=true`. Checkout then requires a billing address and accepts VAT numbers.
8. **Retries and emails:** Settings → Billing → Subscriptions and emails: choose the retry schedule (Smart Retries)
   and what happens after the last retry (cancel or mark unpaid; both end Pro access), and enable Stripe's emails
   for failed payments and upcoming trial ends if you want them. Narixia itself only shows in-app banners.

### End-to-end test in test mode

With `npm run dev` and `stripe listen` running:

1. Sign up, open Billing, click Subscribe, pay with `4242 4242 4242 4242` (any future date, any CVC).
2. Back on Billing, the status becomes "Pro" within seconds; `billing_events` shows `checkout.session.completed`
   and `customer.subscription.created` as `processed`.
3. Open **Manage billing**, cancel the subscription: Billing shows the end date. Resume it from the portal.
4. Payment failure: subscribe with `4000 0000 0000 0341` (attaches, then fails on charge), or use a test clock to
   advance past the trial end. The account shows the grace banner, then expires after 7 days of failure.
5. Replays: `stripe events resend <evt_id>` must leave the data unchanged (the event is acknowledged as duplicate).
6. Run `stripe trigger customer.subscription.updated` and check the event is processed or ignored, never failed.

## Before accepting real payments

Live keys alone cannot start real payments: with a `sk_live_…`/`rk_live_…` key, new checkouts stay disabled and
Billing says so until **`STRIPE_LIVE_ENABLED=true`** is set. Set it only when every item below is done.

**Eligibility and verification — check these first; they are legal requirements, not formalities:**

- **Age.** Stripe requires the account representative to be of legal age (at least 18 in most countries,
  including France) and to have the capacity to enter contracts. A minor cannot open or operate the Stripe account
  in their own name; a parent or legal guardian, or a company represented by an adult, must hold it. Check
  Stripe's current terms for your country.
- **Business identity.** Stripe verifies the legal entity (sole proprietorship or company), its registration
  number (e.g. SIREN/SIRET in France), address, the representative's identity document, and owners/directors.
  Selling a subscription requires being registered to trade in your country (e.g. micro-entrepreneur or a company
  in France). Payouts require a bank account in the business's name.
- **Product eligibility.** Confirm Narixia's business type and description are accepted under Stripe's restricted
  businesses list, and that your public website shows prices, terms, refund/cancellation policy and contact details
  (Stripe reviews them).

**Tax and legal:**

- VAT: decide whether you are under a VAT franchise threshold (e.g. *franchise en base* in France) or registered.
  Selling digital services to consumers in other EU countries can require the OSS scheme; business customers may
  be invoiced under reverse charge. Get confirmation from an accountant.
- Invoices must carry the legally required mentions for your country (Stripe invoice settings: legal name,
  address, registration number, VAT number or VAT exemption mention).
- Have the Terms, Privacy Policy and legal notice reviewed by a lawyer; they are templates written for this product,
  not legal advice. Fill in the company details (`NEXT_PUBLIC_COMPANY_*`).
- EU consumer law: if you sell to consumers, the 14-day withdrawal right applies to digital services unless the
  customer expressly waives it when service starts; the checkout and terms must reflect your chosen approach.

**Technical:**

- Run the test-mode end-to-end test above on the production deployment (with test keys) and keep the results.
- Create the live product, price, portal configuration and webhook endpoint (live mode has separate objects).
- Set the live `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_PRO_MONTHLY`, then
  `STRIPE_LIVE_ENABLED=true`, and redeploy.
- Make one real purchase with your own card, check the webhook events, the invoice and the portal, then refund it
  from the Stripe Dashboard.
