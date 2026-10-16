import "server-only";
import type { CampaignRow } from "@/lib/analytics/reference";
import { campaignRowFromSql } from "@/lib/analytics/rows";
import type { Store } from "@/lib/auth/workspace";
import type { DateRange } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";
import { ReportsPausedError, ReportUnavailableError } from "./reports";

export type ProductFilter = "active" | "missing_cost" | "loss" | "archived" | "all";
export type ProductSort = "revenue" | "margin" | "rate" | "units" | "name" | "cost";

export const PRODUCT_SORTS: Record<ProductSort, { column: string; label: string; defaultDir: "asc" | "desc" }> = {
  revenue: { column: "net_revenue", label: "Net revenue", defaultDir: "desc" },
  margin: { column: "contribution_margin", label: "Contribution margin", defaultDir: "desc" },
  rate: { column: "contribution_margin_rate", label: "Margin %", defaultDir: "desc" },
  units: { column: "units", label: "Units", defaultDir: "desc" },
  name: { column: "name", label: "Name", defaultDir: "asc" },
  cost: { column: "unit_cost_e4", label: "Unit cost", defaultDir: "desc" },
};

export type CatalogRow = {
  productId: string;
  sku: string | null;
  name: string;
  unitCostE4: number | null;
  priceMinor: number | null;
  archived: boolean;
  source: string;
  units: number;
  grossSales: number;
  discounts: number;
  refunds: number;
  shippingCharged: number;
  netSales: number;
  netRevenue: number;
  cogs: number | null;
  linesWithoutCost: number;
  shippingCosts: number;
  transactionFees: number;
  adSpend: number;
  contributionMargin: number | null;
  contributionMarginRate: number | null;
};

type SqlRow = {
  product_id: string;
  sku: string | null;
  name: string;
  unit_cost_e4: number | null;
  price_minor: number | null;
  archived: boolean;
  source: string;
  units: number;
  gross_sales: number;
  discounts: number;
  refunds: number;
  shipping_charged: number;
  cogs: number | null;
  lines_without_cost: number;
  shipping_costs: number;
  transaction_fees: number;
  ad_spend: number;
  net_sales: number;
  net_revenue: number;
  contribution_margin: number | null;
  contribution_margin_rate: number | null;
};

const n = (v: unknown) => Number(v ?? 0);
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toRow(r: SqlRow): CatalogRow {
  return {
    productId: r.product_id,
    sku: r.sku,
    name: r.name,
    unitCostE4: nn(r.unit_cost_e4),
    priceMinor: nn(r.price_minor),
    archived: Boolean(r.archived),
    source: r.source,
    units: n(r.units),
    grossSales: n(r.gross_sales),
    discounts: n(r.discounts),
    refunds: n(r.refunds),
    shippingCharged: n(r.shipping_charged),
    netSales: n(r.net_sales),
    netRevenue: n(r.net_revenue),
    cogs: nn(r.cogs),
    linesWithoutCost: n(r.lines_without_cost),
    shippingCosts: n(r.shipping_costs),
    transactionFees: n(r.transaction_fees),
    adSpend: n(r.ad_spend),
    contributionMargin: nn(r.contribution_margin),
    contributionMarginRate: nn(r.contribution_margin_rate),
  };
}

function check(error: { code?: string } | null, scope: string) {
  if (!error) return;
  if (error.code === "42501") throw new ReportsPausedError();
  console.error(`[products] ${scope} failed`, { code: error.code });
  throw new ReportUnavailableError();
}

export async function listCatalog(
  store: Pick<Store, "id">,
  range: DateRange,
  opts: { search?: string; filter: ProductFilter; sort: ProductSort; dir: "asc" | "desc"; page: number; pageSize: number },
): Promise<{ rows: CatalogRow[]; total: number }> {
  const supabase = await createClient();
  const sort = PRODUCT_SORTS[opts.sort];
  let query = supabase
    .rpc(
      "report_product_catalog",
      { p_store_id: store.id, p_from: range.from, p_to: range.to, p_search: opts.search?.slice(0, 100) || undefined, p_filter: opts.filter },
      { count: "exact" },
    )
    .order(sort.column, { ascending: opts.dir === "asc", nullsFirst: false });
  if (sort.column !== "name") query = query.order("name", { ascending: true });
  const { data, error, count } = await query.range(opts.page * opts.pageSize, opts.page * opts.pageSize + opts.pageSize - 1);
  check(error, "catalog");
  return { rows: ((data ?? []) as SqlRow[]).map(toRow), total: count ?? 0 };
}

