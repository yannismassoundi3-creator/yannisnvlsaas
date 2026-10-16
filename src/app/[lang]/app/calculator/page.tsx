import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfitCalculator } from "@/components/calculator/profit-calculator";
import { Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { calculatorPage } from "@/i18n/messages/account-calculator";
import { getLocale } from "@/i18n/server";
import { requireStore } from "@/lib/auth/workspace";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: calculatorPage[locale].metaTitle };
}

async function Calculator() {
  const ws = await requireStore();
  return <ProfitCalculator defaultCurrency={ws.activeStore.currency} />;
}

export default async function CalculatorPage() {
  const t = calculatorPage[await getLocale()];
  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />
      <Suspense fallback={<Skeleton className="h-[640px]" />}>
        <Calculator />
      </Suspense>
    </div>
  );
}
