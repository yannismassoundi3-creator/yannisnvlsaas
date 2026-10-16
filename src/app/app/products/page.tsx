import { ArrowDown, ArrowUp, Download, Lock, Package, Search } from "lucide-react";
import type { Metadata, Route } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { AnalyticsPaused } from "@/components/app/analytics-paused";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { CostEditor } from "@/components/products/cost-editor";
import { AddProductDialog } from "@/components/products/product-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { TermTip } from "@/components/ui/overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { rangeQuery } from "@/lib/analytics/range";
import { requireStore } from "@/lib/auth/workspace";
import { listCatalog, PRODUCT_SORTS, type ProductFilter, type ProductSort } from "@/lib/data/products";
import { getStoreDataStatus, reportPeriod, ReportsPausedError } from "@/lib/data/reports";
import { formatRange } from "@/lib/dates";
import { formatCount, formatPercent } from "@/lib/finance/format";
import { DEFINITIONS } from "@/lib/finance/metrics";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 50;
const FILTER_PARAMS: Record<string, ProductFilter> = { active: "active", "missing-cost": "missing_cost", loss: "loss", archived: "archived", all: "all" };
const FILTER_SLUG: Record<ProductFilter, string> = { active: "active", missing_cost: "missing-cost", loss: "loss", archived: "archived", all: "all" };

export default function ProductsPage({ searchParams }: PageProps<"/app/products">) {
  return (
    <Suspense fallback={<ProductsSkeleton />}>
      <Products searchParams={searchParams} />
    </Suspense>
  );
}

