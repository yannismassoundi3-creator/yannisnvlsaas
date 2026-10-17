import "server-only";
import { cache } from "react";
import type { Store } from "@/lib/auth/workspace";
import type { DateRange } from "@/lib/domain/types";
import { deriveMetrics, type Metrics } from "@/lib/finance/metrics";
import { defaultSalesChannel, staleBefore } from "@/lib/reseller/logic";
import type { PlatformId } from "@/lib/onboarding/constants";
import { createClient } from "@/lib/supabase/server";
import { fetchTotals, ReportsPausedError, ReportUnavailableError } from "./reports";

/**
 * Read models of the reseller mode. Every query runs with the user's session
 * (RLS) and aggregates in SQL: report_daily_totals for the headline figures,
 * reseller_stock_summary / reseller_items for the stock, report_product_catalog
 * for the best sales and report_channel_breakdown per platform.
 */

function check(error: { code?: string } | null, scope: string) {
  if (!error) return;
  if (error.code === "42501") throw new ReportsPausedError();
  console.error(`[reseller] ${scope} failed`, { code: error.code });
  throw new ReportUnavailableError();
}

const n = (v: unknown) => Number(v ?? 0);
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export type ItemStatus = "in_stock" | "sold";
export type ItemFilter = ItemStatus | "all";

export type ItemRow = {
  productId: string;
  name: string;
  unitCostE4: number | null;
  acquiredOn: string | null;
  createdAt: string;
  stockedOn: string;
  archived: boolean;
  status: ItemStatus;
  orderId: string | null;
  orderNumber: string | null;
  soldOn: string | null;
  salesChannel: string | null;
  salePrice: number | null;
  itemCost: number | null;
  shippingCost: number | null;
  fees: number | null;
  /** What the sale left: null when the purchase price is unknown or the order has several items. */
  margin: number | null;
};

type SqlItem = {
  product_id: string;
  name: string;
  unit_cost_e4: number | null;
  acquired_on: string | null;
  created_at: string;
  stocked_on: string;
  archived: boolean;
  status: string;
  order_id: string | null;
  order_external_id: string | null;
  sold_on: string | null;
  sales_channel: string | null;
  sale_price: number | null;
  item_cost: number | null;
  shipping_cost: number | null;
  fees: number | null;
  margin: number | null;
};

function toItem(r: SqlItem): ItemRow {
  return {
    productId: r.product_id,
    name: r.name,
    unitCostE4: nn(r.unit_cost_e4),
    acquiredOn: r.acquired_on,
    createdAt: r.created_at,
    stockedOn: String(r.stocked_on).slice(0, 10),
    archived: Boolean(r.archived),
    status: r.status === "sold" ? "sold" : "in_stock",
    orderId: r.order_id,
    orderNumber: r.order_external_id,
    soldOn: r.sold_on ? String(r.sold_on).slice(0, 10) : null,
    salesChannel: r.sales_channel,
    salePrice: nn(r.sale_price),
    itemCost: nn(r.item_cost),
    shippingCost: nn(r.shipping_cost),
    fees: nn(r.fees),
    margin: nn(r.margin),
  };
}

/** One page of items, most recent first (sold items by sale date). */
export async function listItems(
  store: Pick<Store, "id">,
  opts: { filter: ItemFilter; search?: string; page: number; pageSize: number },
): Promise<{ rows: ItemRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase.rpc(
    "reseller_items",
    { p_store_id: store.id, p_status: opts.filter, p_search: opts.search?.slice(0, 100) || undefined },
    { count: "exact" },
  );
  query = opts.filter === "sold" ? query.order("ordered_at", { ascending: false }) : query.order("created_at", { ascending: false });
  const { data, error, count } = await query.order("product_id").range(opts.page * opts.pageSize, opts.page * opts.pageSize + opts.pageSize - 1);
  check(error, "items");
  return { rows: ((data ?? []) as SqlItem[]).map(toItem), total: count ?? 0 };
}

export type StockOption = { id: string; name: string; unitCostE4: number | null; stockedOn: string };

export type SellContext = {
  /** Items in stock, most recent first (at most 1,000, searched in the browser). */
  stock: StockOption[];
  defaultChannel: PlatformId;
};

