**English** · [Français](fr/DEPLOYMENT.md)

# Deployment and operations

The reference deployment is **Vercel** (application and daily cron) with a **hosted Supabase project** and
**Stripe**. Any Node.js host that runs `next start` works if you provide an HTTPS endpoint, the environment variables
and a daily scheduler for the maintenance job.

Requirements: Node.js 20.9 or later (developed on Node 22), npm, the Supabase CLI (installed as a dev dependency, run
with `npx supabase`), and the Stripe CLI for local webhook testing.

## 1. Supabase

1. Create a project in an EU region if your customers are in Europe (the region is published in the privacy policy
   through `NEXT_PUBLIC_DATA_REGION`). Choose a strong database password and store it in a password manager.
2. Apply the migrations from your machine:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push          # applies supabase/migrations in order
   ```
3. **API keys** (Project Settings → API Keys): copy the publishable key to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   create a secret key for `SUPABASE_SECRET_KEY`, and copy the project URL to `NEXT_PUBLIC_SUPABASE_URL`. Prefer the
   asymmetric JWT signing keys (Project Settings → JWT Keys) so sessions are verified without a network call.
4. **Authentication → URL configuration:** Site URL `https://<your-domain>`; redirect URLs `https://<your-domain>/**`
   (add preview URLs only if you test auth on previews).
5. **Authentication → Providers → Email:** enable email sign-up, require email confirmation, enable secure email
   change, minimum password length 10, "letters and digits" required. Enable leaked-password protection if your plan
   offers it.
6. **Emails:** configure a custom SMTP provider (Authentication → Emails → SMTP). Supabase's built-in sender is for
   testing only and is heavily rate-limited. Then paste the three templates from `supabase/templates` into
   Authentication → Email Templates with these subjects:
   | Template | Subject | File |
   | --- | --- | --- |
   | Confirm signup | Confirm your Narixia account | `confirmation.html` |
   | Reset password | Reset your Narixia password | `recovery.html` |
   | Change email address | Confirm your new email address | `email_change.html` |
   The templates link to `{{ .SiteURL }}/auth/confirm?token_hash=…`, which verifies the token on the server.
7. **Authentication → Rate limits:** keep or tighten the defaults (sign-ups/sign-ins per IP, emails per hour).
   Consider enabling CAPTCHA (Turnstile) under Authentication → Attack Protection.
8. **Data API:** keep the exposed schemas to `public` and `graphql_public`, and max rows at 1,000.

## 2. Vercel

1. Import the GitHub repository (framework preset: Next.js; build command `npm run build`).
2. Set the environment variables from `.env.example` for **Production** (and Preview if you use it, ideally with a
   separate Supabase project and Stripe test keys). `NEXT_PUBLIC_*` values are inlined at build time: redeploy after
   changing them.
3. Choose a function region close to the Supabase region (e.g. Paris or Frankfurt for an EU project).
4. Add your domain and set `NEXT_PUBLIC_SITE_URL` to `https://<your-domain>`. HSTS and `upgrade-insecure-requests`
   are sent automatically on HTTPS.
5. **Cron:** `vercel.json` schedules `GET /api/cron/maintenance` daily at 03:17 UTC. Set `CRON_SECRET` (e.g.
   `openssl rand -hex 32`); Vercel sends it as a bearer token. The job prunes expired rate-limit windows and deletes
   staged rows of uploads abandoned for more than two days. On another host, call the endpoint daily with
   `Authorization: Bearer $CRON_SECRET`.

## 3. Stripe

Follow [BILLING.md](BILLING.md): product and price, customer portal, webhook endpoint
`https://<your-domain>/api/stripe/webhook`, and the launch checklist before live payments.

## 4. Smoke test after each production deployment

1. `/`, `/pricing`, `/privacy` load; response headers include `content-security-policy` and
   `strict-transport-security`.
