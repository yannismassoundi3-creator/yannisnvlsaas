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
import { importUsageThisMonth, listImportJobs } from "@/lib/data/imports";
import { formatDateTime } from "@/lib/dates";
import { IMPORT_KINDS, KIND_ORDER } from "@/lib/imports/schema";

export const metadata: Metadata = { title: "Imports" };

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        description="Bring in orders, product costs, ad spend and expenses from CSV files. Every import is checked before anything is saved, and can be undone."
        actions={
          <Button asChild>
            <Link href="/app/imports/new">
              <Plus aria-hidden />
              New import
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-72 rounded-lg" />}>
        <History />
      </Suspense>
      <Card>
        <CardHeader title="Templates" description="Column layouts Narixia reads without any matching. Example rows are fictional." />
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
  const ws = await requireStore();
  const [jobs, used] = await Promise.all([listImportJobs(ws.activeStore), importUsageThisMonth(ws.organization.id)]);
  const limits = ws.entitlements.limits;
  const tz = ws.activeStore.timezone;

  return (
    <Card>
      <CardHeader
        title="History"
        description={`${used.toLocaleString("en-GB")} of ${limits.importRowsPerMonth.toLocaleString("en-GB")} rows imported this month · up to ${limits.importRowsPerFile.toLocaleString("en-GB")} rows per file`}
      />
      {jobs.length === 0 ? (
        <EmptyState
          icon={<Upload aria-hidden />}
          title="No imports yet"
          description="Start with your orders: dashboards, product margins and insights are built from them."
          actions={
            <Button asChild>
              <Link href={"/app/imports/new?kind=orders" as Route}>Import orders</Link>
            </Button>
          }
        />
      ) : (
        <TableContainer className="mt-3">
          <Table>
            <caption className="sr-only">Import history</caption>
            <THead>
              <TR>
                <TH>Started</TH>
                <TH>Type</TH>
                <TH>File</TH>
                <TH>Status</TH>
                <TH numeric>Rows</TH>
                <TH numeric>Imported</TH>
                <TH numeric>Updated</TH>
                <TH numeric>Errors</TH>
              </TR>
            </THead>
            <TBody>
              {jobs.map((j) => (
                <TR key={j.id} className="hover:bg-hover/60">
                  <TD className="whitespace-nowrap">
                    <Link href={`/app/imports/${j.id}` as Route} className="font-medium text-ink hover:underline">
                      {formatDateTime(j.createdAt, tz)}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap text-ink-2">{IMPORT_KINDS[j.kind]?.label ?? j.kind}</TD>
                  <TD className="max-w-56 truncate text-ink-2" title={j.fileName}>
                    {j.fileName}
                  </TD>
                  <TD>
                    <ImportStatusBadge status={j.status} />
                  </TD>
                  <TD numeric>{j.totalRows.toLocaleString("en-GB")}</TD>
                  <TD numeric>{j.status === "committed" || j.status === "rolled_back" ? j.insertedCount.toLocaleString("en-GB") : "—"}</TD>
                  <TD numeric>{j.status === "committed" || j.status === "rolled_back" ? j.updatedCount.toLocaleString("en-GB") : "—"}</TD>
                  <TD numeric className={j.invalidRows > 0 ? "text-negative-700" : undefined}>
                    {j.invalidRows.toLocaleString("en-GB")}
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