/** What the quick dialogs need: the stock to pick from and the preselected platform. */
export const getSellContext = cache(async (store: Store): Promise<SellContext> => {
  const supabase = await createClient();
  const [stock, last] = await Promise.all([
    supabase
      .rpc("reseller_items", { p_store_id: store.id, p_status: "in_stock" })
      .order("created_at", { ascending: false })
      .order("product_id")
      .limit(1000),
    supabase.from("orders").select("sales_channel").eq("store_id", store.id).not("sales_channel", "is", null).order("ordered_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  check(stock.error, "stock options");
  return {
    stock: ((stock.data ?? []) as SqlItem[]).map((r) => ({ id: r.product_id, name: r.name, unitCostE4: nn(r.unit_cost_e4), stockedOn: String(r.stocked_on).slice(0, 10) })),
    defaultChannel: defaultSalesChannel(last.data?.sales_channel, store.platform),
  };
});

export type ChannelRow = {
  channel: string | null;
  orders: number;
  units: number;
  netRevenue: number;
  linesWithoutCost: number;
  margin: number | null;
};

export type BestSale = { productId: string; name: string; netRevenue: number; margin: number };

export type ResellerHomeData = {
  metrics: Metrics;
  previous: Metrics | null;
  stock: { items: number; costMinor: number; itemsWithoutCost: number; staleItems: number };
  stale: ItemRow[];
  best: BestSale[];
  channels: ChannelRow[];
  /** Variable expenses and ad spend of the period: deducted from the total only, never spread over platforms. */
  storeWideExpenses: number;
  hasAnyData: boolean;
};

/** Everything the reseller home needs for one store and period, in one round of parallel queries. */
export const getResellerHome = cache(async (store: Store, range: DateRange, comparison: DateRange | null, today: string): Promise<ResellerHomeData> => {
  const client = await createClient();
  const cutoff = staleBefore(today);
  const [totals, previousTotals, summary, stale, best, channels, unallocated, anyProduct, anyOrder] = await Promise.all([
    fetchTotals(client, store.id, range),
    comparison ? fetchTotals(client, store.id, comparison) : null,
    client.rpc("reseller_stock_summary", { p_store_id: store.id, p_stale_before: cutoff }).maybeSingle(),
    client
      .rpc("reseller_items", { p_store_id: store.id, p_status: "in_stock" })
      .lt("stocked_on", cutoff)
      .order("stocked_on", { ascending: true })
      .order("product_id")
      .limit(5),
    client
      .rpc("report_product_catalog", { p_store_id: store.id, p_from: range.from, p_to: range.to, p_filter: "all" })
      .gt("units", 0)
      .not("contribution_margin", "is", null)
      .order("contribution_margin", { ascending: false })
      .order("name")
      .limit(5),
    client.rpc("report_channel_breakdown", { p_store_id: store.id, p_from: range.from, p_to: range.to }),
    client.rpc("report_unallocated", { p_store_id: store.id, p_from: range.from, p_to: range.to }).maybeSingle(),
    client.from("products").select("id", { count: "exact", head: true }).eq("store_id", store.id),
    client.from("orders").select("id", { count: "exact", head: true }).eq("store_id", store.id),
  ]);
  check(summary.error, "stock summary");
  check(stale.error, "stale items");
  check(best.error, "best sales");
  check(channels.error, "channels");
  check(unallocated.error, "store-wide amounts");
  check(anyProduct.error, "product count");
  check(anyOrder.error, "order count");
  const metrics = deriveMetrics(totals);
  const s = summary.data as { items: number; cost_minor: number; items_without_cost: number; stale_items: number } | null;
  return {
    metrics,
    previous: previousTotals ? deriveMetrics(previousTotals) : null,
    stock: { items: n(s?.items), costMinor: n(s?.cost_minor), itemsWithoutCost: n(s?.items_without_cost), staleItems: n(s?.stale_items) },
    stale: ((stale.data ?? []) as SqlItem[]).map(toItem),
    best: (best.data ?? []).map((r) => ({ productId: r.product_id, name: r.name, netRevenue: n(r.net_revenue), margin: n(r.contribution_margin) })),
    channels: (channels.data ?? []).map((r) => ({
      channel: r.sales_channel,
      orders: n(r.orders),
      units: n(r.units),
      netRevenue: n(r.net_revenue),
      linesWithoutCost: n(r.lines_without_cost),
      margin: nn(r.margin),
    })),
    storeWideExpenses: metrics.adSpend + n(unallocated.data?.variable_expenses),
    hasAnyData: (anyProduct.count ?? 0) > 0 || (anyOrder.count ?? 0) > 0,
  };
});
