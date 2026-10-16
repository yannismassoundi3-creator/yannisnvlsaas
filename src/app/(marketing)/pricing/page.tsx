import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { PageIntro, Prose } from "@/components/marketing/prose";
import { PAYMENT_GRACE_DAYS, PLANS, TRIAL_DAYS } from "@/config/plans";
import { formatCount } from "@/lib/finance/format";
import { formatMoney } from "@/lib/finance/money";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Start with a ${TRIAL_DAYS}-day free trial, no payment card required. Narixia Pro is ${formatMoney(PLANS.pro.priceMinor, PLANS.pro.currency)} per month.`,
  alternates: { canonical: "/pricing" },
};

function years(days: number) {
  return days >= 365 ? `${Math.round(days / 365)} years` : `${days} days`;
}

export default function PricingPage() {
  const t = PLANS.trial.limits;
  const p = PLANS.pro.limits;
  const rows: { label: string; trial: string | boolean; pro: string | boolean }[] = [
    { label: "Stores", trial: String(t.stores), pro: String(p.stores) },
    { label: "Rows per CSV import", trial: formatCount(t.importRowsPerFile), pro: formatCount(p.importRowsPerFile) },
    { label: "Imported rows per month", trial: formatCount(t.importRowsPerMonth), pro: formatCount(p.importRowsPerMonth) },
    { label: "History in dashboards and reports", trial: `Last ${years(t.historyDays)}`, pro: `Last ${years(p.historyDays)}` },
    { label: "Profit dashboard and insights", trial: true, pro: true },
    { label: "Products and advertising views", trial: true, pro: true },
    { label: "Profitability calculator", trial: true, pro: true },
    { label: "Manual entry and corrections", trial: true, pro: true },
    { label: "Downloadable reports (CSV and PDF)", trial: t.exports, pro: p.exports },
    { label: "CSV exports of products, orders and costs", trial: t.exports, pro: p.exports },
    { label: "Product and campaign filters", trial: t.advancedFilters, pro: p.advancedFilters },
    { label: "Full account data export (GDPR)", trial: true, pro: true },
  ];
  const cell = (v: string | boolean) =>
    typeof v === "boolean" ? (
      v ? (
        <Check className="mx-auto size-4 text-emerald-600" aria-label="Included" />
      ) : (
        <Minus className="mx-auto size-4 text-ink-4" aria-label="Not included" />
      )
    ) : (
      <span className="tabular">{v}</span>
    );

  return (
    <>
      <PageIntro eyebrow="Pricing" title="Pricing that fits a small store">
        <p>Try the core product free for {TRIAL_DAYS} days. No payment card, no automatic charge.</p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <PricingCards />

        <div className="mt-16 max-w-4xl overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="px-5 pt-4 pb-2 text-left text-md font-semibold text-ink">Compare plans</caption>
            <thead>
              <tr className="border-b border-line text-xs text-ink-3">
                <th scope="col" className="px-5 py-2.5 text-left font-medium">Feature</th>
                <th scope="col" className="w-36 px-3 py-2.5 text-center font-medium">Free trial</th>
                <th scope="col" className="w-36 px-3 py-2.5 text-center font-medium">Pro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-line last:border-0">
                  <th scope="row" className="px-5 py-3 text-left font-normal text-ink">
                    {r.label}
                  </th>
                  <td className="px-3 py-3 text-center text-ink-2">{cell(r.trial)}</td>
                  <td className="px-3 py-3 text-center text-ink">{cell(r.pro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Prose className="mt-16">
          <h2>Billing questions</h2>
          <h3>What happens when my trial ends?</h3>
          <p>
            Nothing is charged. Your data stays in place and you can still sign in to export it, change your settings or
            subscribe. Dashboards, imports and reports are paused until you subscribe to Pro.
          </p>
          <h3>Can I subscribe during my trial?</h3>
          <p>
            Yes. If more than two days of your trial remain, your first payment is taken when the trial ends; otherwise
            billing starts immediately. The checkout page shows the exact date before you confirm.
          </p>
          <h3>How do I cancel?</h3>
          <p>
            From the billing page, open the billing portal and cancel. Your subscription stays active until the end of
            the period you have paid for, then does not renew.
          </p>
          <h3>What if a payment fails?</h3>
          <p>
            We keep your access for {PAYMENT_GRACE_DAYS} days while the payment provider retries the payment and you
            update your payment method. You are notified in the app.
          </p>
          <h3>Do prices include VAT?</h3>
          <p>
            Prices are shown excluding VAT. Depending on your country and whether you provide a VAT number, VAT may be
            added at checkout. Your invoice shows the breakdown.
          </p>
          <h3>Who processes payments?</h3>
          <p>
            Payments are processed by Stripe. Narixia never receives or stores your full card details.
          </p>
        </Prose>
      </div>
    </>
  );
}
