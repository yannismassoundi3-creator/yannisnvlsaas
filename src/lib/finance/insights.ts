import type { Route } from "next";
import type { CampaignRow, ProductRow } from "@/lib/analytics/reference";
import { formatMultiple, formatPercent, formatPoints } from "./format";
import type { Metrics } from "./metrics";
import { formatMoney } from "./money";

/**
 * Deterministic, rule-based insights. Every insight is derived from figures
 * shown elsewhere in the product and lists them as evidence. Wording describes
 * what changed together and never claims one change caused another.
 */

export type InsightSeverity = "attention" | "info";

export type Insight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  evidence: { label: string; value: string }[];
  action?: { label: string; href: Route };
};

export type InsightInput = {
  currency: string;
  current: Metrics;
  previous: Metrics | null;
  products?: { current: ProductRow[]; previous: ProductRow[] };
  campaigns?: CampaignRow[];
  /** Store fee rule, used to explain estimates. */
  feeRule?: { basisPoints: number | null; fixedMinor: number | null };
};

/** Thresholds are deliberately conservative to avoid noise on small stores. */
export const INSIGHT_THRESHOLDS = {
  missingCostShare: 0.05,
  missingCostAttentionShare: 0.1,
  adGrowthGap: 0.1,
  adGrowthMin: 0.05,
  adMinShareOfRevenue: 0.02,
  refundRatePoints: 0.015,
  refundMinShareOfGross: 0.005,
  productMinRevenueShare: 0.05,
  productMarginDropPoints: 0.05,
  campaignMinSpendShare: 0.05,
  discountRatePoints: 0.03,
} as const;

