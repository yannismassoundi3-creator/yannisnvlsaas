import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { resolveRange, type ResolvedRange } from "@/lib/analytics/range";
import { compareProductRows, type CampaignRow } from "@/lib/analytics/reference";
import {
  campaignRowFromSql,
  dailyTotalsFromSql,
  productRowFromSql,
  unallocatedFromSql,
  type ReportProductRow,
} from "@/lib/analytics/rows";
import { buildTimeSeries, type TimeSeries } from "@/lib/analytics/series";
import type { ReadyWorkspace, Store } from "@/lib/auth/workspace";
import { historyStart } from "@/lib/billing/entitlements";
import { eachDay, localDateOf, previousPeriod, todayIn } from "@/lib/dates";
import type { DateRange } from "@/lib/domain/types";
import { buildInsights, type Insight } from "@/lib/finance/insights";
import { deriveMetrics, EMPTY_TOTALS, type Metrics, type PeriodTotals } from "@/lib/finance/metrics";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Report data layer
 * -----------------
 * Server-only access to the SQL reporting functions. Every call runs with the
 * signed-in user's session, so Row Level Security limits results to stores of
 * their organisation; the functions themselves are SECURITY INVOKER.
 */

type Client = SupabaseClient<Database>;

export class ReportUnavailableError extends Error {
  constructor() {
    super("Report data could not be loaded. Please try again.");
    this.name = "ReportUnavailableError";
  }
}

/** The database refused: reports are paused because the trial or subscription ended. */
export class ReportsPausedError extends Error {
  constructor() {
    super("Reports are paused because the trial or subscription has ended.");
    this.name = "ReportsPausedError";
  }
}

function fail(scope: string, error: { code?: string; message?: string }): never {
  if (error.code === "42501") throw new ReportsPausedError();
  // Log the error class only: messages can echo query parameters.
  console.error(`[reports] ${scope} failed`, { code: error.code });
  throw new ReportUnavailableError();
}

const args = (storeId: string, range: DateRange) => ({ p_store_id: storeId, p_from: range.from, p_to: range.to });

export async function fetchDailyTotals(client: Client, storeId: string, range: DateRange): Promise<Map<string, PeriodTotals>> {
  const { data, error } = await client.rpc("report_daily_totals", args(storeId, range));
  if (error) fail("daily totals", error);
  return dailyTotalsFromSql(data ?? []);
}

export async function fetchProductBreakdown(client: Client, storeId: string, range: DateRange) {
  const [products, unallocated] = await Promise.all([
    client.rpc("report_product_breakdown", args(storeId, range)),
    client.rpc("report_unallocated", args(storeId, range)),
  ]);
  if (products.error) fail("product breakdown", products.error);
  if (unallocated.error) fail("unallocated amounts", unallocated.error);
  const rows: ReportProductRow[] = (products.data ?? []).map(productRowFromSql).sort(compareProductRows);
  return { rows, unallocated: unallocatedFromSql(unallocated.data?.[0]) };
}

export async function fetchCampaigns(client: Client, storeId: string, range: DateRange): Promise<CampaignRow[]> {
  const { data, error } = await client.rpc("report_campaign_breakdown", args(storeId, range));
  if (error) fail("campaigns", error);
  return (data ?? []).map(campaignRowFromSql);
}

export type AdDailyPoint = { day: string; platform: string; spend: number; conversionValue: number };

export async function fetchAdDaily(client: Client, storeId: string, range: DateRange): Promise<AdDailyPoint[]> {
  const { data, error } = await client.rpc("report_ad_daily", args(storeId, range));
  if (error) fail("ad daily", error);
  return (data ?? []).map((r) => ({
    day: String(r.day).slice(0, 10),
    platform: r.platform,
    spend: Number(r.spend ?? 0),
    conversionValue: Number(r.conversion_value ?? 0),
  }));
}

function sumTotals(daily: Map<string, PeriodTotals>): PeriodTotals {
  const total = { ...EMPTY_TOTALS };
  for (const t of daily.values()) for (const k of Object.keys(total) as (keyof PeriodTotals)[]) total[k] += t[k];
  return total;
}

/** Totals for a range, summed from the daily function so all views agree. */
export async function fetchTotals(client: Client, storeId: string, range: DateRange): Promise<PeriodTotals> {
  return sumTotals(await fetchDailyTotals(client, storeId, range));
}

