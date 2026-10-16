import { Check, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutConfirmation, PortalButton, SubscribeButton } from "@/components/billing/billing-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PAYMENT_GRACE_DAYS, PLANS, planCopy, TRIAL_DAYS } from "@/config/plans";
import type { Locale } from "@/i18n/config";
import type { Format } from "@/i18n/format";
import { billingMessages } from "@/i18n/messages/account-billing";
import { getFormat, getLocale } from "@/i18n/server";
import { requireWorkspace, type ReadyWorkspace } from "@/lib/auth/workspace";
import { getBillingDetails, type BillingDetails } from "@/lib/data/billing";
import { serverEnv } from "@/lib/env";

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

function StatusCard({ ws, billing, locale, f }: { ws: ReadyWorkspace; billing: BillingDetails; locale: Locale; f: Format }) {
  const t = billingMessages[locale].status;
  const day = dayFormatter(f);
  const e = ws.entitlements;
  const sub = billing.subscription;
  let title: string;
  let body: string;
  let tone: "positive" | "info" | "caution" | "negative";
  if (e.access === "pro" && sub?.status === "trialing") {
    title = t.trialingTitle(day(sub.trialEnd));
    body = t.trialingBody;
    tone = "positive";
  } else if (e.access === "pro") {
    title = t.activeTitle;
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
    body = t.trialBody(day(e.trialEndsAt));
    tone = "info";
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

async function Billing({ searchParams }: { searchParams: PageProps<"/[lang]/app/billing">["searchParams"] }) {
  const [ws, sp, locale, f] = await Promise.all([requireWorkspace(), searchParams, getLocale(), getFormat()]);
  const t = billingMessages[locale];
  const day = dayFormatter(f);
  const billing = await getBillingDetails(ws);
  const checkout = Array.isArray(sp.checkout) ? sp.checkout[0] : sp.checkout;
  const pro = PLANS.pro;
  const proCopy = planCopy("pro", locale);
  const isOwner = ws.role === "owner";
  const e = ws.entitlements;
  const price = f.money(pro.priceMinor, pro.currency, { wholeUnits: pro.priceMinor % 100 === 0 });
  const canSubscribe = billing.configured && !billing.liveCheckoutBlocked && isOwner && (e.access === "trial" || e.access === "expired");
  const showPortal = billing.configured && isOwner && billing.hasCustomer;
  const taxNote = serverEnv().stripeAutomaticTax ? t.taxAutomatic : t.taxExcluded;

  return (
    <div className="space-y-6">
      {checkout === "success" ? <CheckoutConfirmation confirmed={e.access === "pro" || e.access === "grace"} /> : null}
      {checkout === "success" && (e.access === "pro" || e.access === "grace") ? (
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

      <StatusCard ws={ws} billing={billing} locale={locale} f={f} />

      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader title={t.planTitle(proCopy.name)} description={proCopy.description} />
          <CardBody className="space-y-5">
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tighter text-ink tabular">{price}</span>
              <span className="text-sm text-ink-3">{t.perMonth(taxNote)}</span>
            </p>
            <ul className="space-y-2 text-sm text-ink-2">
              {proCopy.highlights.map((h) => (
                <li key={h} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              {canSubscribe ? (
                <SubscribeButton label={e.access === "trial" && (e.trialDaysLeft ?? 0) > 2 ? t.subscribeAfterTrial : t.subscribeFor(price)} />
              ) : null}
              {showPortal ? <PortalButton /> : null}
              {!isOwner ? <p className="text-sm text-ink-3">{t.ownerOnly}</p> : null}
            </div>
            {canSubscribe && e.access === "trial" && (e.trialDaysLeft ?? 0) > 2 ? (
              <p className="text-xs text-ink-3">{t.keepTrialDays(price, day(e.trialEndsAt))}</p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t.howTitle} as="h2" />
          <CardBody>
            <ul className="space-y-3 text-sm text-ink-2">
              <li>
                <span className="font-medium text-ink">{t.howTrial(TRIAL_DAYS)}</span> {t.howTrialBody}
              </li>
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
      </div>

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
