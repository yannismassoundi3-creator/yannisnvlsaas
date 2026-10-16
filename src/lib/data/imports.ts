import "server-only";
import type { Store } from "@/lib/auth/workspace";
import type { RowIssue } from "@/lib/imports/normalize";
import type { ImportKind, ImportOptions } from "@/lib/imports/schema";
import { createClient } from "@/lib/supabase/server";

export type ImportStatus = "staging" | "validated" | "committing" | "committed" | "failed" | "rolled_back" | "cancelled";

export type ImportJob = {
  id: string;
  kind: ImportKind;
  status: ImportStatus;
  fileName: string;
  fileSizeBytes: number | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  mapping: Record<string, string | null>;
  options: Partial<ImportOptions>;
  errorMessage: string | null;
  createdAt: string;
  validatedAt: string | null;
  committedAt: string | null;
  rolledBackAt: string | null;
};

const COLUMNS =
  "id, kind, status, file_name, file_size_bytes, total_rows, valid_rows, invalid_rows, duplicate_rows, inserted_count, updated_count, skipped_count, mapping, options, error_message, created_at, validated_at, committed_at, rolled_back_at";

type Row = {
  id: string;
  kind: string;
  status: string;
  file_name: string;
  file_size_bytes: number | null;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  mapping: unknown;
  options: unknown;
  error_message: string | null;
  created_at: string;
  validated_at: string | null;
  committed_at: string | null;
  rolled_back_at: string | null;
};

function toJob(r: Row): ImportJob {
  return {
    id: r.id,
    kind: r.kind as ImportKind,
    status: r.status as ImportStatus,
    fileName: r.file_name,
    fileSizeBytes: r.file_size_bytes,
    totalRows: r.total_rows,
    validRows: r.valid_rows,
    invalidRows: r.invalid_rows,
    duplicateRows: r.duplicate_rows,
    insertedCount: r.inserted_count,
    updatedCount: r.updated_count,
    skippedCount: r.skipped_count,
    mapping: (r.mapping ?? {}) as Record<string, string | null>,
    options: (r.options ?? {}) as Partial<ImportOptions>,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    validatedAt: r.validated_at,
    committedAt: r.committed_at,
    rolledBackAt: r.rolled_back_at,
  };
}

export async function listImportJobs(store: Pick<Store, "id">, limit = 50): Promise<ImportJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("import_jobs").select(COLUMNS).eq("store_id", store.id).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Imports could not be loaded.");
  return (data ?? []).map((r) => toJob(r as Row));
}

export async function getImportJob(id: string): Promise<ImportJob | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("import_jobs").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? toJob(data as Row) : null;
}

/** The most recent confirmed import of a store: the only one that can be undone. */
export async function latestCommittedImportId(store: Pick<Store, "id">): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("import_jobs")
    .select("id")
    .eq("store_id", store.id)
    .eq("status", "committed")
    .order("committed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export type IssueFilter = "problems" | "duplicates" | "skipped" | "all";

export type ImportRowView = {
  rowNumber: number;
  status: string;
  raw: Record<string, string>;
  errors: RowIssue[];
  warnings: RowIssue[];
};

export async function getImportRows(jobId: string, filter: IssueFilter, page: number, pageSize = 50) {
  const supabase = await createClient();
  let query = supabase
    .from("import_rows")
    .select("row_number, status, raw, errors, warnings", { count: "exact" })
    .eq("import_job_id", jobId)
    .order("row_number", { ascending: true })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (filter === "problems") query = query.eq("status", "invalid");
  else if (filter === "duplicates") query = query.eq("status", "duplicate");
  else if (filter === "skipped") query = query.eq("status", "skipped");
  const { data, count, error } = await query;
  if (error) throw new Error("Import rows could not be loaded.");
  return {
    rows: (data ?? []).map(
      (r): ImportRowView => ({
        rowNumber: r.row_number,
        status: r.status,
        raw: (r.raw ?? {}) as Record<string, string>,
        errors: (r.errors ?? []) as RowIssue[],
        warnings: (r.warnings ?? []) as RowIssue[],
      }),
    ),
    total: count ?? 0,
  };
}

/** Counts of rows with warnings, to point users at decisions worth reviewing. */
export async function countRowsWithWarnings(jobId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_job_id", jobId)
    .neq("warnings", "[]");
  return count ?? 0;
}

export async function importUsageThisMonth(organizationId: string): Promise<number> {
  const supabase = await createClient();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data } = await supabase
    .from("import_jobs")
    .select("inserted_count, updated_count")
    .eq("organization_id", organizationId)
    .eq("status", "committed")
    .gte("committed_at", start);
  return (data ?? []).reduce((sum, j) => sum + j.inserted_count + j.updated_count, 0);
}
