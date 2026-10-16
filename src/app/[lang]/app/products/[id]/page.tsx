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
import { formatDateTime, formatRange } from "@/lib/dates";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/types";
import { formatCount, formatMultiple, formatPercent } from "@/lib/finance/format";
import { DEFINITIONS } from "@/lib/finance/metrics";
import { formatMoney, formatUnitCost } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Product" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_LABELS: Record<string, string> = { manual: "Added manually", csv: "From an import", demo: "Sample data", shopify: "From Shopify" };

export default function ProductPage({ params, searchParams }: PageProps<"/[lang]/app/products/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px] rounded-lg" />}>
      <ProductDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductDetail({ params, searchParams }: Pick<PageProps<"/[lang]/app/products/[id]">, "params" | "searchParams">) {
  const [{ id }, sp, ws] = await Promise.all([params, searchParams, requireStore()]);
  if (!UUID_RE.test(id)) notFound();
  const product = await getProduct(id);
  if (!product) notFound();
  const store = ws.activeStore;
  const period = reportPeriod(store, ws.entitlements, sp);
  const keep = rangeQuery(period);
  const money = (v: number) => formatMoney(v, store.currency);
  const canWrite = ws.entitlements.canWrite;
  const lineCount = await countProductLines(product.id);

  const header = (
    <PageHeader
      eyebrow={
        <Link href={`/app/products?${keep}` as Route} className="hover:underline">
          Products
        </Link>
      }
      title={
        <span className="flex flex-wrap items-center gap-3">
          {product.name}
          {product.archived ? <Badge tone="neutral">Archived</Badge> : null}
          {product.unitCostE4 === null ? <Badge tone="caution">No cost</Badge> : null}
        </span>
      }
      description={`${product.sku ? `SKU ${product.sku}` : "No SKU"} · ${SOURCE_LABELS[product.source] ?? product.source}`}
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
      <CardHeader title="Details" description="Changing the unit cost updates margins of order lines that do not carry their own cost." as="h2" />
      <CardBody>
        <ProductForm
          key={product.updatedAt}
          productId={product.id}
          currency={store.currency}
          initial={{ name: product.name, sku: product.sku, unitCostE4: product.unitCostE4, priceMinor: product.priceMinor }}
          submitLabel="Save changes"
          disabled={!canWrite}
        />
      </CardBody>
    </Card>
  );

  if (!ws.entitlements.canViewAnalytics) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsPaused what="Product analytics" />
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
          <AnalyticsPaused what="Product analytics" />
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
  );
  const breakdown: { label: string; amount: number | null; sign: "+" | "−" | "="; note?: string; strong?: boolean }[] = [
    { label: "Gross sales", amount: row.grossSales, sign: "+" },
    { label: "Discounts", amount: -row.discounts, sign: "−" },
    { label: "Refunds", amount: -row.refunds, sign: "−", note: "Order refunds split across the order's lines by value." },
    { label: "Net sales", amount: row.netSales, sign: "=", strong: true },
    { label: "Shipping charged", amount: row.shippingCharged, sign: "+", note: "The order's shipping, split by each line's share of the order." },
    { label: "Net revenue", amount: row.netRevenue, sign: "=", strong: true },
    { label: "Cost of goods sold", amount: row.cogs === null ? null : -row.cogs, sign: "−" },
    { label: "Shipping & fulfilment", amount: -row.shippingCosts, sign: "−", note: "Order shipping costs (recorded or estimated), split by line value." },
    { label: "Payment fees", amount: -row.transactionFees, sign: "−", note: "Order payment fees (recorded or estimated), split by line value." },
    { label: "Linked advertising", amount: -row.adSpend, sign: "−", note: "Spend of campaigns linked to this product only." },
    { label: "Contribution margin", amount: row.contributionMargin, sign: "=", strong: true },
  ];

  return (
    <div className="space-y-6">
      {header}

      {row.linesWithoutCost > 0 ? (
        <Alert tone="caution" title="Margin unavailable: some sales have no cost">
          {formatCount(row.linesWithoutCost)} order {row.linesWithoutCost === 1 ? "line" : "lines"} in this period have no unit cost, so the margin is not shown rather than
          overstated. Add a unit cost below, or include costs in your order imports.
        </Alert>
      ) : null}

      <KpiGrid>
        <KpiTile label="Units sold" value={formatCount(row.units)} footnote={`${formatRange(period.range)}`} />
        <KpiTile label="Net revenue" value={money(row.netRevenue)} definition={{ term: DEFINITIONS.netRevenue.term, text: DEFINITIONS.netRevenue.short }} footnote={`Net sales ${money(row.netSales)}`} />
        <KpiTile
          label="Contribution margin"
          value={row.contributionMargin === null ? "—" : money(row.contributionMargin)}
          definition={{ term: DEFINITIONS.contributionMargin.term, text: DEFINITIONS.contributionMargin.short }}
          status={row.contributionMargin === null ? { tone: "caution", label: "Costs incomplete" } : null}
          footnote={row.cogs !== null ? `COGS ${money(row.cogs)}` : null}
        />
        <KpiTile
          label="Contribution margin %"
          value={formatPercent(row.contributionMarginRate)}
          footnote={
            <span className="inline-flex items-center gap-1">
              Unit cost <CostEditor productId={product.id} productName={product.name} unitCostE4={product.unitCostE4} currency={store.currency} disabled={!canWrite} />
            </span>
          }
        />
      </KpiGrid>

      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <BarSeriesChart
          title="Product sales"
          description={`${series.granularity === "day" ? "Daily" : series.granularity === "week" ? "Weekly" : "Monthly"} sales after line discounts, before refunds. Units are in the table view.`}
          series={[{ key: "sales", label: "Product sales", color: CHART.series[0] }]}
          points={series.points}
          granularity={series.granularity}
          valueKind="money"
          currency={store.currency}
          extras={[{ key: "units", label: "Units", kind: "count", values: series.points.map((p) => p.values.units) }]}
        />
        <Card className="min-w-0">
          <CardHeader title="Margin breakdown" description={formatRange(period.range)} />
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">Margin breakdown for {product.name}</caption>
            <tbody>
              {breakdown.map((b) => (
                <tr key={b.label} className={cn("border-t border-line", b.strong && "bg-sunken/45")}>
                  <th scope="row" className={cn("py-2 pl-5 text-left font-normal text-ink", b.strong && "font-medium")}>
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden className="w-3 text-center text-ink-3">
                        {b.sign}
                      </span>
                      {b.label}
                      {b.note ? <TermTip term={b.label}>{b.note}</TermTip> : null}
                    </span>
                  </th>
                  <td className={cn("py-2 pr-5 text-right tabular", b.strong && "font-medium", b.amount !== null && b.amount < 0 && b.strong && "text-negative-700")}>
                    {b.amount === null ? <span className="text-ink-3">Incomplete</span> : money(b.amount)}
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
            title="Linked campaigns"
            description="Only campaigns linked to this product count towards its margin. Link campaigns on the Advertising page."
            actions={
              <Link href={`/app/advertising?${keep}` as Route} className="text-sm font-medium text-emerald-700 hover:underline">
                Manage links
              </Link>
            }
          />
          {campaigns.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-3">No campaign is linked to this product. Store-wide advertising is not split across products.</p>
            </CardBody>
          ) : (
            <TableContainer className="mt-3">
              <Table>
                <caption className="sr-only">Campaigns linked to {product.name}</caption>
                <THead>
                  <TR>
                    <TH>Campaign</TH>
                    <TH numeric>Spend</TH>
                    <TH numeric>Platform ROAS</TH>
                  </TR>
                </THead>
                <TBody>
                  {campaigns.map((c) => (
                    <TR key={c.campaignId}>
                      <TD>
                        <div className="font-medium text-ink">{c.name}</div>
                        <div className="text-xs text-ink-3">{PLATFORM_LABELS[c.platform as Platform] ?? c.platform}</div>
                      </TD>
                      <TD numeric>{money(c.spend)}</TD>
                      <TD numeric>{formatMultiple(c.platformRoas)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Recent orders" description="The cost used for each line: its own recorded cost, else the product's current cost." />
          {lines.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-3">This product has not been sold yet.</p>
            </CardBody>
          ) : (
            <TableContainer className="mt-3">
              <Table>
                <caption className="sr-only">Recent order lines for {product.name}</caption>
                <THead>
                  <TR>
                    <TH>Order</TH>
                    <TH numeric>Qty</TH>
                    <TH numeric>Line net</TH>
                    <TH numeric>Unit cost used</TH>
                  </TR>
                </THead>
                <TBody>
                  {lines.map((l, i) => (
                    <TR key={`${l.orderId}-${i}`}>
                      <TD>
                        <div className="font-medium text-ink">{l.externalId}</div>
                        <div className="text-xs text-ink-3">{formatDateTime(l.orderedAt, store.timezone)}</div>
                      </TD>
                      <TD numeric>{formatCount(l.quantity)}</TD>
                      <TD numeric>{money(l.net)}</TD>
                      <TD numeric>
                        {l.unitCostE4 === null ? (
                          <Badge tone="caution">No cost</Badge>
                        ) : (
                          <span className="inline-flex flex-col items-end">
                            {formatUnitCost(l.unitCostE4, store.currency)}
                            <span className="text-xs text-ink-3">{l.costSource === "line" ? "Recorded on the order" : "Current product cost"}</span>
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
