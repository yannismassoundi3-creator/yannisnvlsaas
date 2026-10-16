"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { INTL_LOCALE, isLocale } from "@/i18n/config";
import { importActions } from "@/i18n/messages/imports-actions";
import { getRequestLocale } from "@/i18n/request";
import { track, trackFirst } from "@/lib/analytics/track";
import { audit } from "@/lib/audit";
import { requireStore } from "@/lib/auth/workspace";
import { EXPENSE_CATEGORIES } from "@/lib/domain/types";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { normalizeRows } from "./normalize";
import { DEFAULT_OPTIONS, IMPORT_KINDS, IMPORT_LIMITS, type ImportKind, type ImportOptions } from "./schema";

/**
 * Import server actions. The browser parses the file and sends mapped cells;
 * everything is validated again here, with the options stored on the job (not
 * whatever the client sends later), and written under the user's session so
 * Row Level Security applies. The request language is stored on the job, so
 * row messages (written here and by import_finalize) follow it.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const optionsSchema = z.object({
  dateFormat: z.enum(["ymd", "dmy", "mdy"]),
  decimalSeparator: z.enum([".", ","]),
  duplicates: z.enum(["skip", "update"]),
  pricesIncludeTax: z.boolean(),
  refundsIncludeTax: z.boolean(),
  skipCancelled: z.boolean(),
  defaultPlatform: z.enum(["meta", "google", "tiktok", "pinterest", "microsoft", "other"]),
  defaultCategory: z.enum(Object.keys(EXPENSE_CATEGORIES) as [keyof typeof EXPENSE_CATEGORIES, ...(keyof typeof EXPENSE_CATEGORIES)[]]),
  defaultKind: z.enum(["variable", "fixed"]).nullable(),
});

const createSchema = z.object({
  kind: z.enum(["orders", "products", "ad_spend", "expenses"]),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().min(0).max(IMPORT_LIMITS.maxFileBytes),
  totalRows: z.number().int().min(1).max(10_000_000),
  mapping: z.record(z.string().max(50), z.string().max(200).nullable()),
  options: optionsSchema,
});

const rowSchema = z.object({
  rowNumber: z.number().int().min(1).max(10_000_000),
  values: z.record(z.string().max(50), z.string().max(IMPORT_LIMITS.maxCellChars * 2)),
});

const uuid = z.string().uuid();

function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function messages() {
  const locale = await getRequestLocale();
  return { t: importActions[locale], locale, n: (value: number) => value.toLocaleString(INTL_LOCALE[locale]) };
}

async function rowsImportedThisMonth(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string) {
  const { data } = await supabase
    .from("import_jobs")
    .select("inserted_count, updated_count")
    .eq("organization_id", organizationId)
    .eq("status", "committed")
    .gte("committed_at", monthStartUtc());
  return (data ?? []).reduce((sum, j) => sum + j.inserted_count + j.updated_count, 0);
}

export async function createImportJob(input: z.input<typeof createSchema>): Promise<Result<{ jobId: string }>> {
  const ws = await requireStore();
  const { t, locale, n } = await messages();
  if (!ws.entitlements.canWrite) return { ok: false, message: t.paused };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.invalidSettings };
  const { kind, fileName, fileSize, totalRows, mapping } = parsed.data;
  // Row messages are written in the language of the page that started the import.
  const options: ImportOptions = { ...parsed.data.options, locale };

  const limits = ws.entitlements.limits;
  if (totalRows > limits.importRowsPerFile) {
    return { ok: false, message: t.rowsPerFile(n(limits.importRowsPerFile)) };
  }
  if (!(await consumeRateLimit(`import-create:${ws.user.id}`, 30, 3600))) {
    return { ok: false, message: t.tooManyStarts };
  }

  const supabase = await createClient();
  const used = await rowsImportedThisMonth(supabase, ws.organization.id);
  if (used + totalRows > limits.importRowsPerMonth) {
    return { ok: false, message: t.monthlyLimit(n(limits.importRowsPerMonth), n(used)) };
  }

  const fieldKeys = new Set(IMPORT_KINDS[kind].fields.map((f) => f.key));
  const cleanMapping = Object.fromEntries(Object.entries(mapping).filter(([k]) => fieldKeys.has(k)));

  const { data, error } = await supabase
    .from("import_jobs")
    .insert({
      organization_id: ws.organization.id,
      store_id: ws.activeStore.id,
      kind,
      file_name: fileName,
      file_size_bytes: fileSize,
      total_rows: totalRows,
      mapping: cleanMapping as NonNullable<Json>,
      options: options as unknown as NonNullable<Json>,
      created_by: ws.user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: t.couldNotStart };
  return { ok: true, jobId: data.id };
}

export async function stageImportRows(jobId: string, chunk: number, rows: z.input<typeof rowSchema>[]): Promise<Result<{ staged: number; invalid: number }>> {
  const ws = await requireStore();
  const { t } = await messages();
  if (!uuid.safeParse(jobId).success || !Number.isInteger(chunk) || chunk < 0 || chunk > 100_000) return { ok: false, message: t.invalidRequest };
  const parsedRows = z.array(rowSchema).max(IMPORT_LIMITS.chunkRows + IMPORT_LIMITS.maxLinesPerOrder).safeParse(rows);
  if (!parsedRows.success) return { ok: false, message: t.unreadableRows };
  if (!(await consumeRateLimit(`import-stage:${ws.user.id}`, 1200, 600))) {
    return { ok: false, message: t.tooManyUploads };
  }

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("import_jobs")
    .select("id, organization_id, store_id, kind, status, options, store:stores(currency, timezone)")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.status !== "staging") return { ok: false, message: t.notAccepting };
  if (!job.store) return { ok: false, message: t.storeGone };

  const kind = job.kind as ImportKind;
  const stored = job.options as Partial<ImportOptions>;
  // Messages follow the language stored on the job, not the current request.
  const options: ImportOptions = { ...DEFAULT_OPTIONS, ...stored, locale: isLocale(stored.locale) ? stored.locale : DEFAULT_OPTIONS.locale };
  const fieldKeys = new Set(IMPORT_KINDS[kind].fields.map((f) => f.key));
  const raw = parsedRows.data.map((r) => ({
    rowNumber: r.rowNumber,
    values: Object.fromEntries(Object.entries(r.values).filter(([k]) => fieldKeys.has(k))),
  }));

  const normalized = normalizeRows(kind, raw, options, { currency: job.store.currency, timezone: job.store.timezone }, options.locale);
  const records = normalized.map((r) => ({
    organization_id: job.organization_id,
    import_job_id: job.id,
    row_number: r.rowNumber,
    status: r.status,
    data: r.data as Json,
    chunk,
    // Stored for error display only; long cells are shortened.
    raw: Object.fromEntries(Object.entries(r.raw).map(([k, v]) => [k, v.length > 300 ? `${v.slice(0, 300)}…` : v])) as NonNullable<Json>,
    errors: r.errors as unknown as NonNullable<Json>,
    warnings: r.warnings as unknown as NonNullable<Json>,
    dedupe_key: r.dedupeKey,
  }));

  const { error } = await supabase.from("import_rows").upsert(records, { onConflict: "import_job_id,row_number" });
  if (error) {
    console.error("[imports] staging failed", { code: error.code });
    return { ok: false, message: t.couldNotSave };
  }

  const { count } = await supabase.from("import_rows").select("id", { count: "exact", head: true }).eq("import_job_id", job.id);
  if ((count ?? 0) > ws.entitlements.limits.importRowsPerFile) {
    await supabase.from("import_jobs").update({ status: "cancelled", error_message: t.rowLimitExceeded }).eq("id", job.id);
    await supabase.from("import_rows").delete().eq("import_job_id", job.id);
    return { ok: false, message: t.tooManyRowsForPlan };
  }
  return { ok: true, staged: records.length, invalid: records.filter((r) => r.status === "invalid").length };
}

export async function finalizeImport(jobId: string): Promise<Result<{ total: number; valid: number; invalid: number; duplicate: number }>> {
  await requireStore();
  const { t } = await messages();
  if (!uuid.safeParse(jobId).success) return { ok: false, message: t.invalidRequest };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_finalize", { p_job: jobId });
  if (error) {
    return { ok: false, message: error.code === "42501" ? t.paused : t.couldNotCheck };
  }
  const counts = data as { total: number; valid: number; invalid: number; duplicate: number };
  return { ok: true, ...counts };
}

export async function commitImportBatch(jobId: string): Promise<Result<{ done: boolean; remaining: number }>> {
  const ws = await requireStore();
  const { t } = await messages();
  if (!uuid.safeParse(jobId).success) return { ok: false, message: t.invalidRequest };
  if (!ws.entitlements.canWrite) return { ok: false, message: t.paused };
  const supabase = await createClient();
  const { data: job } = await supabase.from("import_jobs").select("id, kind, status, valid_rows, organization_id").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, message: t.notFound };
  if (job.status === "validated") {
    const used = await rowsImportedThisMonth(supabase, job.organization_id);
    if (used + job.valid_rows > ws.entitlements.limits.importRowsPerMonth) {
      return { ok: false, message: t.monthlyAllowance };
    }
  }

  const { data, error } = await supabase.rpc("import_commit_batch", { p_job: jobId, p_limit: 500 });
  if (error) {
    console.error("[imports] commit batch failed", { code: error.code });
    if (error.code === "42501") return { ok: false, message: t.paused };
    if (error.code === "55000") return { ok: false, message: t.cannotConfirm };
    // Undo whatever earlier batches wrote, so a failed import never leaves partial data.
    await supabase.from("import_jobs").update({ status: "failed", error_message: t.stoppedUndoneShort }).eq("id", jobId);
    const undo = await supabase.rpc("import_rollback", { p_job: jobId });
    return { ok: false, message: undo.error ? t.stoppedPartial : t.stoppedUndone };
  }

  const result = data as { done: boolean; remaining: number };
  if (result.done) {
    const { data: done } = await supabase.from("import_jobs").select("inserted_count, updated_count, skipped_count, invalid_rows").eq("id", jobId).single();
    const ctx = { organizationId: ws.organization.id, actorId: ws.user.id };
    audit("import.committed", ctx, { type: "import_job", id: jobId }, {
      kind: job.kind,
      inserted: done?.inserted_count ?? 0,
      updated: done?.updated_count ?? 0,
      skipped: done?.skipped_count ?? 0,
    });
    track("import_committed", { organizationId: ws.organization.id, userId: ws.user.id }, { kind: job.kind });
    trackFirst("first_import_succeeded", { organizationId: ws.organization.id, userId: ws.user.id }, { kind: job.kind });
    refresh();
  }
  return { ok: true, ...result };
}

export async function rollbackImport(jobId: string): Promise<Result<{ removed: number; restored: number }>> {
  const ws = await requireStore();
  const { t } = await messages();
  if (!uuid.safeParse(jobId).success) return { ok: false, message: t.invalidRequest };
  if (!(await consumeRateLimit(`import-undo:${ws.user.id}`, 30, 3600))) return { ok: false, message: t.tooManyRequests };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_rollback", { p_job: jobId });
  if (error) {
    if (error.hint === "later_import") return { ok: false, message: t.undoLaterFirst };
    if (error.code === "42501") return { ok: false, message: t.undoPaused };
    if (error.code === "55000") return { ok: false, message: t.onlyConfirmedUndo };
    return { ok: false, message: t.couldNotUndo };
  }
  const result = data as { removed: number; restored: number };
  audit("import.rolled_back", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "import_job", id: jobId }, result);
  refresh();
  return { ok: true, ...result };
}

export async function cancelImport(jobId: string): Promise<Result> {
  await requireStore();
  const { t } = await messages();
  if (!uuid.safeParse(jobId).success) return { ok: false, message: t.invalidRequest };
  const supabase = await createClient();
  const { data: job } = await supabase.from("import_jobs").select("status").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, message: t.notFound };
  if (job.status !== "staging" && job.status !== "validated") return { ok: false, message: t.onlyUnconfirmedCancel };
  await supabase.from("import_rows").delete().eq("import_job_id", jobId);
  const { error } = await supabase.from("import_jobs").update({ status: "cancelled" }).eq("id", jobId);
  if (error) return { ok: false, message: t.couldNotCancel };
  return { ok: true };
}

/** Removes an import from the history. Data it imported stays, but can no longer be undone. */
export async function deleteImportRecord(jobId: string): Promise<Result> {
  const ws = await requireStore();
  const { t } = await messages();
  if (!uuid.safeParse(jobId).success) return { ok: false, message: t.invalidRequest };
  const supabase = await createClient();
  const { data: job } = await supabase.from("import_jobs").select("status, kind").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, message: t.notFound };
  if (job.status === "committing") return { ok: false, message: t.stillRunning };
  const { error } = await supabase.from("import_jobs").delete().eq("id", jobId);
  if (error) return { ok: false, message: t.couldNotRemove };
  audit("import.deleted", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "import_job", id: jobId }, { kind: job.kind, status: job.status });
  refresh();
  return { ok: true };
}
