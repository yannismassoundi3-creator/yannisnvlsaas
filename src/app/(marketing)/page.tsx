import { ArrowRight, Check, FileSpreadsheet, ListChecks, Rows3, ShieldCheck, Store, Upload } from "lucide-react";
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
import { site } from "@/config/site";
import { formatRange } from "@/lib/dates";
import { getMarketingDemo, type MarketingDemo } from "@/lib/demo/marketing";
import { formatMultiple, formatPercent } from "@/lib/finance/format";
import { buildAdvertisingKpis } from "@/lib/finance/kpis";
import { formatMoney } from "@/lib/finance/money";

export const metadata: Metadata = {
  title: { absolute: "Narixia — Know your margins. Grow with confidence." },
  description: site.description,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const demo = await getMarketingDemo();
  return (
    <>
      <Hero demo={demo} />
      <Problem demo={demo} />
      <ProductTour demo={demo} />
      <ProductProfitability demo={demo} />
      <Advertising demo={demo} />
      <CsvImport />
      <HowItWorks />
      <PricingSection />
      <FaqSection />
      <FinalCta />
      <JsonLd />
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

function Hero({ demo }: { demo: MarketingDemo }) {
  return (
    <section className="relative overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-emerald-700">Profitability analytics for e-commerce</p>
          <h1 className="mt-3 text-[2.5rem] leading-[1.05] font-semibold tracking-tightest text-ink sm:text-6xl">
            Know your margins.
            <br />
            Grow with confidence.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-2 sm:text-xl sm:leading-8">
            One clear view of your sales, product costs, and advertising performance.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="accent" size="lg">
              <Link href="/sign-up">
                Start your free trial
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="#product">Explore the dashboard</Link>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-3">
            {[`${TRIAL_DAYS}-day free trial`, "No payment card required", "Import Shopify CSV exports"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-emerald-600" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-14">
          <div aria-hidden className="pointer-events-none absolute -inset-x-[50vw] top-1/3 -bottom-16 -z-0 border-t border-line bg-sunken/60" />
          <div className="relative">
            <HeroDashboardPreview demo={demo} />
            <DemoDataNote className="mt-3 text-center" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Problem({ demo }: { demo: MarketingDemo }) {
  const m = demo.metrics;
  const per100 = (amount: number) => (m.netRevenue > 0 ? (amount / m.netRevenue) * 100 : 0);
  const rows = [
    { label: "Product costs", value: per100(m.cogs) },
    { label: "Shipping and fulfilment", value: per100(m.shippingCosts) },
    { label: "Advertising", value: per100(m.adSpend) },
    { label: "Payment fees", value: per100(m.transactionFees) },
    { label: "Other variable costs", value: per100(m.otherVariableCosts) },
  ];
  const kept = per100(m.contributionMargin);
  const currencySymbol = formatMoney(10000, demo.currency, { wholeUnits: true }).replace(/[\d.,\s]/g, "");
  return (
    <Section
      eyebrow="The profitability problem"
      title="Revenue is not what you keep."
      intro={
        <p>
          Your store platform shows sales. Your ad accounts show return on ad spend. Neither shows what is left once
          product costs, shipping, payment fees and advertising are paid. Narixia puts them in one place, with every
          formula written down.
        </p>
      }
    >
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
        <ul className="space-y-5">
          {[
            ["Real product margins", "See which products carry the business once costs, fees and returns are counted."],
            ["Advertising against margin", "Compare platform ROAS with your break-even point instead of a rule of thumb."],
            ["Honest numbers", "Missing costs and estimates are flagged, never filled in silently."],
          ].map(([title, text]) => (
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
            <span className="text-md font-semibold text-ink">Where {currencySymbol}100 of net revenue goes</span>
            <span className="text-xs text-ink-3">Sample store, {formatRange(demo.range)}</span>
          </figcaption>
          <table className="mt-5 w-full text-sm">
            <caption className="sr-only">Share of each cost in net revenue</caption>
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
                  <td className="w-20 py-1.5 pl-3 text-right text-ink tabular">
                    {currencySymbol}
                    {r.value.toFixed(2)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line">
                <th scope="row" className="pt-3 pr-3 text-left font-semibold text-ink">
                  What you keep
                </th>
                <td className="pt-3">
                  <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-sunken">
                    <span className="block h-full rounded-full bg-chart-2" style={{ width: `${Math.max(Math.min(kept, 100), 0)}%` }} />
                  </span>
                </td>
                <td className="w-20 pt-3 pl-3 text-right font-semibold text-ink tabular">
                  {currencySymbol}
                  {kept.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-4 text-xs text-ink-3">
            &ldquo;What you keep&rdquo; is contribution margin: before fixed costs such as rent, salaries and
            subscriptions, and before taxes on profit.
          </p>
          <DemoDataNote className="mt-3" />
        </figure>
      </div>
    </Section>
  );
}

function ProductTour({ demo }: { demo: MarketingDemo }) {
  const range = formatRange(demo.range);
  const adKpis = buildAdvertisingKpis(demo.metrics, demo.previous, demo.currency);
  const productNames = Object.fromEntries(demo.products.map((p) => [p.productId, p.name]));
  return (
    <Section
      id="product"
      eyebrow="A look inside"
      title="A dashboard that explains itself."
      intro={<p>Switch between the views a merchant uses every week. Every term has a definition one click away.</p>}
      className="border-t border-line"
    >
      <PreviewTabs
        panels={[
          {
            value: "overview",
            label: "Profit",
            content: (
              <ProductFrame title="Sample store — Profit breakdown" range={range}>
                <ProfitBreakdown metrics={demo.metrics} currency={demo.currency} />
              </ProductFrame>
            ),
          },
          {
            value: "products",
            label: "Products",
            content: (
              <ProductFrame title="Sample store — Products" range={range}>
                <ProductMarginBars rows={demo.products} currency={demo.currency} limit={10} />
              </ProductFrame>
            ),
          },
          {
            value: "advertising",
            label: "Advertising",
            content: (
              <ProductFrame title="Sample store — Advertising" range={range}>
                <div className="space-y-4">
                  <KpiGrid>
                    {adKpis.map((k) => (
                      <KpiTile key={k.key} label={k.label} value={k.value} definition={k.definition} delta={k.delta} deltaContext="vs previous 30 days" status={k.status} footnote={k.footnote} />
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
      <DemoDataNote className="mt-4 text-center" />
    </Section>
  );
}

function ProductProfitability({ demo }: { demo: MarketingDemo }) {
  const missing = demo.products.filter((p) => p.linesWithoutCost > 0).length;
  return (
    <Section
      id="features"
      eyebrow="Product profitability"
      title="Know which products actually pay."
      intro={
        <p>
          Each product&rsquo;s contribution margin includes its share of discounts, refunds, shipping and payment fees.
          Store-wide advertising stays separate unless a campaign promotes a single product, so margins are never
          distorted by arbitrary allocation.
        </p>
      }
    >
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.25fr]">
        <ul className="space-y-6">
          <Feature icon={<Rows3 />} title="Search, sort and filter">
            Find low-margin products, products without a cost, or best sellers in a few keystrokes.
          </Feature>
          <Feature icon={<ListChecks />} title="Costs you can correct">
            Edit unit costs inline and every view updates at once. Costs recorded on individual orders are kept as they were.
          </Feature>
          <Feature icon={<ShieldCheck />} title="Missing data stays visible">
            {missing > 0
              ? `In the sample store, ${missing} product has no cost recorded, so Narixia shows no margin for it rather than guessing.`
              : "Products without a cost show no margin rather than a guess."}
          </Feature>
        </ul>
        <div>
          <ProductMarginBars rows={demo.products} currency={demo.currency} limit={10} />
          <DemoDataNote className="mt-3" />
        </div>
      </div>
    </Section>
  );
}

function Advertising({ demo }: { demo: MarketingDemo }) {
  const m = demo.metrics;
  const productNames = Object.fromEntries(demo.products.map((p) => [p.productId, p.name]));
  return (
    <Section
      eyebrow="Advertising performance"
      title="Judge ads against your margin, not a rule of thumb."
      intro={
        <p>
          Narixia calculates your break-even ROAS from your own costs: the return below which advertising consumes more
          margin than it brings in. Platform figures are shown as reported, with their attribution caveats.
        </p>
      }
      className="border-t border-line bg-surface"
    >
      <div className="grid gap-6 md:grid-cols-3">
        <Stat label="Break-even ROAS" value={formatMultiple(m.breakEvenRoas)} note="Sample store, last 30 days" />
        <Stat label="Blended ROAS" value={formatMultiple(m.blendedRoas)} note="Net revenue ÷ total ad spend" />
        <Stat label="Ad spend share of revenue" value={formatPercent(m.adSpendRate)} note="Advertising ÷ net revenue" />
      </div>
      <div className="mt-6 rounded-lg border border-line bg-surface shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
          <h3 className="text-md font-semibold tracking-tight text-ink">Campaigns, last 30 days</h3>
          <span className="text-xs text-ink-3">Break-even ROAS {formatMultiple(m.breakEvenRoas)}</span>
        </div>
        <CampaignTable campaigns={demo.campaigns} currency={demo.currency} breakEvenRoas={m.breakEvenRoas} productNames={productNames} />
      </div>
      <p className="mt-5 max-w-3xl text-sm text-ink-3">
        Platform ROAS relies on each platform&rsquo;s attribution and can count the same sale more than once. Blended
        ROAS avoids attribution but includes sales that ads did not cause. Narixia shows both and explains the
        difference instead of picking a winner for you.
      </p>
      <DemoDataNote className="mt-3" />
    </Section>
  );
}

function CsvImport() {
  const steps = [
    { icon: <Upload />, title: "Upload", text: "Drop a CSV export. It is read in your browser." },
    { icon: <FileSpreadsheet />, title: "Map columns", text: "Shopify columns are recognised automatically." },
    { icon: <ListChecks />, title: "Validate", text: "Every row is checked. Errors are listed by row." },
    { icon: <Check />, title: "Confirm", text: "Duplicates are skipped. Imports can be undone." },
  ];
  const mapping = [
    ["Name", "Order ID"],
    ["Created at", "Order date"],
    ["Lineitem sku", "SKU"],
    ["Lineitem quantity", "Quantity"],
    ["Lineitem price", "Unit price"],
    ["Discount Amount", "Order discount"],
    ["Shipping", "Shipping charged"],
    ["Taxes", "Tax amount"],
    ["Email", "Not imported"],
  ];
  return (
    <Section
      eyebrow="CSV import"
      title="From export to insight in minutes."
      intro={
        <p>
          Import orders, products and costs, expenses and ad spend from CSV files. Narixia validates every row, shows
          exactly what will be imported, and never discards a row without telling you.
        </p>
      }
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <ol className="relative space-y-0">
          {steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 pb-8 last:pb-0">
              {i < steps.length - 1 ? <span aria-hidden className="absolute top-10 bottom-0 left-[19px] w-px bg-line-strong" /> : null}
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-2 shadow-xs [&_svg]:size-4" aria-hidden>
                {s.icon}
              </span>
              <div className="pt-1">
                <p className="text-xs font-medium text-ink-3 tabular">Step {i + 1}</p>
                <p className="font-medium text-ink">{s.title}</p>
                <p className="mt-0.5 text-base text-ink-2">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="rounded-lg border border-line bg-surface shadow-xs">
          <div className="border-b border-line px-5 py-3.5">
            <p className="text-md font-semibold text-ink">Column mapping</p>
            <p className="text-sm text-ink-3">Example: a Shopify orders export</p>
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">Example mapping from Shopify columns to Narixia fields</caption>
            <thead>
              <tr className="text-xs text-ink-3">
                <th scope="col" className="px-5 py-2 text-left font-medium">Your file</th>
                <th scope="col" className="px-5 py-2 text-left font-medium">Narixia field</th>
              </tr>
            </thead>
            <tbody>
              {mapping.map(([from, to]) => (
                <tr key={from} className="border-t border-line">
                  <td className="px-5 py-2 font-mono text-[12.5px] text-ink-2">{from}</td>
                  <td className={`px-5 py-2 ${to === "Not imported" ? "text-ink-3" : "text-ink"}`}>
                    <span className="inline-flex items-center gap-2">
                      <ArrowRight className="size-3.5 text-ink-3" aria-hidden />
                      {to}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">
            Customer names, emails and addresses are never uploaded: unmapped columns stay on your computer.
          </p>
        </div>
      </div>
    </Section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: <Store />, title: "Create your store profile", text: "Choose your currency and reporting time zone, and whether your prices include VAT." },
    { icon: <Upload />, title: "Add your data", text: "Import orders, product costs and ad spend from CSV files, or enter them by hand." },
    { icon: <ListChecks />, title: "Read your real margins", text: "See contribution margin by period and product, and the changes that deserve attention." },
  ];
  return (
    <Section eyebrow="How it works" title="Three steps to a clear picture." className="border-t border-line">
      <ol className="grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="relative">
            <span className="text-5xl font-semibold tracking-tighter text-line-strong tabular" aria-hidden>
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

function PricingSection() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Simple pricing for small stores."
      intro={<p>Start with a free trial. Upgrade when Narixia earns its place in your week.</p>}
      className="border-t border-line bg-surface"
    >
      <PricingCards />
      <p className="mt-6 text-sm text-ink-3">
        <Link href="/pricing" className="font-medium text-emerald-700 hover:underline">
          Compare plans in detail
        </Link>
      </p>
    </Section>
  );
}

function FaqSection() {
  return (
    <Section id="faq" eyebrow="Questions" title="Frequently asked questions" className="border-t border-line">
      <Faq />
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="rounded-xl bg-navy-800 px-6 py-14 text-center sm:px-12">
          <h2 className="text-3xl font-semibold tracking-tighter text-white sm:text-4xl">See what your store really earns.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-navy-100">
            Import your first CSV and get a profit breakdown in minutes. {TRIAL_DAYS} days free, no payment card required.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-white text-ink hover:bg-ivory active:bg-sunken">
              <Link href="/sign-up">Start your free trial</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-white hover:bg-navy-700 hover:text-white">
              <Link href="/tools/profit-margin-calculator">Try the margin calculator</Link>
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

function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: site.description,
    url: site.url,
  };
  return (
    <script
      type="application/ld+json"
      // JSON-LD built from static configuration only; "<" is escaped to keep the script block safe.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