2. Sign up with a real inbox, confirm the email, complete onboarding, create the sample store.
3. Import `tests/e2e/fixtures/shopify-orders.csv` into the real store, confirm, check the overview, undo the import.
4. Billing shows the expected price and mode (test or live) and opens Checkout.
5. `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/maintenance` returns `{"ok":true,…}`.
6. Delete the test account from Settings → Data.

## Database migrations

- Migrations live in `supabase/migrations` and are applied in filename order. Never edit a migration that has been
  applied to production; add a new one: `npx supabase migration new <name>`.
- Test locally before pushing: `npm run db:reset` (recreates the local database from all migrations), then
  `npm run test:db`, then `npm run db:types` to regenerate `src/lib/supabase/database.types.ts`.
- Deploy order for a breaking schema change: ship a migration that is compatible with the current code, deploy the
  code, then remove what is no longer used in a later migration.
- `npx supabase db push` refuses to run if the remote history diverges from the local files; investigate with
  `npx supabase migration list` instead of forcing it.

## Backups and recovery

**What must be protected:** the Postgres database (business data, `auth` users, billing state, audit trail). The
application itself is stateless and can be redeployed from Git. Uploaded files are never stored.

**Backups**

- Supabase takes daily backups on paid plans (retention depends on the plan) and offers Point-in-Time Recovery as an
  add-on. Check what your plan includes; the free plan is not suitable for customer data.
- Keep an independent logical backup as well, e.g. a scheduled job (GitHub Actions or a small server) running
  ```bash
  npx supabase db dump --db-url "$PRODUCTION_DB_URL" -f roles.sql --role-only
  npx supabase db dump --db-url "$PRODUCTION_DB_URL" -f schema.sql
  npx supabase db dump --db-url "$PRODUCTION_DB_URL" -f data.sql --use-copy --data-only
  ```
  and storing the files encrypted (e.g. `age` or GPG) in storage you control, with a retention policy that matches
  your privacy policy. Restrict who can read them: they contain customer financial data.
- Suggested targets for a small SaaS: recovery point within 24 hours (minutes with PITR), recovery time within a day.

**Restoring**

1. Restore into a **new** project (or use PITR to a timestamp) rather than overwriting the only copy.
2. Point `NEXT_PUBLIC_SUPABASE_URL`, the API keys and auth settings at the restored project if it is new, then
   redeploy.
3. Billing may be behind Stripe after a restore to an earlier point: resend the webhook events since that point from
   the Stripe Dashboard (Developers → Events). Processing is idempotent and stale events are ignored.
4. Accounts deleted after the backup point reappear in a restore: re-run those deletions (keep a record of deletion
   requests outside the database, e.g. in your support inbox) before reopening the service.
5. Test a restore at least every quarter, including signing in and opening a dashboard on the restored data.

## Operations

**Where to look**

| Signal | Where |
| --- | --- |
| Application errors | Vercel → Logs (messages are prefixed, e.g. `[stripe-webhook]`, `[imports]`, `[reports]`) |
| Database, auth and API errors | Supabase → Logs |
| Webhook delivery failures | Stripe → Developers → Webhooks → endpoint; and the query below |
| Cron runs | Vercel → Cron Jobs |

**Useful queries** (SQL editor, as an administrator):

```sql
-- Stripe events that failed processing (Stripe retries them; investigate the error)
select id, type, error, received_at from public.billing_events where status = 'failed' order by received_at desc;

-- Imports stuck while committing for more than an hour (the user can resume them from the import page)
select id, organization_id, kind, updated_at from public.import_jobs
where status = 'committing' and updated_at < now() - interval '1 hour';

-- Product funnel over the last 30 days
select event, count(*) from public.product_events where created_at > now() - interval '30 days' group by event order by 2 desc;
```

**Rotating credentials** (after a suspected leak, or when someone with access leaves): create a new Supabase
secret key and revoke the old one; roll the Stripe secret key and the webhook signing secret; generate a new
`CRON_SECRET`. Update the host's environment and redeploy. Sessions are not affected by these rotations.

**Requests from users:** account export and deletion are self-service in Settings → Data. For a request received
by email, verify the requester controls the account's email address before acting.
