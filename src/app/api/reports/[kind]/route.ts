import type { NextRequest } from "next/server";
import { track } from "@/lib/analytics/track";
import { audit } from "@/lib/audit";
import { getWorkspace } from "@/lib/auth/workspace";
import { fileSlug, toCsv } from "@/lib/csv";
import { reportPeriod, ReportsPausedError } from "@/lib/data/reports";
import { csvResponse } from "@/lib/exports";
import { consumeRateLimit } from "@/lib/rate-limit";
import { buildPdfInput, dailyCsvRows, REPORT_KINDS, summaryCsvRows } from "@/lib/reports/data";
import { renderPdfReport, type ReportKind } from "@/lib/reports/pdf";

/**
 * Downloadable reports (Pro): /api/reports/summary?format=pdf&range=last_30
 * Kinds: summary | products | advertising (PDF), summary | daily (CSV).
 * Product and campaign CSVs are served by /api/exports/*.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/reports/[kind]">) {
  const { kind } = await ctx.params;
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "pdf";
  const ws = await getWorkspace().catch(() => null);
  if (!ws?.organization || !ws.activeStore) return new Response("Sign in required", { status: 401 });
  if (!ws.entitlements.limits.exports) return new Response("Downloadable reports are part of the Pro plan.", { status: 403 });
  if (!ws.entitlements.canViewAnalytics) return new Response("Reports are paused because the trial or subscription has ended.", { status: 403 });
  if (!(await consumeRateLimit(`report:${ws.user.id}`, 60, 3600))) return new Response("Too many reports. Try again later.", { status: 429 });

  const store = ws.activeStore;
  const period = reportPeriod(store, ws.entitlements, Object.fromEntries(request.nextUrl.searchParams.entries()));
  const base = `${fileSlug(store.name)}-${kind}-${period.range.from}-to-${period.range.to}`;
  const ctxAudit = { organizationId: ws.organization.id, actorId: ws.user.id };

  try {
    if (format === "csv") {
      if (kind !== "summary" && kind !== "daily") return new Response("Unknown report", { status: 404 });
      const { header, rows } = kind === "summary" ? await summaryCsvRows(store, period) : await dailyCsvRows(store, period);
      audit("data.exported", ctxAudit, { type: "store", id: store.id }, { export: `${kind}_csv` });
      track("report_exported", { organizationId: ws.organization.id, userId: ws.user.id }, { report: `${kind}_csv` });
      return csvResponse(toCsv(header, rows), `${base}.csv`);
    }

    if (!REPORT_KINDS.includes(kind as ReportKind)) return new Response("Unknown report", { status: 404 });
    const pdf = await renderPdfReport(await buildPdfInput(ws as Parameters<typeof buildPdfInput>[0], store, period, kind as ReportKind));
    audit("data.exported", ctxAudit, { type: "store", id: store.id }, { export: `${kind}_pdf` });
    track("report_exported", { organizationId: ws.organization.id, userId: ws.user.id }, { report: `${kind}_pdf` });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ReportsPausedError) return new Response("Reports are paused because the trial or subscription has ended.", { status: 403 });
    console.error("[reports] generation failed", { kind, format, error: error instanceof Error ? error.message : "unknown" });
    return new Response("The report could not be generated. Please try again.", { status: 500 });
  }
}