function relativeChange(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

export function buildInsights(input: InsightInput): Insight[] {
  const { currency, current, previous } = input;
  const money = (v: number) => formatMoney(v, currency, { wholeUnits: Math.abs(v) >= 100_000 });
  const insights: Insight[] = [];
  const T = INSIGHT_THRESHOLDS;

  // 1. Negative contribution margin.
  if (current.netRevenue > 0 && current.contributionMargin < 0) {
    insights.push({
      id: "negative_contribution",
      severity: "attention",
      title: "Contribution margin is negative for this period",
      body: `After product costs and variable costs, the period shows ${money(current.contributionMargin)}. Variable costs exceeded what sales left after product costs.`,
      evidence: [
        { label: "Net revenue", value: money(current.netRevenue) },
        { label: "Product and variable costs", value: money(current.cogs + current.variableCosts) },
      ],
    });
  }

  // 2. Missing product costs.
  if (current.costCoverage !== null && 1 - current.costCoverage >= T.missingCostShare) {
    const share = 1 - current.costCoverage;
    const missingProducts = (input.products?.current ?? [])
      .filter((p) => p.linesWithoutCost > 0)
      .sort((a, b) => b.netRevenue - a.netRevenue)
      .slice(0, 3)
      .map((p) => p.name);
    insights.push({
      id: "missing_costs",
      severity: share >= T.missingCostAttentionShare ? "attention" : "info",
      title: `Cost data is missing for ${formatPercent(share, { digits: 0 })} of product sales`,
      body: `Contribution margin is overstated until these costs are added${missingProducts.length ? `: ${missingProducts.join(", ")}` : ""}.`,
      evidence: [
        { label: "Sales without a unit cost", value: money(current.salesWithoutCost) },
        { label: "Order lines without a unit cost", value: String(current.linesWithoutCost) },
      ],
      action: { label: "Add product costs", href: "/app/products?filter=missing-cost" },
    });
  }

  if (previous) {
    // 3. Advertising growing faster than revenue.
    const adGrowth = relativeChange(current.adSpend, previous.adSpend);
    const revenueGrowth = relativeChange(current.netRevenue, previous.netRevenue);
    if (
      adGrowth !== null &&
      revenueGrowth !== null &&
      adGrowth >= T.adGrowthMin &&
      adGrowth - revenueGrowth >= T.adGrowthGap &&
      current.netRevenue > 0 &&
      current.adSpend / current.netRevenue >= T.adMinShareOfRevenue
    ) {
      insights.push({
        id: "ad_spend_outpacing_revenue",
        severity: "attention",
        title: "Advertising spend grew faster than net revenue",
        body: `Ad spend changed by ${formatPercent(adGrowth, { signDisplay: "exceptZero" })} while net revenue changed by ${formatPercent(revenueGrowth, { signDisplay: "exceptZero" })} compared with the previous period. This does not show whether the extra spend drove sales; review campaign results before adjusting budgets.`,
        evidence: [
          { label: "Ad spend", value: `${money(previous.adSpend)} → ${money(current.adSpend)}` },
          { label: "Net revenue", value: `${money(previous.netRevenue)} → ${money(current.netRevenue)}` },
          { label: "Ad spend share of revenue", value: formatPercent(current.adSpendRate) },
        ],
        action: { label: "Review advertising", href: "/app/advertising" },
      });
    }

    // 4. Refund rate increase.
    if (
      current.refundRate !== null &&
      previous.refundRate !== null &&
      current.refundRate - previous.refundRate >= T.refundRatePoints &&
      current.refundRate >= T.refundMinShareOfGross
    ) {
      insights.push({
        id: "refund_rate_up",
        severity: "attention",
        title: "Refund rate increased",
        body: `Refunds were ${formatPercent(current.refundRate)} of gross sales, up from ${formatPercent(previous.refundRate)}. Refunds reduce net sales; product costs of returned items are not reversed automatically.`,
        evidence: [
          { label: "Refunds", value: `${money(previous.refunds)} → ${money(current.refunds)}` },
          { label: "Change", value: formatPoints(current.refundRate - previous.refundRate) },
        ],
        action: { label: "View refunds", href: "/app/transactions?tab=refunds" },
      });
    }

    // 5. Discount rate increase.
    if (
      current.discountRate !== null &&
      previous.discountRate !== null &&
      current.discountRate - previous.discountRate >= T.discountRatePoints
    ) {
      insights.push({
        id: "discount_rate_up",
        severity: "info",
        title: "Discounts take a larger share of sales",
        body: `Discounts were ${formatPercent(current.discountRate)} of gross sales, up from ${formatPercent(previous.discountRate)}.`,
        evidence: [{ label: "Discounts", value: `${money(previous.discounts)} → ${money(current.discounts)}` }],
      });
    }

    // 6. Product contribution margin decreases.
    if (input.products && current.netRevenue > 0 && previous.netRevenue > 0) {
      const prevById = new Map(input.products.previous.map((p) => [p.productId, p]));
      const drops = input.products.current
        .map((p) => ({ p, prev: prevById.get(p.productId) }))
        .filter(
          ({ p, prev }) =>
            prev &&
            p.contributionMarginRate !== null &&
            prev.contributionMarginRate !== null &&
            p.netRevenue / current.netRevenue >= T.productMinRevenueShare &&
            prev.netRevenue / previous.netRevenue >= T.productMinRevenueShare &&
            prev.contributionMarginRate - p.contributionMarginRate >= T.productMarginDropPoints,
        )
        .sort((a, b) => b.prev!.contributionMarginRate! - b.p.contributionMarginRate! - (a.prev!.contributionMarginRate! - a.p.contributionMarginRate!))
        .slice(0, 2);
      for (const { p, prev } of drops) {
        const reasons: string[] = [];
        if (p.adSpend > prev!.adSpend) reasons.push("linked advertising spend rose");
        const discountShare = (r: ProductRow) => (r.grossSales > 0 ? r.discounts / r.grossSales : 0);
        if (discountShare(p) > discountShare(prev!) + 0.01) reasons.push("discounts took a larger share");
        const refundShare = (r: ProductRow) => (r.grossSales > 0 ? r.refunds / r.grossSales : 0);
        if (refundShare(p) > refundShare(prev!) + 0.01) reasons.push("refunds took a larger share");
        insights.push({
          id: `product_margin_down:${p.productId}`,
          severity: "attention",
          title: `${p.name}: contribution margin fell from ${formatPercent(prev!.contributionMarginRate)} to ${formatPercent(p.contributionMarginRate)}`,
          body: reasons.length
            ? `In the same period, ${reasons.join(" and ")}. These changes coincide with the lower margin; they are not proven causes.`
            : "Compare its costs, prices and discounts with the previous period to understand the change.",
          evidence: [
            { label: "Net revenue", value: `${money(prev!.netRevenue)} → ${money(p.netRevenue)}` },
            { label: "Contribution margin", value: `${money(prev!.contributionMargin!)} → ${money(p.contributionMargin!)}` },
          ],
          action: { label: "Open product", href: `/app/products/${p.productId}` as Route },
        });
      }
    }
  }

  // 7. Campaigns below break-even ROAS (platform-reported).
  if (input.campaigns && current.breakEvenRoas !== null && current.adSpend > 0) {
    const below = input.campaigns.filter(
      (c) => c.platformRoas !== null && c.spend / current.adSpend >= T.campaignMinSpendShare && c.platformRoas < current.breakEvenRoas!,
    );
    if (below.length > 0) {
      const spend = below.reduce((a, c) => a + c.spend, 0);
      insights.push({
        id: "campaigns_below_break_even",
        severity: "attention",
        title:
          below.length === 1
            ? `“${below[0].name}” reports ROAS below your break-even point`
            : `${below.length} campaigns report ROAS below your break-even point`,
        body: `Your break-even ROAS is ${formatMultiple(current.breakEvenRoas)}: below it, advertising costs more than the margin left after product and variable costs. Platform ROAS uses each platform's own attribution and can over- or under-count sales.`,
        evidence: [
          ...below.slice(0, 3).map((c) => ({ label: c.name, value: `${formatMultiple(c.platformRoas)} on ${money(c.spend)}` })),
          { label: "Spend in these campaigns", value: money(spend) },
        ],
        action: { label: "Review campaigns", href: "/app/advertising" },
      });
    }
  }

  // 8. Estimated values in use.
  const estimatedFees = current.transactionFeesEstimated > 0;
  const estimatedShipping = current.shippingCostsEstimated > 0;
  if (estimatedFees || estimatedShipping) {
    const parts: string[] = [];
    if (estimatedFees) {
      const rule = input.feeRule;
      const ruleText =
        rule && (rule.basisPoints !== null || rule.fixedMinor !== null)
          ? ` (${formatPercent((rule.basisPoints ?? 0) / 10_000, { digits: 2 })}${rule.fixedMinor ? ` + ${formatMoney(rule.fixedMinor, currency)}` : ""} per order)`
          : "";
      parts.push(`payment fees${ruleText}`);
    }
    if (estimatedShipping) parts.push("shipping costs for orders without a recorded cost");
    insights.push({
      id: "estimated_values",
      severity: "info",
      title: "Some costs are estimates",
      body: `Narixia estimated ${parts.join(" and ")} from your store settings. Import actual amounts to replace the estimates.`,
      evidence: [
        ...(estimatedFees ? [{ label: "Estimated payment fees", value: money(current.transactionFeesEstimated) }] : []),
        ...(estimatedShipping ? [{ label: "Estimated shipping costs", value: money(current.shippingCostsEstimated) }] : []),
      ],
      action: { label: "Review cost settings", href: "/app/settings?section=costs" },
    });
  }

  const order: Record<InsightSeverity, number> = { attention: 0, info: 1 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
}
