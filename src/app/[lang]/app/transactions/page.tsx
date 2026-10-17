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
import { addDays } from "@/lib/dates";
import { expenseCategoryLabel, expenseKindLabel } from "@/lib/domain/types";
import { isReseller } from "@/lib/onboarding/constants";
import { cn } from "@/lib/utils";
import type { Format } from "@/i18n/format";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { transactionsMessages } from "@/i18n/messages/catalog-transactions";
import { shellLayout } from "@/i18n/messages/shell-layout";
import { getFormat, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: transactionsMessages[await getLocale()].metaTitle };
}

type Tab = "orders" | "refunds" | "expenses";
const TABS: Tab[] = ["orders", "refunds", "expenses"];
const PAGE_SIZE = 50;
type Messages = (typeof transactionsMessages)["en"];
type Common = (typeof catalogCommon)["en"];

export default function TransactionsPage({ searchParams }: PageProps<"/[lang]/app/transactions">) {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] rounded-lg" />}>
      <Transactions searchParams={searchParams} />
    </Suspense>
  );
}

async function Transactions({ searchParams }: { searchParams: PageProps<"/[lang]/app/transactions">["searchParams"] }) {
  const [ws, sp, locale, f] = await Promise.all([requireStore(), searchParams, getLocale(), getFormat()]);
  const t = transactionsMessages[locale];
  const store = ws.activeStore;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tab: Tab = TABS.find((id) => id === first(sp.tab)) ?? "orders";
  const period = reportPeriod(store, ws.entitlements, sp);
  const keep = rangeQuery(period);
  const page = Math.max(0, Math.min(100_000, Number.parseInt(first(sp.page) ?? "0", 10) || 0));
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const canWrite = ws.entitlements.canWrite;
  const yesterday = addDays(period.today, -1);

  const header = (
    <PageHeader
      eyebrow={store.name}
      title={isReseller(store) ? shellLayout[locale].nav.salesCosts : t.title}
      description={t.description(f.range(period.range))}
      actions={
        <>
          <DateRangePicker pathname="/app/transactions" preserve={{ tab }} range={period.range} preset={period.preset} today={period.today} historyStart={period.historyStart} />
          {tab === "orders" ? (
            <AddOrderDialog
              currency={store.currency}
              defaultDate={period.today}
              pricesIncludeTax={store.prices_include_tax}
              products={await listProductOptions(store)}
              disabled={!canWrite}
              defaultOpen={first(sp.new) === "1"}
            />
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
    <nav aria-label={t.recordType} className="flex flex-wrap gap-1 border-b border-line">
      {TABS.map((id) => (
        <Link
          key={id}
          href={`/app/transactions?tab=${id}&${keep}` as Route}
          aria-current={id === tab ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            id === tab ? "border-emerald-600 text-ink" : "border-transparent text-ink-3 hover:text-ink",
          )}
        >
          {t.tabs[id]}
        </Link>
      ))}
    </nav>
  );

  if (!ws.entitlements.canViewAnalytics) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsPaused what={t.analytics} />
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

function Pagination({ page, total, base, t, c, f }: { page: number; total: number; base: string; t: Messages; c: Common; f: Format }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
      <span className="text-ink-3 tabular">
        {total === 0 ? t.noRecords : t.shown(f.count(page * PAGE_SIZE + 1), f.count(Math.min(total, (page + 1) * PAGE_SIZE)), f.count(total))}
      </span>
      {pages > 1 ? (
        <nav aria-label={c.pagination} className="flex gap-3">
          {page > 0 ? (
            <Link href={`${base}&page=${page - 1}` as Route} className="font-medium text-emerald-700 hover:underline">
              {c.previous}
            </Link>
          ) : null}
          {page + 1 < pages ? (
            <Link href={`${base}&page=${page + 1}` as Route} className="font-medium text-emerald-700 hover:underline">
              {c.next}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function CostCell({ amount, estimated, currency, t, f }: { amount: number | null; estimated: boolean; currency: string; t: Messages; f: Format }) {
  if (amount === null) return <Badge tone="caution">{t.missing}</Badge>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {estimated ? <Badge tone="info">{t.estimatedShort}</Badge> : null}
      {f.money(amount, currency)}
    </span>
  );
}

async function OrdersTab({ store, period, page, q, keep }: { store: Store; period: ReportPeriod; page: number; q: string; keep: string }) {
  const [{ rows, total }, locale, f] = await Promise.all([listOrders(store, period.range, { search: q, page, pageSize: PAGE_SIZE }), getLocale(), getFormat()]);
  const t = transactionsMessages[locale];
  const c = catalogCommon[locale];
  const money = (v: number) => f.money(v, store.currency);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <p className="text-sm text-ink-3">
          <Badge tone="info">{t.estimatedShort}</Badge> {t.legendEstimated} · <Badge tone="caution">{t.missing}</Badge> {t.legendMissing}
        </p>
        <Form action="/app/transactions" className="w-full sm:w-64" role="search">
          <input type="hidden" name="tab" value="orders" />
          {Array.from(new URLSearchParams(keep).entries()).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Input name="q" type="search" defaultValue={q} placeholder={t.orderNumberPlaceholder} aria-label={t.searchOrders} leading={<Search className="size-4" aria-hidden />} />
        </Form>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt aria-hidden />}
          title={q ? t.noOrderMatch(q) : t.noOrders}
          description={t.noOrdersBody}
          actions={
            <Button asChild>
              <Link href={"/app/imports/new?kind=orders" as Route}>{t.importOrders}</Link>
            </Button>
          }
        />
      ) : (
        <TableContainer className="mt-3">
          <Table>
            <caption className="sr-only">{t.ordersCaption(f.range(period.range))}</caption>
            <THead>
              <TR>
                <TH>{t.colOrder}</TH>
                <TH numeric>{t.colUnits}</TH>
                <TH numeric>{t.colNetSales}</TH>
                <TH numeric>{t.colShippingCharged}</TH>
                <TH numeric>{t.colShippingCost}</TH>
                <TH numeric>{t.colPaymentFees}</TH>
                <TH numeric>{t.colCogs}</TH>
                <TH numeric>{t.colRefunds}</TH>
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
                      {f.dateTime(o.orderedAt, store.timezone)} · {t.sources[o.source] ?? o.source}
                    </div>
                  </TD>
                  <TD numeric>{f.count(o.units)}</TD>
                  <TD numeric>{money(o.net)}</TD>
                  <TD numeric>{money(o.shippingCharged)}</TD>
                  <TD numeric>
                    <CostCell amount={o.shippingCost} estimated={o.shippingEstimated} currency={store.currency} t={t} f={f} />
                  </TD>
                  <TD numeric>
                    <CostCell amount={o.fees} estimated={o.feesEstimated} currency={store.currency} t={t} f={f} />
                  </TD>
                  <TD numeric>{o.linesWithoutCost > 0 ? <Badge tone="caution">{c.incomplete}</Badge> : money(o.cogs)}</TD>
                  <TD numeric className={o.refunds > 0 ? "text-ink" : "text-ink-3"}>
                    {o.refunds > 0 ? money(o.refunds) : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
      <Pagination page={page} total={total} base={`/app/transactions?tab=orders&${keep}${q ? `&q=${encodeURIComponent(q)}` : ""}`} t={t} c={c} f={f} />
    </Card>
  );
}

async function RefundsTab({ store, period, page, keep }: { store: Store; period: ReportPeriod; page: number; keep: string }) {
  const [{ rows, total }, locale, f] = await Promise.all([listRefunds(store, period.range, page, PAGE_SIZE), getLocale(), getFormat()]);
  const t = transactionsMessages[locale];
  const c = catalogCommon[locale];
  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState icon={<Receipt aria-hidden />} title={t.noRefunds} description={t.noRefundsBody} />
      ) : (
        <TableContainer>
          <Table>
            <caption className="sr-only">{t.refundsCaption(f.range(period.range))}</caption>
            <THead>
              <TR>
                <TH>{t.colDate}</TH>
                <TH>{t.colOrder}</TH>
                <TH>{t.colReason}</TH>
                <TH numeric>{t.colAmount}</TH>
                <TH className="w-12">
                  <span className="sr-only">{c.actions}</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">
                    {f.dateTime(r.refundedAt, store.timezone)}
                    {r.dateEstimated ? (
                      <Badge tone="info" className="ml-2" title={t.orderDateTitle}>
                        {t.orderDate}
                      </Badge>
                    ) : null}
                  </TD>
                  <TD>
                    {r.orderId ? (
                      <Link href={`/app/transactions/orders/${r.orderId}` as Route} className="font-medium text-ink hover:underline">
                        {r.orderExternalId}
                      </Link>
                    ) : (
                      <span className="text-ink-3">{t.notLinked}</span>
                    )}
                  </TD>
                  <TD className="max-w-72 truncate text-ink-2">{r.reason ?? "—"}</TD>
                  <TD numeric>{f.money(r.amountMinor, store.currency)}</TD>
                  <TD>
                    <DeleteRowButton kind="refund" id={r.id} label={t.refundOf(f.money(r.amountMinor, store.currency))} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
      <Pagination page={page} total={total} base={`/app/transactions?tab=refunds&${keep}`} t={t} c={c} f={f} />
    </Card>
  );
}

async function ExpensesTab({ store, period, page, keep }: { store: Store; period: ReportPeriod; page: number; keep: string }) {
  const [{ rows, total, sums }, locale, f] = await Promise.all([listExpenses(store, period.range, page, PAGE_SIZE), getLocale(), getFormat()]);
  const t = transactionsMessages[locale];
  const c = catalogCommon[locale];
  const category = (value: Parameters<typeof expenseCategoryLabel>[0]) => expenseCategoryLabel(value, locale) ?? value;
  return (
    <div className="space-y-4">
      <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs sm:grid-cols-2">
        <div className="bg-surface px-5 py-3">
          <dt className="text-sm text-ink-3">{t.variableCosts}</dt>
          <dd className="text-lg font-semibold text-ink tabular">{f.money(sums.variable, store.currency)}</dd>
          <dd className="text-xs text-ink-3">{t.variableCostsNote}</dd>
        </div>
        <div className="bg-surface px-5 py-3">
          <dt className="text-sm text-ink-3">{t.fixedCosts}</dt>
          <dd className="text-lg font-semibold text-ink tabular">{f.money(sums.fixed, store.currency)}</dd>
          <dd className="text-xs text-ink-3">{t.fixedCostsNote}</dd>
        </div>
      </dl>
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Receipt aria-hidden />}
            title={t.noExpenses}
            description={t.noExpensesBody}
            actions={
              <Button variant="secondary" asChild>
                <Link href={"/app/imports/new?kind=expenses" as Route}>{t.importExpenses}</Link>
              </Button>
            }
          />
        ) : (
          <TableContainer>
            <Table>
              <caption className="sr-only">{t.expensesCaption(f.range(period.range))}</caption>
              <THead>
                <TR>
                  <TH>{t.colDate}</TH>
                  <TH>{t.colCategory}</TH>
                  <TH>{t.colDescription}</TH>
                  <TH>{t.colType}</TH>
                  <TH numeric>{t.colAmount}</TH>
                  <TH className="w-12">
                    <span className="sr-only">{c.actions}</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap">{f.date(e.incurredOn)}</TD>
                    <TD className="whitespace-nowrap">{category(e.category)}</TD>
                    <TD className="max-w-80 truncate text-ink-2">{e.description ?? "—"}</TD>
                    <TD>
                      <Badge tone={e.kind === "fixed" ? "neutral" : "outline"}>{expenseKindLabel(e.kind, locale)}</Badge>
                    </TD>
                    <TD numeric>{f.money(e.amountMinor, store.currency)}</TD>
                    <TD>
                      <DeleteRowButton kind="expense" id={e.id} label={t.expenseLabel(category(e.category), f.money(e.amountMinor, store.currency), f.date(e.incurredOn))} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
        <Pagination page={page} total={total} base={`/app/transactions?tab=expenses&${keep}`} t={t} c={c} f={f} />
      </Card>
    </div>
  );
}
