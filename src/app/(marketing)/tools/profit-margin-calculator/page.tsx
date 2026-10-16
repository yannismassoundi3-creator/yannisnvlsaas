import type { Metadata } from "next";
import Link from "next/link";
import { ProfitCalculator } from "@/components/calculator/profit-calculator";
import { PageIntro } from "@/components/marketing/prose";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Profit margin calculator for e-commerce",
  description:
    "Free contribution margin calculator for online stores: enter price, unit cost, discounts, refunds, payment fees, shipping and ad spend to see your margin and break-even price.",
  alternates: { canonical: "/tools/profit-margin-calculator" },
};

export default function CalculatorPage() {
  return (
    <>
      <PageIntro eyebrow="Free tool" title="Profit margin calculator">
        <p>
          See what a product really earns after discounts, refunds, payment fees, shipping and advertising, and the
          lowest price that still breaks even. Every formula is shown below the result.
        </p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <ProfitCalculator />
        <div className="mt-12 flex flex-col items-start gap-4 rounded-lg border border-line bg-surface p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-ink">Run this on your real store data</p>
            <p className="text-sm text-ink-2">Import your orders and costs to see the margin of every product, every week.</p>
          </div>
          <Button asChild variant="accent">
            <Link href="/sign-up">Start your free trial</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
