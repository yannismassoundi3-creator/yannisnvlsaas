import { Search, Shirt } from "lucide-react";
import type { Metadata, Route } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AnalyticsPaused } from "@/components/app/analytics-paused";
import { StockItemActions, UndoSaleButton } from "@/components/reseller/item-actions";
import { AddItemButton, QuickActionsProvider, SellButton } from "@/components/reseller/quick-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/config";
import type { Format } from "@/i18n/format";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { resellerMessages } from "@/i18n/messages/reseller";
import { getFormat, getLocale } from "@/i18n/server";
import { requireStore, type Store } from "@/lib/auth/workspace";
import { getSellContext, listItems, type ItemFilter, type ItemRow } from "@/lib/data/reseller";
import { ReportsPausedError } from "@/lib/data/reports";
import { todayIn } from "@/lib/dates";
import { e4ToMinor } from "@/lib/finance/money";
import { isPlatformId, isReseller, platformName } from "@/lib/onboarding/constants";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: resellerMessages[await getLocale()].items.metaTitle };
}

const TABS: ItemFilter[] = ["in_stock", "sold", "all"];
const PAGE_SIZE = 50;

export default function ItemsPage({ searchParams }: PageProps<"/[lang]/app/items">) {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] rounded-lg" />}>
      <Items searchParams={searchParams} />
    </Suspense>
  );
}

