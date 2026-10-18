**English** · [Français](fr/SECURITY.md)

# Security and privacy

This document describes the controls that exist in the code, how they were verified, and the gaps that remain.
It is not a certification: no external audit or penetration test has been performed.

## Tenancy and authorisation

- **Organisation ownership.** Every business record (stores, products, orders, order items, refunds, expenses,
  campaigns, ad spend, imports) carries an `organization_id`. Users reach data only through
  `organization_members` (roles `owner`, `admin`, `member`).
- **Row Level Security on every public table**, checked in the database:
  - reads require membership (`private.is_org_member`);
  - inserts and updates also require a live trial or subscription (`private.org_can_write`), so an expired
    account is read-only even through the API;
  - `billing_customers`, `billing_events` and `product_events` have no policies at all: only the service role
    can read or write them;
  - `inbound_emails` (forwarded sale emails) can be read by members and updated only in `status` and `order_id`
    (confirm or dismiss); only the service role inserts them, after the inbound webhook has verified its
    credentials, and nobody deletes them through the API;
  - `ai_usage` (AI listings per organisation and month) can be read by members; nobody writes it through the API:
    only `reserve_listing_analysis` (members with write access) and `release_listing_analysis` (service role) change it;
  - item thumbnails live in the private Storage bucket `item-photos` under `<organization_id>/<product_id>/…`: policies
    on `storage.objects` let members read and delete their organisation's files, and upload only with a live trial or
    subscription, into an existing item of their organisation; `products.photo_path` must point into that same folder;
  - composite foreign keys keep child rows in their parent's organisation, and triggers keep them in the same
    store (an order line cannot point to another tenant's or another store's product).
- **SQL functions** used by the app (`report_*`, `import_*`) are `SECURITY INVOKER`, so RLS applies inside them.
  The few `SECURITY DEFINER` functions (access checks, workspace creation, rate limiting, maintenance) have a fixed
  empty `search_path` and validate their caller; maintenance functions are executable by the service role only.
- **Server-side checks.** Every page, server action and route handler resolves the caller with
  `requireUser` / `requireWorkspace` / `requireStore` (`src/lib/auth/workspace.ts`) before doing anything, and
  owner-only actions (billing, store and account deletion) check the role. The proxy's redirect of signed-out
  visitors is a convenience; it is not relied on for security.
- **Plan limits** are enforced on the server: store count by a trigger, import sizes in the import actions,
  exports and reports in their routes, analytics access in the report functions (`private.assert_report_request`).
- **Privileged key.** `SUPABASE_SECRET_KEY` bypasses RLS. It is used only in server modules marked
  `import "server-only"`, for: verified Stripe webhooks, the authenticated inbound email webhook, account and store deletion, audit and analytics events,
  rate limits, refunding a failed AI analysis, deleting an account's item photos, creating the sample store, and
  reading the Stripe customer id. Each caller authorises the user first.

Verified by `tests/db/tenancy.test.ts` (cross-tenant reads, writes and function calls are refused for every table,
expired accounts cannot write), `tests/db/integrity.test.ts` (cross-tenant references are rejected) and
`tests/db/stores.test.ts` (store limits).

## Authentication and sessions

- Supabase Auth with email and password. Email confirmation is required before the first sign-in; passwords need
  at least 10 characters with letters and digits (`supabase/config.toml`; set the same rules on the hosted project).
- Sessions live in HTTP-only cookies managed by `@supabase/ssr`. The proxy refreshes them on application routes.
  Server code verifies the access token (signature and expiry) with `auth.getClaims()` on every request.
- Access tokens expire after one hour. A session signed out elsewhere can stay valid until then; a deleted user
  loses all data access immediately because their memberships are deleted.
- Password reset and email change use single-use links verified server-side (`/auth/confirm`, `verifyOtp`).
- The `next` parameter after sign-in only accepts same-site relative paths (`src/lib/auth/redirect.ts`, unit-tested
  against `//evil.com`, backslashes, encoded and absolute URLs).
- Auth endpoints are rate-limited by Supabase Auth itself (per IP: sign-ups and sign-ins, token refreshes,
  verifications, emails per hour). Configure the same limits on the hosted project (Authentication → Rate Limits).

## Input handling

- Every server action validates its input with zod; IDs must be UUIDs; amounts are parsed as exact decimals and
  bounded. The database repeats the essential checks as constraints (lengths, signs, enums, currency codes).
- Imported files are untrusted: parsed in the browser, re-validated on the server with the job's stored options,
  limited in size, columns and cell length (see [IMPORTS.md](IMPORTS.md)).
- React escapes all rendered text; the app never renders user content as HTML.
- **CSV injection:** every CSV the app produces neutralises cells starting with `=`, `+`, `-`, `@`, tab or carriage
  return (`src/lib/csv.ts`, unit-tested, including a product named `=cmd|' /C calc'!A0`).

## Rate limits

Database-backed fixed windows (`public.consume_rate_limit`, `private.rate_limits`), keyed by user:

