import { Receipt, Search } from "lucide-react";
import type { Metadata, Route } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { AnalyticsPaused } from "@/components/app/analytics-paused";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { AddExpenseDialog, AddOrderDialog, AddRefundDialog, DeleteRowButton } from "@/components/transactions/transaction-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { rangeQuery } from "@/lib/analytics/range";
import { requireStore, type Store } from "@/lib/auth/workspace";
import { reportPeriod, type ReportPeriod } from "@/lib/data/reports";
import { listExpenses, listOrders, listProductOptions, listRefunds } from "@/lib/data/transactions";
import { addDays, formatDate, formatDateTime, formatRange } from "@/lib/dates";
import { EXPENSE_CATEGORIES } from "@/lib/domain/types";
import { formatCount } from "@/lib/finance/format";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Transactions & costs" };

type Tab = "orders" | "refunds" | "expenses";
const TABS: { id: Tab; label: string }[] = [
  { id: "orders", label: "Orders" },
  { id: "refunds", label: "Refunds" },
  { id: "expenses", label: "Expenses" },
];
const PAGE_SIZE = 50;
const SOURCE: Record<string, string> = { csv: "Import", manual: "Manual", demo: "Sample", shopify: "Shopify" };

export default function TransactionsPage({ searchParams }: PageProps<"/[lang]/app/transactions">) {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] rounded-lg" />}>
      <Transactions searchParams={searchParams} />
    </Suspense>
  );
}

async function Transactions({ searchParams }: { searchParams: PageProps<"/[lang]/app/transactions">["searchParams"] }) {
  const [ws, sp] = await Promise.all([requireStore(), searchParams]);
  const store = ws.activeStore;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tab: Tab = TABS.find((t) => t.id === first(sp.tab))?.id ?? "orders";
  const period = reportPeriod(store, ws.entitlements, sp);
  const keep = rangeQuery(period);
  const page = Math.max(0, Math.min(100_000, Number.parseInt(first(sp.page) ?? "0", 10) || 0));
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const canWrite = ws.entitlements.canWrite;
  const yesterday = addDays(period.today, -1);

  const header = (
    <PageHeader
      eyebrow={store.name}
      title="Transactions & costs"
      description={`Orders, refunds and expenses recorded for ${formatRange(period.range)}. Amounts exclude tax.`}
      actions={
        <>
          <DateRangePicker pathname="/app/transactions" preserve={{ tab }} range={period.range} preset={period.preset} today={period.today} historyStart={period.historyStart} />
          {tab === "orders" ? (
            <AddOrderDialog currency={store.currency} defaultDate={period.today} pricesIncludeTax={store.prices_include_tax} products={await listProductOptions(store)} disabled={!canWrite} />
          ) : tab === "refunds" ? (
            <AddRefundDialog currency={store.currency} defaultDate={period.today} disabled={!canWrite} />
          ) : (
            <AddExpenseDialog currency={store.currency} defaultDate={yesterday} disabled={!canWrite} />
          )}
        </>
      }
    />
  );

  const tabs = (
    <nav aria-label="Record type" className="flex flex-wrap gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={`/app/transactions?tab=${t.id}&${keep}` as Route}
          aria-current={t.id === tab ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            t.id === tab ? "border-emerald-600 text-ink" : "border-transparent text-ink-3 hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );

  if (!ws.entitlements.canViewAnalytics) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsPaused what="Transaction views" />
      </div>
    );
  }

  const content =
    tab === "orders" ? (
      <OrdersTab store={store} period={period} page={page} q={q} keep={keep} />
    ) : tab === "refunds" ? (
      <RefundsTab store={store} period={period} page={page} keep={keep} />
    ) : (
      <ExpensesTab store={store} period={period} page={page} keep={keep} />
    );

  return (
    <div className="space-y-5">
      {header}
      {tabs}
      {content}
    </div>
  );
}

