import { ArrowRight, Check, FileSpreadsheet, ListChecks, Rows3, ShieldCheck, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CampaignTable } from "@/components/dashboard/campaign-table";
import { KpiGrid, KpiTile } from "@/components/dashboard/kpi-tile";
import { ProductMarginBars } from "@/components/dashboard/product-margin-bars";
import { ProfitBreakdown } from "@/components/dashboard/profit-breakdown";
import { DemoDataNote, HeroDashboardPreview, ProductFrame } from "@/components/marketing/dashboard-preview";
import { Faq } from "@/components/marketing/faq";
import { PreviewTabs } from "@/components/marketing/preview-tabs";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { Button } from "@/components/ui/button";
import { TRIAL_DAYS } from "@/config/plans";
import { site, siteCopy } from "@/config/site";
import { localizedPath, type Locale } from "@/i18n/config";
import type { Format } from "@/i18n/format";
import { marketingCommon, publicAlternates } from "@/i18n/messages/marketing-common";
import { marketingHome } from "@/i18n/messages/marketing-home";
import { getFormat, getLocale } from "@/i18n/server";
import { getMarketingDemo, type MarketingDemo } from "@/lib/demo/marketing";
import { buildAdvertisingKpis } from "@/lib/finance/kpis";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: { absolute: marketingHome[locale].metaTitle },
    description: siteCopy(locale).description,
    alternates: publicAlternates("/", locale),
  };
}

type Props = { demo: MarketingDemo; locale: Locale; f: Format };

export default async function HomePage() {
  const locale = await getLocale();
  const f = await getFormat();
  const demo = await getMarketingDemo(locale);
  const props = { demo, locale, f };
  return (
    <>
      <Hero {...props} />
      <Problem {...props} />
      <ProductTour {...props} />
      <ProductProfitability {...props} />
      <Advertising {...props} />
      <CsvImport locale={locale} />
      <HowItWorks locale={locale} />
      <PricingSection locale={locale} />
      <FaqSection locale={locale} />
      <FinalCta locale={locale} />
      <JsonLd locale={locale} />
    </>
  );
}

function Section({ id, eyebrow, title, intro, children, className }: { id?: string; eyebrow?: string; title: ReactNode; intro?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 py-16 sm:py-20 ${className ?? ""}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          {eyebrow ? <p className="text-sm font-medium text-emerald-700">{eyebrow}</p> : null}
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter text-ink sm:text-4xl">{title}</h2>
          {intro ? <div className="mt-4 text-lg text-ink-2">{intro}</div> : null}
        </div>
        {children ? <div className="mt-10">{children}</div> : null}
      </div>
    </section>
  );
}