| Action | Limit |
| --- | --- |
| Workspace creation | 10 / hour |
| Sample store creation | 5 / hour |
| Import job creation / undo | 30 / hour each |
| Import row upload | 1,200 chunks / 10 minutes |
| Product, transaction and ad-spend edits | 300 / hour per family |
| CSV exports and reports | 60 / hour |
| Full data export | 5 / hour |
| Checkout / billing portal | 10 / 20 per hour |
| Password change, email change, account deletion | 5 / hour each |
| Store deletion | 10 / hour |
| Feedback messages | 10 / hour |
| Inbound sale emails | 120 / hour per store |
| Confirming or dismissing inbound emails | 300 / hour |
| Changing the inbound address | 10 / hour |
| Listings written with AI | 10 / 10 minutes per user, and 50 / month per organisation (`LISTING_AI_MONTHLY_LIMIT`) |

Expired windows are pruned daily by `/api/cron/maintenance`.

## HTTP security headers

Set for every route in `next.config.ts`:

- `Content-Security-Policy`: `default-src 'self'`; scripts and styles from self with `'unsafe-inline'`; images from
  self, `data:` and `blob:`; fonts from self; connections to self and the Supabase project; `object-src 'none'`;
  `base-uri 'self'`; `form-action 'self'` plus Stripe Checkout and the billing portal; `frame-ancestors 'none'`;
  `upgrade-insecure-requests` when the site URL is HTTPS.
