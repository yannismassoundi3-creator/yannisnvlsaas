import "server-only";
import { dataNotices } from "@/components/dashboard/data-notices";
import type { ReadyWorkspace, Store } from "@/lib/auth/workspace";
import { type CsvCell } from "@/lib/csv";
import { fetchDailyTotals, getOverviewData, type ReportPeriod } from "@/lib/data/reports";
import { formatDateTime } from "@/lib/dates";
import { moneyCell, rateCell } from "@/lib/exports";
import { formatMoney } from "@/lib/finance/money";
import { createClient } from "@/lib/supabase/server";
import type { PdfReportInput, ReportKind } from "./pdf";

export const REPORT_KINDS: ReportKind[] = ["summary", "products", "advertising"];

/** Everything a PDF report needs, from the same data functions as the screens. */
export async function buildPdfInput(ws: ReadyWorkspace, store: Store, period: ReportPeriod, kind: ReportKind): Promise<PdfReportInput> {
  const data = await getOverviewData(store, period.range, period.comparison);
  const notes = dataNotices(data.metrics, store).map((n) => `${n.title}. ${n.body}`);
  if (data.unallocated.adSpend > 0) {
    notes.push(`Ad spend of campaigns not linked to a single product (${formatMoney(data.unallocated.adSpend, store.currency)}) is kept at store level and not split across products.`);
  }
  return {
    kind,
    storeName: store.name,
    isDemo: store.is_demo,
    currency: store.currency,
    timezone: store.timezone,
    range: period.range,
    comparison: period.comparison,
    generatedAt: formatDateTime(new Date(), store.timezone),
    metrics: data.metrics,
    previous: data.previous,
    products: data.products,
    campaigns: data.campaigns,
    insights: data.insights,
    notes,
    unallocatedAdSpend: data.unallocated.adSpend,
  };
}

/** Key figures and the profit breakdown, current vs previous period, as CSV rows. */
export async function summaryCsvRows(store: Store, period: ReportPeriod): Promise<{ header: string[]; rows: CsvCell[][] }> {
  const data = await getOverviewData(store, period.range, period.comparison);
  const m = data.metrics;
  const p = data.previous;
  const c = store.currency;
  const line = (label: string, current: number, previous: number | undefined | null): CsvCell[] => [label, moneyCell(current, c), previous === undefined || previous === null ? null : moneyCell(previous, c)];
  return {
    header: ["Measure", `${period.range.from} to ${period.range.to}`, period.comparison ? `${period.comparison.from} to ${period.comparison.to}` : "Previous period (not available)"],
    rows: [
      line("Gross sales", m.grossSales, p?.grossSales),
      line("Discounts", m.discounts, p?.discounts),
      line("Refunds", m.refunds, p?.refunds),
      line("Net sales", m.netSales, p?.netSales),
      line("Shipping charged", m.shippingCharged, p?.shippingCharged),
      line("Net revenue", m.netRevenue, p?.netRevenue),
      line("Cost of goods sold (known costs only)", m.cogs, p?.cogs),
      line("Gross profit", m.grossProfit, p?.grossProfit),
      line("Shipping & fulfilment costs", m.shippingCosts, p?.shippingCosts),
      line("of which estimated", m.shippingCostsEstimated, p?.shippingCostsEstimated),
      line("Payment fees", m.transactionFees, p?.transactionFees),
      line("of which estimated", m.transactionFeesEstimated, p?.transactionFeesEstimated),
      line("Advertising", m.adSpend, p?.adSpend),
      line("Other variable costs", m.otherVariableCosts, p?.otherVariableCosts),
      line("Contribution margin", m.contributionMargin, p?.contributionMargin),
      ["Contribution margin % of net revenue", rateCell(m.contributionMarginRate), p ? rateCell(p.contributionMarginRate) : null],
      line("Fixed costs recorded", m.fixedCosts, p?.fixedCosts),
      line("Operating profit (estimate)", m.operatingProfit, p?.operatingProfit),
      ["Orders", m.orders, p ? p.orders : null],
      ["Units", m.units, p ? p.units : null],
      ["Average order value", m.averageOrderValue === null ? null : moneyCell(m.averageOrderValue, c), p?.averageOrderValue != null ? moneyCell(p.averageOrderValue, c) : null],
      ["Product sales without a unit cost", moneyCell(m.salesWithoutCost, c), p ? moneyCell(p.salesWithoutCost, c) : null],
      ["Orders without shipping cost or rule", m.ordersWithoutShippingCost, p ? p.ordersWithoutShippingCost : null],
      ["Orders without payment fee or rule", m.ordersWithoutFees, p ? p.ordersWithoutFees : null],
    ],
  };
}

/** One row per day with every component, for spreadsheets and accountants. */
export async function dailyCsvRows(store: Store, period: ReportPeriod): Promise<{ header: string[]; rows: CsvCell[][] }> {
  const client = await createClient();
  const daily = await fetchDailyTotals(client, store.id, period.range);
  const c = store.currency;
  const days = [...daily.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return {
    header: ["Date", "Orders", "Units", "Gross sales", "Discounts", "Refunds", "Shipping charged", "COGS (known)", "Sales without cost", "Shipping costs", "Payment fees", "Ad spend", "Other variable costs", "Fixed costs"],
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
