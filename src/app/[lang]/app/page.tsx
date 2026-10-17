import { ArrowRight, Upload } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AnalyticsPaused } from "@/components/app/analytics-paused";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { SampleStoreButton } from "@/components/app/sample-store-button";
import { RevenueMarginChart } from "@/components/charts/revenue-margin-chart";
import { CampaignTable } from "@/components/dashboard/campaign-table";
import { DataNotices, dataNotices } from "@/components/dashboard/data-notices";
import { InsightList } from "@/components/dashboard/insight-list";
import { KpiGrid, KpiTile } from "@/components/dashboard/kpi-tile";
import { ProductMarginBars } from "@/components/dashboard/product-margin-bars";
import { ProfitBreakdown } from "@/components/dashboard/profit-breakdown";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/config";
import { overviewMessages } from "@/i18n/messages/dashboard-overview";
import { getFormat, getLocale } from "@/i18n/server";
import { rangeQuery } from "@/lib/analytics/range";
import { requireStore, type ReadyWorkspace, type Store } from "@/lib/auth/workspace";
import { getOverviewData, getStoreDataStatus, reportPeriod, ReportsPausedError, type ReportPeriod } from "@/lib/data/reports";
import { buildAdvertisingKpis, buildPrimaryKpis, buildSecondaryKpis } from "@/lib/finance/kpis";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: overviewMessages[locale].title };
}

type SearchParams = Awaited<PageProps<"/[lang]/app">["searchParams"]>;

export default async function OverviewPage({ searchParams }: PageProps<"/[lang]/app">) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<OverviewSkeleton locale={locale} />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Header({ store, period }: { store: Store; period: ReportPeriod }) {
  const t = overviewMessages[await getLocale()];
  const f = await getFormat();
  return (
    <PageHeader
      eyebrow={store.name}
      title={t.title}
      description={
        <span className="tabular">
          {f.range(period.range)}
          {period.comparison ? <span className="text-ink-3">{t.comparedWith(f.range(period.comparison))}</span> : null}
        </span>
      }
      actions={
        <DateRangePicker
          pathname="/app"
          range={period.range}
          preset={period.preset}
          today={period.today}
          historyStart={period.historyStart}
        />
      }
    />
  );
}

async function HistoryNotices({ ws, period }: { ws: ReadyWorkspace; period: ReportPeriod }) {
  const t = overviewMessages[await getLocale()];
  const f = await getFormat();
  const upgrade =
    ws.entitlements.plan === "trial" ? (
      <Link href="/app/billing" className="text-sm font-medium whitespace-nowrap underline-offset-2 hover:underline">
        {t.seePro}
      </Link>
    ) : null;
  return (
    <>
      {period.clampedToHistory ? (
        <Alert tone="info" title={t.clampedTitle(f.date(period.historyStart))} action={upgrade}>
          {t.clampedBody(ws.entitlements.limits.historyDays)}
        </Alert>
      ) : null}
      {!period.comparison && !period.clampedToHistory ? (
        <Alert tone="info" title={t.noComparisonTitle} action={upgrade}>
          {t.noComparisonBody(period.days)}
        </Alert>
      ) : null}
    </>
  );
}

