import type { NextRequest } from "next/server";
import { track } from "@/lib/analytics/track";
import { audit } from "@/lib/audit";
import { getWorkspace } from "@/lib/auth/workspace";
import { fileSlug, toCsv } from "@/lib/csv";
import { listCatalogAll } from "@/lib/data/products";
import { reportPeriod } from "@/lib/data/reports";
import { costCell, csvResponse, moneyCell, rateCell, textResponse } from "@/lib/exports";
import { consumeRateLimit } from "@/lib/rate-limit";
import { exportsMessages } from "@/i18n/messages/catalog-exports";
import { getRequestLocale } from "@/i18n/request";

/** Product profitability for a period as CSV (Pro). Amounts exclude tax; text cells are formula-safe. Headers follow the request language. */
export async function GET(request: NextRequest) {
  const [ws, locale] = await Promise.all([getWorkspace().catch(() => null), getRequestLocale()]);
  const t = exportsMessages[locale];
  if (!ws?.organization || !ws.activeStore) return textResponse(t.signInRequired, 401);
  if (!ws.entitlements.limits.exports) return textResponse(t.proOnly, 403);
  if (!(await consumeRateLimit(`export:${ws.user.id}`, 60, 3600))) return textResponse(t.tooManyExports, 429);

  const store = ws.activeStore;
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const period = reportPeriod(store, ws.entitlements, params);
  const rows = await listCatalogAll(store, period.range, "all");
  const c = store.currency;
  const csv = toCsv(
    t.productColumns,
    rows.map((r) => [
      r.name,
      r.sku,
      r.archived ? t.yes : t.no,
      costCell(r.unitCostE4),
      r.units,
      moneyCell(r.grossSales, c),
      moneyCell(r.discounts, c),
      moneyCell(r.refunds, c),
      moneyCell(r.netSales, c),
      moneyCell(r.shippingCharged, c),
      moneyCell(r.netRevenue, c),
      moneyCell(r.cogs, c),
      r.linesWithoutCost,
      moneyCell(r.shippingCosts, c),
      moneyCell(r.transactionFees, c),
      moneyCell(r.adSpend, c),
      moneyCell(r.contributionMargin, c),
      rateCell(r.contributionMarginRate),
    ]),
  );
  audit("data.exported", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "store", id: store.id }, { export: "products", rows: rows.length });
  track("report_exported", { organizationId: ws.organization.id, userId: ws.user.id }, { report: "products_csv" });
  return csvResponse(csv, `${fileSlug(store.name)}-products-${period.range.from}-to-${period.range.to}.csv`);
}
