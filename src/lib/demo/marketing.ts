import "server-only";
import { cacheLife } from "next/cache";
import { computeCampaignBreakdown, computeDailyTotals, computeProductBreakdown, computeTotals } from "@/lib/analytics/reference";
import { buildTimeSeries } from "@/lib/analytics/series";
import { addDays, previousPeriod, todayIn } from "@/lib/dates";
import { buildInsights } from "@/lib/finance/insights";
import { deriveMetrics } from "@/lib/finance/metrics";
import { generateDemoDataset } from "./generator";

const DEMO_TIMEZONE = "Europe/Paris";

/**
 * Demo figures for the public website, computed from the fictional sample
 * store. Cached for a day so the marketing pages stay static and fast.
 */
export async function getMarketingDemo() {
  "use cache";
  cacheLife("days");

  const end = addDays(todayIn(DEMO_TIMEZONE), -1);
  const ds = generateDemoDataset({ endDate: end, timezone: DEMO_TIMEZONE });
  const range = { from: addDays(end, -29), to: end };
  const prev = previousPeriod(range);

  const metrics = deriveMetrics(computeTotals(ds, range));
  const previous = deriveMetrics(computeTotals(ds, prev));
  const products = computeProductBreakdown(ds, range);
  const previousProducts = computeProductBreakdown(ds, prev);
  const campaigns = computeCampaignBreakdown(ds, range);
  const series = buildTimeSeries(computeDailyTotals(ds, range), range);
  const insights = buildInsights({
    currency: ds.settings.currency,
    current: metrics,
    previous,
    products: { current: products.rows, previous: previousProducts.rows },
    campaigns,
    feeRule: { basisPoints: ds.settings.feeRuleBasisPoints, fixedMinor: ds.settings.feeRuleFixedMinor },
  });

  return {
    currency: ds.settings.currency,
    range,
    metrics,
    previous,
    products: products.rows,
    unallocated: products.unallocated,
    campaigns,
    series,
    insights,
  };
}

export type MarketingDemo = Awaited<ReturnType<typeof getMarketingDemo>>;