async function Products({ searchParams }: { searchParams: PageProps<"/app/products">["searchParams"] }) {
  const [ws, sp] = await Promise.all([requireStore(), searchParams]);
  const store = ws.activeStore;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const period = reportPeriod(store, ws.entitlements, sp);
  const advanced = ws.entitlements.limits.advancedFilters;

  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  let filter: ProductFilter = FILTER_PARAMS[first(sp.filter) ?? ""] ?? "active";
  if (filter === "loss" && !advanced) filter = "active";
  const sortParam = first(sp.sort) as ProductSort | undefined;
  const sort: ProductSort = sortParam && sortParam in PRODUCT_SORTS ? sortParam : "revenue";
  const dirParam = first(sp.dir);
  const dir: "asc" | "desc" = dirParam === "asc" || dirParam === "desc" ? dirParam : PRODUCT_SORTS[sort].defaultDir;
  const page = Math.max(0, Math.min(100_000, Number.parseInt(first(sp.page) ?? "0", 10) || 0));

  const keep = rangeQuery(period);
  const href = (o: { filter?: ProductFilter; sort?: ProductSort; dir?: "asc" | "desc"; page?: number; q?: string }) => {
    const params = new URLSearchParams(keep);
    const f = o.filter ?? filter;
    if (f !== "active") params.set("filter", FILTER_SLUG[f]);
    const s = o.sort ?? sort;
    if (s !== "revenue") params.set("sort", s);
    const d = o.dir ?? (o.sort ? PRODUCT_SORTS[o.sort].defaultDir : dir);
    if (d !== PRODUCT_SORTS[s].defaultDir) params.set("dir", d);
    const query = o.q ?? q;
    if (query) params.set("q", query);
    if (o.page) params.set("page", String(o.page));
    return `/app/products?${params.toString()}` as Route;
  };

  const header = (
    <PageHeader
      eyebrow={store.name}
      title="Products"
      description={`Profitability per product, ${formatRange(period.range)}.`}
      actions={
        <>
          <DateRangePicker
            pathname="/app/products"
            preserve={Object.fromEntries(Array.from(new URLSearchParams(href({ page: 0 }).split("?")[1]).entries()).filter(([k]) => !["range", "from", "to"].includes(k)))}
            range={period.range}
            preset={period.preset}
            today={period.today}
            historyStart={period.historyStart}
          />
          <AddProductDialog currency={store.currency} defaultOpen={first(sp.new) === "1"} disabled={!ws.entitlements.canWrite} />
          {ws.entitlements.limits.exports ? (
            <Button variant="secondary" asChild>
              <a href={`/api/exports/products?${keep}`}>
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
        <AnalyticsPaused what="Product analytics" />
      </div>
    );
  }

  let catalog, status;
  try {
    [catalog, status] = await Promise.all([
      listCatalog(store, period.range, { search: q, filter, sort, dir, page, pageSize: PAGE_SIZE }),
      getStoreDataStatus(store),
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

  const { rows, total } = catalog;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const money = (v: number) => formatMoney(v, store.currency);
  const tabs: { id: ProductFilter; label: string; count?: number; pro?: boolean }[] = [
    { id: "active", label: "Active" },
    { id: "missing_cost", label: "Missing cost", count: status.productsWithoutCost },
    { id: "loss", label: "Loss-making", pro: !advanced },
    { id: "archived", label: "Archived" },
    { id: "all", label: "All" },
  ];

  const sortHeader = (key: ProductSort, label: React.ReactNode, numeric = true) => {
    const active = sort === key;
    const next: "asc" | "desc" = active ? (dir === "asc" ? "desc" : "asc") : PRODUCT_SORTS[key].defaultDir;
    return (
      <TH numeric={numeric} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
        <Link href={href({ sort: key, dir: next, page: 0 })} className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}>
          {label}
          {active ? dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : null}
          <span className="sr-only">{active ? `, sorted ${dir === "asc" ? "ascending" : "descending"}` : ", sort"}</span>
        </Link>
      </TH>
    );
  };

  return (
    <div className="space-y-5">
      {header}

      {status.productsWithoutCost > 0 && filter !== "missing_cost" ? (
        <Alert
          tone="caution"
          title={`${formatCount(status.productsWithoutCost)} ${status.productsWithoutCost === 1 ? "product has" : "products have"} no unit cost`}
          action={
            <Link href={href({ filter: "missing_cost", page: 0 })} className="text-sm font-medium whitespace-nowrap underline-offset-2 hover:underline">
              Show them
            </Link>
          }
        >
          Their sales count as revenue with no cost, so margins look better than they are. Add costs here, or import them from a product list.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Product filter" className="flex flex-wrap gap-1">
          {tabs.map((t) =>
            t.pro ? (
              <Link key={t.id} href="/app/billing" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-3 hover:bg-hover" title="Advanced filters are part of Pro">
                {t.label}
                <Badge tone="outline">Pro</Badge>
              </Link>
            ) : (
              <Link
                key={t.id}
                href={href({ filter: t.id, page: 0 })}
                aria-current={filter === t.id ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium",
                  filter === t.id ? "bg-navy-800 text-white" : "text-ink-2 hover:bg-hover",
                )}
              >
                {t.label}
                {t.count ? <span className={cn("rounded-sm px-1 text-xs tabular", filter === t.id ? "bg-white/15" : "bg-caution-50 text-caution-800")}>{t.count}</span> : null}
              </Link>
            ),
          )}
        </nav>
        <Form action="/app/products" className="flex w-full items-center gap-2 sm:w-72" role="search">
          {Array.from(new URLSearchParams(href({ page: 0, q: "" }).split("?")[1]).entries())
            .filter(([k]) => k !== "q")
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <Input name="q" type="search" defaultValue={q} placeholder="Search name or SKU" aria-label="Search products by name or SKU" leading={<Search className="size-4" aria-hidden />} className="w-full" />
        </Form>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Package aria-hidden />}
            title={q ? `No products match “${q}”` : filter === "missing_cost" ? "Every product has a cost" : status.products === 0 ? "No products yet" : "No products in this view"}
            description={
              status.products === 0
                ? "Products are created automatically from your order imports. You can also import a product list with costs, or add products one by one."
                : filter === "missing_cost"
                  ? "Margins for this store are complete as far as product costs go."
                  : "Try another filter or search."
            }
            actions={
              status.products === 0 ? (
                <Button asChild>
                  <Link href={"/app/imports/new?kind=products" as Route}>Import products</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <TableContainer>
            <Table>
              <caption className="sr-only">Products with figures for {formatRange(period.range)}</caption>
              <THead>
                <TR>
                  {sortHeader("name", "Product", false)}
                  {sortHeader("cost", "Unit cost")}
                  {sortHeader("units", "Units")}
                  {sortHeader("revenue", "Net revenue")}
                  <TH numeric>
                    <span className="inline-flex items-center gap-1">
                      COGS
                      <TermTip term={DEFINITIONS.cogs.term}>{DEFINITIONS.cogs.short}</TermTip>
                    </span>
                  </TH>
                  {sortHeader("margin", "Contribution margin")}
                  {sortHeader("rate", "Margin %")}
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.productId} className="hover:bg-hover/50">
                    <TD className="max-w-80 py-2.5">
                      <Link href={`/app/products/${r.productId}?${keep}` as Route} className="block truncate font-medium text-ink hover:underline">
                        {r.name}
                      </Link>
                      <span className="flex items-center gap-1.5 text-xs text-ink-3">
                        {r.sku ?? "No SKU"}
                        {r.archived ? <Badge tone="neutral">Archived</Badge> : null}
                      </span>
                    </TD>
                    <TD numeric className="py-2">
                      <CostEditor productId={r.productId} productName={r.name} unitCostE4={r.unitCostE4} currency={store.currency} disabled={!ws.entitlements.canWrite} />
                    </TD>
                    <TD numeric>{formatCount(r.units)}</TD>
                    <TD numeric>{money(r.netRevenue)}</TD>
                    <TD numeric className={r.cogs === null ? "text-ink-3" : undefined}>
                      {r.cogs === null ? <span title={`${r.linesWithoutCost} order lines have no cost`}>Incomplete</span> : money(r.cogs)}
                    </TD>
                    <TD numeric className={cn("font-medium", r.contributionMargin !== null && r.contributionMargin < 0 && "text-negative-700")}>
                      {r.contributionMargin === null ? <span className="font-normal text-ink-3">—</span> : money(r.contributionMargin)}
                    </TD>
                    <TD numeric className={cn(r.contributionMarginRate !== null && r.contributionMarginRate < 0 && "text-negative-700")}>
                      {formatPercent(r.contributionMarginRate)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
        {total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
            <span className="text-ink-3 tabular">
              {formatCount(page * PAGE_SIZE + 1)}–{formatCount(Math.min(total, (page + 1) * PAGE_SIZE))} of {formatCount(total)} products
            </span>
            {pages > 1 ? (
              <nav aria-label="Pagination" className="flex gap-3">
                {page > 0 ? (
                  <Link href={href({ page: page - 1 })} className="font-medium text-emerald-700 hover:underline">
                    Previous
                  </Link>
                ) : null}
                {page + 1 < pages ? (
                  <Link href={href({ page: page + 1 })} className="font-medium text-emerald-700 hover:underline">
                    Next
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        ) : null}
      </Card>

      <p className="max-w-4xl text-xs text-ink-3">
        Contribution margin per product = net revenue − COGS − shipping and payment fees allocated by each line&rsquo;s share of the order − spend of campaigns linked
        to the product. Ad spend of campaigns not linked to a product stays at store level: splitting it across products would be arbitrary. A product with any
        sold line lacking a cost shows no margin instead of an overstated one.
      </p>
    </div>
  );
}

function ProductsSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading products">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-9 w-72 rounded-md" />
      </div>
      <Skeleton className="h-9 w-full max-w-xl rounded-md" />
      <Skeleton className="h-[480px] rounded-lg" />
    </div>
  );
}
