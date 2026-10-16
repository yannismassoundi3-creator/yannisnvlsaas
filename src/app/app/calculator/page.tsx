import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfitCalculator } from "@/components/calculator/profit-calculator";
import { Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { requireStore } from "@/lib/auth/workspace";

export const metadata: Metadata = { title: "Calculator" };

async function Calculator() {
  const ws = await requireStore();
  return <ProfitCalculator defaultCurrency={ws.activeStore.currency} />;
}

export default function CalculatorPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Profitability calculator"
        description="Test prices, costs and ad budgets before you commit. Nothing you enter here is saved."
      />
      <Suspense fallback={<Skeleton className="h-[640px]" />}>
        <Calculator />
      </Suspense>
    </div>
  );
}
