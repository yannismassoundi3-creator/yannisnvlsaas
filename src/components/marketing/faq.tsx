import { ChevronDown } from "lucide-react";
import { PLANS, TRIAL_DAYS } from "@/config/plans";
import type { Locale } from "@/i18n/config";
import { createFormat } from "@/i18n/format";
import { marketingCommon } from "@/i18n/messages/marketing-common";

export function Faq({ locale }: { locale: Locale }) {
  const t = marketingCommon[locale].faq;
  const f = createFormat(locale);
  const items: { q: string; a: string }[] = [
    t.calculate,
    t.netProfit,
    t.platforms,
    t.customerData,
    t.vat,
    { q: t.trial.q, a: t.trial.a(TRIAL_DAYS, f.money(PLANS.pro.priceMinor, PLANS.pro.currency)) },
    t.attribution,
    t.export,
  ];
  return (
    <div className="max-w-3xl divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.q} className="group py-1 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-sm py-4 text-left text-md font-medium text-ink">
            {item.q}
            <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>
          <div className="pb-5 text-base leading-6 text-ink-2">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
