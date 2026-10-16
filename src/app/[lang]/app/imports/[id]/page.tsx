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
import { importPages } from "@/i18n/messages/imports-pages";
import { getFormat, getLocale } from "@/i18n/server";
import { requireStore } from "@/lib/auth/workspace";
import { getImportJob, getImportRows, latestCommittedImportId, type IssueFilter } from "@/lib/data/imports";
import { expenseCategoryLabel, platformLabel } from "@/lib/domain/types";
import { fieldLabels, IMPORT_KINDS, kindCopy } from "@/lib/imports/schema";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: importPages[await getLocale()].job.metaTitle };
}

const FILTERS: IssueFilter[] = ["problems", "duplicates", "skipped", "all"];
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
  const [{ id }, sp, ws, locale, fmt] = await Promise.all([params, searchParams, requireStore(), getLocale(), getFormat()]);
  const t = importPages[locale].job;
  if (!UUID_RE.test(id)) notFound();
  const job = await getImportJob(id);
  if (!job) notFound();
  const tz = ws.activeStore.timezone;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const defaultFilter: IssueFilter = job.invalidRows > 0 ? "problems" : job.duplicateRows > 0 ? "duplicates" : "all";
  const filter = FILTERS.find((f) => f === first(sp.filter)) ?? defaultFilter;
  const page = Math.max(0, Math.min(10_000, Number.parseInt(first(sp.page) ?? "0", 10) || 0));
  const [rows, latest] = await Promise.all([getImportRows(job.id, filter, page, PAGE_SIZE), latestCommittedImportId(ws.activeStore)]);
  const def = IMPORT_KINDS[job.kind];
  const labels = fieldLabels(job.kind, locale);
  const n = fmt.count;
  const o = job.options;
  const pages = Math.ceil(rows.total / PAGE_SIZE);
  const href = (f: IssueFilter, p = 0) => `/app/imports/${job.id}?filter=${f}${p ? `&page=${p}` : ""}` as Route;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/app/imports" className="hover:underline">
            {t.imports}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t.title(kindCopy(job.kind, locale).label)} <ImportStatusBadge status={job.status} />
          </span>
        }
        description={t.started(job.fileName, fmt.dateTime(job.createdAt, tz))}
      />

      {job.status === "validated" ? (
        <Alert tone="info" title={t.validatedTitle}>
          {t.validatedBody(n(job.validRows), job.duplicateRows > 0 ? n(job.duplicateRows) : null, job.invalidRows > 0 ? n(job.invalidRows) : null)}
        </Alert>
      ) : null}
      {job.status === "committed" && job.committedAt ? (
        <Alert tone="positive" title={t.committedTitle(fmt.dateTime(job.committedAt, tz))}>
          {t.committedBody(n(job.insertedCount), n(job.updatedCount), n(job.skippedCount), job.invalidRows > 0 ? n(job.invalidRows) : null)}
        </Alert>
      ) : null}
      {job.status === "rolled_back" && job.rolledBackAt ? (
        <Alert tone="info" title={t.undoneTitle(fmt.dateTime(job.rolledBackAt, tz))}>
          {t.undoneBody}
        </Alert>
      ) : null}
      {job.status === "failed" ? (
        <Alert tone="negative" title={t.failedTitle}>
          {job.errorMessage ?? t.failedFallback}
        </Alert>
      ) : null}
      {job.status === "committing" ? (
        <Alert tone="caution" title={t.committingTitle}>
          {t.committingBody}
        </Alert>
      ) : null}
      {job.status === "staging" ? (
        <Alert tone="caution" title={t.stagingTitle}>
          {t.stagingBody}
        </Alert>
      ) : null}

      <ImportJobActions jobId={job.id} status={job.status} validRows={job.validRows} canUndo={latest === job.id} canWrite={ws.entitlements.canWrite} />

      <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            [t.counts.total, job.totalRows],
            [t.counts.ready, job.validRows],
            [t.counts.duplicates, job.duplicateRows],
            [t.counts.errors, job.invalidRows],
            [t.counts.added, job.status === "committed" || job.status === "rolled_back" ? job.insertedCount : null],
            [t.counts.updated, job.status === "committed" || job.status === "rolled_back" ? job.updatedCount : null],
          ] as [string, number | null][]
        ).map(([label, value]) => (
          <div key={label} className="bg-surface px-4 py-3">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink tabular">{value === null ? "—" : n(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
            <nav aria-label={t.filterLabel} className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Link
                  key={f}
                  href={href(f)}
                  aria-current={f === filter ? "page" : undefined}
                  className={cn("rounded-md px-2.5 py-1.5 text-sm font-medium", f === filter ? "bg-navy-800 text-white" : "text-ink-2 hover:bg-hover")}
                >
                  {t.filters[f]}
                </Link>
              ))}
            </nav>
            {job.invalidRows + job.duplicateRows > 0 ? (
              <a href={`/api/imports/${job.id}/issues`} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline">
                <Download className="size-4" aria-hidden />
                {t.download}
              </a>
            ) : null}
          </div>
          {rows.rows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-3">{t.noRows}</p>
          ) : (
            <TableContainer className="mt-3">
              <Table className="text-sm">
                <caption className="sr-only">{t.caption}</caption>
                <THead>
                  <TR>
                    <TH className="w-16">{t.row}</TH>
                    <TH>{t.values}</TH>
                    <TH>{t.notes}</TH>
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
                          <p className="mb-1 text-ink-3">{r.status === "imported" ? t.added : r.status === "updated" ? t.updated : t.ready}</p>
                        ) : r.status === "skipped" ? (
                          <p className="mb-1 text-ink-3">{t.skipped}</p>
                        ) : null}
                        {r.errors.map((e, i) => (
                          <p key={`e${i}`} className="flex gap-1.5 text-negative-700">
                            <XCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
                            <span>
                              {e.field && labels[e.field] ? <span className="font-medium">{locale === "fr" ? `${labels[e.field]} : ` : `${labels[e.field]}: `}</span> : null}
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
            <nav aria-label={t.pagination} className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
              <span className="text-ink-3 tabular">{t.page(page + 1, pages)}</span>
              <span className="flex gap-3">
                {page > 0 ? (
                  <Link href={href(filter, page - 1)} className="font-medium text-emerald-700 hover:underline">
                    {t.previous}
                  </Link>
                ) : null}
                {page + 1 < pages ? (
                  <Link href={href(filter, page + 1)} className="font-medium text-emerald-700 hover:underline">
                    {t.next}
                  </Link>
                ) : null}
              </span>
            </nav>
          ) : null}
        </Card>

        <Card className="h-fit">
          <CardHeader title={t.howRead} as="h3" />
          <dl className="space-y-3 px-5 pt-3 pb-5 text-sm">
            <div>
              <dt className="text-xs text-ink-3">{t.columns}</dt>
              <dd className="mt-1 space-y-0.5">
                {def.fields
                  .filter((f) => job.mapping[f.key])
                  .map((f) => (
                    <p key={f.key} className="flex justify-between gap-3">
                      <span className="text-ink-2">{labels[f.key]}</span>
                      <span className="truncate text-right text-ink-3" title={job.mapping[f.key] ?? ""}>
                        {job.mapping[f.key]}
                      </span>
                    </p>
                  ))}
              </dd>
            </div>
            {o.dateFormat ? (
              <div>
                <dt className="text-xs text-ink-3">{t.dates}</dt>
                <dd className="text-ink-2">{t.dateFormats[o.dateFormat]}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-ink-3">{t.decimalSeparator}</dt>
              <dd className="text-ink-2">{o.decimalSeparator === "," ? t.comma : t.point}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">{t.existing}</dt>
              <dd className="text-ink-2">{job.kind === "expenses" ? t.identicalExpenses : o.duplicates === "update" ? t.replaced : t.skippedExisting}</dd>
            </div>
            {job.kind === "orders" ? (
              <div>
                <dt className="text-xs text-ink-3">{t.tax}</dt>
                <dd className="text-ink-2">
                  {o.pricesIncludeTax ? t.pricesInclude : t.pricesExclude}
                  {o.refundsIncludeTax ? t.refundsInclude : ""}
                </dd>
              </div>
            ) : null}
            {job.kind === "ad_spend" && o.defaultPlatform ? (
              <div>
                <dt className="text-xs text-ink-3">{t.defaultPlatform}</dt>
                <dd className="text-ink-2">{platformLabel(o.defaultPlatform, locale)}</dd>
              </div>
            ) : null}
            {job.kind === "expenses" && o.defaultCategory ? (
              <div>
                <dt className="text-xs text-ink-3">{t.defaultCategory}</dt>
                <dd className="text-ink-2">{expenseCategoryLabel(o.defaultCategory, locale)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>
    </div>
  );
}
