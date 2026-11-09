import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { PageIntro, Prose } from "@/components/marketing/prose";
import { FREE_STOCK_ITEMS, PAYMENT_GRACE_DAYS, PLANS, planCopy, TRIAL_DAYS } from "@/config/plans";
import { createFormat } from "@/i18n/format";
import { publicAlternates } from "@/i18n/messages/marketing-common";
import { marketingPages } from "@/i18n/messages/marketing-pages";
import { getFormat, getLocale } from "@/i18n/server";
import { featureAvailability } from "@/lib/features";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = marketingPages[locale].pricing;
  const f = createFormat(locale);
  const resellerPrice = f.money(PLANS.reseller.priceMinor, PLANS.reseller.currency);
  const proPrice = f.money(PLANS.pro.priceMinor, PLANS.pro.currency, { wholeUnits: PLANS.pro.priceMinor % 100 === 0 });
  return { title: m.metaTitle, description: m.metaDescription(TRIAL_DAYS, resellerPrice, proPrice, FREE_STOCK_ITEMS), alternates: publicAlternates("/pricing", locale) };
}

type Cell = string | boolean;

export default async function PricingPage() {
  const locale = await getLocale();
  const f = await getFormat();
  const m = marketingPages[locale].pricing;
  const r = m.rows;
  const c = m.cells;
  // Prerendered: optional features are read from this deployment's configuration at build time.
  const features = featureAvailability();
  const free = PLANS.free.limits;
  const reseller = PLANS.reseller.limits;
  const pro = PLANS.pro.limits;
  const ai: Cell = features.aiListings ? c.perMonth(features.aiListingsPerMonth ?? 0) : c.soon;
  const email: Cell = features.inboundEmail ? true : c.soon;
  const rows: { label: string; free: Cell; reseller: Cell; pro: Cell }[] = [
    { label: r.audience, free: c.resellers, reseller: c.resellers, pro: `${c.stores}, ${c.resellers.toLowerCase()}` },
    { label: r.stock, free: String(FREE_STOCK_ITEMS), reseller: c.unlimited, pro: c.unlimited },
    { label: r.resellerMode, free: true, reseller: true, pro: true },
    { label: r.photos, free: true, reseller: true, pro: true },
    { label: r.ai, free: false, reseller: ai, pro: ai },
    { label: r.email, free: false, reseller: email, pro: email },
    { label: r.ecommerce, free: false, reseller: false, pro: true },
    { label: r.rowsPerImport, free: false, reseller: false, pro: f.count(pro.importRowsPerFile) },
    { label: r.stores, free: String(free.stores), reseller: String(reseller.stores), pro: String(pro.stores) },
    { label: r.history, free: m.history(free.historyDays), reseller: m.history(reseller.historyDays), pro: m.history(pro.historyDays) },
    { label: r.reports, free: free.exports, reseller: reseller.exports, pro: pro.exports },
    { label: r.exports, free: free.exports, reseller: reseller.exports, pro: pro.exports },
    { label: r.filters, free: free.advancedFilters, reseller: reseller.advancedFilters, pro: pro.advancedFilters },
    { label: r.gdpr, free: true, reseller: true, pro: true },
  ];
  const cell = (v: Cell) =>
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
        <p>{m.intro(TRIAL_DAYS, FREE_STOCK_ITEMS)}</p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <PricingCards locale={locale} features={features} />

        <div className="mt-16 max-w-5xl overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="px-5 pt-4 pb-2 text-left text-md font-semibold text-ink">{m.compare}</caption>
            <thead>
              <tr className="border-b border-line text-xs text-ink-3">
                <th scope="col" className="px-5 py-2.5 text-left font-medium">{m.feature}</th>
                <th scope="col" className="w-32 px-3 py-2.5 text-center font-medium">{planCopy("free", locale).name}</th>
                <th scope="col" className="w-32 px-3 py-2.5 text-center font-medium">{planCopy("reseller", locale).name}</th>
                <th scope="col" className="w-32 px-3 py-2.5 text-center font-medium">{planCopy("pro", locale).name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-line last:border-0">
                  <th scope="row" className="px-5 py-3 text-left font-normal text-ink">
                    {row.label}
                  </th>
                  <td className="px-3 py-3 text-center text-ink-2">{cell(row.free)}</td>
                  <td className="px-3 py-3 text-center text-ink-2">{cell(row.reseller)}</td>
                  <td className="px-3 py-3 text-center text-ink">{cell(row.pro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">{m.trialNote(TRIAL_DAYS)}</p>
        </div>

        <Prose className="mt-16">
          <h2>{m.billingTitle}</h2>
          <h3>{m.faq.chooseQ}</h3>
          <p>{m.faq.chooseA(FREE_STOCK_ITEMS)}</p>
          <h3>{m.faq.limitQ(FREE_STOCK_ITEMS)}</h3>
          <p>{m.faq.limitA(FREE_STOCK_ITEMS)}</p>
          <h3>{m.faq.trialEndsQ}</h3>
          <p>{m.faq.trialEndsA(FREE_STOCK_ITEMS)}</p>
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
