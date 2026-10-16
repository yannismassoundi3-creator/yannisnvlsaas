import { AlertTriangle, Download, XCircle } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ImportJobActions } from "@/components/imports/import-job-actions";
import { ImportStatusBadge } from "@/components/imports/import-bits";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireStore } from "@/lib/auth/workspace";
import { getImportJob, getImportRows, latestCommittedImportId, type IssueFilter } from "@/lib/data/imports";
import { formatDateTime } from "@/lib/dates";
import { PLATFORM_LABELS, EXPENSE_CATEGORIES } from "@/lib/domain/types";
import { IMPORT_KINDS } from "@/lib/imports/schema";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Import" };

const FILTERS: { id: IssueFilter; label: string }[] = [
  { id: "problems", label: "Errors" },
  { id: "duplicates", label: "Duplicates" },
  { id: "skipped", label: "Skipped" },
  { id: "all", label: "All rows" },
];
const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ImportJobPage({ params, searchParams }: PageProps<"/[lang]/app/imports/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
      <Job params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Job({ params, searchParams }: Pick<PageProps<"/[lang]/app/imports/[id]">, "params" | "searchParams">) {
  const [{ id }, sp, ws] = await Promise.all([params, searchParams, requireStore()]);
  if (!UUID_RE.test(id)) notFound();
  const job = await getImportJob(id);
  if (!job) notFound();
  const tz = ws.activeStore.timezone;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const defaultFilter: IssueFilter = job.invalidRows > 0 ? "problems" : job.duplicateRows > 0 ? "duplicates" : "all";
  const filter = (FILTERS.find((f) => f.id === first(sp.filter))?.id ?? defaultFilter) as IssueFilter;
  const page = Math.max(0, Math.min(10_000, Number.parseInt(first(sp.page) ?? "0", 10) || 0));
  const [rows, latest] = await Promise.all([getImportRows(job.id, filter, page, PAGE_SIZE), latestCommittedImportId(ws.activeStore)]);
  const def = IMPORT_KINDS[job.kind];
  const labels = Object.fromEntries(def.fields.map((f) => [f.key, f.label]));
  const o = job.options;
  const pages = Math.ceil(rows.total / PAGE_SIZE);
  const href = (f: IssueFilter, p = 0) => `/app/imports/${job.id}?filter=${f}${p ? `&page=${p}` : ""}` as Route;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/app/imports" className="hover:underline">
            Imports
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {def.label} import <ImportStatusBadge status={job.status} />
          </span>
        }
        description={`${job.fileName} · started ${formatDateTime(job.createdAt, tz)}`}
      />

      {job.status === "validated" ? (
        <Alert tone="info" title="Nothing has been saved yet">
          Review the rows below. Confirming imports the {job.validRows.toLocaleString("en-GB")} ready rows
          {job.duplicateRows > 0 ? ` and skips ${job.duplicateRows.toLocaleString("en-GB")} duplicates` : ""}
          {job.invalidRows > 0 ? `; ${job.invalidRows.toLocaleString("en-GB")} rows with errors stay out` : ""}.
        </Alert>
      ) : null}
      {job.status === "committed" && job.committedAt ? (
        <Alert tone="positive" title={`Imported on ${formatDateTime(job.committedAt, tz)}`}>
          {job.insertedCount.toLocaleString("en-GB")} rows added, {job.updatedCount.toLocaleString("en-GB")} updated, {job.skippedCount.toLocaleString("en-GB")}{" "}
          skipped{job.invalidRows > 0 ? `, ${job.invalidRows.toLocaleString("en-GB")} with errors not imported` : ""}.
        </Alert>
      ) : null}
      {job.status === "rolled_back" && job.rolledBackAt ? (
        <Alert tone="info" title={`Undone on ${formatDateTime(job.rolledBackAt, tz)}`}>
          Records created by this import were removed and records it replaced were restored.
        </Alert>
      ) : null}
      {job.status === "failed" ? (
        <Alert tone="negative" title="This import failed">
          {job.errorMessage ?? "The import stopped before it finished."}
        </Alert>
      ) : null}
      {job.status === "committing" ? (
        <Alert tone="caution" title="This import has not finished">
          If the page was closed while importing, resume it: rows already imported are saved and are not imported twice.
        </Alert>
      ) : null}
      {job.status === "staging" ? (
        <Alert tone="caution" title="This upload did not finish">
          The file was not fully uploaded. Cancel it and start a new import.
        </Alert>
      ) : null}

      <ImportJobActions jobId={job.id} status={job.status} validRows={job.validRows} canUndo={latest === job.id} canWrite={ws.entitlements.canWrite} />

      <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Rows in file", job.totalRows],
          ["Ready", job.validRows],
          ["Duplicates", job.duplicateRows],
          ["Errors", job.invalidRows],
          ["Added", job.status === "committed" || job.status === "rolled_back" ? job.insertedCount : null],
          ["Updated", job.status === "committed" || job.status === "rolled_back" ? job.updatedCount : null],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-surface px-4 py-3">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink tabular">{value === null ? "—" : (value as number).toLocaleString("en-GB")}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
            <nav aria-label="Row filter" className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Link
                  key={f.id}
                  href={href(f.id)}
                  aria-current={f.id === filter ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-sm font-medium",
                    f.id === filter ? "bg-navy-800 text-white" : "text-ink-2 hover:bg-hover",
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
            {job.invalidRows + job.duplicateRows > 0 ? (
              <a href={`/api/imports/${job.id}/issues`} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline">
                <Download className="size-4" aria-hidden />
                Download rows to fix (CSV)
              </a>
            ) : null}
          </div>
          {rows.rows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-3">No rows in this view.</p>
          ) : (
            <TableContainer className="mt-3">
              <Table className="text-sm">
                <caption className="sr-only">Import rows</caption>
                <THead>
                  <TR>
                    <TH className="w-16">Row</TH>
                    <TH>Values</TH>
                    <TH>Notes</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.rows.map((r) => (
                    <TR key={r.rowNumber} className="align-top">
                      <TD className="py-2.5 text-ink-3 tabular">{r.rowNumber}</TD>
                      <TD className="max-w-md py-2.5">
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                          {Object.entries(r.raw)
                            .filter(([, v]) => v !== "")
                            .slice(0, 6)
                            .map(([k, v]) => (
                              <div key={k} className="contents">
                                <dt className="text-ink-3">{labels[k] ?? k}</dt>
                                <dd className="truncate text-ink-2">{v}</dd>
                              </div>
                            ))}
                        </dl>
                      </TD>
                      <TD className="min-w-64 py-2.5 text-xs">
                        {r.status === "imported" || r.status === "updated" || r.status === "valid" ? (
                          <p className="mb-1 text-ink-3">{r.status === "imported" ? "Added" : r.status === "updated" ? "Updated" : "Ready"}</p>
                        ) : r.status === "skipped" ? (
                          <p className="mb-1 text-ink-3">Skipped</p>
                        ) : null}
                        {r.errors.map((e, i) => (
                          <p key={`e${i}`} className="flex gap-1.5 text-negative-700">
                            <XCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
                            <span>
                              {e.field && labels[e.field] ? <span className="font-medium">{labels[e.field]}: </span> : null}
                              {e.message}
                            </span>
                          </p>
                        ))}
                        {r.warnings.map((w, i) => (
                          <p key={`w${i}`} className="flex gap-1.5 text-caution-800">
                            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                            <span>{w.message}</span>
                          </p>
                        ))}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
          {pages > 1 ? (
            <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
              <span className="text-ink-3 tabular">
                Page {page + 1} of {pages}
              </span>
              <span className="flex gap-3">
                {page > 0 ? (
                  <Link href={href(filter, page - 1)} className="font-medium text-emerald-700 hover:underline">
                    Previous
                  </Link>
                ) : null}
                {page + 1 < pages ? (
                  <Link href={href(filter, page + 1)} className="font-medium text-emerald-700 hover:underline">
                    Next
                  </Link>
                ) : null}
              </span>
            </nav>
          ) : null}
        </Card>

        <Card className="h-fit">
          <CardHeader title="How the file was read" as="h3" />
          <dl className="space-y-3 px-5 pt-3 pb-5 text-sm">
            <div>
              <dt className="text-xs text-ink-3">Columns</dt>
              <dd className="mt-1 space-y-0.5">
                {def.fields
                  .filter((f) => job.mapping[f.key])
                  .map((f) => (
                    <p key={f.key} className="flex justify-between gap-3">
                      <span className="text-ink-2">{f.label}</span>
                      <span className="truncate text-right text-ink-3" title={job.mapping[f.key] ?? ""}>
                        {job.mapping[f.key]}
                      </span>
                    </p>
                  ))}
              </dd>
            </div>
            {o.dateFormat ? (
              <div>
                <dt className="text-xs text-ink-3">Dates</dt>
                <dd className="text-ink-2">{{ ymd: "Year-month-day", dmy: "Day/month/year", mdy: "Month/day/year" }[o.dateFormat]}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-ink-3">Decimal separator</dt>
              <dd className="text-ink-2">{o.decimalSeparator === "," ? "Comma" : "Point"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Existing records</dt>
              <dd className="text-ink-2">{job.kind === "expenses" ? "Identical expenses skipped" : o.duplicates === "update" ? "Replaced" : "Skipped"}</dd>
            </div>
            {job.kind === "orders" ? (
              <div>
                <dt className="text-xs text-ink-3">Tax</dt>
                <dd className="text-ink-2">
                  {o.pricesIncludeTax ? "Prices include tax (removed per order)" : "Prices exclude tax"}
                  {o.refundsIncludeTax ? "; refunds include tax" : ""}
                </dd>
              </div>
            ) : null}
            {job.kind === "ad_spend" && o.defaultPlatform ? (
              <div>
                <dt className="text-xs text-ink-3">Default platform</dt>
                <dd className="text-ink-2">{PLATFORM_LABELS[o.defaultPlatform]}</dd>
              </div>
            ) : null}
            {job.kind === "expenses" && o.defaultCategory ? (
              <div>
                <dt className="text-xs text-ink-3">Default category</dt>
                <dd className="text-ink-2">{EXPENSE_CATEGORIES[o.defaultCategory].label}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>
    </div>
  );
}