function Hero({ demo, locale }: Props) {
  const t = marketingHome[locale].hero;
  return (
    <section className="relative overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-emerald-700">{t.eyebrow}</p>
          <h1 className="mt-3 text-[2.5rem] leading-[1.05] font-semibold tracking-tightest text-ink sm:text-6xl">
            {t.titleLine1}
            <br />
            {t.titleLine2}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-2 sm:text-xl sm:leading-8">
            {t.lead}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="accent" size="lg">
              <Link href="/sign-up">
                {t.startTrial}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="#product">{t.explore}</Link>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-3">
            {[t.trialDays(TRIAL_DAYS), t.noCard, t.shopify].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="size-4 text-emerald-600" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-14">
          <div aria-hidden className="pointer-events-none absolute -inset-x-[50vw] top-1/3 -bottom-16 -z-0 border-t border-line bg-sunken/60" />
          <div className="relative">
            <HeroDashboardPreview demo={demo} locale={locale} />
            <DemoDataNote locale={locale} className="mt-3 text-center" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Problem({ demo, locale, f }: Props) {
  const t = marketingHome[locale].problem;
  const m = demo.metrics;
  const per100 = (amount: number) => (m.netRevenue > 0 ? (amount / m.netRevenue) * 100 : 0);
  const rows = [
    { label: t.rows.cogs, value: per100(m.cogs) },
    { label: t.rows.shipping, value: per100(m.shippingCosts) },
    { label: t.rows.advertising, value: per100(m.adSpend) },
    { label: t.rows.fees, value: per100(m.transactionFees) },
    { label: t.rows.other, value: per100(m.otherVariableCosts) },
  ];
  const kept = per100(m.contributionMargin);
  const hundred = f.money(10000, demo.currency, { wholeUnits: true });
  const currencySymbol = hundred.replace(/[\d.,\s]/g, "");
  // English keeps its historical "€12.34" rendering; other languages use the locale's money format ("12,34 €").
  const amount = (value: number) => (locale === "en" ? `${currencySymbol}${value.toFixed(2)}` : f.money(Math.round(value * 100), demo.currency));
  return (
    <Section eyebrow={t.eyebrow} title={t.title} intro={<p>{t.intro}</p>}>
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
        <ul className="space-y-5">
          {t.points.map(({ title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <Check className="size-3" aria-hidden />
              </span>
              <div>
                <p className="font-medium text-ink">{title}</p>
                <p className="text-base text-ink-2">{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <figure className="rounded-lg border border-line bg-surface p-6 shadow-xs">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-md font-semibold text-ink">{t.figureTitle(locale === "en" ? `${currencySymbol}100` : hundred)}</span>
            <span className="text-xs text-ink-3">{t.sampleRange(f.range(demo.range))}</span>
          </figcaption>
          <table className="mt-5 w-full text-sm">
            <caption className="sr-only">{t.tableCaption}</caption>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="w-44 py-1.5 pr-3 text-left font-normal text-ink-2">
                    {r.label}
                  </th>
                  <td className="py-1.5">
                    <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-sunken">
                      <span className="block h-full rounded-full bg-chart-1" style={{ width: `${Math.min(r.value, 100)}%` }} />
                    </span>
                  </td>
                  <td className="w-20 py-1.5 pl-3 text-right text-ink tabular">{amount(r.value)}</td>
                </tr>
              ))}
              <tr className="border-t border-line">
                <th scope="row" className="pt-3 pr-3 text-left font-semibold text-ink">
                  {t.kept}
                </th>
                <td className="pt-3">
                  <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-sunken">
                    <span className="block h-full rounded-full bg-chart-2" style={{ width: `${Math.max(Math.min(kept, 100), 0)}%` }} />
                  </span>
                </td>
                <td className="w-20 pt-3 pl-3 text-right font-semibold text-ink tabular">{amount(kept)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-4 text-xs text-ink-3">{t.keptNote}</p>
          <DemoDataNote locale={locale} className="mt-3" />
        </figure>
      </div>
    </Section>
  );
}

function ProductTour({ demo, locale, f }: Props) {
  const t = marketingHome[locale].tour;
  const vsPrevious = marketingCommon[locale].demo.vsPrevious;
  const range = f.range(demo.range);
  const adKpis = buildAdvertisingKpis(demo.metrics, demo.previous, demo.currency, locale);
  const productNames = Object.fromEntries(demo.products.map((p) => [p.productId, p.name]));
  return (
    <Section
      id="product"
      eyebrow={t.eyebrow}
      title={t.title}
      intro={<p>{t.intro}</p>}
      className="border-t border-line"
    >
      <PreviewTabs
        panels={[
          {
            value: "overview",
            label: t.profitTab,
            content: (
              <ProductFrame locale={locale} title={t.profitTitle} range={range}>
                <ProfitBreakdown metrics={demo.metrics} currency={demo.currency} />
              </ProductFrame>
            ),
          },
          {
            value: "products",
            label: t.productsTab,
            content: (
              <ProductFrame locale={locale} title={t.productsTitle} range={range}>
                <ProductMarginBars rows={demo.products} currency={demo.currency} limit={10} />
              </ProductFrame>
            ),
          },
          {
            value: "advertising",
            label: t.advertisingTab,
            content: (
              <ProductFrame locale={locale} title={t.advertisingTitle} range={range}>
                <div className="space-y-4">
                  <KpiGrid>
                    {adKpis.map((k) => (
                      <KpiTile key={k.key} label={k.label} value={k.value} definition={k.definition} delta={k.delta} deltaContext={vsPrevious} status={k.status} footnote={k.footnote} />
                    ))}
                  </KpiGrid>
                  <div className="rounded-lg border border-line bg-surface shadow-xs">
                    <CampaignTable campaigns={demo.campaigns} currency={demo.currency} breakEvenRoas={demo.metrics.breakEvenRoas} productNames={productNames} />
                  </div>
                </div>
              </ProductFrame>
            ),
          },
        ]}
      />
      <DemoDataNote locale={locale} className="mt-4 text-center" />
    </Section>
  );
}

function ProductProfitability({ demo, locale }: Props) {
  const t = marketingHome[locale].products;
  const missing = demo.products.filter((p) => p.linesWithoutCost > 0).length;
  return (
    <Section id="features" eyebrow={t.eyebrow} title={t.title} intro={<p>{t.intro}</p>}>
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.25fr]">
        <ul className="space-y-6">
          <Feature icon={<Rows3 />} title={t.searchTitle}>
            {t.searchText}
          </Feature>
          <Feature icon={<ListChecks />} title={t.costsTitle}>
            {t.costsText}
          </Feature>
          <Feature icon={<ShieldCheck />} title={t.missingTitle}>
            {missing > 0 ? t.missingSample(missing) : t.missingGeneric}
          </Feature>
        </ul>
        <div>
          <ProductMarginBars rows={demo.products} currency={demo.currency} limit={10} />
          <DemoDataNote locale={locale} className="mt-3" />
        </div>
      </div>
    </Section>
  );
}

function Advertising({ demo, locale, f }: Props) {
  const t = marketingHome[locale].advertising;
  const m = demo.metrics;
  const productNames = Object.fromEntries(demo.products.map((p) => [p.productId, p.name]));
  return (
    <Section eyebrow={t.eyebrow} title={t.title} intro={<p>{t.intro}</p>} className="border-t border-line bg-surface">
      <div className="grid gap-6 md:grid-cols-3">
        <Stat label={t.breakEven} value={f.multiple(m.breakEvenRoas)} note={t.breakEvenNote} />
        <Stat label={t.blended} value={f.multiple(m.blendedRoas)} note={t.blendedNote} />
        <Stat label={t.adShare} value={f.percent(m.adSpendRate)} note={t.adShareNote} />
      </div>
      <div className="mt-6 rounded-lg border border-line bg-surface shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
          <h3 className="text-md font-semibold tracking-tight text-ink">{t.campaigns}</h3>
          <span className="text-xs text-ink-3">{t.breakEvenInline(f.multiple(m.breakEvenRoas))}</span>
        </div>
        <CampaignTable campaigns={demo.campaigns} currency={demo.currency} breakEvenRoas={m.breakEvenRoas} productNames={productNames} />
      </div>
      <p className="mt-5 max-w-3xl text-sm text-ink-3">{t.caveat}</p>
      <DemoDataNote locale={locale} className="mt-3" />
    </Section>
  );
}

function CsvImport({ locale }: { locale: Locale }) {
  const t = marketingHome[locale].csv;
  const icons = [<Upload key="upload" />, <FileSpreadsheet key="map" />, <ListChecks key="validate" />, <Check key="confirm" />];
  const steps = t.steps.map((s, i) => ({ ...s, icon: icons[i] }));
  // Shopify column names stay as they appear in the export file.
  const mapping: [string, string, boolean][] = [
    ["Name", t.fields.orderId, true],
    ["Created at", t.fields.orderDate, true],
    ["Lineitem sku", t.fields.sku, true],
    ["Lineitem quantity", t.fields.quantity, true],
    ["Lineitem price", t.fields.unitPrice, true],
    ["Discount Amount", t.fields.orderDiscount, true],
    ["Shipping", t.fields.shipping, true],
    ["Taxes", t.fields.tax, true],
    ["Email", t.fields.notImported, false],
  ];
  return (
    <Section eyebrow={t.eyebrow} title={t.title} intro={<p>{t.intro}</p>}>
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <ol className="relative space-y-0">
          {steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 pb-8 last:pb-0">
              {i < steps.length - 1 ? <span aria-hidden className="absolute top-10 bottom-0 left-[19px] w-px bg-line-strong" /> : null}
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-2 shadow-xs [&_svg]:size-4" aria-hidden>
                {s.icon}
              </span>
              <div className="pt-1">
                <p className="text-xs font-medium text-ink-3 tabular">{t.step(i + 1)}</p>
                <p className="font-medium text-ink">{s.title}</p>
                <p className="mt-0.5 text-base text-ink-2">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="rounded-lg border border-line bg-surface shadow-xs">
          <div className="border-b border-line px-5 py-3.5">
            <p className="text-md font-semibold text-ink">{t.mappingTitle}</p>
            <p className="text-sm text-ink-3">{t.mappingSubtitle}</p>
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">{t.mappingCaption}</caption>
            <thead>
              <tr className="text-xs text-ink-3">
                <th scope="col" className="px-5 py-2 text-left font-medium">{t.yourFile}</th>
                <th scope="col" className="px-5 py-2 text-left font-medium">{t.narixiaField}</th>
              </tr>
            </thead>
            <tbody>
              {mapping.map(([from, to, imported]) => (
                <tr key={from} className="border-t border-line">
                  <td className="px-5 py-2 font-mono text-[12.5px] text-ink-2">{from}</td>
                  <td className={`px-5 py-2 ${imported ? "text-ink" : "text-ink-3"}`}>
                    <span className="inline-flex items-center gap-2">
                      <ArrowRight className="size-3.5 text-ink-3" aria-hidden />
                      {to}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">{t.privacy}</p>
        </div>
      </div>
    </Section>
  );
}

function HowItWorks({ locale }: { locale: Locale }) {
  const t = marketingHome[locale].how;
  const steps = t.steps;
  return (
    <Section eyebrow={t.eyebrow} title={t.title} className="border-t border-line">
      <ol className="grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="relative">
            <span className="text-5xl font-semibold tracking-tighter text-control-strong tabular" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="mt-3 font-medium text-ink">{s.title}</p>
            <p className="mt-1 text-base text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function PricingSection({ locale }: { locale: Locale }) {
  const t = marketingHome[locale].pricing;
  return (
    <Section id="pricing" eyebrow={t.eyebrow} title={t.title} intro={<p>{t.intro}</p>} className="border-t border-line bg-surface">
      <PricingCards locale={locale} />
      <p className="mt-6 text-sm text-ink-3">
        <Link href={localizedPath("/pricing", locale)} className="font-medium text-emerald-700 hover:underline">
          {t.compare}
        </Link>
      </p>
    </Section>
  );
}

function FaqSection({ locale }: { locale: Locale }) {
  const t = marketingHome[locale].faq;
  return (
    <Section id="faq" eyebrow={t.eyebrow} title={t.title} className="border-t border-line">
      <Faq locale={locale} />
    </Section>
  );
}

function FinalCta({ locale }: { locale: Locale }) {
  const t = marketingHome[locale].cta;
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="rounded-xl bg-navy-800 px-6 py-14 text-center sm:px-12">
          <h2 className="text-3xl font-semibold tracking-tighter text-white sm:text-4xl">{t.title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-navy-100">{t.text(TRIAL_DAYS)}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-white text-ink hover:bg-ivory active:bg-sunken">
              <Link href="/sign-up">{t.startTrial}</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-white hover:bg-navy-700 hover:text-white">
              <Link href={localizedPath("/tools/profit-margin-calculator", locale)}>{t.calculator}</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-2 shadow-xs [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-base text-ink-2">{children}</p>
      </div>
    </li>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-ivory p-5">
      <p className="text-sm font-medium text-ink-3">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tighter text-ink tabular">{value}</p>
      <p className="mt-1 text-xs text-ink-3">{note}</p>
    </div>
  );
}

function JsonLd({ locale }: { locale: Locale }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: siteCopy(locale).description,
    inLanguage: locale,
    url: locale === "en" ? site.url : `${site.url}${localizedPath("/", locale)}`,
  };
  return (
    <script
      type="application/ld+json"
      // JSON-LD built from static configuration only; "<" is escaped to keep the script block safe.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
