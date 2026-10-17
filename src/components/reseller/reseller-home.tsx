import { ArrowRight, Hourglass, PackageCheck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AnalyticsPaused } from "@/components/app/analytics-paused";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { AddItemButton, QuickActionsProvider, SellButton } from "@/components/reseller/quick-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Locale } from "@/i18n/config";
import type { Format } from "@/i18n/format";
import { kpiMessages } from "@/i18n/messages/dashboard-kpis";
import { overviewMessages } from "@/i18n/messages/dashboard-overview";
import { resellerMessages } from "@/i18n/messages/reseller";
import { rangeQuery } from "@/lib/analytics/range";
import type { ReadyWorkspace, Store } from "@/lib/auth/workspace";
import { getResellerHome, getSellContext } from "@/lib/data/reseller";
import { ReportsPausedError, type ReportPeriod } from "@/lib/data/reports";
import { definitionsFor, METRIC_POLARITY, type Metrics } from "@/lib/finance/metrics";
import { e4ToMinor } from "@/lib/finance/money";
import { isPlatformId, platformName } from "@/lib/onboarding/constants";
import { daysBetween } from "@/lib/reseller/logic";
import { cn } from "@/lib/utils";

/**
 * Home page of a store in reseller mode: two big actions, what is left from
 * the period's sales, the stock and what lingers in it, the best sales and the
 * split by platform. Mobile first; the e-commerce overview is unchanged.
 */

type Props = {
  ws: ReadyWorkspace & { activeStore: Store };
  period: ReportPeriod;
  initial: "add" | "sell" | null;
  locale: Locale;
  f: Format;
  /** Slot under the actions, e.g. sale emails waiting for confirmation. */
  notice?: ReactNode;
};

function relative(f: Format, current: number, previous: number | null | undefined) {
  if (previous === undefined || previous === null || previous === 0) return { value: null, text: "" };
  const value = (current - previous) / Math.abs(previous);
  return { value: Math.abs(value) < 0.0005 ? 0 : value, text: f.percent(Math.abs(value) < 0.0005 ? 0 : value, { signDisplay: "exceptZero" }) };
}

function channelLabel(channel: string | null, locale: Locale) {
  if (channel && isPlatformId(channel)) return platformName(channel, locale);
  return resellerMessages[locale].home.channelUnknown;
}