async function Items({ searchParams }: { searchParams: PageProps<"/[lang]/app/items">["searchParams"] }) {
  const [ws, sp, locale, f] = await Promise.all([requireStore(), searchParams, getLocale(), getFormat()]);
  const store = ws.activeStore;
  // Stores that import a catalogue use the Products page.
  if (!isReseller(store)) redirect("/app/products");
  const t = resellerMessages[locale].items;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tab: ItemFilter = TABS.find((id) => id === first(sp.tab)) ?? "in_stock";
  const page = Math.max(0, Math.min(100_000, Number.parseInt(first(sp.page) ?? "0", 10) || 0));
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const today = todayIn(store.timezone);
  const canWrite = ws.entitlements.canWrite;

  const header = <PageHeader eyebrow={store.name} title={t.title} description={t.description} />;
  if (!ws.entitlements.canViewAnalytics) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsPaused what={t.title} />
      </div>
    );
  }

  let list, sell;
  try {
    [list, sell] = await Promise.all([listItems(store, { filter: tab, search: q, page, pageSize: PAGE_SIZE }), getSellContext(store)]);
  } catch (error) {
    if (error instanceof ReportsPausedError) {
      return (
        <div className="space-y-6">
          {header}
          <AnalyticsPaused what={t.title} />
        </div>
      );
    }
    throw error;
  }

  const base = `/app/items?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const pages = Math.ceil(list.total / PAGE_SIZE);
  const c = catalogCommon[locale];

  return (
    <QuickActionsProvider currency={store.currency} today={today} stock={sell.stock} defaultChannel={sell.defaultChannel} disabled={!canWrite}>
      <div className="space-y-5">
        <PageHeader
          eyebrow={store.name}
          title={t.title}
          description={t.description}
          actions={
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <AddItemButton size="md" variant="secondary" />
              <SellButton size="md" />
            </div>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label={t.tabsLabel} className="flex gap-1 border-b border-line">
            {TABS.map((id) => (
              <Link
                key={id}
                href={`/app/items?tab=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}` as Route}
                aria-current={id === tab ? "page" : undefined}
                className={cn("-mb-px border-b-2 px-3 py-2.5 text-sm font-medium", id === tab ? "border-emerald-600 text-ink" : "border-transparent text-ink-3 hover:text-ink")}
              >
                {t.tabs[id]}
              </Link>
            ))}
          </nav>
          <Form action="/app/items" className="w-full sm:w-72" role="search">
            <input type="hidden" name="tab" value={tab} />
            <Input name="q" type="search" defaultValue={q} placeholder={t.search} aria-label={t.searchLabel} leading={<Search className="size-4" aria-hidden />} />
          </Form>
        </div>

        <Card>
          {list.rows.length === 0 ? (
            <EmptyState
              icon={<Shirt aria-hidden />}
              title={q ? t.noMatch(q) : tab === "in_stock" ? t.emptyStock : tab === "sold" ? t.emptySold : t.emptyAll}
              description={q ? undefined : t.emptyBody}
            />
          ) : (
            <ul className="divide-y divide-line" aria-label={t.countLabel(list.total)}>
              {list.rows.map((item) => (
                <ItemLine key={item.productId} item={item} store={store} locale={locale} f={f} today={today} canWrite={canWrite} />
              ))}
            </ul>
          )}
          {list.total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
              <span className="text-ink-3 tabular">{t.shown(f.count(page * PAGE_SIZE + 1), f.count(Math.min(list.total, (page + 1) * PAGE_SIZE)), f.count(list.total))}</span>
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
          ) : null}
        </Card>
      </div>
    </QuickActionsProvider>
  );
}

/**
 * One row per item. Items of several pieces show their quantities ("3 in
 * stock", "1 sold · 2 left") and, once sold at least once, their latest sale
 * (its price is the total of that sale, for all its pieces).
 */
function ItemLine({ item, store, locale, f, today, canWrite }: { item: ItemRow; store: Store; locale: Locale; f: Format; today: string; canWrite: boolean }) {
  const t = resellerMessages[locale].items;
  const money = (v: number) => f.money(v, store.currency);
  const cost = item.unitCostE4 === null ? null : e4ToMinor(item.unitCostE4, store.currency);
  const platform = item.salesChannel && isPlatformId(item.salesChannel) ? platformName(item.salesChannel, locale) : null;
  const several = item.quantity > 1;
  const hasSale = item.soldUnits > 0 && item.orderId !== null;
  const status =
    item.remaining === 0 ? (
      <Badge tone="positive">{several ? t.soldAll(item.soldUnits) : t.soldBadge}</Badge>
    ) : item.soldUnits > 0 ? (
      <Badge tone="info">{t.soldRemaining(item.soldUnits, item.remaining)}</Badge>
    ) : (
      <Badge tone="neutral">{several ? t.inStockCount(item.remaining) : t.inStockBadge}</Badge>
    );
  const saleLabel = item.saleQuantity !== null && item.saleQuantity > 1 ? t.salePieces(item.saleQuantity) : several ? t.lastSalePrice : t.salePrice;
  return (
    <li className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-md font-medium break-words text-ink">{item.name}</span>
          {status}
          {item.archived ? <Badge tone="outline">{t.archivedBadge}</Badge> : null}
        </p>
        <p className="mt-0.5 text-xs text-ink-3 tabular">
          {hasSale && item.soldOn
            ? platform
              ? (several ? t.lastSoldOn : t.soldOn)(f.date(item.soldOn), platform)
              : (several ? t.lastSoldOnNoPlatform : t.soldOnNoPlatform)(f.date(item.soldOn))
            : item.acquiredOn
              ? t.bought(f.date(item.acquiredOn))
              : t.added(f.date(item.stockedOn))}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm sm:w-80 sm:shrink-0">
        <div>
          <dt className="text-xs text-ink-3">{several ? t.purchasePriceEach : t.purchasePrice}</dt>
          <dd className="tabular">{cost === null ? <Badge tone="caution">{t.missingCost}</Badge> : money(cost)}</dd>
        </div>
        {hasSale ? (
          <>
            <div>
              <dt className="text-xs text-ink-3">{saleLabel}</dt>
              <dd className="tabular">{item.salePrice === null ? "—" : money(item.salePrice)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">{t.kept}</dt>
              <dd className={cn("font-semibold tabular", item.margin !== null && item.margin < 0 ? "text-negative-700" : "text-ink")} title={item.margin === null && cost !== null ? t.marginHidden : undefined}>
                {item.margin === null ? "—" : money(item.margin)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      <div className="flex flex-wrap items-center justify-end gap-1 sm:w-52 sm:shrink-0">
        {item.remaining > 0 && !item.archived ? <SellButton productId={item.productId} size="md" icon={false} label={t.sell} aria-label={t.sellLabel(item.name)} className="mr-1" /> : null}
        {hasSale ? (
          <Link href={`/app/transactions/orders/${item.orderId}` as Route} className="mr-2 text-sm font-medium text-emerald-700 hover:underline">
            {t.saleDetails}
          </Link>
        ) : null}
        <StockItemActions
          productId={item.productId}
          name={item.name}
          unitCostE4={item.unitCostE4}
          acquiredOn={item.acquiredOn}
          quantity={item.quantity}
          soldUnits={item.soldUnits}
          currency={store.currency}
          today={today}
          disabled={!canWrite}
        />
        {hasSale ? <UndoSaleButton orderId={item.orderId!} name={item.name} /> : null}
      </div>
    </li>
  );
}
