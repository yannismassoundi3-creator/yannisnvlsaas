import { Plus, Upload } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ImportStatusBadge, TemplateButton } from "@/components/imports/import-bits";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireStore } from "@/lib/auth/workspace";
import { importPages } from "@/i18n/messages/imports-pages";
import { getFormat, getLocale } from "@/i18n/server";
import { importUsageThisMonth, listImportJobs } from "@/lib/data/imports";
import { IMPORT_KINDS, kindCopy, KIND_ORDER } from "@/lib/imports/schema";

export async function generateMetadata(): Promise<Metadata> {
  return { title: importPages[await getLocale()].history.title };
}

export default async function ImportsPage() {
  const t = importPages[await getLocale()].history;
  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button asChild>
            <Link href="/app/imports/new">
              <Plus aria-hidden />
              {t.newImport}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-72 rounded-lg" />}>
        <History />
      </Suspense>
      <Card>
        <CardHeader title={t.templates} description={t.templatesDescription} />
        <div className="flex flex-wrap gap-2 px-5 pt-3 pb-5">
          {KIND_ORDER.map((k) => (
            <TemplateButton key={k} kind={k} />
          ))}
        </div>
      </Card>
    </div>
  );
}

async function History() {
  const [ws, locale, f] = await Promise.all([requireStore(), getLocale(), getFormat()]);
  const t = importPages[locale].history;
  const [jobs, used] = await Promise.all([listImportJobs(ws.activeStore), importUsageThisMonth(ws.organization.id)]);
  const limits = ws.entitlements.limits;
  const tz = ws.activeStore.timezone;

  return (
    <Card>
      <CardHeader title={t.history} description={t.usage(f.count(used), f.count(limits.importRowsPerMonth), f.count(limits.importRowsPerFile))} />
      {jobs.length === 0 ? (
        <EmptyState
          icon={<Upload aria-hidden />}
          title={t.emptyTitle}
          description={t.emptyDescription}
          actions={
            <Button asChild>
              <Link href={"/app/imports/new?kind=orders" as Route}>{t.importOrders}</Link>
            </Button>
          }
        />
      ) : (
        <TableContainer className="mt-3">
          <Table>
            <caption className="sr-only">{t.caption}</caption>
            <THead>
              <TR>
                <TH>{t.started}</TH>
                <TH>{t.type}</TH>
                <TH>{t.file}</TH>
                <TH>{t.status}</TH>
                <TH numeric>{t.rows}</TH>
                <TH numeric>{t.imported}</TH>
                <TH numeric>{t.updated}</TH>
                <TH numeric>{t.errors}</TH>
              </TR>
            </THead>
            <TBody>
              {jobs.map((j) => (
                <TR key={j.id} className="hover:bg-hover/60">
                  <TD className="whitespace-nowrap">
                    <Link href={`/app/imports/${j.id}` as Route} className="font-medium text-ink hover:underline">
                      {f.dateTime(j.createdAt, tz)}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap text-ink-2">{IMPORT_KINDS[j.kind] ? kindCopy(j.kind, locale).label : j.kind}</TD>
                  <TD className="max-w-56 truncate text-ink-2" title={j.fileName}>
                    {j.fileName}
                  </TD>
                  <TD>
                    <ImportStatusBadge status={j.status} />
                  </TD>
                  <TD numeric>{f.count(j.totalRows)}</TD>
                  <TD numeric>{j.status === "committed" || j.status === "rolled_back" ? f.count(j.insertedCount) : "—"}</TD>
                  <TD numeric>{j.status === "committed" || j.status === "rolled_back" ? f.count(j.updatedCount) : "—"}</TD>
                  <TD numeric className={j.invalidRows > 0 ? "text-negative-700" : undefined}>
                    {f.count(j.invalidRows)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}
