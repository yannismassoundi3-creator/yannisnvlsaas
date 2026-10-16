import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { PLANS, TRIAL_DAYS } from "@/config/plans";
import { formatMoney } from "@/lib/finance/money";

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "What does Narixia calculate?",
    a: (
      <>
        Narixia turns your orders, product costs, advertising spend and expenses into a clear profit breakdown: net
        sales, gross profit and contribution margin, overall and per product. Every figure has a written definition,
        and estimated or missing values are labelled.
      </>
    ),
  },
  {
    q: "Is contribution margin the same as net profit?",
    a: (
      <>
        No. Contribution margin is what remains after product costs and variable costs such as shipping, payment fees
        and advertising. Net profit also subtracts fixed costs, taxes, interest and depreciation. Narixia shows an
        operating-profit estimate using the fixed costs you record, but it does not replace your accounts.
      </>
    ),
  },
  {
    q: "Which platforms can I import from?",
    a: (
      <>
        Narixia imports CSV files. It recognises the column names of Shopify order and product exports and offers
        documented templates for orders, products, expenses and advertising campaigns, so files from other platforms
        or spreadsheets can be mapped in a few clicks. Direct integrations are planned but not available yet.
      </>
    ),
  },
  {
    q: "What happens to customer data in my order exports?",
    a: (
      <>
        Files are read in your browser. Only the columns you map are sent to Narixia, and the order templates do not
        include customer names, emails or addresses. Narixia does not need them to calculate margins.
      </>
    ),
  },
  {
    q: "My prices include VAT. Does that distort the numbers?",
    a: (
      <>
        Tell Narixia that your prices include tax and provide the tax amount per order. Tax is removed from sales,
        discounts, shipping and refunds before any margin is calculated, so your margins are not inflated by VAT.
      </>
    ),
  },
  {
    q: "How does the free trial work?",
    a: (
      <>
        You get {TRIAL_DAYS} days of the core product without entering a payment card. When the trial ends, nothing
        is charged: you can upgrade to Pro for {formatMoney(PLANS.pro.priceMinor, PLANS.pro.currency)} per month,
        and your data stays available to export or delete.
      </>
    ),
  },
  {
    q: "How does Narixia handle advertising attribution?",
    a: (
      <>
        Ad platforms report conversions using their own attribution rules, which often overlap. Narixia shows
        platform-reported ROAS as reported, compares it with your break-even ROAS, and keeps store-wide ad spend
        separate from product margins unless a campaign is explicitly linked to a single product.
      </>
    ),
  },
  {
    q: "Can I export or delete my data?",
    a: (
      <>
        Yes. You can download all of your data from the settings page at any time, and deleting your account removes
        your organisation&rsquo;s data from Narixia.
      </>
    ),
  },
];

export function Faq() {
  return (
    <div className="max-w-3xl divide-y divide-line border-y border-line">
      {FAQS.map((item) => (
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
