import type { NextRequest } from "next/server";
import { track } from "@/lib/analytics/track";
import { audit } from "@/lib/audit";
import { getWorkspace } from "@/lib/auth/workspace";
import { fileSlug, toCsv } from "@/lib/csv";
import { getAdvertisingData, reportPeriod } from "@/lib/data/reports";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/types";
import { csvResponse, moneyCell } from "@/lib/exports";
import { consumeRateLimit } from "@/lib/rate-limit";

/** Campaign performance for a period as CSV (Pro). */
export async function GET(request: NextRequest) {
  const ws = await getWorkspace().catch(() => null);
  if (!ws?.organization || !ws.activeStore) return new Response("Sign in required", { status: 401 });
  if (!ws.entitlements.limits.exports) return new Response("CSV exports are part of the Pro plan.", { status: 403 });
  if (!(await consumeRateLimit(`export:${ws.user.id}`, 60, 3600))) return new Response("Too many exports. Try again later.", { status: 429 });

  const store = ws.activeStore;
  const period = reportPeriod(store, ws.entitlements, Object.fromEntries(request.nextUrl.searchParams.entries()));
  const data = await getAdvertisingData(store, period.range, null);
  const names = new Map(data.products.map((p) => [p.id, p.name]));
  const breakEven = data.metrics.breakEvenRoas;
  const csv = toCsv(
    ["Campaign", "Platform", "Promotes", "Spend", "Impressions", "Clicks", "Conversions", "Conversion value", "Platform ROAS", "Below break-even ROAS"],
    data.campaigns.map((c) => [
      c.name,
      PLATFORM_LABELS[c.platform as Platform] ?? c.platform,
      c.productId ? (names.get(c.productId) ?? "Archived product") : "Several products / store-wide",
      moneyCell(c.spend, store.currency),
      c.impressions,
      c.clicks,
      c.conversions,
      moneyCell(c.conversionValue, store.currency),
      c.platformRoas === null ? null : { decimal: c.platformRoas.toFixed(2) },
      breakEven !== null && c.platformRoas !== null ? c.platformRoas < breakEven : null,
    ]),
  );
  audit("data.exported", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "store", id: store.id }, { export: "campaigns", rows: data.campaigns.length });
  track("report_exported", { organizationId: ws.organization.id, userId: ws.user.id }, { report: "campaigns_csv" });
  return csvResponse(csv, `${fileSlug(store.name)}-campaigns-${period.range.from}-to-${period.range.to}.csv`);
}
