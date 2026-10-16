import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/workspace";
import { fileSlug, toCsv } from "@/lib/csv";
import type { RowIssue } from "@/lib/imports/normalize";
import { IMPORT_KINDS, type ImportKind } from "@/lib/imports/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * Rows of an import that were not imported (errors and duplicates), with the
 * original mapped values and the reasons, as CSV. Text cells are escaped
 * against formula injection.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/imports/[id]/issues">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const user = await getSessionUser();
  if (!user) return new Response("Sign in required", { status: 401 });

  const supabase = await createClient();
  const { data: job } = await supabase.from("import_jobs").select("id, kind, file_name").eq("id", id).maybeSingle();
  if (!job) return new Response("Not found", { status: 404 });

  const fields = IMPORT_KINDS[job.kind as ImportKind].fields;
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
      out.push([r.row_number, r.status === "invalid" ? "error" : r.status, issues, ...fields.map((f) => raw[f.key] ?? "")]);
    }
    if (!data || data.length < 1000) break;
  }

  const csv = toCsv(["Row", "Status", "Reason", ...fields.map((f) => f.label)], out);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileSlug(job.file_name.replace(/\.csv$/i, ""))}-rows-to-fix.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
