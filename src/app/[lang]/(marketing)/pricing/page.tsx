import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { PageIntro, Prose } from "@/components/marketing/prose";
import { PAYMENT_GRACE_DAYS, PLANS, planCopy, TRIAL_DAYS } from "@/config/plans";
import { createFormat } from "@/i18n/format";
import { publicAlternates } from "@/i18n/messages/marketing-common";
import { marketingPages } from "@/i18n/messages/marketing-pages";
import { getFormat, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = marketingPages[locale].pricing;
  const price = createFormat(locale).money(PLANS.pro.priceMinor, PLANS.pro.currency);
  return { title: m.metaTitle, description: m.metaDescription(TRIAL_DAYS, price), alternates: publicAlternates("/pricing", locale) };
}

export default async function PricingPage() {
  const locale = await getLocale();
  const f = await getFormat();
  const m = marketingPages[locale].pricing;
  const r = m.rows;
  const t = PLANS.trial.limits;
  const p = PLANS.pro.limits;
  const rows: { label: string; trial: string | boolean; pro: string | boolean }[] = [
    { label: r.stores, trial: String(t.stores), pro: String(p.stores) },
    { label: r.rowsPerImport, trial: f.count(t.importRowsPerFile), pro: f.count(p.importRowsPerFile) },
    { label: r.rowsPerMonth, trial: f.count(t.importRowsPerMonth), pro: f.count(p.importRowsPerMonth) },
    { label: r.history, trial: m.history(t.historyDays), pro: m.history(p.historyDays) },
    { label: r.dashboard, trial: true, pro: true },
    { label: r.views, trial: true, pro: true },
    { label: r.calculator, trial: true, pro: true },
    { label: r.manual, trial: true, pro: true },
    { label: r.reports, trial: t.exports, pro: p.exports },
    { label: r.exports, trial: t.exports, pro: p.exports },
    { label: r.filters, trial: t.advancedFilters, pro: p.advancedFilters },
    { label: r.gdpr, trial: true, pro: true },
  ];
  const cell = (v: string | boolean) =>
    typeof v === "boolean" ? (
      v ? (
        <Check className="mx-auto size-4 text-emerald-600" aria-label={m.included} />
      ) : (
        <Minus className="mx-auto size-4 text-ink-4" aria-label={m.notIncluded} />
      )
    ) : (
      <span className="tabular">{v}</span>
    );

  return (
    <>
      <PageIntro eyebrow={m.eyebrow} title={m.title}>
        <p>{m.intro(TRIAL_DAYS)}</p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <PricingCards locale={locale} />

        <div className="mt-16 max-w-4xl overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="px-5 pt-4 pb-2 text-left text-md font-semibold text-ink">{m.compare}</caption>
            <thead>
              <tr className="border-b border-line text-xs text-ink-3">
                <th scope="col" className="px-5 py-2.5 text-left font-medium">{m.feature}</th>
                <th scope="col" className="w-36 px-3 py-2.5 text-center font-medium">{planCopy("trial", locale).name}</th>
                <th scope="col" className="w-36 px-3 py-2.5 text-center font-medium">{planCopy("pro", locale).name}</th>
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
          <h2>{m.billingTitle}</h2>
          <h3>{m.faq.trialEndsQ}</h3>
          <p>{m.faq.trialEndsA}</p>
          <h3>{m.faq.duringTrialQ}</h3>
          <p>{m.faq.duringTrialA}</p>
          <h3>{m.faq.cancelQ}</h3>
          <p>{m.faq.cancelA}</p>
          <h3>{m.faq.failedQ}</h3>
          <p>{m.faq.failedA(PAYMENT_GRACE_DAYS)}</p>
          <h3>{m.faq.vatQ}</h3>
          <p>{m.faq.vatA}</p>
          <h3>{m.faq.processorQ}</h3>
          <p>{m.faq.processorA}</p>
        </Prose>
      </div>
    </>
  );
}
