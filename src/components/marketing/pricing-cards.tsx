import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PLANS, planCopy, TRIAL_DAYS } from "@/config/plans";
import type { Locale } from "@/i18n/config";
import { createFormat } from "@/i18n/format";
import { marketingCommon } from "@/i18n/messages/marketing-common";
import { cn } from "@/lib/utils";

export function PricingCards({ locale, className }: { locale: Locale; className?: string }) {
  const t = marketingCommon[locale].pricingCards;
  const f = createFormat(locale);
  const trial = PLANS.trial;
  const pro = PLANS.pro;
  const trialCopy = planCopy("trial", locale);
  const proCopy = planCopy("pro", locale);
  return (
    <div className={cn("grid max-w-4xl gap-5 md:grid-cols-2", className)}>
      <article className="flex flex-col rounded-lg border border-line bg-surface p-6 shadow-xs">
        <h3 className="text-lg font-semibold text-ink">{trialCopy.name}</h3>
        <p className="mt-1 text-sm text-ink-3">{trialCopy.description}</p>
        <p className="mt-6 flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tighter text-ink tabular">{f.money(0, trial.currency, { wholeUnits: true })}</span>
          <span className="text-sm text-ink-3">{t.forDays(TRIAL_DAYS)}</span>
        </p>
        <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-2">
          {trialCopy.highlights.map((h) => (
            <li key={h} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              {h}
            </li>
          ))}
        </ul>
        <Button asChild variant="secondary" size="lg" className="mt-8">
          <Link href="/sign-up">{t.startTrial}</Link>
        </Button>
        <p className="mt-3 text-center text-xs text-ink-3">{t.noCard}</p>
      </article>

      <article className="relative flex flex-col rounded-lg border border-navy-800 bg-navy-800 p-6 text-white shadow-md">
        <h3 className="text-lg font-semibold">{proCopy.name}</h3>
        <p className="mt-1 text-sm text-navy-100">{proCopy.description}</p>
        <p className="mt-6 flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tighter tabular">
            {f.money(pro.priceMinor, pro.currency, { wholeUnits: pro.priceMinor % 100 === 0 })}
          </span>
          <span className="text-sm text-navy-100">{t.perMonth}</span>
        </p>
        <ul className="mt-6 flex-1 space-y-2.5 text-sm text-navy-50">
          {proCopy.highlights.map((h) => (
            <li key={h} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-200" aria-hidden />
              {h}
            </li>
          ))}
        </ul>
        <Button asChild size="lg" className="mt-8 bg-white text-ink hover:bg-ivory active:bg-sunken">
          <Link href="/sign-up">{t.startWithTrial}</Link>
        </Button>
        <p className="mt-3 text-center text-xs text-navy-100">{t.upgradeNote}</p>
      </article>
    </div>
  );
}
