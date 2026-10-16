**English** · [Français](fr/LAUNCH.md)

# Launch checklist, limitations and what is not built yet

## Launch checklist

Work through these in order. Items marked **(legal)** need a qualified professional; this repository cannot settle
them.

### Eligibility and company

- [ ] **(legal)** The person operating the service is of legal age and has the capacity to contract (18 in most
      countries). Otherwise an adult or a company represented by an adult must hold the accounts (Stripe, Supabase,
      Vercel, domain) and sign the contracts. See "Before accepting real payments" in [BILLING.md](BILLING.md).
- [ ] **(legal)** A registered business able to sell subscriptions (e.g. micro-entreprise or company in France), with
      a bank account in its name.
- [ ] Company details set: `NEXT_PUBLIC_COMPANY_LEGAL_NAME`, `…_ADDRESS`, `…_REGISTRATION`, `…_COUNTRY`,
      `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_PRIVACY_EMAIL`. Until then the legal pages say the details are not
      configured.

### Legal and privacy

- [ ] **(legal)** Terms of service, privacy policy and legal notice (`/terms`, `/privacy`, `/legal`) reviewed and
      adapted by a lawyer. They are drafts written for this product, not legal advice. Update
      `legalLastUpdated` in `src/config/site.ts` when they change.
- [ ] **(legal)** Data processing agreements accepted with Supabase, Stripe and the host (all three offer standard
      DPAs); processors and regions in `src/config/site.ts` match the real deployment.
- [ ] **(legal)** Narixia acts as a processor for the store data merchants upload and as a controller for account
      data: offer a DPA to business customers who ask for one.
- [ ] Records of processing activities written; retention periods decided (accounts, audit and analytics events,
      backups) and implemented in the maintenance job.
- [ ] Only strictly necessary cookies are used today, so no consent banner is required. Re-check before adding any
      analytics, chat or advertising script.
- [ ] **(legal)** VAT position confirmed (franchise threshold or registration, OSS for EU consumers, reverse charge for
      businesses) and invoice mentions configured in Stripe.
- [ ] **(legal)** Consumer withdrawal right handled if you accept consumers (EU: 14 days for digital services unless
      waived when the service starts).

### Infrastructure

- [ ] Supabase project on a paid plan with backups (PITR recommended), EU region, custom SMTP, email templates, auth
      settings and rate limits as in [DEPLOYMENT.md](DEPLOYMENT.md).
- [ ] Vercel production environment variables, domain with HTTPS, cron with `CRON_SECRET`.
- [ ] Independent encrypted database backup scheduled, and one restore tested.
- [ ] CAPTCHA and leaked-password protection enabled in Supabase Auth; MFA considered for your own admin accounts
      (Supabase, Stripe, Vercel, GitHub, domain registrar, email).
- [ ] Error alerting: at minimum, Vercel and Supabase notifications by email; optionally an error tracker.

### Payments

- [ ] Stripe account verified (identity, business, bank account), product and price created in live mode.
- [ ] Test-mode end-to-end run on the production deployment ([BILLING.md](BILLING.md)), then live keys,
      live webhook, `STRIPE_LIVE_ENABLED=true`, one real purchase and refund.
- [ ] Displayed price (`NEXT_PUBLIC_PRO_PRICE_MINOR`) equals the Stripe Price; "VAT included/excluded" wording
      matches your tax setup.

### Product

- [ ] Smoke test from [DEPLOYMENT.md](DEPLOYMENT.md) passes on production.
- [ ] `npm run check`, `npm run test:db`, `npm run test:e2e` and `npm run build` green on the release commit.
- [ ] Support inbox monitored; in-app feedback read regularly
      (`select * from public.feedback order by created_at desc`).

## Known limitations

**Data and calculations**

- CSV import and manual entry only: no live connection to Shopify or advertising platforms yet.
- One currency per store and no currency conversion; multi-currency businesses need one store per currency.
- Orders with several VAT rates are split between lines approximately (order totals are exact).
- Narixia measures sales when orders are placed. It does not model payouts, chargebacks, currency-conversion fees or
  cash flow, and does not calculate net profit.
- Advertising reaches product margins only through campaigns linked by hand to one product; there is no pixel, UTM
  or order-level attribution.
- Edits are not versioned: only imports can be undone, and only the latest one per store.
- Files must be CSV (no XLSX), up to 25 MB, parsed in the browser's memory.

**Product**

- English interface only (dates in British format); import headers are also recognised in French.
- No team invitations yet: the database supports organisations with several members and roles, but there is no
  interface to invite someone.
- Trial-ending and payment-failure notices are in-app banners; Narixia sends no emails besides Supabase's
  authentication emails (Stripe can send billing emails if enabled).
- Product analytics events are stored but there is no admin dashboard; use SQL.
- No admin back office: support tasks use the Supabase and Stripe dashboards.

**Security and operations** — see "Known gaps" in [SECURITY.md](SECURITY.md): no MFA or CAPTCHA yet, the plan's
history window is enforced in the application layer, no retention policy for event tables, no external audit.

## Incomplete or unverified

| Item | Status | What remains |
| --- | --- | --- |
| Stripe billing | Implemented, unit- and database-tested with real signatures | Run against a real Stripe test account, then live (needs credentials and account verification) |
| Transactional email | Templates written, tested with the local inbox | Custom SMTP on the hosted project and a deliverability check (SPF, DKIM, DMARC on your domain) |
| Legal pages | Drafts with configurable company details | Legal review, company details, DPAs |
| Production deployment | Production build and a local production run tested | Hosted Supabase project, Vercel project, domain, cron secret |
| Backups | Procedure documented | Paid Supabase plan or scheduled dumps, and a tested restore |
| Platform integrations | Data model ready (`source`, `import_job_id`, store platform) | Shopify, Meta and Google Ads connectors |

## Phase 7: next features, only when users ask for them

The brief asks for features justified by real feedback. There is no user feedback yet, so none was built. Candidates,
with the signal that would justify each:

| Candidate | Build it when |
| --- | --- |
| Shopify connection (orders, products, costs) | Several trial users import Shopify CSVs more than once a week |
| Meta / Google Ads connection | Users link campaigns to products and re-import ad spend regularly |
| Team invitations | Users ask to share access with a partner, accountant or employee |
| Email reminders (trial end, failed payment, weekly summary) | Trials expire without users noticing, or users ask for a summary |
| Saved report schedules | Pro users download the same report every month |
| Multi-currency stores | Users run one shop in several currencies |
| French interface | A meaningful share of sign-ups are French-speaking |

Collect the signal with the in-app feedback form, the funnel in `product_events` (registration → onboarding → first
import → first dashboard result → checkout), and conversations with the first users.
