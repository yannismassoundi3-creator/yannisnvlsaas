import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { TermTip } from "@/components/ui/overlay";
import { formatPercent } from "@/lib/finance/format";
import { DEFINITIONS, type DefinitionKey, type Metrics } from "@/lib/finance/metrics";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

type Row = {
  key: string;
  label: string;
  amount: number;
  sign: "+" | "−" | "=";
  definition?: DefinitionKey;
  kind: "line" | "subtotal" | "total" | "muted";
  badge?: { tone: "caution" | "info"; label: string } | null;
  /** Show an inline bar for the share of net revenue. */
  bar?: boolean;
  /** Show the share of net revenue (not for lines above net revenue). */
  share?: boolean;
};

function completenessBadge(state: Metrics["completeness"]["cogs"]): Row["badge"] {
  if (state === "partial") return { tone: "caution", label: "Incomplete" };
  if (state === "missing") return { tone: "caution", label: "Missing" };
  if (state === "estimated") return { tone: "info", label: "Includes estimates" };
  return null;
}

/**
 * Profit statement from gross sales to contribution margin, with each line's
 * share of net revenue. A table first; the inline bars only support it.
 */
export function ProfitBreakdown({ metrics, currency, className, title = "Profit breakdown" }: { metrics: Metrics; currency: string; className?: string; title?: ReactNode }) {
  const m = metrics;
  const rows: Row[] = [
    { key: "grossSales", label: "Gross sales", amount: m.grossSales, sign: "+", definition: "grossSales", kind: "line" },
    { key: "discounts", label: "Discounts", amount: -m.discounts, sign: "−", definition: "discounts", kind: "line" },
    { key: "refunds", label: "Refunds", amount: -m.refunds, sign: "−", definition: "refunds", kind: "line" },
    { key: "netSales", label: "Net sales", amount: m.netSales, sign: "=", definition: "netSales", kind: "subtotal" },
    { key: "shippingCharged", label: "Shipping charged", amount: m.shippingCharged, sign: "+", definition: "shippingCharged", kind: "line" },
    { key: "netRevenue", label: "Net revenue", amount: m.netRevenue, sign: "=", definition: "netRevenue", kind: "subtotal", share: true },
    { key: "cogs", label: "Cost of goods sold", amount: -m.cogs, sign: "−", definition: "cogs", kind: "line", share: true, bar: true, badge: completenessBadge(m.completeness.cogs) },
    { key: "grossProfit", label: "Gross profit", amount: m.grossProfit, sign: "=", definition: "grossProfit", kind: "subtotal", share: true },
    { key: "shippingCosts", label: "Shipping & fulfilment", amount: -m.shippingCosts, sign: "−", definition: "shippingCosts", kind: "line", share: true, bar: true, badge: completenessBadge(m.completeness.shipping) },
    { key: "transactionFees", label: "Payment fees", amount: -m.transactionFees, sign: "−", definition: "transactionFees", kind: "line", share: true, bar: true, badge: completenessBadge(m.completeness.fees) },
    { key: "adSpend", label: "Advertising", amount: -m.adSpend, sign: "−", definition: "adSpend", kind: "line", share: true, bar: true },
    { key: "otherVariableCosts", label: "Other variable costs", amount: -m.otherVariableCosts, sign: "−", definition: "otherVariableCosts", kind: "line", share: true, bar: true },
    { key: "contributionMargin", label: "Contribution margin", amount: m.contributionMargin, sign: "=", definition: "contributionMargin", kind: "total", share: true },
    { key: "fixedCosts", label: "Fixed costs", amount: -m.fixedCosts, sign: "−", definition: "fixedCosts", kind: "muted", share: true },
    { key: "operatingProfit", label: "Operating profit (estimate)", amount: m.operatingProfit, sign: "=", definition: "operatingProfit", kind: "muted", share: true },
  ];

  // Cost lines show their size as a share of net revenue; results (rows with "=") keep their sign.
  const share = (row: Row) => (m.netRevenue > 0 ? (row.sign === "=" ? row.amount : Math.abs(row.amount)) / m.netRevenue : null);

  return (
    <div className={cn("rounded-lg border border-line bg-surface shadow-xs", className)}>
      <div className="flex items-baseline justify-between gap-4 px-5 pt-4 pb-2">
        <h2 className="text-md font-semibold tracking-tight text-ink">{title}</h2>
        <span className="text-xs text-ink-3">Amounts exclude VAT / sales tax</span>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Profit breakdown from gross sales to operating profit</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Line</th>
            <th scope="col">Amount</th>
            <th scope="col">Share of net revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const def = row.definition ? DEFINITIONS[row.definition] : null;
            const pct = share(row);
            return (
              <tr
                key={row.key}
                className={cn(
                  "border-t border-line first:border-t-0",
                  row.kind === "subtotal" && "bg-sunken/45",
                  row.kind === "total" && "bg-emerald-50/70",
                )}
              >
                <th
                  scope="row"
                  className={cn(
                    "py-2 pr-2 pl-4 text-left font-normal sm:pl-5",
                    row.kind === "subtotal" && "font-medium",
                    row.kind === "total" && "font-semibold",
                    row.kind === "muted" ? "text-ink-3" : "text-ink",
                  )}
                >
                  <span className="flex items-start gap-1.5">
                    <span aria-hidden className="w-3 shrink-0 text-center text-ink-3 tabular">
                      {row.sign}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="inline-flex items-center gap-1.5 sm:whitespace-nowrap">
                        {row.label}
                        {def ? <TermTip term={def.term}>{def.short}</TermTip> : null}
                      </span>
                      {row.badge ? <Badge tone={row.badge.tone}>{row.badge.label}</Badge> : null}
                    </span>
                  </span>
                </th>
                <td
                  className={cn(
                    "py-2 pr-2 text-right whitespace-nowrap tabular sm:pr-3",
                    row.kind === "total" && "font-semibold",
                    row.kind === "subtotal" && "font-medium",
                    row.kind === "muted" ? "text-ink-3" : "text-ink",
                  )}
                >
                  {formatMoney(row.amount, currency)}
                </td>
                <td className="w-14 py-2 pr-3 sm:w-[38%] sm:pr-5">
                  <div className="flex items-center justify-end gap-3">
                    {row.bar && pct !== null ? (
                      <span aria-hidden className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-sunken sm:block">
                        <span className="block h-full rounded-full bg-chart-1" style={{ width: `${Math.min(pct, 1) * 100}%` }} />
                      </span>
                    ) : (
                      <span className="hidden flex-1 sm:block" />
                    )}
                    <span className={cn("w-11 shrink-0 text-right text-xs tabular sm:w-14", row.kind === "total" ? "font-semibold text-ink" : "text-ink-3")}>
                      {row.share ? formatPercent(pct) : ""}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-line px-5 py-3 text-xs text-ink-3">
        Percentages are shares of net revenue (net sales plus shipping charged). Contribution margin is not net profit: fixed costs, taxes on profit,
        interest and depreciation are not included above it.
      </p>
    </div>
  );
}
