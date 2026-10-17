"use client";

import { ArrowRight, Check } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useLocale } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { dashboardMessages } from "@/i18n/messages/dashboard-components";
import type { StoreDataStatus } from "@/lib/data/reports";
import { cn } from "@/lib/utils";

type Step = { key: string; title: string; description: string; done: boolean; href: Route; action: string; optional?: boolean };

export function setupSteps(status: StoreDataStatus, locale: Locale = "en"): Step[] {
  const t = dashboardMessages[locale].setupChecklist;
  return [
    {
      key: "orders",
      title: t.orders.title,
      description: t.orders.description,
      done: status.orders > 0,
      href: "/app/imports/new?kind=orders" as Route,
      action: t.orders.action,
    },
    {
      key: "costs",
      title: t.costs.title,
      description: status.products === 0 ? t.costs.descriptionEmpty : t.costs.descriptionMissing(status.productsWithoutCost, status.products),
      done: status.products > 0 && status.productsWithoutCost === 0,
      href: (status.products === 0 ? "/app/imports/new?kind=products" : "/app/products?filter=missing-cost") as Route,
      action: status.products === 0 ? t.costs.actionImport : t.costs.actionAdd,
    },
    {
      key: "rules",
      title: t.rules.title,
      description: t.rules.description,
      done: status.feeRuleSet && status.shippingRuleSet,
      href: "/app/settings?section=costs" as Route,
      action: t.rules.action,
    },
    {
      key: "ads",
      title: t.ads.title,
      description: t.ads.description,
      done: status.adSpendDays > 0,
      href: "/app/imports/new?kind=ad_spend" as Route,
      action: t.ads.action,
    },
    {
      key: "expenses",
      title: t.expenses.title,
      description: t.expenses.description,
      done: status.expenses > 0,
      href: "/app/transactions?tab=expenses" as Route,
      action: t.expenses.action,
      optional: true,
    },
  ];
}

/** Next steps towards complete margins. Each step states why it matters. */
export function SetupChecklist({
  status,
  className,
  headingLevel: Heading = "h2",
  locale: localeProp,
}: {
  status: StoreDataStatus;
  className?: string;
  headingLevel?: "h2" | "h3";
  /** Interface language; defaults to the current one. */
  locale?: Locale;
}) {
  const contextLocale = useLocale();
  const locale = localeProp ?? contextLocale;
  const t = dashboardMessages[locale].setupChecklist;
  const steps = setupSteps(status, locale);
  // Progress counts every step listed, the optional one included, so "x of y" matches what is shown.
  const done = steps.filter((s) => s.done).length;

  return (
    <section className={cn("rounded-lg border border-line bg-surface shadow-xs", className)} aria-labelledby="setup-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
        <Heading id="setup-heading" className="text-md font-semibold tracking-tight text-ink">
          {t.heading}
        </Heading>
        <p className="text-sm text-ink-3 tabular">{t.progress(done, steps.length)}</p>
      </div>
      <div className="mx-5 mt-3 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / steps.length) * 100}%` }} />
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
              <span className="sr-only">{step.done ? t.done : t.todo}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", step.done ? "text-ink-3" : "text-ink")}>
                {step.title}
                {step.optional ? <span className="ml-2 text-xs font-normal text-ink-3">{t.optional}</span> : null}
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
