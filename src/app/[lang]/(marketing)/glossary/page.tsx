import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/marketing/prose";
import { DEFINITIONS, type DefinitionKey } from "@/lib/finance/metrics";

export const metadata: Metadata = {
  title: "E-commerce profitability glossary",
  description:
    "Plain-language definitions of gross sales, net sales, gross profit, contribution margin, ROAS, break-even ROAS, net profit and cash flow, as used in Narixia.",
  alternates: { canonical: "/glossary" },
};

const GROUPS: { title: string; keys: DefinitionKey[] }[] = [
  { title: "Revenue", keys: ["grossSales", "discounts", "refunds", "netSales", "shippingCharged", "netRevenue", "orders", "averageOrderValue", "refundRate"] },
  { title: "Costs", keys: ["cogs", "shippingCosts", "transactionFees", "adSpend", "otherVariableCosts", "fixedCosts"] },
  { title: "Margins", keys: ["grossProfit", "contributionMargin", "contributionMarginRate", "operatingProfit"] },
  { title: "Advertising", keys: ["roas", "blendedRoas", "breakEvenRoas", "roi"] },
  { title: "What Narixia does not calculate", keys: ["netProfit", "cashFlow"] },
];

function slug(key: string) {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export default function GlossaryPage() {
  return (
    <>
      <PageIntro eyebrow="Glossary" title="Profitability terms, defined">
        <p>
          The exact definitions Narixia uses in every dashboard, report and export. Amounts always exclude VAT and sales
          tax.
        </p>
      </PageIntro>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Glossary sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-2 text-sm">
            {GROUPS.map((g) => (
              <li key={g.title}>
                <a href={`#${slug(g.title.replace(/\s+/g, ""))}`} className="text-ink-3 hover:text-ink">
                  {g.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-14">
          {GROUPS.map((g) => (
            <section key={g.title} id={slug(g.title.replace(/\s+/g, ""))} className="scroll-mt-24">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">{g.title}</h2>
              <dl className="mt-5 divide-y divide-line border-y border-line">
                {g.keys.map((key) => {
                  const d = DEFINITIONS[key];
                  return (
                    <div key={key} id={slug(key)} className="grid scroll-mt-24 gap-2 py-5 md:grid-cols-[220px_1fr] md:gap-8">
                      <dt className="font-semibold text-ink">{d.term}</dt>
                      <dd className="space-y-2">
                        <p className="text-ink-2">{d.short}</p>
                        <p className="font-mono text-[12.5px] text-ink-3">{d.formula}</p>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
          <p className="text-sm text-ink-3">
            Want to try the formulas?{" "}
            <Link href="/tools/profit-margin-calculator" className="font-medium text-emerald-700 hover:underline">
              Open the profit margin calculator
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