/** Every row of the catalogue for a period (exports). Fetched in pages to respect the API row limit. */
export async function listCatalogAll(store: Pick<Store, "id">, range: DateRange, filter: ProductFilter = "all"): Promise<CatalogRow[]> {
  const supabase = await createClient();
  const out: CatalogRow[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await supabase
      .rpc("report_product_catalog", { p_store_id: store.id, p_from: range.from, p_to: range.to, p_filter: filter })
      .order("net_revenue", { ascending: false })
      .order("name", { ascending: true })
      .range(from, from + 999);
    check(error, "catalog export");
    out.push(...((data ?? []) as SqlRow[]).map(toRow));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function getCatalogRow(store: Pick<Store, "id">, range: DateRange, productId: string): Promise<CatalogRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("report_product_catalog", { p_store_id: store.id, p_from: range.from, p_to: range.to, p_filter: "all" })
    .eq("product_id", productId)
    .maybeSingle();
  check(error, "catalog row");
  return data ? toRow(data as SqlRow) : null;
}

export type ProductRecord = {
  id: string;
  name: string;
  sku: string | null;
  unitCostE4: number | null;
  priceMinor: number | null;
  archived: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export async function getProduct(id: string): Promise<ProductRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, sku, unit_cost_e4, price_minor, archived_at, source, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    sku: data.sku,
    unitCostE4: data.unit_cost_e4,
    priceMinor: data.price_minor,
    archived: data.archived_at !== null,
    source: data.source,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getProductDaily(store: Pick<Store, "id">, productId: string, range: DateRange) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_product_daily", { p_store_id: store.id, p_product_id: productId, p_from: range.from, p_to: range.to });
  check(error, "product daily");
  return (data ?? []).map((r) => ({ day: String(r.day).slice(0, 10), units: n(r.units), sales: n(r.sales) }));
}

/** Campaigns linked to the product, with spend in the period (zero when none). */
export async function getLinkedCampaigns(store: Pick<Store, "id">, productId: string, range: DateRange): Promise<CampaignRow[]> {
  const supabase = await createClient();
  const [linked, perf] = await Promise.all([
    supabase.from("ad_campaigns").select("id, platform, name").eq("product_id", productId).order("name"),
    supabase.rpc("report_campaign_breakdown", { p_store_id: store.id, p_from: range.from, p_to: range.to }).eq("product_id", productId),
  ]);
  check(perf.error, "linked campaigns");
  const byId = new Map((perf.data ?? []).map((r) => [r.campaign_id, campaignRowFromSql(r)]));
  return (linked.data ?? []).map(
    (c) =>
      byId.get(c.id) ?? {
        campaignId: c.id,
        platform: c.platform,
        name: c.name,
        productId,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: 0,
        platformRoas: null,
      },
  );
}

export type ProductLine = {
  orderId: string;
  externalId: string;
  orderedAt: string;
  quantity: number;
  net: number;
  unitCostE4: number | null;
  costSource: "line" | "product" | "missing";
};

export async function getRecentLines(productId: string, currentCostE4: number | null, limit = 15): Promise<ProductLine[]> {
  const supabase = await createClient();
  // Latest orders containing the product; the embedded lines are filtered to it.
  const { data } = await supabase
    .from("orders")
    .select("id, external_id, ordered_at, order_items!inner(quantity, gross_minor, discount_minor, unit_cost_e4, product_id)")
    .eq("order_items.product_id", productId)
    .order("ordered_at", { ascending: false })
    .limit(limit);
  return (data ?? []).flatMap((order) =>
    order.order_items.map((l) => ({
      orderId: order.id,
      externalId: order.external_id,
      orderedAt: order.ordered_at,
      quantity: l.quantity,
      net: l.gross_minor - l.discount_minor,
      unitCostE4: l.unit_cost_e4 ?? currentCostE4,
      costSource: l.unit_cost_e4 !== null ? ("line" as const) : currentCostE4 !== null ? ("product" as const) : ("missing" as const),
    })),
  );
}

export async function countProductLines(productId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", productId);
  return count ?? 0;
}
