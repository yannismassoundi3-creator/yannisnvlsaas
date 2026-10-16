import type { NextRequest } from "next/server";
import { track } from "@/lib/analytics/track";
import { audit } from "@/lib/audit";
import { getWorkspace } from "@/lib/auth/workspace";
import { fileSlug, toCsv } from "@/lib/csv";
import { listCatalogAll } from "@/lib/data/products";
import { reportPeriod } from "@/lib/data/reports";
import { costCell, csvResponse, moneyCell, rateCell } from "@/lib/exports";
import { consumeRateLimit } from "@/lib/rate-limit";

/** Product profitability for a period as CSV (Pro). Amounts exclude tax; text cells are formula-safe. */
export async function GET(request: NextRequest) {
  const ws = await getWorkspace().catch(() => null);
  if (!ws?.organization || !ws.activeStore) return new Response("Sign in required", { status: 401 });
  if (!ws.entitlements.limits.exports) return new Response("CSV exports are part of the Pro plan.", { status: 403 });
  if (!(await consumeRateLimit(`export:${ws.user.id}`, 60, 3600))) return new Response("Too many exports. Try again later.", { status: 429 });

  const store = ws.activeStore;
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const period = reportPeriod(store, ws.entitlements, params);
  const rows = await listCatalogAll(store, period.range, "all");
  const c = store.currency;
  const csv = toCsv(
    ["Product", "SKU", "Archived", "Unit cost", "Units", "Gross sales", "Discounts", "Refunds", "Net sales", "Shipping charged", "Net revenue", "COGS", "Lines without cost", "Shipping costs", "Payment fees", "Linked ad spend", "Contribution margin", "Contribution margin %"],
    rows.map((r) => [
      r.name,
      r.sku,
      r.archived,
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