function Pagination({ page, total, base }: { page: number; total: number; base: string }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
      <span className="text-ink-3 tabular">
        {total === 0 ? "No records" : `${formatCount(page * PAGE_SIZE + 1)}–${formatCount(Math.min(total, (page + 1) * PAGE_SIZE))} of ${formatCount(total)}`}
      </span>
      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex gap-3">
          {page > 0 ? (
            <Link href={`${base}&page=${page - 1}` as Route} className="font-medium text-emerald-700 hover:underline">
              Previous
            </Link>
          ) : null}
          {page + 1 < pages ? (
            <Link href={`${base}&page=${page + 1}` as Route} className="font-medium text-emerald-700 hover:underline">
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function CostCell({ amount, estimated, currency }: { amount: number | null; estimated: boolean; currency: string }) {
  if (amount === null) return <Badge tone="caution">Missing</Badge>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {estimated ? <Badge tone="info">Est.</Badge> : null}
      {formatMoney(amount, currency)}
    </span>
  );
}

async function OrdersTab({ store, period, page, q, keep }: { store: Store; period: ReportPeriod; page: number; q: string; keep: string }) {
  const { rows, total } = await listOrders(store, period.range, { search: q, page, pageSize: PAGE_SIZE });
  const money = (v: number) => formatMoney(v, store.currency);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <p className="text-sm text-ink-3">
          <Badge tone="info">Est.</Badge> estimated from your rules · <Badge tone="caution">Missing</Badge> no value and no rule
        </p>
        <Form action="/app/transactions" className="w-full sm:w-64" role="search">
          <input type="hidden" name="tab" value="orders" />
          {Array.from(new URLSearchParams(keep).entries()).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Input name="q" type="search" defaultValue={q} placeholder="Order number" aria-label="Search orders by number" leading={<Search className="size-4" aria-hidden />} />
        </Form>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt aria-hidden />}
          title={q ? `No order matches “${q}”` : "No orders in this period"}
          description="Orders come from imports or manual entry, and count on the day they were placed in your store's time zone."
          actions={
            <Button asChild>
              <Link href={"/app/imports/new?kind=orders" as Route}>Import orders</Link>
            </Button>
          }
        />
      ) : (
        <TableContainer className="mt-3">
          <Table>
            <caption className="sr-only">Orders, {formatRange(period.range)}</caption>
            <THead>
              <TR>
                <TH>Order</TH>
                <TH numeric>Units</TH>
                <TH numeric>Net sales</TH>
                <TH numeric>Shipping charged</TH>
                <TH numeric>Shipping cost</TH>
                <TH numeric>Payment fees</TH>
                <TH numeric>COGS</TH>
                <TH numeric>Refunds</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((o) => (
                <TR key={o.orderId} className="hover:bg-hover/50">
                  <TD className="whitespace-nowrap">
                    <Link href={`/app/transactions/orders/${o.orderId}` as Route} className="font-medium text-ink hover:underline">
                      {o.externalId}
                    </Link>
                    <div className="text-xs text-ink-3">
                      {formatDateTime(o.orderedAt, store.timezone)} · {SOURCE[o.source] ?? o.source}
                    </div>
                  </TD>
                  <TD numeric>{formatCount(o.units)}</TD>
                  <TD numeric>{money(o.net)}</TD>
                  <TD numeric>{money(o.shippingCharged)}</TD>
                  <TD numeric>
                    <CostCell amount={o.shippingCost} estimated={o.shippingEstimated} currency={store.currency} />
                  </TD>
                  <TD numeric>
                    <CostCell amount={o.fees} estimated={o.feesEstimated} currency={store.currency} />
                  </TD>
                  <TD numeric>{o.linesWithoutCost > 0 ? <Badge tone="caution">Incomplete</Badge> : money(o.cogs)}</TD>
                  <TD numeric className={o.refunds > 0 ? "text-ink" : "text-ink-3"}>
                    {o.refunds > 0 ? money(o.refunds) : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
      <Pagination page={page} total={total} base={`/app/transactions?tab=orders&${keep}${q ? `&q=${encodeURIComponent(q)}` : ""}`} />
    </Card>
  );
}

async function RefundsTab({ store, period, page, keep }: { store: Store; period: ReportPeriod; page: number; keep: string }) {
  const { rows, total } = await listRefunds(store, period.range, page, PAGE_SIZE);
  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState icon={<Receipt aria-hidden />} title="No refunds in this period" description="Refunds come from the refunded amount in order imports, or can be added by hand." />
      ) : (
        <TableContainer>
          <Table>
            <caption className="sr-only">Refunds, {formatRange(period.range)}</caption>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Order</TH>
                <TH>Reason</TH>
                <TH numeric>Amount</TH>
                <TH className="w-12">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">
                    {formatDateTime(r.refundedAt, store.timezone)}
                    {r.dateEstimated ? (
                      <Badge tone="info" className="ml-2" title="No refund date was available, so the order date is used">
                        Order date
                      </Badge>
                    ) : null}
                  </TD>
                  <TD>
                    {r.orderId ? (
                      <Link href={`/app/transactions/orders/${r.orderId}` as Route} className="font-medium text-ink hover:underline">
                        {r.orderExternalId}
                      </Link>
                    ) : (
                      <span className="text-ink-3">Not linked</span>
                    )}
                  </TD>
                  <TD className="max-w-72 truncate text-ink-2">{r.reason ?? "—"}</TD>
                  <TD numeric>{formatMoney(r.amountMinor, store.currency)}</TD>
                  <TD>
                    <DeleteRowButton kind="refund" id={r.id} label={`Refund of ${formatMoney(r.amountMinor, store.currency)}`} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
      <Pagination page={page} total={total} base={`/app/transactions?tab=refunds&${keep}`} />
    </Card>
  );
}

async function ExpensesTab({ store, period, page, keep }: { store: Store; period: ReportPeriod; page: number; keep: string }) {
  const { rows, total, sums } = await listExpenses(store, period.range, page, PAGE_SIZE);
  return (
    <div className="space-y-4">
      <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs sm:grid-cols-2">
        <div className="bg-surface px-5 py-3">
          <dt className="text-sm text-ink-3">Variable costs</dt>
          <dd className="text-lg font-semibold text-ink tabular">{formatMoney(sums.variable, store.currency)}</dd>
          <dd className="text-xs text-ink-3">Reduce contribution margin</dd>
        </div>
        <div className="bg-surface px-5 py-3">
          <dt className="text-sm text-ink-3">Fixed costs</dt>
          <dd className="text-lg font-semibold text-ink tabular">{formatMoney(sums.fixed, store.currency)}</dd>
          <dd className="text-xs text-ink-3">Reduce the operating profit estimate only</dd>
        </div>
      </dl>
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Receipt aria-hidden />}
            title="No expenses in this period"
            description="Record packaging, marketplace commissions, software or rent to complete your margins."
            actions={
              <Button variant="secondary" asChild>
                <Link href={"/app/imports/new?kind=expenses" as Route}>Import expenses</Link>
              </Button>
            }
          />
        ) : (
          <TableContainer>
            <Table>
              <caption className="sr-only">Expenses, {formatRange(period.range)}</caption>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Category</TH>
                  <TH>Description</TH>
                  <TH>Type</TH>
                  <TH numeric>Amount</TH>
                  <TH className="w-12">
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap">{formatDate(e.incurredOn)}</TD>
                    <TD className="whitespace-nowrap">{EXPENSE_CATEGORIES[e.category]?.label ?? e.category}</TD>
                    <TD className="max-w-80 truncate text-ink-2">{e.description ?? "—"}</TD>
                    <TD>
                      <Badge tone={e.kind === "fixed" ? "neutral" : "outline"}>{e.kind === "fixed" ? "Fixed" : "Variable"}</Badge>
                    </TD>
                    <TD numeric>{formatMoney(e.amountMinor, store.currency)}</TD>
                    <TD>
                      <DeleteRowButton kind="expense" id={e.id} label={`${EXPENSE_CATEGORIES[e.category]?.label ?? e.category}, ${formatMoney(e.amountMinor, store.currency)} on ${formatDate(e.incurredOn)}`} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
        <Pagination page={page} total={total} base={`/app/transactions?tab=expenses&${keep}`} />
      </Card>
    </div>
  );
}