async function Overview({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [ws, params, locale, f] = await Promise.all([requireStore(), searchParams, getLocale(), getFormat()]);
  const t = overviewMessages[locale];
  const store = ws.activeStore;
  const period = reportPeriod(store, ws.entitlements, params);
  const header = <Header store={store} period={period} />;

  if (!ws.entitlements.canViewAnalytics) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsPaused />
      </div>
    );
  }

  let status, data;
  try {
    [status, data] = await Promise.all([getStoreDataStatus(store), getOverviewData(store, period.range, period.comparison, locale)]);
  } catch (error) {
    if (error instanceof ReportsPausedError) {
      return (
        <div className="space-y-6">
          {header}
          <AnalyticsPaused />
        </div>
      );
    }
    throw error;
  }

  const demoStore = ws.stores.find((s) => s.is_demo) ?? null;

  if (status.orders === 0 && status.adSpendDays === 0 && status.expenses === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={store.name} title={t.title} description={t.emptyDescription} />
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <SetupChecklist status={status} />
          <Card>
            <EmptyState
              icon={<Upload aria-hidden />}
              title={t.noSalesTitle}
              description={t.noSalesBody}
              actions={
                <>
                  <Button asChild>
                    <Link href={"/app/imports/new?kind=orders" as Route}>{t.importOrders}</Link>
                  </Button>
                  {!store.is_demo ? <SampleStoreButton demoStoreId={demoStore?.id ?? null} /> : null}
                </>
              }
            />
          </Card>
        </div>
      </div>
    );
  }

  const { metrics, previous } = data;
  const context = period.comparison ? t.deltaContext(period.days) : undefined;
  const primary = buildPrimaryKpis(metrics, previous, store.currency, locale);
  const secondary = buildSecondaryKpis(metrics, previous, store.currency, locale);
  const notices = dataNotices(metrics, store, locale);
  // Cost-data insights repeat the data-quality notices shown above them.
  const insights = notices.length > 0 ? data.insights.filter((i) => i.id !== "missing_costs" && i.id !== "estimated_values") : data.insights;
  const productNames = Object.fromEntries(data.products.map((p) => [p.productId, p.name]));
  const keep = rangeQuery(period);
  const hasAds = metrics.adSpend > 0 || (previous?.adSpend ?? 0) > 0 || data.campaigns.length > 0;
  const setupIncomplete = status.orders === 0 || status.productsWithoutCost > 0 || !status.feeRuleSet || !status.shippingRuleSet || status.adSpendDays === 0;
  const unallocated = data.unallocated;
  const money = (v: number) => f.money(v, store.currency);

  return (
    <div className="space-y-6">
      {header}
      <HistoryNotices ws={ws} period={period} />

      {metrics.orders === 0 ? (
        <Alert
          tone="info"
          title={t.noOrdersTitle}
          action={
            status.firstOrderDate && status.lastOrderDate ? (
              <Link
                href={`/app?from=${status.firstOrderDate > period.historyStart ? status.firstOrderDate : period.historyStart}&to=${status.lastOrderDate}` as Route}
                className="text-sm font-medium whitespace-nowrap underline-offset-2 hover:underline"
              >
                {t.showAllOrders}
              </Link>
            ) : null
          }
        >
          {status.firstOrderDate && status.lastOrderDate
            ? t.ordersRange(f.date(status.firstOrderDate), f.date(status.lastOrderDate))
            : t.noOrdersFallback}
        </Alert>
      ) : null}

      <section aria-labelledby="kpi-heading" className="space-y-3">
        <h2 id="kpi-heading" className="sr-only">
          {t.keyFigures}
        </h2>
        <KpiGrid>
          {primary.map((k) => (
            <KpiTile key={k.key} label={k.label} value={k.value} definition={k.definition} delta={k.delta} deltaContext={context} status={k.status} footnote={k.footnote} />
          ))}
        </KpiGrid>
        <KpiGrid columns={6}>
          {secondary.map((k) => (
            <KpiTile key={k.key} size="sm" label={k.label} value={k.value} definition={k.definition} delta={k.delta} status={k.status} footnote={k.footnote} />
          ))}
        </KpiGrid>
      </section>

      <DataNotices notices={notices} locale={locale} />

      <RevenueMarginChart points={data.series.points} granularity={data.series.granularity} currency={store.currency} height={300} />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card aria-labelledby="insights-heading" className="min-w-0">
          <CardHeader id="insights-heading" title={t.whatChanged} description={t.whatChangedDescription} />
          {insights.length > 0 ? (
            <InsightList insights={insights} limit={4} className="mt-2" />
          ) : (
            <CardBody>
              <p className="text-sm text-ink-3">{t.nothingStandsOut(previous !== null)}</p>
            </CardBody>
          )}
        </Card>
        <ProfitBreakdown metrics={metrics} currency={store.currency} className="min-w-0" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section aria-labelledby="products-heading" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="products-heading" className="text-lg font-semibold tracking-tight text-ink">
              {t.products}
            </h2>
            <Link href={`/app/products?${keep}` as Route} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
              {t.allProducts}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {data.products.length > 0 ? (
            <ProductMarginBars rows={data.products} currency={store.currency} linkProducts limit={8} />
          ) : (
            <Card>
              <CardBody>
                <p className="text-sm text-ink-3">{t.noProductSales}</p>
              </CardBody>
            </Card>
          )}
          {unallocated.adSpend > 0 || unallocated.refunds > 0 || unallocated.variableExpenses > 0 ? (
            <p className="px-1 text-xs text-ink-3">
              {t.unallocatedIntro}
              {[
                unallocated.adSpend > 0 ? t.unallocatedAds(money(unallocated.adSpend)) : null,
                unallocated.refunds > 0 ? t.unallocatedRefunds(money(unallocated.refunds)) : null,
                unallocated.variableExpenses > 0 ? t.unallocatedVariable(money(unallocated.variableExpenses)) : null,
              ]
                .filter(Boolean)
                .join("; ")}
              {t.unallocatedOutro}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="ads-heading" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ads-heading" className="text-lg font-semibold tracking-tight text-ink">
              {t.advertising}
            </h2>
            <Link href={`/app/advertising?${keep}` as Route} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
              {t.advertisingDetails}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {hasAds ? (
            <>
              <KpiGrid columns={2}>
                {buildAdvertisingKpis(metrics, previous, store.currency, locale).map((k) => (
                  <KpiTile key={k.key} size="sm" label={k.label} value={k.value} definition={k.definition} delta={k.delta} deltaContext={context} status={k.status} footnote={k.footnote} />
                ))}
              </KpiGrid>
              {data.campaigns.length > 0 ? (
                <Card>
                  <CardHeader title={t.topCampaigns} description={t.topCampaignsDescription} as="h3" />
                  <div className="mt-3">
                    <CampaignTable campaigns={data.campaigns.slice(0, 5)} currency={store.currency} breakEvenRoas={metrics.breakEvenRoas} productNames={productNames} compact />
                  </div>
                </Card>
              ) : null}
            </>
          ) : (
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-3">{t.noAdSpend}</p>
                <Button variant="secondary" size="sm" asChild>
                  <Link href={"/app/imports/new?kind=ad_spend" as Route}>{t.addAdSpend}</Link>
                </Button>
              </CardBody>
            </Card>
          )}
        </section>
      </div>

      {setupIncomplete && !store.is_demo ? <SetupChecklist status={status} /> : null}
    </div>
  );
}

function OverviewSkeleton({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label={overviewMessages[locale].loading}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-56 rounded-md" />
      </div>
      <Skeleton className="h-[126px] rounded-lg" />
      <Skeleton className="h-[92px] rounded-lg" />
      <Skeleton className="h-[400px] rounded-lg" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-[480px] rounded-lg" />
        <Skeleton className="h-[480px] rounded-lg" />
      </div>
    </div>
  );
}