export type ReportPeriod = ResolvedRange & {
  today: string;
  /** Previous period of equal length, or null when it falls outside the plan's history window. */
  comparison: DateRange | null;
  /** Number of days in the selected range. */
  days: number;
};

/**
 * Resolves the reporting period for a store from URL parameters: dates are in
 * the store's time zone, and both the selected and the comparison period must
 * lie within the plan's history window.
 */
export function reportPeriod(
  store: Pick<Store, "timezone">,
  entitlements: ReadyWorkspace["entitlements"],
  params: { range?: string | string[]; from?: string | string[]; to?: string | string[] },
): ReportPeriod {
  const today = todayIn(store.timezone);
  const resolved = resolveRange(params, today, historyStart(entitlements, today));
  const previous = previousPeriod(resolved.range);
  return {
    ...resolved,
    today,
    comparison: previous.from >= resolved.historyStart ? previous : null,
    days: eachDay(resolved.range).length,
  };
}

export type OverviewData = {
  metrics: Metrics;
  previous: Metrics | null;
  series: TimeSeries;
  products: ReportProductRow[];
  unallocated: { adSpend: number; refunds: number; variableExpenses: number };
  campaigns: CampaignRow[];
  insights: Insight[];
};

/** Everything the overview needs for one store and period, in one round of parallel queries. */
export const getOverviewData = cache(async (store: Store, range: DateRange, comparison: DateRange | null): Promise<OverviewData> => {
  const client = await createClient();
  const [daily, previousDaily, products, previousProducts, campaigns] = await Promise.all([
    fetchDailyTotals(client, store.id, range),
    comparison ? fetchDailyTotals(client, store.id, comparison) : null,
    fetchProductBreakdown(client, store.id, range),
    comparison ? fetchProductBreakdown(client, store.id, comparison) : null,
    fetchCampaigns(client, store.id, range),
  ]);

  const metrics = deriveMetrics(sumTotals(daily));
  const previous = previousDaily ? deriveMetrics(sumTotals(previousDaily)) : null;
  const insights = buildInsights({
    currency: store.currency,
    current: metrics,
    previous,
    products: { current: products.rows, previous: previousProducts?.rows ?? [] },
    campaigns,
    feeRule: { basisPoints: store.fee_rule_bps, fixedMinor: store.fee_rule_fixed_minor },
  });

  return {
    metrics,
    previous,
    series: buildTimeSeries(daily, range),
    products: products.rows,
    unallocated: products.unallocated,
    campaigns,
    insights,
  };
});

export type StoreDataStatus = {
  orders: number;
  products: number;
  productsWithoutCost: number;
  adSpendDays: number;
  expenses: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  feeRuleSet: boolean;
  shippingRuleSet: boolean;
};

/** Counts used for empty states, the setup checklist and data-quality notices. */
export const getStoreDataStatus = cache(async (store: Store): Promise<StoreDataStatus> => {
  const client = await createClient();
  const count = { count: "exact" as const, head: true };
  const [orders, products, withoutCost, adDays, expenses, first, last] = await Promise.all([
    client.from("orders").select("id", count).eq("store_id", store.id),
    client.from("products").select("id", count).eq("store_id", store.id).is("archived_at", null),
    client.from("products").select("id", count).eq("store_id", store.id).is("archived_at", null).is("unit_cost_e4", null),
    client.from("ad_spend_daily").select("id", count).eq("store_id", store.id),
    client.from("expenses").select("id", count).eq("store_id", store.id),
    client.from("orders").select("ordered_at").eq("store_id", store.id).order("ordered_at", { ascending: true }).limit(1).maybeSingle(),
    client.from("orders").select("ordered_at").eq("store_id", store.id).order("ordered_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const [scope, r] of Object.entries({ orders, products, withoutCost, adDays, expenses, first, last })) {
    if (r.error) fail(`data status (${scope})`, r.error);
  }
  const localDate = (instant: string | undefined) => (instant ? localDateOf(instant, store.timezone) : null);
  return {
    orders: orders.count ?? 0,
    products: products.count ?? 0,
    productsWithoutCost: withoutCost.count ?? 0,
    adSpendDays: adDays.count ?? 0,
    expenses: expenses.count ?? 0,
    firstOrderDate: localDate(first.data?.ordered_at),
    lastOrderDate: localDate(last.data?.ordered_at),
    feeRuleSet: store.fee_rule_bps !== null || store.fee_rule_fixed_minor !== null,
    shippingRuleSet: store.default_shipping_cost_minor !== null,
  };
});
