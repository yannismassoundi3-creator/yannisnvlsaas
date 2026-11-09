import { Check, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutConfirmation, PortalButton, SubscribeButton } from "@/components/billing/billing-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FREE_STOCK_ITEMS, PAYMENT_GRACE_DAYS, PLANS, planCopy, TRIAL_DAYS, type FeatureAvailability, type PaidPlanId } from "@/config/plans";
import type { Locale } from "@/i18n/config";
import type { Format } from "@/i18n/format";
import { billingMessages } from "@/i18n/messages/account-billing";
import { getFormat, getLocale } from "@/i18n/server";
import { requireWorkspace, type ReadyWorkspace } from "@/lib/auth/workspace";
import { isResellerOnly, offersFor } from "@/lib/billing/entitlements";
import { getBillingDetails, type BillingDetails } from "@/lib/data/billing";
import { countStockPieces } from "@/lib/data/reseller";
import { isResellerCheckoutConfigured, serverEnv } from "@/lib/env";
import { featureAvailability } from "@/lib/features";

export async function generateMetadata(): Promise<Metadata> {
  return { title: billingMessages[await getLocale()].metaTitle };
}

export default async function BillingPage({ searchParams }: PageProps<"/[lang]/app/billing">) {
  const t = billingMessages[await getLocale()];
  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />
      <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
        <Billing searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const dayFormatter = (f: Format) => (iso: string | null) => (iso ? f.date(iso.slice(0, 10)) : null);

function StatusCard({ ws, billing, locale, f, stockPieces }: { ws: ReadyWorkspace; billing: BillingDetails; locale: Locale; f: Format; stockPieces: number | null }) {
  const t = billingMessages[locale].status;
  const day = dayFormatter(f);
  const e = ws.entitlements;
  const sub = billing.subscription;
  const planName = planCopy(e.paidPlan ?? "pro", locale).name;
  let title: string;
  let body: string;
  let tone: "positive" | "info" | "caution" | "negative";
  if (e.access === "pro" && sub?.status === "trialing") {
    title = t.trialingTitle(planName, day(sub.trialEnd));
    body = t.trialingBody;
    tone = "positive";
  } else if (e.access === "pro") {
    title = t.activeTitle(planName);
    body = sub?.cancelAtPeriodEnd || sub?.cancelAt
      ? t.endsBody(day(sub.cancelAt ?? sub.currentPeriodEnd))
      : sub?.currentPeriodEnd
        ? t.renewsBody(day(sub.currentPeriodEnd))
        : t.thanksBody;
    tone = "positive";
  } else if (e.access === "grace") {
    title = t.graceTitle;
    body = t.graceBody(day(e.graceEndsAt));
    tone = "caution";
  } else if (e.access === "trial") {
    title = t.trialTitle(e.trialDaysLeft);
    // The free plan exists once the database has the reseller plans migration.
    body = e.resellerPlans && isResellerOnly(ws.stores) ? t.trialBodyReseller(day(e.trialEndsAt), FREE_STOCK_ITEMS) : t.trialBody(day(e.trialEndsAt));
    tone = "info";
  } else if (e.access === "free") {
    const limit = e.stockLimit ?? FREE_STOCK_ITEMS;
    title = t.freeTitle;
    body = t.freeBody(stockPieces, limit);
    tone = stockPieces !== null && stockPieces >= limit ? "caution" : "info";
  } else {
    title = t.pausedTitle;
    body = t.pausedBody;
    tone = "negative";
  }
  return (
    <Alert tone={tone} title={title}>
      {body}
    </Alert>
  );
}

/** One paid offer: price, what it includes and, when it can be chosen, the subscribe button. */
function OfferCard({
  planId,
  locale,
  f,
  features,
  taxNote,
  badge,
  highlighted,
  children,
}: {
  planId: PaidPlanId;
  locale: Locale;
  f: Format;
  features: FeatureAvailability;
  taxNote: string;
  badge?: React.ReactNode;
  highlighted?: boolean;
  children?: React.ReactNode;
}) {
  const t = billingMessages[locale];
  const plan = PLANS[planId];
  const copy = planCopy(planId, locale, features);
  const price = f.money(plan.priceMinor, plan.currency, { wholeUnits: plan.priceMinor % 100 === 0 });
  return (
    <Card aria-labelledby={`offer-${planId}`} className={highlighted ? "border-emerald-600 ring-1 ring-emerald-600" : undefined}>
      <CardHeader id={`offer-${planId}`} title={t.planTitle(copy.name)} description={copy.description} actions={badge} />
      <CardBody className="space-y-5">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tighter text-ink tabular">{price}</span>
          <span className="text-sm text-ink-3">{t.perMonth(taxNote)}</span>
        </p>
        <ul className="space-y-2 text-sm text-ink-2">
          {copy.highlights.map((h) => (
            <li key={h} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              {h}
            </li>
          ))}
        </ul>
        {children}
      </CardBody>
    </Card>
  );
}

async function Billing({ searchParams }: { searchParams: PageProps<"/[lang]/app/billing">["searchParams"] }) {
  const [ws, sp, locale, f] = await Promise.all([requireWorkspace(), searchParams, getLocale(), getFormat()]);
  const t = billingMessages[locale];
  const day = dayFormatter(f);
  const e = ws.entitlements;
  const [billing, stockPieces] = await Promise.all([getBillingDetails(ws), e.access === "free" ? countStockPieces(ws.stores) : null]);
  const checkout = Array.isArray(sp.checkout) ? sp.checkout[0] : sp.checkout;
  const isOwner = ws.role === "owner";
  const features = featureAvailability();
  // Reseller-only workspaces see Revendeur first and Pro as an option; online stores see Pro.
  const offers = offersFor(ws.stores);
  const subscribed = e.access === "pro" || e.access === "grace";
  const canSubscribe = billing.configured && !billing.liveCheckoutBlocked && isOwner && !subscribed;
  // Never charge the Pro price for a Revendeur click: without its own price (or the database plans), the offer is "coming soon".
  const resellerReady = isResellerCheckoutConfigured() && e.resellerPlans;
  const afterTrial = e.access === "trial" && (e.trialDaysLeft ?? 0) > 2;
  const showPortal = billing.configured && isOwner && billing.hasCustomer;
  const taxNote = serverEnv().stripeAutomaticTax ? t.taxAutomatic : t.taxExcluded;
  const priceOf = (planId: PaidPlanId) => f.money(PLANS[planId].priceMinor, PLANS[planId].currency, { wholeUnits: PLANS[planId].priceMinor % 100 === 0 });

  const action = (planId: PaidPlanId, primary: boolean) => {
    const name = planCopy(planId, locale).name;
    const price = priceOf(planId);
    if (subscribed) {
      return e.paidPlan === planId ? <Badge tone="positive">{t.currentPlan}</Badge> : null;
    }
    if (planId === "reseller" && !resellerReady) {
      return (
        <div className="space-y-2">
          <Button size="lg" variant="secondary" disabled aria-describedby="reseller-soon">
            {t.comingSoon}
          </Button>
          <p id="reseller-soon" className="text-xs text-ink-3">
            {t.resellerSoon}
          </p>
        </div>
      );
    }
    if (!canSubscribe) return null;
    return (
      <div className="space-y-2">
        <SubscribeButton plan={planId} variant={primary ? "accent" : "secondary"} label={afterTrial ? t.subscribeAfterTrial(name) : t.subscribeFor(name, price)} />
        {afterTrial ? <p className="text-xs text-ink-3">{t.keepTrialDays(price, day(e.trialEndsAt))}</p> : null}
      </div>
    );
  };

  const how = (
    <Card>
      <CardHeader title={t.howTitle} as="h2" />
      <CardBody>
        <ul className="space-y-3 text-sm text-ink-2">
          <li>
            <span className="font-medium text-ink">{t.howTrial(TRIAL_DAYS)}</span> {t.howTrialBody}
          </li>
          {e.resellerPlans && offers.includes("reseller") ? (
            <li>
              <span className="font-medium text-ink">{t.howFree}</span> {t.howFreeBody(FREE_STOCK_ITEMS)}
            </li>
          ) : null}
          <li>
            <span className="font-medium text-ink">{t.howMonthly}</span> {t.howMonthlyBody}
          </li>
          <li>
            <span className="font-medium text-ink">{t.howGrace(PAYMENT_GRACE_DAYS)}</span> {t.howGraceBody(PAYMENT_GRACE_DAYS)}
          </li>
          <li>
            <span className="font-medium text-ink">{t.howData}</span> {t.howDataBody}
          </li>
          <li className="flex gap-2 text-ink-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t.howCards}
          </li>
        </ul>
      </CardBody>
    </Card>
  );
  const accountControls =
    showPortal || !isOwner ? (
      <div className="flex flex-wrap items-center gap-3">
        {showPortal ? <PortalButton /> : null}
        {!isOwner ? <p className="text-sm text-ink-3">{t.ownerOnly}</p> : null}
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      {checkout === "success" ? <CheckoutConfirmation confirmed={subscribed} /> : null}
      {checkout === "success" && subscribed ? (
        <Alert tone="positive" title={t.confirmedTitle}>
          {t.confirmedBody}
        </Alert>
      ) : null}
      {checkout === "cancelled" ? <Alert tone="info">{t.cancelled}</Alert> : null}
      {!billing.configured ? (
        <Alert tone="caution" title={t.notConfiguredTitle}>
          {t.notConfiguredBody}
        </Alert>
      ) : billing.liveCheckoutBlocked ? (
        <Alert tone="caution" title={t.liveBlockedTitle}>
          {t.liveBlockedBody}
        </Alert>
      ) : !billing.liveMode ? (
        <Alert tone="info" title={t.testModeTitle}>
          {t.testModeBody}
        </Alert>
      ) : null}

      <StatusCard ws={ws} billing={billing} locale={locale} f={f} stockPieces={stockPieces} />
      {accountControls}

      {offers.length > 1 ? (
        <>
          <section aria-labelledby="offers-heading" className="space-y-3">
            <h2 id="offers-heading" className="text-md font-semibold tracking-tight text-ink">
              {t.offersTitle}
            </h2>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <OfferCard planId="reseller" locale={locale} f={f} features={features} taxNote={taxNote} highlighted badge={<Badge tone="positive">{t.recommended}</Badge>}>
                {action("reseller", true)}
              </OfferCard>
              <OfferCard planId="pro" locale={locale} f={f} features={features} taxNote={taxNote}>
                {action("pro", false)}
              </OfferCard>
            </div>
          </section>
          {how}
        </>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
          <OfferCard planId="pro" locale={locale} f={f} features={features} taxNote={taxNote}>
            {action("pro", true)}
          </OfferCard>
          {how}
        </div>
      )}

      <Card>
        <CardHeader title={t.invoicesTitle} description={t.invoicesDescription} />
        {billing.invoicesUnavailable ? (
          <CardBody>
            <p className="text-sm text-ink-3">{t.invoicesUnavailable}</p>
          </CardBody>
        ) : billing.invoices.length === 0 ? (
          <CardBody>
            <p className="text-sm text-ink-3">{t.noInvoices}</p>
          </CardBody>
        ) : (
          <TableContainer className="mt-3">
            <Table>
              <caption className="sr-only">{t.invoicesTitle}</caption>
              <THead>
                <TR>
                  <TH>{t.colDate}</TH>
                  <TH>{t.colNumber}</TH>
                  <TH>{t.colStatus}</TH>
                  <TH numeric>{t.colAmount}</TH>
                  <TH numeric>{t.colDocuments}</TH>
                </TR>
              </THead>
              <TBody>
                {billing.invoices.map((i) => (
                  <TR key={i.id}>
                    <TD>{day(i.created)}</TD>
                    <TD className="text-ink-2">{i.number ?? "—"}</TD>
                    <TD>
                      <Badge tone={i.status === "paid" ? "positive" : i.status === "open" ? "caution" : "neutral"}>{i.status ? (t.invoiceStatus[i.status] ?? i.status) : "—"}</Badge>
                    </TD>
                    <TD numeric>{f.money(i.total, i.currency)}</TD>
                    <TD numeric>
                      <span className="inline-flex gap-3">
                        {i.hostedUrl ? (
                          <a href={i.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-emerald-700 hover:underline">
                            {t.view}
                          </a>
                        ) : null}
                        {i.pdfUrl ? (
                          <a href={i.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-emerald-700 hover:underline">
                            PDF
                          </a>
                        ) : null}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </div>
  );
}
