import { ArrowRight, Check } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { StoreDataStatus } from "@/lib/data/reports";
import { cn } from "@/lib/utils";

type Step = { key: string; title: string; description: string; done: boolean; href: Route; action: string; optional?: boolean };

export function setupSteps(status: StoreDataStatus): Step[] {
  return [
    {
      key: "orders",
      title: "Import your orders",
      description: "Upload an order export from Shopify or any platform. Narixia reads the file in your browser and only sends the columns you map.",
      done: status.orders > 0,
      href: "/app/imports/new?kind=orders" as Route,
      action: "Import orders",
    },
    {
      key: "costs",
      title: "Add product costs",
      description:
        status.products === 0
          ? "Products are created from your orders, or you can import a product list with unit costs."
          : `${status.productsWithoutCost} of ${status.products} products have no unit cost yet. Margins stay incomplete until they do.`,
      done: status.products > 0 && status.productsWithoutCost === 0,
      href: (status.products === 0 ? "/app/imports/new?kind=products" : "/app/products?filter=missing-cost") as Route,
      action: status.products === 0 ? "Import products" : "Add costs",
    },
    {
      key: "rules",
      title: "Set payment fee and shipping rules",
      description: "Used to estimate costs for orders without recorded values. Estimates are always labelled as such.",
      done: status.feeRuleSet && status.shippingRuleSet,
      href: "/app/settings?section=costs" as Route,
      action: "Open cost settings",
    },
    {
      key: "ads",
      title: "Add advertising spend",
      description: "Import daily spend from Meta, Google or TikTok exports, or enter it manually.",
      done: status.adSpendDays > 0,
      href: "/app/imports/new?kind=ad_spend" as Route,
      action: "Add ad spend",
    },
    {
      key: "expenses",
      title: "Record other costs",
      description: "Packaging, marketplace commissions or subscriptions, to complete contribution margin and the operating estimate.",
      done: status.expenses > 0,
      href: "/app/transactions?tab=expenses" as Route,
      action: "Add expenses",
      optional: true,
    },
  ];
}

/** Next steps towards complete margins. Each step states why it matters. */
export function SetupChecklist({ status, className, headingLevel: Heading = "h2" }: { status: StoreDataStatus; className?: string; headingLevel?: "h2" | "h3" }) {
  const steps = setupSteps(status);
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;

  return (
    <section className={cn("rounded-lg border border-line bg-surface shadow-xs", className)} aria-labelledby="setup-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
        <Heading id="setup-heading" className="text-md font-semibold tracking-tight text-ink">
          Complete your margins
        </Heading>
        <p className="text-sm text-ink-3 tabular">
          {done} of {required.length} steps done
        </p>
      </div>
      <div className="mx-5 mt-3 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / required.length) * 100}%` }} />
      </div>
      <ol className="mt-2 divide-y divide-line">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3 px-5 py-3.5">
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs",
                step.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-control bg-surface text-ink-3",
              )}
            >
              {step.done ? <Check className="size-3" aria-hidden /> : null}
              <span className="sr-only">{step.done ? "Done:" : "To do:"}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", step.done ? "text-ink-3" : "text-ink")}>
                {step.title}
                {step.optional ? <span className="ml-2 text-xs font-normal text-ink-3">Optional</span> : null}
              </p>
              {!step.done ? <p className="mt-0.5 text-sm text-ink-3">{step.description}</p> : null}
            </div>
            {!step.done ? (
              <Link href={step.href} className="inline-flex shrink-0 items-center gap-1 self-center text-sm font-medium text-emerald-700 hover:underline">
                {step.action}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
