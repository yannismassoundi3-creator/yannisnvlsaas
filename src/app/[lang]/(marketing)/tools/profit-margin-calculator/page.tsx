import type { Metadata } from "next";
import Link from "next/link";
import { ProfitCalculator } from "@/components/calculator/profit-calculator";
import { PageIntro } from "@/components/marketing/prose";
import { Button } from "@/components/ui/button";
import { publicAlternates } from "@/i18n/messages/marketing-common";
import { marketingPages } from "@/i18n/messages/marketing-pages";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = marketingPages[locale].calculator;
  return { title: t.metaTitle, description: t.metaDescription, alternates: publicAlternates("/tools/profit-margin-calculator", locale) };
}

export default async function CalculatorPage() {
  const t = marketingPages[await getLocale()].calculator;
  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title}>
        <p>{t.intro}</p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <ProfitCalculator />
        <div className="mt-12 flex flex-col items-start gap-4 rounded-lg border border-line bg-surface p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-ink">{t.ctaTitle}</p>
            <p className="text-sm text-ink-2">{t.ctaText}</p>
          </div>
          <Button asChild variant="accent">
            <Link href="/sign-up">{t.ctaButton}</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
