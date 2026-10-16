import type { Route } from "next";
import type { Locale } from "@/i18n/config";
import { createFormat } from "@/i18n/format";
import { insightMessages } from "@/i18n/messages/dashboard-insights";
import type { CampaignRow, ProductRow } from "@/lib/analytics/reference";
import type { Metrics } from "./metrics";

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
  /** Language of titles, bodies, evidence and action labels. Defaults to English. */
  locale?: Locale;
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
  const locale = input.locale ?? "en";
  const f = createFormat(locale);
  const t = insightMessages[locale];
  const formatPercent = f.percent;
  const formatMultiple = f.multiple;
  const formatPoints = f.points;
  const money = (v: number) => f.money(v, currency, { wholeUnits: Math.abs(v) >= 100_000 });
  const insights: Insight[] = [];
  const T = INSIGHT_THRESHOLDS;

  // 1. Negative contribution margin.
  if (current.netRevenue > 0 && current.contributionMargin < 0) {
    insights.push({
      id: "negative_contribution",
      severity: "attention",
      title: t.negativeContribution.title,
      body: t.negativeContribution.body(money(current.contributionMargin)),
      evidence: [
        { label: t.negativeContribution.netRevenue, value: money(current.netRevenue) },
        { label: t.negativeContribution.costs, value: money(current.cogs + current.variableCosts) },
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
      title: t.missingCosts.title(formatPercent(share, { digits: 0 })),
      body: t.missingCosts.body(t.joinNames(missingProducts)),
      evidence: [
        { label: t.missingCosts.salesWithoutCost, value: money(current.salesWithoutCost) },
        { label: t.missingCosts.linesWithoutCost, value: String(current.linesWithoutCost) },
      ],
      action: { label: t.missingCosts.action, href: "/app/products?filter=missing-cost" },
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
        title: t.adSpendOutpacing.title,
        body: t.adSpendOutpacing.body(formatPercent(adGrowth, { signDisplay: "exceptZero" }), formatPercent(revenueGrowth, { signDisplay: "exceptZero" })),
        evidence: [
          { label: t.adSpendOutpacing.adSpend, value: `${money(previous.adSpend)} → ${money(current.adSpend)}` },
          { label: t.adSpendOutpacing.netRevenue, value: `${money(previous.netRevenue)} → ${money(current.netRevenue)}` },
          { label: t.adSpendOutpacing.share, value: formatPercent(current.adSpendRate) },
        ],
        action: { label: t.adSpendOutpacing.action, href: "/app/advertising" },
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
        title: t.refundRateUp.title,
        body: t.refundRateUp.body(formatPercent(current.refundRate), formatPercent(previous.refundRate)),
        evidence: [
          { label: t.refundRateUp.refunds, value: `${money(previous.refunds)} → ${money(current.refunds)}` },
          { label: t.refundRateUp.change, value: formatPoints(current.refundRate - previous.refundRate) },
        ],
        action: { label: t.refundRateUp.action, href: "/app/transactions?tab=refunds" },
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
        title: t.discountRateUp.title,
        body: t.discountRateUp.body(formatPercent(current.discountRate), formatPercent(previous.discountRate)),
        evidence: [{ label: t.discountRateUp.discounts, value: `${money(previous.discounts)} → ${money(current.discounts)}` }],
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
        if (p.adSpend > prev!.adSpend) reasons.push(t.productMarginDown.reasonAds);
        const discountShare = (r: ProductRow) => (r.grossSales > 0 ? r.discounts / r.grossSales : 0);
        if (discountShare(p) > discountShare(prev!) + 0.01) reasons.push(t.productMarginDown.reasonDiscounts);
        const refundShare = (r: ProductRow) => (r.grossSales > 0 ? r.refunds / r.grossSales : 0);
        if (refundShare(p) > refundShare(prev!) + 0.01) reasons.push(t.productMarginDown.reasonRefunds);
        insights.push({
          id: `product_margin_down:${p.productId}`,
          severity: "attention",
          title: t.productMarginDown.title(p.name, formatPercent(prev!.contributionMarginRate), formatPercent(p.contributionMarginRate)),
          body: reasons.length ? t.productMarginDown.bodyWithReasons(t.joinAnd(reasons)) : t.productMarginDown.bodyNoReasons,
          evidence: [
            { label: t.productMarginDown.netRevenue, value: `${money(prev!.netRevenue)} → ${money(p.netRevenue)}` },
            { label: t.productMarginDown.contributionMargin, value: `${money(prev!.contributionMargin!)} → ${money(p.contributionMargin!)}` },
          ],
          action: { label: t.productMarginDown.action, href: `/app/products/${p.productId}` as Route },
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
        title: below.length === 1 ? t.campaignsBelowBreakEven.titleOne(below[0].name) : t.campaignsBelowBreakEven.titleMany(below.length),
        body: t.campaignsBelowBreakEven.body(formatMultiple(current.breakEvenRoas)),
        evidence: [
          ...below.slice(0, 3).map((c) => ({ label: c.name, value: t.campaignsBelowBreakEven.campaignValue(formatMultiple(c.platformRoas), money(c.spend)) })),
          { label: t.campaignsBelowBreakEven.spend, value: money(spend) },
        ],
        action: { label: t.campaignsBelowBreakEven.action, href: "/app/advertising" },
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
          ? t.estimatedValues.ruleText(formatPercent((rule.basisPoints ?? 0) / 10_000, { digits: 2 }), rule.fixedMinor ? f.money(rule.fixedMinor, currency) : null)
          : "";
      parts.push(t.estimatedValues.fees(ruleText));
    }
    if (estimatedShipping) parts.push(t.estimatedValues.shipping);
    insights.push({
      id: "estimated_values",
      severity: "info",
      title: t.estimatedValues.title,
      body: t.estimatedValues.body(t.joinAnd(parts)),
      evidence: [
        ...(estimatedFees ? [{ label: t.estimatedValues.estimatedFees, value: money(current.transactionFeesEstimated) }] : []),
        ...(estimatedShipping ? [{ label: t.estimatedValues.estimatedShipping, value: money(current.shippingCostsEstimated) }] : []),
      ],
      action: { label: t.estimatedValues.action, href: "/app/settings?section=costs" },
    });
  }

  const order: Record<InsightSeverity, number> = { attention: 0, info: 1 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
}