- `Strict-Transport-Security` (2 years, subdomains, preload) in production, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`.
- `Cache-Control: private, no-store` on `/app`, `/onboarding` and `/api` so shared caches never store
  authenticated pages or exports.

**Why `'unsafe-inline'` for scripts:** a nonce-based CSP forces every page to render dynamically, which would turn
the static marketing pages into per-request renders. The risk is mitigated because the app has no HTML injection
points (React escaping, no `dangerouslySetInnerHTML` with user data) and loads no third-party scripts. Moving to
nonces (`proxy.ts` + `headers()`) is a possible hardening step if the app ever needs third-party scripts.

Server actions are protected against cross-site requests by Next.js (Origin/Host comparison). The only state-changing
route handlers are the Stripe webhook (signature), the maintenance job (bearer secret compared in constant time) and
the inbound email webhook (HTTP basic auth compared in constant time).

## Secrets

- Real credentials live only in the host's environment or in the gitignored `.env.local`. `.env.example` contains
  no secret values, and tests read even the local Supabase CLI keys from the environment.
- Only `NEXT_PUBLIC_*` values reach the browser, and none is secret. Server secrets are read through
  `serverEnv()` in modules that import `server-only`, which fails the build if a client component imports them.
  The production build output was searched for the configured secret values with no match (the only
  `sb_secret_` string in client code is supabase-js's own key-format check).

## Logging

Logs contain event types, error codes and identifiers, never amounts, file contents, product names, email contents,
passwords, tokens or keys. Analytics events (`product_events`) are first-party, have no cookies, and drop any property whose
name suggests money or personal data (`src/lib/analytics/track.ts`).

## Audit trail

`audit_events` records security-relevant actions with actor, organisation and target: store created, updated or
deleted; sample store created; import committed, undone or removed from history; data exported; checkout started;
billing portal opened. Members can read their organisation's events; nobody can modify them through the API.
Stripe events are kept in `billing_events`.

## Privacy (GDPR preparation)

- **Data minimisation:** imports send only mapped columns; no field asks for customer names, emails or addresses.
- **Export (access and portability):** Settings → Data → "Download all data" streams a JSON file with the profile,
  organisation, stores and every record (`/api/account/export`). Available even after the trial expires.
- **Deletion (erasure):** Settings → Data → "Delete account" cancels Stripe subscriptions, deletes the organisation
  (cascading to every record) and the login. Owners can also delete a single store.
- **Cookies:** only strictly necessary cookies (Supabase session, active store). No analytics or advertising
  cookies, so no consent banner is required for them under the ePrivacy rules; add one before introducing any
  non-essential tracker.
- **Processors** are listed in the privacy policy from `src/config/site.ts` (Supabase, Stripe, hosting provider,
  the auth email provider, the inbound email provider and Anthropic). Anthropic is listed even while
  `ANTHROPIC_API_KEY` is not set, with the purpose "only if you use this feature": the privacy policy is a
  prerendered page, so a list that depended on a server secret could silently omit a processor that is in use,
  whereas listing it early only over-informs.

### Sales received by email

Sellers may forward their own sale-notification emails to a private address (`<hash>+<token>@inbound.postmarkapp.com`);
Postmark posts each message to `/api/inbound/email`. Nothing is scraped and no platform account is accessed.

- **Address.** Each store has a random 32-character token (`stores.inbound_token`, 122 random bits). Members can read
  it to display the address; owners and admins can replace it (`regenerate_inbound_token`), which disables the old
  address at once. Anyone who knows an address can only create *pending* entries for that store: nothing is recorded
  as a sale until a member confirms it.
- **Endpoint.** HTTP basic auth (user `narixia`, password `INBOUND_WEBHOOK_SECRET`) compared in constant time, 5 MB
  body limit, unknown tokens answered like accepted messages (no enumeration), 120 messages per store per hour,
  idempotent per message id. Without configuration it answers 503 and the interface says "coming soon".
- **What is stored** (`inbound_emails`): received date, provider message id, the original sender's address, the
  subject, the detected platform, amount and item title, for Gmail confirmations the code and link, an excerpt of at
  most 2,000 characters with email addresses, phone numbers and postal-address lines removed, the status and the
  order it created. The full email, attachments and headers are not stored.
- **Retention.** The daily maintenance job deletes confirmed and dismissed emails after 30 days and pending ones after
  90 days. They are included in the account export and deleted with the store or account.
- **Processor.** Postmark (configurable name and region: `NEXT_PUBLIC_INBOUND_EMAIL_PROVIDER`,
  `NEXT_PUBLIC_INBOUND_EMAIL_REGION`) receives the emails, in the United States by default.

### Item photos and listings written with AI

- **On the device.** Photos are picked or taken in the browser, decoded and enhanced with Canvas 2D
  (`src/lib/photos`): levels, exposure, a clamped gray-world white balance, slight contrast and sharpening, square or
  original framing, 1,600 px JPEG. Only light, colour and framing change; nothing is removed or retouched, and the
  interface says so. Downloading or sharing a photo never leaves the device (Web Share hands it to the phone).
- **Stored.** One 480 px square JPEG thumbnail per item (about 30-60 KB, bucket limit 300 KB, JPEG or WebP sniffed
  from the bytes), uploaded by a server action with the user's session so the storage policies apply. Pages show it
  through signed URLs valid 15 minutes. Deleting an item deletes its file, deleting a store deletes its items' files,
  deleting the account deletes the organisation's whole folder (service role). The data export lists each thumbnail
  with its path and a download link valid one hour.
- **Sent to Anthropic only on request.** Nothing is sent unless `ANTHROPIC_API_KEY` is set and the seller presses
  « Créer l'annonce avec l'IA »; the button says that the photos go to Claude (Anthropic). The browser sends at most 3
  copies at 1,024 px (JPEG 0.8). The route (`/api/listing`) checks the session and write access, limits the body to
  5 MB and each image to 1.5 MB decoded, accepts only JPEG/PNG/WebP recognised from their magic bytes, rate-limits per
  user, then reserves one analysis atomically in the database before calling Claude, and gives it back if the call
  fails (refusal, truncated or unreadable answer, API error, cancellation). Neither the photos nor the generated text
  are stored or logged by Narixia; logs contain counts, token usage, stop reasons and the model only.
- **Honest output.** The prompt asks for what is visible only, uncertain attributes marked, no invented brand, size or
  material, visible defects mentioned. The answer is structured JSON validated with zod; the price is labelled
  « Estimation de l'IA, sans données de marché — à vérifier », and nothing is saved unless the seller saves the item.
- **Test mode.** `LISTING_AI_FAKE=1` returns a canned listing marked "test data" and is ignored when
  `NODE_ENV=production`; tests never call the real API.

These features prepare for GDPR compliance; they do not make the service compliant by themselves. See the legal
items in [LAUNCH.md](LAUNCH.md).

## Dependencies

`npm audit --omit=dev` reports **0** vulnerabilities in production dependencies (October 2026). The full audit
reports a high-severity advisory in `braces` (via `micromatch` → `fast-glob` → `@next/eslint-plugin-next`), used
only by the linter on the repository's own files; the only automatic fix downgrades `eslint-config-next` to 14.x,
so it is accepted until an upstream fix is released.

## Known gaps

- No multi-factor authentication and no CAPTCHA on sign-up or password reset (Supabase supports both: enable
  TOTP MFA and Turnstile/hCaptcha before scaling sign-ups).
- Leaked-password protection depends on the Supabase plan (HaveIBeenPwned check); enable it if available.
- The plan's history window (90 days on the trial) is enforced by the application, not by the database: a trial
  user calling the database API directly could read their own older data. Tenancy is not affected.
- No retention period is applied yet to `audit_events`, `product_events` and `billing_events`; define one and add it
  to the maintenance job.
- No automated malware scanning of uploads (import files are parsed as text in the browser and never stored; item
  thumbnails are re-encoded by the browser and checked by magic bytes and size, not scanned).
- Photos sent for an AI listing are processed by Anthropic in the United States under its API terms (no training on
  API data by default); Narixia does not control their retention there.
- A member can spend the organisation's monthly AI quota by calling the reservation function directly (it only
  counts; no analysis runs without the server). The quota is a cost cap, not a security boundary.
- No external penetration test.
- Forwarded emails pass through the inbound provider (Postmark, United States by default) before reaching Narixia;
  sellers forward them by choice, and the privacy policy lists the provider. The excerpt filter is heuristic: an
  unusual address format could survive in an excerpt until the 30/90-day purge.
