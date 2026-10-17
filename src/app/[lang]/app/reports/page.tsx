import { Download, FileSpreadsheet, FileText, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AnalyticsPaused } from "@/components/app/analytics-paused";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { ProfitBreakdown } from "@/components/dashboard/profit-breakdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { rangeQuery } from "@/lib/analytics/range";
import { requireStore } from "@/lib/auth/workspace";
import { getOverviewData, reportPeriod } from "@/lib/data/reports";
import { reportsPage } from "@/i18n/messages/account-reports";
import { getFormat, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: reportsPage[await getLocale()].metaTitle };
}

type Download = { label: string; href: string; format: "PDF" | "CSV" };
type ReportDef = { id: string; title: string; description: string; downloads: Download[] };

export default function ReportsPage({ searchParams }: PageProps<"/[lang]/app/reports">) {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] rounded-lg" />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ searchParams }: { searchParams: PageProps<"/[lang]/app/reports">["searchParams"] }) {
  const [ws, sp, locale, f] = await Promise.all([requireStore(), searchParams, getLocale(), getFormat()]);
  const t = reportsPage[locale];
  const store = ws.activeStore;
  const period = reportPeriod(store, ws.entitlements, sp);
  const q = rangeQuery(period);
  const canDownload = ws.entitlements.limits.exports;

  const reports: ReportDef[] = [
    {
      id: "summary",
      title: t.summaryTitle,
      description: t.summaryDescription,
      downloads: [
        { label: "PDF", href: `/api/reports/summary?format=pdf&${q}`, format: "PDF" },
        { label: "CSV", href: `/api/reports/summary?format=csv&${q}`, format: "CSV" },
      ],
    },
    {
      id: "products",
      title: t.productsTitle,
      description: t.productsDescription,
      downloads: [
        { label: "PDF", href: `/api/reports/products?format=pdf&${q}`, format: "PDF" },
        { label: "CSV", href: `/api/exports/products?${q}`, format: "CSV" },
      ],
    },
    {
      id: "advertising",
      title: t.advertisingTitle,
      description: t.advertisingDescription,
      downloads: [
        { label: "PDF", href: `/api/reports/advertising?format=pdf&${q}`, format: "PDF" },
        { label: "CSV", href: `/api/exports/campaigns?${q}`, format: "CSV" },
      ],
    },
    {
      id: "daily",
      title: t.dailyTitle,
      description: t.dailyDescription,
      downloads: [{ label: "CSV", href: `/api/reports/daily?format=csv&${q}`, format: "CSV" }],
    },
  ];

  const header = (
    <PageHeader
      eyebrow={store.name}
      title={t.title}
      description={t.description(f.range(period.range))}
      actions={<DateRangePicker pathname="/app/reports" range={period.range} preset={period.preset} today={period.today} historyStart={period.historyStart} />}
    />
  );

  if (!ws.entitlements.canViewAnalytics) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsPaused />
      </div>
    );
  }

  const data = await getOverviewData(store, period.range, period.comparison, locale);

  return (
    <div className="space-y-6">
      {header}
      {!canDownload ? (
        <Alert
          tone="info"
          title={t.proTitle}
          action={
            <Link href="/app/billing" className="text-sm font-medium whitespace-nowrap underline-offset-2 hover:underline">
              {t.seePro}
            </Link>
          }
        >
          {t.proBody}
        </Alert>
      ) : null}
      {store.is_demo ? <Alert tone="caution">{t.demoNotice}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.id} className="flex flex-col">
            <div className="flex flex-1 gap-3 px-5 pt-4">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-3">
                {r.downloads.some((d) => d.format === "PDF") ? <FileText className="size-4" aria-hidden /> : <FileSpreadsheet className="size-4" aria-hidden />}
              </span>
              <div>
                <h2 className="text-md font-semibold tracking-tight text-ink">{r.title}</h2>
                <p className="mt-1 text-sm text-ink-3">{r.description}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 px-5 pt-4 pb-5 sm:pl-16">
              {r.downloads.map((d) =>
                canDownload ? (
                  <Button key={d.label} variant="secondary" size="sm" asChild>
                    <a href={d.href} download>
                      <Download aria-hidden />
                      {d.label}
                      <span className="sr-only">{t.downloadOf(r.title)}</span>
                    </a>
                  </Button>
                ) : (
                  <Button key={d.label} variant="secondary" size="sm" asChild>
                    <Link href="/app/billing" title={t.proTitle}>
                      <Lock aria-hidden />
                      {d.label}
                      <Badge tone="outline">Pro</Badge>
                    </Link>
                  </Button>
                ),
              )}
            </div>
          </Card>
        ))}
      </div>

      <section aria-labelledby="preview-heading" className="space-y-3">
        <h2 id="preview-heading" className="text-lg font-semibold tracking-tight text-ink">
          {t.preview}
        </h2>
        <ProfitBreakdown metrics={data.metrics} currency={store.currency} title={f.range(period.range)} locale={locale} />
      </section>
    </div>
  );
}
