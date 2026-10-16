import "server-only";
import { dataNotices } from "@/components/dashboard/data-notices";
import type { Locale } from "@/i18n/config";
import { createFormat } from "@/i18n/format";
import { reportFiles } from "@/i18n/messages/account-reports";
import type { ReadyWorkspace, Store } from "@/lib/auth/workspace";
import { type CsvCell } from "@/lib/csv";
import { fetchDailyTotals, fetchProductBreakdown, getOverviewData, type OverviewData, type ReportPeriod } from "@/lib/data/reports";
import { moneyCell, rateCell } from "@/lib/exports";
import { buildInsights, type Insight } from "@/lib/finance/insights";
import { createClient } from "@/lib/supabase/server";
import type { PdfReportInput, ReportKind } from "./pdf";

export const REPORT_KINDS: ReportKind[] = ["summary", "products", "advertising"];

/** Everything a PDF report needs, from the same data functions as the screens. */
export async function buildPdfInput(ws: ReadyWorkspace, store: Store, period: ReportPeriod, kind: ReportKind, locale: Locale = "en"): Promise<PdfReportInput> {
  const data = await getOverviewData(store, period.range, period.comparison);
  const f = createFormat(locale);
  const notes = dataNotices(data.metrics, store).map((n) => `${n.title}. ${n.body}`);
  if (data.unallocated.adSpend > 0) {
    notes.push(reportFiles[locale].unallocatedNote(f.money(data.unallocated.adSpend, store.currency)));
  }
  return {
    kind,
    locale,
    storeName: store.name,
    isDemo: store.is_demo,
    currency: store.currency,
    timezone: store.timezone,
    range: period.range,
    comparison: period.comparison,
    generatedAt: f.dateTime(new Date(), store.timezone),
    metrics: data.metrics,
    previous: data.previous,
    products: data.products,
    campaigns: data.campaigns,
    insights: locale === "en" ? data.insights : await localizedInsights(store, period, data, locale),
    notes,
    unallocatedAdSpend: data.unallocated.adSpend,
  };
}

/**
 * getOverviewData builds its insights in English (it is cached per store and
 * period, without a language). For another language, rebuild them with the
 * same inputs and the report's locale.
 */
async function localizedInsights(store: Store, period: ReportPeriod, data: OverviewData, locale: Locale): Promise<Insight[]> {
  const previousProducts = period.comparison ? await fetchProductBreakdown(await createClient(), store.id, period.comparison) : null;
  const input = {
    currency: store.currency,
    current: data.metrics,
    previous: data.previous,
    products: { current: data.products, previous: previousProducts?.rows ?? [] },
    campaigns: data.campaigns,
    feeRule: { basisPoints: store.fee_rule_bps, fixedMinor: store.fee_rule_fixed_minor },
    locale,
  };
  return buildInsights(input);
}

/** Key figures and the profit breakdown, current vs previous period, as CSV rows. */
export async function summaryCsvRows(store: Store, period: ReportPeriod, locale: Locale = "en"): Promise<{ header: string[]; rows: CsvCell[][] }> {
  const t = reportFiles[locale];
  const L = t.summary;
  const data = await getOverviewData(store, period.range, period.comparison);
  const m = data.metrics;
  const p = data.previous;
  const c = store.currency;
  const line = (label: string, current: number, previous: number | undefined | null): CsvCell[] => [label, moneyCell(current, c), previous === undefined || previous === null ? null : moneyCell(previous, c)];
  return {
    header: [t.measure, t.rangeColumn(period.range.from, period.range.to), period.comparison ? t.rangeColumn(period.comparison.from, period.comparison.to) : t.previousUnavailable],
    rows: [
      line(L.grossSales, m.grossSales, p?.grossSales),
      line(L.discounts, m.discounts, p?.discounts),
      line(L.refunds, m.refunds, p?.refunds),
      line(L.netSales, m.netSales, p?.netSales),
      line(L.shippingCharged, m.shippingCharged, p?.shippingCharged),
      line(L.netRevenue, m.netRevenue, p?.netRevenue),
      line(L.cogs, m.cogs, p?.cogs),
      line(L.grossProfit, m.grossProfit, p?.grossProfit),
      line(L.shippingCosts, m.shippingCosts, p?.shippingCosts),
      line(L.ofWhichEstimated, m.shippingCostsEstimated, p?.shippingCostsEstimated),
      line(L.transactionFees, m.transactionFees, p?.transactionFees),
      line(L.ofWhichEstimated, m.transactionFeesEstimated, p?.transactionFeesEstimated),
      line(L.adSpend, m.adSpend, p?.adSpend),
      line(L.otherVariableCosts, m.otherVariableCosts, p?.otherVariableCosts),
      line(L.contributionMargin, m.contributionMargin, p?.contributionMargin),
      [L.contributionMarginRate, rateCell(m.contributionMarginRate), p ? rateCell(p.contributionMarginRate) : null],
      line(L.fixedCosts, m.fixedCosts, p?.fixedCosts),
      line(L.operatingProfit, m.operatingProfit, p?.operatingProfit),
      [L.orders, m.orders, p ? p.orders : null],
      [L.units, m.units, p ? p.units : null],
      [L.averageOrderValue, m.averageOrderValue === null ? null : moneyCell(m.averageOrderValue, c), p?.averageOrderValue != null ? moneyCell(p.averageOrderValue, c) : null],
      [L.salesWithoutCost, moneyCell(m.salesWithoutCost, c), p ? moneyCell(p.salesWithoutCost, c) : null],
      [L.ordersWithoutShipping, m.ordersWithoutShippingCost, p ? p.ordersWithoutShippingCost : null],
      [L.ordersWithoutFees, m.ordersWithoutFees, p ? p.ordersWithoutFees : null],
    ],
  };
}

/** One row per day with every component, for spreadsheets and accountants. */
export async function dailyCsvRows(store: Store, period: ReportPeriod, locale: Locale = "en"): Promise<{ header: string[]; rows: CsvCell[][] }> {
  const client = await createClient();
  const daily = await fetchDailyTotals(client, store.id, period.range);
  const c = store.currency;
  const days = [...daily.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return {
    header: [...reportFiles[locale].daily],
    rows: days.map(([day, t]) => [
      day,
      t.orders,
      t.units,
      moneyCell(t.grossSales, c),
      moneyCell(t.discounts, c),
      moneyCell(t.refunds, c),
      moneyCell(t.shippingCharged, c),
      moneyCell(t.cogs, c),
      moneyCell(t.salesWithoutCost, c),
      moneyCell(t.shippingCosts, c),
      moneyCell(t.transactionFees, c),
      moneyCell(t.adSpend, c),
      moneyCell(t.otherVariableCosts, c),
      moneyCell(t.fixedCosts, c),
    ]),
  };
}
