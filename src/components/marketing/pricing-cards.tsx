import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PLANS, TRIAL_DAYS } from "@/config/plans";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

export function PricingCards({ className }: { className?: string }) {
  const trial = PLANS.trial;
  const pro = PLANS.pro;
  return (
    <div className={cn("grid max-w-4xl gap-5 md:grid-cols-2", className)}>
      <article className="flex flex-col rounded-lg border border-line bg-surface p-6 shadow-xs">
        <h3 className="text-lg font-semibold text-ink">{trial.name}</h3>
        <p className="mt-1 text-sm text-ink-3">{trial.description}</p>
        <p className="mt-6 flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tighter text-ink tabular">{formatMoney(0, trial.currency, { wholeUnits: true })}</span>
          <span className="text-sm text-ink-3">for {TRIAL_DAYS} days</span>
        </p>
        <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-2">
          {trial.highlights.map((h) => (
            <li key={h} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              {h}
            </li>
          ))}
        </ul>
        <Button asChild variant="secondary" size="lg" className="mt-8">
          <Link href="/sign-up">Start your free trial</Link>
        </Button>
        <p className="mt-3 text-center text-xs text-ink-3">No payment card required. Nothing is charged automatically.</p>
      </article>

      <article className="relative flex flex-col rounded-lg border border-navy-800 bg-navy-800 p-6 text-white shadow-md">
        <h3 className="text-lg font-semibold">{pro.name}</h3>
        <p className="mt-1 text-sm text-navy-100">{pro.description}</p>
        <p className="mt-6 flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tighter tabular">
            {formatMoney(pro.priceMinor, pro.currency, { wholeUnits: pro.priceMinor % 100 === 0 })}
          </span>
          <span className="text-sm text-navy-100">per month, VAT may apply</span>
        </p>
        <ul className="mt-6 flex-1 space-y-2.5 text-sm text-navy-50">
          {pro.highlights.map((h) => (
            <li key={h} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-200" aria-hidden />
              {h}
            </li>
          ))}
        </ul>
        <Button asChild size="lg" className="mt-8 bg-white text-ink hover:bg-ivory active:bg-sunken">
          <Link href="/sign-up">Start with the free trial</Link>
        </Button>
        <p className="mt-3 text-center text-xs text-navy-100">Upgrade from your trial whenever you are ready. Cancel anytime.</p>
      </article>
    </div>
  );
}
