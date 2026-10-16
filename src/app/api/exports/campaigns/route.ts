import type { NextRequest } from "next/server";
import { track } from "@/lib/analytics/track";
import { audit } from "@/lib/audit";
import { getWorkspace } from "@/lib/auth/workspace";
import { fileSlug, toCsv } from "@/lib/csv";
import { getAdvertisingData, reportPeriod } from "@/lib/data/reports";
import { platformLabel, type Platform } from "@/lib/domain/types";
import { csvResponse, moneyCell, textResponse } from "@/lib/exports";
import { consumeRateLimit } from "@/lib/rate-limit";
import { exportsMessages } from "@/i18n/messages/catalog-exports";
import { getRequestLocale } from "@/i18n/request";

/** Campaign performance for a period as CSV (Pro). Headers follow the request language. */
export async function GET(request: NextRequest) {
  const [ws, locale] = await Promise.all([getWorkspace().catch(() => null), getRequestLocale()]);
  const t = exportsMessages[locale];
  if (!ws?.organization || !ws.activeStore) return textResponse(t.signInRequired, 401);
  if (!ws.entitlements.limits.exports) return textResponse(t.proOnly, 403);
  if (!(await consumeRateLimit(`export:${ws.user.id}`, 60, 3600))) return textResponse(t.tooManyExports, 429);

  const store = ws.activeStore;
  const period = reportPeriod(store, ws.entitlements, Object.fromEntries(request.nextUrl.searchParams.entries()));
  const data = await getAdvertisingData(store, period.range, null);
  const names = new Map(data.products.map((p) => [p.id, p.name]));
  const breakEven = data.metrics.breakEvenRoas;
  const csv = toCsv(
    t.campaignColumns,
    data.campaigns.map((c) => [
      c.name,
      platformLabel(c.platform as Platform, locale) ?? c.platform,
      c.productId ? (names.get(c.productId) ?? t.archivedProduct) : t.storeWide,
      moneyCell(c.spend, store.currency),
      c.impressions,
      c.clicks,
      c.conversions,
      moneyCell(c.conversionValue, store.currency),
      c.platformRoas === null ? null : { decimal: c.platformRoas.toFixed(2) },
      breakEven !== null && c.platformRoas !== null ? (c.platformRoas < breakEven ? t.yes : t.no) : null,
    ]),
  );
  audit("data.exported", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "store", id: store.id }, { export: "campaigns", rows: data.campaigns.length });
  track("report_exported", { organizationId: ws.organization.id, userId: ws.user.id }, { report: "campaigns_csv" });
  return csvResponse(csv, `${fileSlug(store.name)}-campaigns-${period.range.from}-to-${period.range.to}.csv`);
}
