import { Check, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutConfirmation, PortalButton, SubscribeButton } from "@/components/billing/billing-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PAYMENT_GRACE_DAYS, PLANS, TRIAL_DAYS } from "@/config/plans";
import { requireWorkspace, type ReadyWorkspace } from "@/lib/auth/workspace";
import { getBillingDetails, type BillingDetails } from "@/lib/data/billing";
import { formatDate } from "@/lib/dates";
import { serverEnv } from "@/lib/env";
import { formatMoney } from "@/lib/finance/money";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage({ searchParams }: PageProps<"/app/billing">) {
  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Your plan, payments and invoices. Payments are handled by Stripe; Narixia never sees or stores card details." />
      <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
        <Billing searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const day = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : null);

function StatusCard({ ws, billing }: { ws: ReadyWorkspace; billing: BillingDetails }) {
  const e = ws.entitlements;
  const sub = billing.subscription;
  let title: string;
  let body: string;
  let tone: "positive" | "info" | "caution" | "negative";
  if (e.access === "pro" && sub?.status === "trialing") {
    title = "Pro, first payment on " + (day(sub.trialEnd) ?? "the end of your trial");
    body = "Your subscription is set up. You will be charged for the first month when the trial period ends.";
    tone = "positive";
  } else if (e.access === "pro") {
    title = "Pro is active";
    body = sub?.cancelAtPeriodEnd || sub?.cancelAt
      ? `Your subscription ends on ${day(sub.cancelAt ?? sub.currentPeriodEnd) ?? "the end of the period"} and will not renew. You keep Pro until then.`
      : sub?.currentPeriodEnd
        ? `Renews on ${day(sub.currentPeriodEnd)}.`
        : "Thank you for subscribing.";
    tone = "positive";
  } else if (e.access === "grace") {
    title = "Your last payment failed";
    body = `You keep full access until ${day(e.graceEndsAt) ?? "the end of the grace period"} while Stripe retries the payment. Update your payment method to avoid interruption.`;
    tone = "caution";
  } else if (e.access === "trial") {
    title = `Free trial: ${e.trialDaysLeft === 0 ? "ends today" : `${e.trialDaysLeft} ${e.trialDaysLeft === 1 ? "day" : "days"} left`}`;
    body = `The trial ends on ${day(e.trialEndsAt) ?? "—"}. Nothing is charged automatically: after the trial, dashboards and imports pause until you subscribe, and your data is kept.`;
    tone = "info";
  } else {
    title = "Access is paused";
    body = "Your trial or subscription has ended. Your data is kept and can be exported from Settings. Subscribe to resume dashboards, reports and imports.";
    tone = "negative";
  }
  return (
    <Alert tone={tone} title={title}>
      {body}
    </Alert>
  );
}

