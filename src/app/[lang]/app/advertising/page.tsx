import { AlertTriangle, Download, Lock, Megaphone } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AddSpendDialog, CampaignLinkSelect } from "@/components/advertising/advertising-controls";
import { AnalyticsPaused } from "@/components/app/analytics-paused";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { BarSeriesChart } from "@/components/charts/bar-series-chart";
import { CHART } from "@/components/charts/chart-theme";
import { KpiGrid, KpiTile } from "@/components/dashboard/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { TermTip } from "@/components/ui/overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { rangeQuery } from "@/lib/analytics/range";
import { bucketDailyValues } from "@/lib/analytics/series";
import { requireStore } from "@/lib/auth/workspace";
import { getAdvertisingData, listCampaignOptions, reportPeriod, ReportsPausedError } from "@/lib/data/reports";
import { addDays } from "@/lib/dates";
import { platformLabel, type Platform } from "@/lib/domain/types";
import { buildAdvertisingKpis } from "@/lib/finance/kpis";
import { definitionsFor } from "@/lib/finance/metrics";
import { cn } from "@/lib/utils";
import { advertisingMessages } from "@/i18n/messages/catalog-advertising";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { getFormat, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: advertisingMessages[await getLocale()].metaTitle };
}

const PLATFORM_ORDER: Platform[] = ["meta", "google", "tiktok", "pinterest", "microsoft", "other"];

export default function AdvertisingPage({ searchParams }: PageProps<"/[lang]/app/advertising">) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px] rounded-lg" />}>
      <Advertising searchParams={searchParams} />
    </Suspense>
  );
}

