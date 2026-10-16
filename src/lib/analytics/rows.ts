import type { Database } from "@/lib/supabase/database.types";
import type { PeriodTotals } from "@/lib/finance/metrics";
import { deriveProductRow, type CampaignRow, type ProductRow } from "./reference";

/**
 * Mapping from the SQL reporting functions (supabase/migrations/*_reporting.sql)
 * to the domain types used by metrics, charts and insights. Pure, so the same
 * mapping is exercised by unit tests and by the database parity tests.
 */

type Functions = Database["public"]["Functions"];
export type DailyTotalsSqlRow = Functions["report_daily_totals"]["Returns"][number];
export type ProductBreakdownSqlRow = Functions["report_product_breakdown"]["Returns"][number];
export type CampaignSqlRow = Functions["report_campaign_breakdown"]["Returns"][number];
export type UnallocatedSqlRow = Functions["report_unallocated"]["Returns"][number];
export type AdDailySqlRow = Functions["report_ad_daily"]["Returns"][number];

/** PostgREST returns bigint and numeric values as JSON numbers; guard against null and strings anyway. */
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const nullableNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function totalsFromSql(r: Omit<DailyTotalsSqlRow, "day">): PeriodTotals {
  return {
    orders: num(r.orders),
    units: num(r.units),
    grossSales: num(r.gross_sales),
    discounts: num(r.discounts),
    refunds: num(r.refunds),
    shippingCharged: num(r.shipping_charged),
    cogs: num(r.cogs),
    productSalesAfterDiscounts: num(r.product_sales_after_discounts),
    salesWithoutCost: num(r.sales_without_cost),
    linesWithoutCost: num(r.lines_without_cost),
    shippingCosts: num(r.shipping_costs),
    shippingCostsEstimated: num(r.shipping_costs_estimated),
    ordersWithoutShippingCost: num(r.orders_without_shipping_cost),
    transactionFees: num(r.transaction_fees),
    transactionFeesEstimated: num(r.transaction_fees_estimated),
    ordersWithoutFees: num(r.orders_without_fees),
    adSpend: num(r.ad_spend),
    otherVariableCosts: num(r.other_variable_costs),
    fixedCosts: num(r.fixed_costs),
  };
}

/** Daily totals keyed by local date (YYYY-MM-DD). */
export function dailyTotalsFromSql(rows: DailyTotalsSqlRow[]): Map<string, PeriodTotals> {
  return new Map(rows.map((r) => [String(r.day).slice(0, 10), totalsFromSql(r)]));
}

export type ReportProductRow = ProductRow & { archived: boolean };

export function productRowFromSql(r: ProductBreakdownSqlRow): ReportProductRow {
  const linesWithoutCost = num(r.lines_without_cost);
  return {
    ...deriveProductRow({
      productId: r.product_id,
      sku: r.sku ?? null,
      name: r.name,
      unitCostE4: nullableNum(r.unit_cost_e4),
      units: num(r.units),
      grossSales: num(r.gross_sales),
      discounts: num(r.discounts),
      refunds: num(r.refunds),
      shippingCharged: num(r.shipping_charged),
      cogs: linesWithoutCost > 0 ? null : nullableNum(r.cogs),
      linesWithoutCost,
      shippingCosts: num(r.shipping_costs),
      transactionFees: num(r.transaction_fees),
      adSpend: num(r.ad_spend),
    }),
    archived: Boolean(r.archived),
  };
}

export function campaignRowFromSql(r: CampaignSqlRow): CampaignRow {
  const spend = num(r.spend);
  const conversionValue = num(r.conversion_value);
  return {
    campaignId: r.campaign_id,
    platform: r.platform,
    name: r.name,
    productId: (r.product_id as string | null) ?? null,
    spend,
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    conversions: num(r.conversions),
    conversionValue,
    platformRoas: spend > 0 ? conversionValue / spend : null,
  };
}

export function unallocatedFromSql(r: UnallocatedSqlRow | undefined) {
  return { adSpend: num(r?.ad_spend), refunds: num(r?.refunds), variableExpenses: num(r?.variable_expenses) };
}
