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
import { addDays, formatRange } from "@/lib/dates";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/types";
import { formatCount, formatMultiple } from "@/lib/finance/format";
import { buildAdvertisingKpis } from "@/lib/finance/kpis";
import { DEFINITIONS } from "@/lib/finance/metrics";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Advertising" };

const PLATFORM_ORDER: Platform[] = ["meta", "google", "tiktok", "pinterest", "microsoft", "other"];

export default function AdvertisingPage({ searchParams }: PageProps<"/app/advertising">) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px] rounded-lg" />}>
      <Advertising searchParams={searchParams} />
    </Suspense>
  );
}

async function Advertising({ searchParams }: { searchParams: PageProps<"/app/advertising">["searchParams"] }) {
  const [ws, sp] = await Promise.all([requireStore(), searchParams]);
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
      title="Advertising"
      description={`Spend, attribution and what advertising leaves of your margin, ${formatRange(period.range)}.`}
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
                Export CSV
              </a>
            </Button>
          ) : (
            <Button variant="secondary" asChild>
              <Link href="/app/billing" title="CSV exports are part of Pro">
                <Lock aria-hidden />
                Export CSV
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
        <AnalyticsPaused what="Advertising analytics" />
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
          <AnalyticsPaused what="Advertising analytics" />
        </div>
      );
    }
    throw error;
  }

  const { metrics, previous } = data;
  const money = (v: number) => formatMoney(v, store.currency);
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
  const context = period.comparison ? `vs previous ${period.days} days` : undefined;
  const hasAnyAds = campaignOptions.length > 0 || data.daily.length > 0;
  const linkedSpend = data.campaigns.filter((c) => c.productId).reduce((a, c) => a + c.spend, 0);

  if (!hasAnyAds) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={<Megaphone aria-hidden />}
            title="No advertising data yet"
            description="Export a report with one row per campaign and day from Meta Ads Manager, Google Ads or TikTok Ads, and import it. Narixia then shows what advertising leaves of your margin."
            actions={
              <Button asChild>
                <Link href={"/app/imports/new?kind=ad_spend" as Route}>Import ad spend</Link>
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
        {buildAdvertisingKpis(metrics, previous, store.currency).map((k) => (
          <KpiTile key={k.key} label={k.label} value={k.value} definition={k.definition} delta={k.delta} deltaContext={context} status={k.status} footnote={k.footnote} />
        ))}
      </KpiGrid>

      <div className="flex flex-wrap items-center gap-1" role="navigation" aria-label="Platform filter">
        {[null, ...platformsWithData].map((p) => {
          const active = p === platform;
          const label = p ? PLATFORM_LABELS[p] : "All platforms";
          if (p && !advanced) return null;
          return (
            <Link
              key={p ?? "all"}
              href={`/app/advertising?${keep}${p ? `&platform=${p}` : ""}` as Route}
              aria-current={active ? "page" : undefined}
              className={cn("rounded-md px-2.5 py-1.5 text-sm font-medium", active ? "bg-navy-800 text-white" : "text-ink-2 hover:bg-hover")}
            >
              {label}
            </Link>
          );
        })}
        {!advanced && platformsWithData.length > 1 ? (
          <Link href="/app/billing" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-3 hover:bg-hover" title="Platform filters are part of Pro">
            Filter by platform
            <Badge tone="outline">Pro</Badge>
          </Link>
        ) : null}
        {platform ? <span className="ml-2 text-xs text-ink-3">The figures above always cover all platforms.</span> : null}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <BarSeriesChart
          title={platform ? `${PLATFORM_LABELS[platform]} spend` : "Ad spend by platform"}
          description={`${series.granularity === "day" ? "Daily" : series.granularity === "week" ? "Weekly" : "Monthly"} spend, excluding VAT.`}
          series={chartPlatforms.map((p) => ({ key: p, label: PLATFORM_LABELS[p], color: CHART.series[PLATFORM_ORDER.indexOf(p)] }))}
          points={series.points}
          granularity={series.granularity}
          valueKind="money"
          currency={store.currency}
        />
        <Card className="min-w-0">
          <CardHeader title="Reading these numbers" as="h2" />
          <CardBody className="space-y-3 text-sm text-ink-2">
            <p>
              <span className="font-medium text-ink">Platform ROAS</span> is what each platform attributes to its own ads. Platforms count with their own rules and the same sale
              can be claimed twice.
            </p>
            <p>
              <span className="font-medium text-ink">Blended ROAS</span> ({formatMultiple(metrics.blendedRoas)}) divides all net revenue by all ad spend. It needs no attribution,
              but includes sales that would have happened without ads.
            </p>
            <p>
              <span className="font-medium text-ink">Break-even ROAS</span> ({formatMultiple(metrics.breakEvenRoas)}) is where advertising uses up the whole margin left after
              product, shipping and payment costs. Campaigns below it cost more margin than the revenue they are credited with brings.
            </p>
            <p className="text-ink-3">
              {money(linkedSpend)} of {money(metrics.adSpend)} spend is from campaigns linked to a single product and counts in that product&rsquo;s margin. The rest stays at
              store level.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Campaigns"
          description="Link a campaign to the product it promotes to include its spend in that product's margin. Campaigns for several products stay store-wide."
        />
        {campaigns.length === 0 ? (
          <CardBody>
            <p className="text-sm text-ink-3">No campaign spent in this period{platform ? ` on ${PLATFORM_LABELS[platform]}` : ""}.</p>
          </CardBody>
        ) : (
          <TableContainer className="mt-3">
            <Table>
              <caption className="sr-only">Campaigns, {formatRange(period.range)}</caption>
              <THead>
                <TR>
                  <TH>Campaign</TH>
                  <TH>Promotes</TH>
                  <TH numeric>Spend</TH>
                  <TH numeric>Clicks</TH>
                  <TH numeric>Conversions</TH>
                  <TH numeric>Conversion value</TH>
                  <TH numeric>
                    <span className="inline-flex items-center gap-1">
                      Platform ROAS
                      <TermTip term={DEFINITIONS.roas.term}>{DEFINITIONS.roas.short}</TermTip>
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
                        <div className="text-xs text-ink-3">{PLATFORM_LABELS[c.platform as Platform] ?? c.platform}</div>
                      </TD>
                      <TD>
                        <CampaignLinkSelect campaignId={c.campaignId} campaignName={c.name} productId={c.productId} products={data.products} disabled={!canWrite} />
                      </TD>
                      <TD numeric>{money(c.spend)}</TD>
                      <TD numeric>{formatCount(c.clicks)}</TD>
                      <TD numeric>{formatCount(c.conversions)}</TD>
                      <TD numeric>{money(c.conversionValue)}</TD>
                      <TD numeric>
                        <span className="inline-flex items-center justify-end gap-2">
                          {below ? (
                            <Badge tone="caution">
                              <AlertTriangle aria-hidden />
                              Below break-even
                            </Badge>
                          ) : null}
                          <span className="font-medium">{formatMultiple(c.platformRoas)}</span>
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