async function Advertising({ searchParams }: { searchParams: PageProps<"/[lang]/app/advertising">["searchParams"] }) {
  const [ws, sp, locale, f] = await Promise.all([requireStore(), searchParams, getLocale(), getFormat()]);
  const t = advertisingMessages[locale];
  const c = catalogCommon[locale];
  const definitions = definitionsFor(locale);
  const label = (p: string) => platformLabel(p as Platform, locale) ?? p;
  const store = ws.activeStore;
  const period = reportPeriod(store, ws.entitlements, sp);
  const keep = rangeQuery(period);
  const advanced = ws.entitlements.limits.advancedFilters;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const platformParam = first(sp.platform) as Platform | undefined;
  const platform = advanced && platformParam && PLATFORM_ORDER.includes(platformParam) ? platformParam : null;
  const canWrite = ws.entitlements.canWrite;
  const campaignOptions = await listCampaignOptions(store);

  const header = (
    <PageHeader
      eyebrow={store.name}
      title={t.title}
      description={t.description(f.range(period.range))}
      actions={
        <>
          <DateRangePicker
            pathname="/app/advertising"
            preserve={platform ? { platform } : {}}
            range={period.range}
            preset={period.preset}
            today={period.today}
            historyStart={period.historyStart}
          />
          <AddSpendDialog campaigns={campaignOptions} currency={store.currency} defaultDate={addDays(period.today, -1)} disabled={!canWrite} />
          {ws.entitlements.limits.exports ? (
            <Button variant="secondary" asChild>
              <a href={`/api/exports/campaigns?${keep}`}>
                <Download aria-hidden />
                {c.exportCsv}
              </a>
            </Button>
          ) : (
            <Button variant="secondary" asChild>
              <Link href="/app/billing" title={c.exportsPro}>
                <Lock aria-hidden />
                {c.exportCsv}
                <Badge tone="outline">Pro</Badge>
              </Link>
            </Button>
          )}
        </>
      }
    />
  );

  if (!ws.entitlements.canViewAnalytics) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsPaused what={t.analytics} />
      </div>
    );
  }

  let data;
  try {
    data = await getAdvertisingData(store, period.range, period.comparison);
  } catch (error) {
    if (error instanceof ReportsPausedError) {
      return (
        <div className="space-y-6">
          {header}
          <AnalyticsPaused what={t.analytics} />
        </div>
      );
    }
    throw error;
  }

  const { metrics, previous } = data;
  const money = (v: number) => f.money(v, store.currency);
  const platformsWithData = PLATFORM_ORDER.filter((p) => data.daily.some((d) => d.platform === p) || data.campaigns.some((c) => c.platform === p));
  const daily = platform ? data.daily.filter((d) => d.platform === platform) : data.daily;
  const chartPlatforms = platform ? [platform] : platformsWithData;
  const byDay = new Map<string, Partial<Record<Platform, number>>>();
  for (const d of daily) {
    const entry = byDay.get(d.day) ?? {};
    entry[d.platform as Platform] = (entry[d.platform as Platform] ?? 0) + d.spend;
    byDay.set(d.day, entry);
  }
  const series = bucketDailyValues([...byDay.entries()].map(([day, values]) => ({ day, values })), chartPlatforms, period.range);
  const campaigns = platform ? data.campaigns.filter((c) => c.platform === platform) : data.campaigns;
  const context = period.comparison ? t.vsPrevious(period.days) : undefined;
  const hasAnyAds = campaignOptions.length > 0 || data.daily.length > 0;
  const linkedSpend = data.campaigns.filter((c) => c.productId).reduce((a, c) => a + c.spend, 0);

  if (!hasAnyAds) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={<Megaphone aria-hidden />}
            title={t.emptyTitle}
            description={t.emptyBody}
            actions={
              <Button asChild>
                <Link href={"/app/imports/new?kind=ad_spend" as Route}>{t.importAdSpend}</Link>
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <KpiGrid>
        {buildAdvertisingKpis(metrics, previous, store.currency, locale).map((k) => (
          <KpiTile key={k.key} label={k.label} value={k.value} definition={k.definition} delta={k.delta} deltaContext={context} status={k.status} footnote={k.footnote} />
        ))}
      </KpiGrid>

      <div className="flex flex-wrap items-center gap-1" role="navigation" aria-label={t.platformFilter}>
        {[null, ...platformsWithData].map((p) => {
          const active = p === platform;
          const text = p ? label(p) : t.allPlatforms;
          if (p && !advanced) return null;
          return (
            <Link
              key={p ?? "all"}
              href={`/app/advertising?${keep}${p ? `&platform=${p}` : ""}` as Route}
              aria-current={active ? "page" : undefined}
              className={cn("rounded-md px-2.5 py-1.5 text-sm font-medium", active ? "bg-navy-800 text-white" : "text-ink-2 hover:bg-hover")}
            >
              {text}
            </Link>
          );
        })}
        {!advanced && platformsWithData.length > 1 ? (
          <Link href="/app/billing" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-3 hover:bg-hover" title={t.platformFiltersPro}>
            {t.filterByPlatform}
            <Badge tone="outline">Pro</Badge>
          </Link>
        ) : null}
        {platform ? <span className="ml-2 text-xs text-ink-3">{t.figuresCoverAll}</span> : null}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <BarSeriesChart
          title={platform ? t.platformSpend(label(platform)) : t.spendByPlatform}
          description={t.spendChartDescription(series.granularity)}
          series={chartPlatforms.map((p) => ({ key: p, label: label(p), color: CHART.series[PLATFORM_ORDER.indexOf(p)] }))}
          points={series.points}
          granularity={series.granularity}
          valueKind="money"
          currency={store.currency}
        />
        <Card className="min-w-0">
          <CardHeader title={t.reading} as="h2" />
          <CardBody className="space-y-3 text-sm text-ink-2">
            <p>
              <span className="font-medium text-ink">{t.platformRoas}</span>
              {t.platformRoasText}
            </p>
            <p>
              <span className="font-medium text-ink">{t.blendedRoas}</span>
              {t.blendedRoasText(f.multiple(metrics.blendedRoas))}
            </p>
            <p>
              <span className="font-medium text-ink">{t.breakEvenRoas}</span>
              {t.breakEvenRoasText(f.multiple(metrics.breakEvenRoas))}
            </p>
            <p className="text-ink-3">{t.linkedShare(money(linkedSpend), money(metrics.adSpend))}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t.campaigns}
          description={t.campaignsDescription}
        />
        {campaigns.length === 0 ? (
          <CardBody>
            <p className="text-sm text-ink-3">{t.noCampaign(platform ? label(platform) : null)}</p>
          </CardBody>
        ) : (
          <TableContainer className="mt-3">
            <Table>
              <caption className="sr-only">{t.campaignsCaption(f.range(period.range))}</caption>
              <THead>
                <TR>
                  <TH>{t.colCampaign}</TH>
                  <TH>{t.colPromotes}</TH>
                  <TH numeric>{t.colSpend}</TH>
                  <TH numeric>{t.colClicks}</TH>
                  <TH numeric>{t.colConversions}</TH>
                  <TH numeric>{t.colConversionValue}</TH>
                  <TH numeric>
                    <span className="inline-flex items-center gap-1">
                      {t.colPlatformRoas}
                      <TermTip term={definitions.roas.term}>{definitions.roas.short}</TermTip>
                    </span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {campaigns.map((c) => {
                  const below = metrics.breakEvenRoas !== null && c.platformRoas !== null && c.platformRoas < metrics.breakEvenRoas;
                  return (
                    <TR key={c.campaignId} className="hover:bg-hover/50">
                      <TD className="max-w-72">
                        <div className="truncate font-medium text-ink">{c.name}</div>
                        <div className="text-xs text-ink-3">{label(c.platform)}</div>
                      </TD>
                      <TD>
                        <CampaignLinkSelect campaignId={c.campaignId} campaignName={c.name} productId={c.productId} products={data.products} disabled={!canWrite} />
                      </TD>
                      <TD numeric>{money(c.spend)}</TD>
                      <TD numeric>{f.count(c.clicks)}</TD>
                      <TD numeric>{f.count(c.conversions)}</TD>
                      <TD numeric>{money(c.conversionValue)}</TD>
                      <TD numeric>
                        <span className="inline-flex items-center justify-end gap-2">
                          {below ? (
                            <Badge tone="caution">
                              <AlertTriangle aria-hidden />
                              {t.belowBreakEven}
                            </Badge>
                          ) : null}
                          <span className="font-medium">{f.multiple(c.platformRoas)}</span>
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </div>
  );
}