export async function ResellerHome({ ws, period, initial, locale, f, notice }: Props) {
  const t = resellerMessages[locale].home;
  const store = ws.activeStore;
  const header = (
    <PageHeader
      eyebrow={store.name}
      title={t.title}
      description={
        <span className="tabular">
          {f.range(period.range)}
          {period.comparison ? <span className="text-ink-3">{overviewMessages[locale].comparedWith(f.range(period.comparison))}</span> : null}
        </span>
      }
      actions={<DateRangePicker pathname="/app" range={period.range} preset={period.preset} today={period.today} historyStart={period.historyStart} />}
    />
  );
  const paused = (
    <div className="space-y-6">
      {header}
      <AnalyticsPaused />
    </div>
  );
  if (!ws.entitlements.canViewAnalytics) return paused;

  let data, sell;
  try {
    [data, sell] = await Promise.all([getResellerHome(store, period.range, period.comparison, period.today), getSellContext(store)]);
  } catch (error) {
    if (error instanceof ReportsPausedError) return paused;
    throw error;
  }

  const money = (v: number) => f.money(v, store.currency);
  const canWrite = ws.entitlements.canWrite;
  const actions = (
    <div className="grid grid-cols-2 gap-3">
      <AddItemButton className="h-14 w-full text-lg" />
      <SellButton className="h-14 w-full text-lg" />
    </div>
  );

  return (
    <QuickActionsProvider currency={store.currency} today={period.today} stock={sell.stock} defaultChannel={sell.defaultChannel} disabled={!canWrite} initial={initial}>
      {!data.hasAnyData ? (
        <div className="space-y-6">
          <PageHeader eyebrow={store.name} title={t.title} />
          {actions}
          {notice}
          <Card>
            <CardBody className="space-y-4 py-6">
              <h2 className="text-xl font-semibold tracking-tight text-ink">{t.emptyTitle}</h2>
              <ol className="space-y-3">
                {[t.emptyStep1, t.emptyStep2].map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-white tabular" aria-hidden>
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-md text-ink-2">{step}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {header}
          {actions}
          {notice}
          <HeadlineFigures metrics={data.metrics} previous={data.previous} currency={store.currency} locale={locale} f={f} comparisonDays={period.comparison ? period.days : null} />
          <StockCard data={data} store={store} locale={locale} f={f} today={period.today} />
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <Card aria-labelledby="best-heading" className="min-w-0">
              <CardHeader id="best-heading" title={t.bestTitle} description={t.bestDescription} />
              {data.best.length > 0 ? (
                <ol className="mt-2 divide-y divide-line border-t border-line">
                  {data.best.map((b, i) => (
                    <li key={b.productId} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="w-4 shrink-0 text-sm text-ink-3 tabular" aria-hidden>
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-md text-ink">{b.name}</span>
                          <span className="block text-xs text-ink-3 tabular">
                            {t.colSales} {money(b.netRevenue)}
                          </span>
                        </span>
                      </span>
                      <span className={cn("shrink-0 font-semibold tabular", b.margin < 0 ? "text-negative-700" : "text-ink")}>{money(b.margin)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <CardBody>
                  <p className="text-sm text-ink-3">{t.bestNone}</p>
                </CardBody>
              )}
            </Card>
            <Card aria-labelledby="channel-heading" className="min-w-0">
              <CardHeader id="channel-heading" title={t.channelTitle} description={t.channelDescription} />
              {data.channels.length > 0 ? (
                <TableContainer className="mt-3">
                  <Table>
                    <caption className="sr-only">{t.channelTitle}</caption>
                    <THead>
                      <TR>
                        <TH>{t.colPlatform}</TH>
                        <TH numeric>{t.colSales}</TH>
                        <TH numeric>{t.colKept}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.channels.map((c) => (
                        <TR key={c.channel ?? "none"}>
                          <TD>
                            <span className="block text-ink">{channelLabel(c.channel, locale)}</span>
                            <span className="block text-xs text-ink-3">{t.salesCount(c.orders)}</span>
                          </TD>
                          <TD numeric>{money(c.netRevenue)}</TD>
                          <TD numeric>
                            {c.margin === null ? <Badge tone="caution">{t.incomplete}</Badge> : <span className={c.margin < 0 ? "text-negative-700" : undefined}>{money(c.margin)}</span>}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableContainer>
              ) : (
                <CardBody>
                  <p className="text-sm text-ink-3">{t.channelNone}</p>
                </CardBody>
              )}
              {data.storeWideExpenses > 0 ? <p className="border-t border-line px-5 py-3 text-xs text-ink-3">{t.storeWideNote(money(data.storeWideExpenses))}</p> : null}
            </Card>
          </div>
          <p className="text-right">
            <Link href={`/app/items?${rangeQuery(period)}` as Route} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
              {resellerMessages[locale].items.title}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </p>
        </div>
      )}
    </QuickActionsProvider>
  );
}

function HeadlineFigures({
  metrics,
  previous,
  currency,
  locale,
  f,
  comparisonDays,
}: {
  metrics: Metrics;
  previous: Metrics | null;
  currency: string;
  locale: Locale;
  f: Format;
  comparisonDays: number | null;
}) {
  const t = resellerMessages[locale].home;
  const D = definitionsFor(locale);
  const money = (v: number) => f.money(v, currency);
  const context = comparisonDays ? overviewMessages[locale].deltaContext(comparisonDays) : undefined;
  const status =
    metrics.completeness.cogs === "partial" || metrics.completeness.cogs === "missing"
      ? { tone: "caution" as const, label: t.costsMissing }
      : metrics.completeness.fees === "estimated" || metrics.completeness.shipping === "estimated"
        ? { tone: "info" as const, label: kpiMessages[locale].status.includesEstimates }
        : null;
  return (
    <section aria-labelledby="reseller-kpis">
      <h2 id="reseller-kpis" className="sr-only">
        {t.keyFigures}
      </h2>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs sm:grid-cols-3">
        <KpiTile
          className="col-span-2 sm:col-span-1"
          label={t.kept}
          value={<span className={metrics.contributionMargin < 0 ? "text-negative-700" : undefined}>{money(metrics.contributionMargin)}</span>}
          definition={{ term: D.contributionMargin.term, text: `${D.contributionMargin.short} ${D.contributionMargin.formula}.` }}
          delta={previous ? { ...relative(f, metrics.contributionMargin, previous.contributionMargin), polarity: METRIC_POLARITY.contributionMargin } : null}
          deltaContext={context}
          status={status}
          footnote={metrics.contributionMarginRate !== null ? t.keptFootnote(f.percent(metrics.contributionMarginRate)) : null}
        />
        <KpiTile
          label={t.sales}
          value={money(metrics.netRevenue)}
          definition={{ term: D.netRevenue.term, text: `${D.netRevenue.short} ${D.netRevenue.formula}.` }}
          delta={previous ? { ...relative(f, metrics.netRevenue, previous.netRevenue), polarity: METRIC_POLARITY.netRevenue } : null}
          deltaContext={context}
        />
        <KpiTile label={t.itemsSold} value={f.count(metrics.units)} definition={{ term: t.itemsSold, text: t.itemsSoldDefinition }} footnote={t.ordersFootnote(metrics.orders)} />
      </div>
    </section>
  );
}

function StockCard({ data, store, locale, f, today }: { data: Awaited<ReturnType<typeof getResellerHome>>; store: Store; locale: Locale; f: Format; today: string }) {
  const t = resellerMessages[locale].home;
  const money = (v: number) => f.money(v, store.currency);
  return (
    <Card aria-labelledby="stock-heading">
      <CardHeader
        id="stock-heading"
        title={t.stockTitle}
        description={t.stockDescription}
        actions={
          <Link href={"/app/items?tab=in_stock" as Route} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
            {t.seeStock}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      <CardBody className="grid grid-cols-2 gap-4">
        <div className="flex items-start gap-3">
          <PackageCheck className="mt-1 size-5 shrink-0 text-ink-3" aria-hidden />
          <div>
            <p className="text-2xl font-semibold tracking-tight text-ink tabular">{f.count(data.stock.items)}</p>
            <p className="text-sm text-ink-3">{t.inStockUnit(data.stock.items)}</p>
          </div>
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight text-ink tabular">{money(data.stock.costMinor)}</p>
          <p className="text-sm text-ink-3">{t.tiedUp}</p>
          <p className="sr-only">{t.tiedUpHint}</p>
        </div>
        {data.stock.itemsWithoutCost > 0 ? <p className="col-span-2 text-xs text-caution-700">{t.withoutCost(data.stock.itemsWithoutCost)}</p> : null}
      </CardBody>
      <div className="border-t border-line">
        <div className="flex items-center gap-2 px-5 pt-4">
          <Hourglass className="size-4 text-ink-3" aria-hidden />
          <h3 className="text-md font-semibold tracking-tight text-ink">{t.staleTitle}</h3>
          <span className="text-sm text-ink-3">· {t.staleDescription}</span>
        </div>
        {data.stale.length === 0 ? (
          <p className="px-5 pt-2 pb-4 text-sm text-ink-3">{t.staleNone}</p>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-line">
              {data.stale.map((item) => (
                <li key={item.productId} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-md text-ink">{item.name}</p>
                    <p className="text-xs text-ink-3 tabular">
                      {t.daysInStock(daysBetween(item.stockedOn, today))} ·{" "}
                      {item.unitCostE4 === null ? <span className="text-caution-700">{t.missingCost}</span> : t.boughtFor(money(e4ToMinor(item.unitCostE4, store.currency)))}
                    </p>
                  </div>
                  <SellButton productId={item.productId} size="sm" variant="secondary" icon={false} label={resellerMessages[locale].items.sell} aria-label={resellerMessages[locale].items.sellLabel(item.name)} />
                </li>
              ))}
            </ul>
            {data.stock.staleItems > data.stale.length ? (
              <p className="px-5 pb-4 text-sm text-ink-3">
                <Link href={"/app/items?tab=in_stock" as Route} className="font-medium text-emerald-700 hover:underline">
                  {t.staleMore(data.stock.staleItems - data.stale.length)}
                </Link>
              </p>
            ) : (
              <div className="pb-2" />
            )}
          </>
        )}
      </div>
    </Card>
  );
}
