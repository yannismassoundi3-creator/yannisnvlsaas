import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/ui/badge";
import type { ProductRow } from "@/lib/analytics/reference";
import { formatPercent } from "@/lib/finance/format";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

type Props = {
  rows: Pick<ProductRow, "productId" | "name" | "netRevenue" | "contributionMargin" | "contributionMarginRate" | "linesWithoutCost">[];
  currency: string;
  /** Link products to their detail page (app only). */
  linkProducts?: boolean;
  limit?: number;
  className?: string;
};

/**
 * Contribution margin by product as diverging bars around zero: positive
 * margins extend right in emerald, losses extend left in brick. Direction and
 * the signed value carry the meaning too, so colour is never the only cue.
 */
export function ProductMarginBars({ rows, currency, linkProducts = false, limit = 8, className }: Props) {
  const sorted = [...rows]
    .sort((a, b) => (b.contributionMargin ?? -Infinity) - (a.contributionMargin ?? -Infinity) || b.netRevenue - a.netRevenue)
    .slice(0, limit);
  const max = Math.max(1, ...sorted.map((r) => Math.abs(r.contributionMargin ?? 0)));
  const hasNegative = sorted.some((r) => (r.contributionMargin ?? 0) < 0);

  return (
    <div className={cn("rounded-lg border border-line bg-surface shadow-xs", className)}>
      <div className="px-5 pt-4 pb-1">
        <h2 className="text-md font-semibold tracking-tight text-ink">Contribution margin by product</h2>
        <p className="text-sm text-ink-3">After product costs, allocated shipping and fees, and linked campaigns.</p>
      </div>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">Contribution margin by product</caption>
        <thead>
          <tr className="text-xs whitespace-nowrap text-ink-3">
            <th scope="col" className="w-[38%] px-5 py-2 text-left font-medium">Product</th>
            <th scope="col" className="hidden w-[30%] px-3 py-2 font-medium sm:table-cell">
              <span className="sr-only">Bar</span>
            </th>
            <th scope="col" className="w-[18%] px-3 py-2 text-right font-medium">Margin</th>
            <th scope="col" className="w-[14%] py-2 pr-5 pl-3 text-right font-medium">Margin %</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const cm = r.contributionMargin;
            const width = cm === null ? 0 : (Math.abs(cm) / max) * (hasNegative ? 50 : 100);
            const name = linkProducts ? (
              <Link href={`/app/products/${r.productId}` as Route} className="hover:underline">
                {r.name}
              </Link>
            ) : (
              r.name
            );
            return (
              <tr key={r.productId} className="border-t border-line">
                <th scope="row" className="truncate px-5 py-2.5 text-left font-normal text-ink" title={r.name}>
                  {name}
                </th>
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  {cm === null ? (
                    <Badge tone="caution">Cost missing</Badge>
                  ) : (
                    <div className="relative h-2.5 w-full" aria-hidden>
                      {hasNegative ? <span className="absolute inset-y-[-3px] left-1/2 w-px bg-chart-axis" /> : null}
                      <span
                        className={cn("absolute inset-y-0 rounded-[3px]", cm >= 0 ? "bg-chart-positive" : "bg-chart-negative")}
                        style={
                          cm >= 0
                            ? { left: hasNegative ? "50%" : 0, width: `${width}%` }
                            : { right: "50%", width: `${width}%` }
                        }
                      />
                    </div>
                  )}
                </td>
                <td className={cn("px-3 py-2.5 text-right whitespace-nowrap tabular", cm !== null && cm < 0 ? "text-negative-700" : "text-ink")}>
                  {cm === null ? <span className="text-ink-3">—</span> : formatMoney(cm, currency, { signDisplay: "exceptZero" })}
                </td>
                <td className="py-2.5 pr-5 pl-3 text-right text-ink-2 tabular">{formatPercent(r.contributionMarginRate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
