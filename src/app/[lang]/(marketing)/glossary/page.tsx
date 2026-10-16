import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/marketing/prose";
import { localizedPath } from "@/i18n/config";
import { publicAlternates } from "@/i18n/messages/marketing-common";
import { marketingPages } from "@/i18n/messages/marketing-pages";
import { getLocale } from "@/i18n/server";
import { definitionsFor, type DefinitionKey } from "@/lib/finance/metrics";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = marketingPages[locale].glossary;
  return { title: t.metaTitle, description: t.metaDescription, alternates: publicAlternates("/glossary", locale) };
}

type GroupId = keyof (typeof marketingPages)["en"]["glossary"]["groups"];

const GROUPS: { group: GroupId; keys: DefinitionKey[] }[] = [
  { group: "revenue", keys: ["grossSales", "discounts", "refunds", "netSales", "shippingCharged", "netRevenue", "orders", "averageOrderValue", "refundRate"] },
  { group: "costs", keys: ["cogs", "shippingCosts", "transactionFees", "adSpend", "otherVariableCosts", "fixedCosts"] },
  { group: "margins", keys: ["grossProfit", "contributionMargin", "contributionMarginRate", "operatingProfit"] },
  { group: "advertising", keys: ["roas", "blendedRoas", "breakEvenRoas", "roi"] },
  { group: "notCalculated", keys: ["netProfit", "cashFlow"] },
];

function slug(key: string) {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Section anchors come from the English titles so links keep working in every language. */
function sectionId(group: GroupId) {
  return slug(marketingPages.en.glossary.groups[group].replace(/\s+/g, ""));
}

export default async function GlossaryPage() {
  const locale = await getLocale();
  const t = marketingPages[locale].glossary;
  const definitions = definitionsFor(locale);
  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title}>
        <p>{t.intro}</p>
      </PageIntro>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label={t.sections} className="hidden lg:block">
          <ul className="sticky top-24 space-y-2 text-sm">
            {GROUPS.map((g) => (
              <li key={g.group}>
                <a href={`#${sectionId(g.group)}`} className="text-ink-3 hover:text-ink">
                  {t.groups[g.group]}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-14">
          {GROUPS.map((g) => (
            <section key={g.group} id={sectionId(g.group)} className="scroll-mt-24">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">{t.groups[g.group]}</h2>
              <dl className="mt-5 divide-y divide-line border-y border-line">
                {g.keys.map((key) => {
                  const d = definitions[key];
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
            {t.tryFormulas}{" "}
            <Link href={localizedPath("/tools/profit-margin-calculator", locale)} className="font-medium text-emerald-700 hover:underline">
              {t.openCalculator}
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
