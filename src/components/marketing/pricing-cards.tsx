import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FREE_STOCK_ITEMS, PLANS, planCopy, TRIAL_DAYS, type FeatureAvailability, type PlanId } from "@/config/plans";
import type { Locale } from "@/i18n/config";
import { createFormat } from "@/i18n/format";
import { marketingCommon } from "@/i18n/messages/marketing-common";
import { cn } from "@/lib/utils";

/**
 * The three offers: Free (resellers, 30 items in stock), Reseller and Pro.
 * `features` says which optional features are switched on on this deployment;
 * the others are described as "coming soon".
 */
export function PricingCards({ locale, features, className }: { locale: Locale; features: FeatureAvailability; className?: string }) {
  const t = marketingCommon[locale].pricingCards;
  const f = createFormat(locale);
  const price = (id: PlanId) => f.money(PLANS[id].priceMinor, PLANS[id].currency, { wholeUnits: PLANS[id].priceMinor % 100 === 0 });
  const offers: { id: PlanId; audience: string; per: string; cta: string; note: string; dark?: boolean; badge?: string }[] = [
    { id: "free", audience: t.freeAudience, per: t.forever, cta: t.startFree, note: t.freeNote(FREE_STOCK_ITEMS, TRIAL_DAYS) },
    { id: "reseller", audience: t.resellerAudience, per: t.perMonth, cta: t.startWithTrial, note: t.trialNote(TRIAL_DAYS), badge: t.resellerBadge },
    { id: "pro", audience: t.proAudience, per: t.perMonth, cta: t.startWithTrial, note: t.trialNote(TRIAL_DAYS), dark: true },
  ];
  return (
    <div className={cn("grid gap-5 md:grid-cols-3", className)}>
      {offers.map((o) => {
        const copy = planCopy(o.id, locale, features);
        return (
          <article
            key={o.id}
            aria-labelledby={`plan-${o.id}`}
            className={cn(
              "relative flex flex-col rounded-lg border p-6",
              o.dark ? "border-navy-800 bg-navy-800 text-white shadow-md" : "border-line bg-surface shadow-xs",
              o.badge && "border-emerald-600 ring-1 ring-emerald-600",
            )}
          >
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className={cn("text-xs font-medium tracking-wide uppercase", o.dark ? "text-navy-100" : "text-ink-3")}>{o.audience}</span>
              {o.badge ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">{o.badge}</span> : null}
            </p>
            <h3 id={`plan-${o.id}`} className={cn("mt-1 text-lg font-semibold", o.dark ? "text-white" : "text-ink")}>
              {copy.name}
            </h3>
            <p className={cn("mt-1 text-sm", o.dark ? "text-navy-100" : "text-ink-3")}>{copy.description}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className={cn("text-4xl font-semibold tracking-tighter tabular", o.dark ? "text-white" : "text-ink")}>{price(o.id)}</span>
              <span className={cn("text-sm", o.dark ? "text-navy-100" : "text-ink-3")}>{o.per}</span>
            </p>
            <ul className={cn("mt-6 flex-1 space-y-2.5 text-sm", o.dark ? "text-navy-50" : "text-ink-2")}>
              {copy.highlights.map((h) => (
                <li key={h} className="flex gap-2.5">
                  <Check className={cn("mt-0.5 size-4 shrink-0", o.dark ? "text-emerald-200" : "text-emerald-600")} aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
            <Button
              asChild
              size="lg"
              variant={o.dark ? undefined : o.badge ? "accent" : "secondary"}
              className={cn("mt-8", o.dark && "bg-white text-ink hover:bg-ivory active:bg-sunken")}
            >
              <Link href="/sign-up">{o.cta}</Link>
            </Button>
            <p className={cn("mt-3 text-center text-xs", o.dark ? "text-navy-100" : "text-ink-3")}>{o.note}</p>
          </article>
        );
      })}
    </div>
  );
}
