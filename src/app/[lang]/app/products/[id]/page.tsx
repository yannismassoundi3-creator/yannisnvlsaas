import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalyticsPaused } from "@/components/app/analytics-paused";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { BarSeriesChart } from "@/components/charts/bar-series-chart";
import { CHART } from "@/components/charts/chart-theme";
import { KpiGrid, KpiTile } from "@/components/dashboard/kpi-tile";
import { CostEditor } from "@/components/products/cost-editor";
import { ProductActions } from "@/components/products/product-actions";
import { ProductForm } from "@/components/products/product-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TermTip } from "@/components/ui/overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { rangeQuery } from "@/lib/analytics/range";
import { bucketDailyValues } from "@/lib/analytics/series";
import { requireStore } from "@/lib/auth/workspace";
import { countProductLines, getCatalogRow, getLinkedCampaigns, getProduct, getProductDaily, getRecentLines } from "@/lib/data/products";
import { reportPeriod, ReportsPausedError } from "@/lib/data/reports";
import { platformLabel, type Platform } from "@/lib/domain/types";
import { definitionsFor } from "@/lib/finance/metrics";
import { cn } from "@/lib/utils";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { productsMessages } from "@/i18n/messages/catalog-products";
import { getFormat, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: productsMessages[await getLocale()].metaProductTitle };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ProductPage({ params, searchParams }: PageProps<"/[lang]/app/products/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px] rounded-lg" />}>
      <ProductDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductDetail({ params, searchParams }: Pick<PageProps<"/[lang]/app/products/[id]">, "params" | "searchParams">) {
  const [{ id }, sp, ws, locale, f] = await Promise.all([params, searchParams, requireStore(), getLocale(), getFormat()]);
  const t = productsMessages[locale];
  const c = catalogCommon[locale];
  const definitions = definitionsFor(locale);
  if (!UUID_RE.test(id)) notFound();
  const product = await getProduct(id);
  if (!product) notFound();
  const store = ws.activeStore;
  const period = reportPeriod(store, ws.entitlements, sp);
  const keep = rangeQuery(period);
  const money = (v: number) => f.money(v, store.currency);
  const canWrite = ws.entitlements.canWrite;
  const lineCount = await countProductLines(product.id);

  const header = (
    <PageHeader
      eyebrow={
        <Link href={`/app/products?${keep}` as Route} className="hover:underline">
          {t.title}
        </Link>
      }
      title={
        <span className="flex flex-wrap items-center gap-3">
          {product.name}
          {product.archived ? <Badge tone="neutral">{c.archived}</Badge> : null}
          {product.unitCostE4 === null ? <Badge tone="caution">{c.noCost}</Badge> : null}
        </span>
      }
      description={`${product.sku ? t.sku(product.sku) : c.noSku} · ${t.sources[product.source] ?? product.source}`}
      actions={
        <>
          <DateRangePicker pathname={`/app/products/${product.id}`} range={period.range} preset={period.preset} today={period.today} historyStart={period.historyStart} />
          <ProductActions productId={product.id} archived={product.archived} canDelete={lineCount === 0} disabled={!canWrite} />
        </>
      }
    />
  );

  const details = (
    <Card>
      <CardHeader title={t.details} description={t.detailsDescription} as="h2" />
      <CardBody>
        <ProductForm
          key={product.updatedAt}
          productId={product.id}
          currency={store.currency}
          initial={{ name: product.name, sku: product.sku, unitCostE4: product.unitCostE4, priceMinor: product.priceMinor }}
          submitLabel={t.saveChanges}
          disabled={!canWrite}
        />
      </CardBody>
    </Card>
  );

  if (!ws.entitlements.canViewAnalytics) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsPaused what={t.analytics} />
        {details}
      </div>
    );
  }

  let row, daily, campaigns, lines;
  try {
    [row, daily, campaigns, lines] = await Promise.all([
      getCatalogRow(store, period.range, product.id),
      getProductDaily(store, product.id, period.range),
      getLinkedCampaigns(store, product.id, period.range),
      getRecentLines(product.id, product.unitCostE4),
    ]);
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
  if (!row) notFound();

  const series = bucketDailyValues(
    daily.map((d) => ({ day: d.day, values: { sales: d.sales, units: d.units } })),
    ["sales", "units"] as const,
    period.range,
    locale,
  );
  const b = t.breakdown;
  const breakdown: { label: string; amount: number | null; sign: "+" | "−" | "="; note?: string; strong?: boolean }[] = [
    { label: b.grossSales, amount: row.grossSales, sign: "+" },
    { label: b.discounts, amount: -row.discounts, sign: "−" },
    { label: b.refunds, amount: -row.refunds, sign: "−", note: b.refundsNote },
    { label: b.netSales, amount: row.netSales, sign: "=", strong: true },
    { label: b.shippingCharged, amount: row.shippingCharged, sign: "+", note: b.shippingChargedNote },
    { label: b.netRevenue, amount: row.netRevenue, sign: "=", strong: true },
    { label: b.cogs, amount: row.cogs === null ? null : -row.cogs, sign: "−" },
    { label: b.shippingCosts, amount: -row.shippingCosts, sign: "−", note: b.shippingCostsNote },
    { label: b.fees, amount: -row.transactionFees, sign: "−", note: b.feesNote },
    { label: b.linkedAds, amount: -row.adSpend, sign: "−", note: b.linkedAdsNote },
    { label: b.contributionMargin, amount: row.contributionMargin, sign: "=", strong: true },
  ];

  return (
    <div className="space-y-6">
      {header}

      {row.linesWithoutCost > 0 ? (
        <Alert tone="caution" title={t.marginUnavailable}>
          {t.marginUnavailableBody(f.count(row.linesWithoutCost), row.linesWithoutCost)}
        </Alert>
      ) : null}

      <KpiGrid>
        <KpiTile label={t.unitsSold} value={f.count(row.units)} footnote={f.range(period.range)} />
        <KpiTile
          label={t.netRevenue}
          value={money(row.netRevenue)}
          definition={{ term: definitions.netRevenue.term, text: definitions.netRevenue.short }}
          footnote={t.netSalesFootnote(money(row.netSales))}
        />
        <KpiTile
          label={t.contributionMargin}
          value={row.contributionMargin === null ? "—" : money(row.contributionMargin)}
          definition={{ term: definitions.contributionMargin.term, text: definitions.contributionMargin.short }}
          status={row.contributionMargin === null ? { tone: "caution", label: t.costsIncomplete } : null}
          footnote={row.cogs !== null ? t.cogsFootnote(money(row.cogs)) : null}
        />
        <KpiTile
          label={t.contributionMarginRate}
          value={f.percent(row.contributionMarginRate)}
          footnote={
            <span className="inline-flex items-center gap-1">
              {t.unitCost} <CostEditor productId={product.id} productName={product.name} unitCostE4={product.unitCostE4} currency={store.currency} disabled={!canWrite} />
            </span>
          }
        />
      </KpiGrid>

      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <BarSeriesChart
          title={t.productSales}
          description={t.salesChartDescription(series.granularity)}
          series={[{ key: "sales", label: t.productSales, color: CHART.series[0] }]}
          points={series.points}
          granularity={series.granularity}
          valueKind="money"
          currency={store.currency}
          extras={[{ key: "units", label: t.units, kind: "count", values: series.points.map((p) => p.values.units) }]}
        />
        <Card className="min-w-0">
          <CardHeader title={t.marginBreakdown} description={f.range(period.range)} />
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">{t.breakdownCaption(product.name)}</caption>
            <tbody>
              {breakdown.map((r) => (
                <tr key={r.label} className={cn("border-t border-line", r.strong && "bg-sunken/45")}>
                  <th scope="row" className={cn("py-2 pl-5 text-left font-normal text-ink", r.strong && "font-medium")}>
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden className="w-3 text-center text-ink-3">
                        {r.sign}
                      </span>
                      {r.label}
                      {r.note ? <TermTip term={r.label}>{r.note}</TermTip> : null}
                    </span>
                  </th>
                  <td className={cn("py-2 pr-5 text-right tabular", r.strong && "font-medium", r.amount !== null && r.amount < 0 && r.strong && "text-negative-700")}>
                    {r.amount === null ? <span className="text-ink-3">{c.incomplete}</span> : money(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader
            title={t.linkedCampaigns}
            description={t.linkedCampaignsDescription}
            actions={
              <Link href={`/app/advertising?${keep}` as Route} className="text-sm font-medium text-emerald-700 hover:underline">
                {t.manageLinks}
              </Link>
            }
          />
          {campaigns.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-3">{t.noLinkedCampaign}</p>
            </CardBody>
          ) : (
            <TableContainer className="mt-3">
              <Table>
                <caption className="sr-only">{t.campaignsCaption(product.name)}</caption>
                <THead>
                  <TR>
                    <TH>{t.colCampaign}</TH>
                    <TH numeric>{t.colSpend}</TH>
                    <TH numeric>{t.colPlatformRoas}</TH>
                  </TR>
                </THead>
                <TBody>
                  {campaigns.map((c) => (
                    <TR key={c.campaignId}>
                      <TD>
                        <div className="font-medium text-ink">{c.name}</div>
                        <div className="text-xs text-ink-3">{platformLabel(c.platform as Platform, locale) ?? c.platform}</div>
                      </TD>
                      <TD numeric>{money(c.spend)}</TD>
                      <TD numeric>{f.multiple(c.platformRoas)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader title={t.recentOrders} description={t.recentOrdersDescription} />
          {lines.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-3">{t.notSold}</p>
            </CardBody>
          ) : (
            <TableContainer className="mt-3">
              <Table>
                <caption className="sr-only">{t.linesCaption(product.name)}</caption>
                <THead>
                  <TR>
                    <TH>{t.colOrder}</TH>
                    <TH numeric>{t.colQty}</TH>
                    <TH numeric>{t.colLineNet}</TH>
                    <TH numeric>{t.colUnitCostUsed}</TH>
                  </TR>
                </THead>
                <TBody>
                  {lines.map((l, i) => (
                    <TR key={`${l.orderId}-${i}`}>
                      <TD>
                        <div className="font-medium text-ink">{l.externalId}</div>
                        <div className="text-xs text-ink-3">{f.dateTime(l.orderedAt, store.timezone)}</div>
                      </TD>
                      <TD numeric>{f.count(l.quantity)}</TD>
                      <TD numeric>{money(l.net)}</TD>
                      <TD numeric>
                        {l.unitCostE4 === null ? (
                          <Badge tone="caution">{c.noCost}</Badge>
                        ) : (
                          <span className="inline-flex flex-col items-end">
                            {f.unitCost(l.unitCostE4, store.currency)}
                            <span className="text-xs text-ink-3">{l.costSource === "line" ? t.recordedOnOrder : t.currentProductCost}</span>
                          </span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      </div>

      {details}
    </div>
  );
}
