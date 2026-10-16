import type { NextRequest } from "next/server";
import { importPages } from "@/i18n/messages/imports-pages";
import { getRequestLocale } from "@/i18n/request";
import { getSessionUser } from "@/lib/auth/workspace";
import { fileSlug, toCsv } from "@/lib/csv";
import type { RowIssue } from "@/lib/imports/normalize";
import { fieldCopy, IMPORT_KINDS, type ImportKind } from "@/lib/imports/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * Rows of an import that were not imported (errors and duplicates), with the
 * original mapped values and the reasons, as CSV. Text cells are escaped
 * against formula injection. Column names and statuses follow the request
 * language; the reasons are in the language the import was made in.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/imports/[id]/issues">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const user = await getSessionUser();
  if (!user) return new Response("Sign in required", { status: 401 });

  const supabase = await createClient();
  const { data: job } = await supabase.from("import_jobs").select("id, kind, file_name").eq("id", id).maybeSingle();
  if (!job) return new Response("Not found", { status: 404 });

  const locale = await getRequestLocale();
  const t = importPages[locale].csv;
  const kind = job.kind as ImportKind;
  const fields = IMPORT_KINDS[kind].fields;
  const out: (string | number)[][] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("import_rows")
      .select("row_number, status, raw, errors, warnings")
      .eq("import_job_id", id)
      .in("status", ["invalid", "duplicate", "skipped"])
      .order("row_number")
      .range(from, from + 999);
    if (error) return new Response("Could not load rows", { status: 500 });
    for (const r of data ?? []) {
      const raw = (r.raw ?? {}) as Record<string, string>;
      const issues = [...((r.errors ?? []) as RowIssue[]), ...((r.warnings ?? []) as RowIssue[])].map((i) => i.message).join(" | ");
      const status = r.status === "invalid" ? "error" : r.status;
      out.push([r.row_number, t.statuses[status] ?? status, issues, ...fields.map((f) => raw[f.key] ?? "")]);
    }
    if (!data || data.length < 1000) break;
  }

  const csv = toCsv([t.row, t.status, t.reason, ...fields.map((f) => fieldCopy(kind, f.key, locale).label)], out);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileSlug(job.file_name.replace(/\.csv$/i, ""))}-${t.fileSuffix}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