async function Billing({ searchParams }: { searchParams: PageProps<"/app/billing">["searchParams"] }) {
  const [ws, sp] = await Promise.all([requireWorkspace(), searchParams]);
  const billing = await getBillingDetails(ws);
  const checkout = Array.isArray(sp.checkout) ? sp.checkout[0] : sp.checkout;
  const pro = PLANS.pro;
  const isOwner = ws.role === "owner";
  const e = ws.entitlements;
  const price = formatMoney(pro.priceMinor, pro.currency, { wholeUnits: pro.priceMinor % 100 === 0 });
  const canSubscribe = billing.configured && !billing.liveCheckoutBlocked && isOwner && (e.access === "trial" || e.access === "expired");
  const showPortal = billing.configured && isOwner && billing.hasCustomer;
  const taxNote = serverEnv().stripeAutomaticTax ? "VAT is calculated at checkout from your billing address." : "Prices exclude VAT where it applies.";

  return (
    <div className="space-y-6">
      {checkout === "success" ? <CheckoutConfirmation confirmed={e.access === "pro" || e.access === "grace"} /> : null}
      {checkout === "success" && (e.access === "pro" || e.access === "grace") ? (
        <Alert tone="positive" title="Subscription confirmed">
          Stripe has confirmed your subscription. Thank you.
        </Alert>
      ) : null}
      {checkout === "cancelled" ? <Alert tone="info">Checkout was cancelled. You have not been charged.</Alert> : null}
      {!billing.configured ? (
        <Alert tone="caution" title="Payments are not set up on this deployment">
          Stripe keys are not configured, so subscriptions cannot be started here and no payment can be taken. See docs/BILLING.md for the setup steps.
        </Alert>
      ) : billing.liveCheckoutBlocked ? (
        <Alert tone="caution" title="Live payments are not enabled yet">
          This deployment has live Stripe keys, but new subscriptions stay disabled until STRIPE_LIVE_ENABLED is set to true after the launch checklist in docs/BILLING.md.
        </Alert>
      ) : !billing.liveMode ? (
        <Alert tone="info" title="Stripe test mode">
          This deployment uses Stripe test keys: use Stripe&rsquo;s test cards. No real payment is taken.
        </Alert>
      ) : null}

      <StatusCard ws={ws} billing={billing} />

      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader title={`${pro.name} plan`} description={pro.description} />
          <CardBody className="space-y-5">
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tighter text-ink tabular">{price}</span>
              <span className="text-sm text-ink-3">per month · {taxNote}</span>
            </p>
            <ul className="space-y-2 text-sm text-ink-2">
              {pro.highlights.map((h) => (
                <li key={h} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              {canSubscribe ? (
                <SubscribeButton label={e.access === "trial" && (e.trialDaysLeft ?? 0) > 2 ? `Subscribe, first payment after the trial` : `Subscribe for ${price}/month`} />
              ) : null}
              {showPortal ? <PortalButton /> : null}
              {!isOwner ? <p className="text-sm text-ink-3">Only the account owner can change the plan or payment details.</p> : null}
            </div>
            {canSubscribe && e.access === "trial" && (e.trialDaysLeft ?? 0) > 2 ? (
              <p className="text-xs text-ink-3">
                Subscribing now keeps your remaining trial days: the first {price} charge happens when the trial ends on {day(e.trialEndsAt)}. Cancel before then and
                nothing is charged.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="How billing works" as="h2" />
          <CardBody>
            <ul className="space-y-3 text-sm text-ink-2">
              <li>
                <span className="font-medium text-ink">{TRIAL_DAYS}-day free trial, no card.</span> Nothing is charged unless you subscribe.
              </li>
              <li>
                <span className="font-medium text-ink">Monthly, cancel anytime.</span> Cancel in the billing portal; Pro stays active until the end of the paid month.
              </li>
              <li>
                <span className="font-medium text-ink">{PAYMENT_GRACE_DAYS} days of grace.</span> If a renewal payment fails, you keep access for {PAYMENT_GRACE_DAYS} days while Stripe
                retries.
              </li>
              <li>
                <span className="font-medium text-ink">Your data stays yours.</span> If access pauses, nothing is deleted; export or delete it from Settings at any time.
              </li>
              <li className="flex gap-2 text-ink-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                Card details are entered on Stripe&rsquo;s secure pages and never reach Narixia&rsquo;s servers.
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Invoices" description="Issued by Stripe for each payment." />
        {billing.invoicesUnavailable ? (
          <CardBody>
            <p className="text-sm text-ink-3">Invoices could not be loaded from Stripe right now. They are also available in the billing portal.</p>
          </CardBody>
        ) : billing.invoices.length === 0 ? (
          <CardBody>
            <p className="text-sm text-ink-3">No invoices yet.</p>
          </CardBody>
        ) : (
          <TableContainer className="mt-3">
            <Table>
              <caption className="sr-only">Invoices</caption>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Number</TH>
                  <TH>Status</TH>
                  <TH numeric>Amount</TH>
                  <TH numeric>Documents</TH>
                </TR>
              </THead>
              <TBody>
                {billing.invoices.map((i) => (
                  <TR key={i.id}>
                    <TD>{day(i.created)}</TD>
                    <TD className="text-ink-2">{i.number ?? "—"}</TD>
                    <TD>
                      <Badge tone={i.status === "paid" ? "positive" : i.status === "open" ? "caution" : "neutral"}>{i.status ?? "—"}</Badge>
                    </TD>
                    <TD numeric>{formatMoney(i.total, i.currency)}</TD>
                    <TD numeric>
                      <span className="inline-flex gap-3">
                        {i.hostedUrl ? (
                          <a href={i.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-emerald-700 hover:underline">
                            View
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
