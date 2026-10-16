import "server-only";
import type { Store } from "@/lib/auth/workspace";
import { rangeToUtcBounds } from "@/lib/dates";
import type { DateRange, ExpenseCategory, ExpenseKind } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";
import { ReportsPausedError, ReportUnavailableError } from "./reports";

function check(error: { code?: string } | null, scope: string) {
  if (!error) return;
  if (error.code === "42501") throw new ReportsPausedError();
  console.error(`[transactions] ${scope} failed`, { code: error.code });
  throw new ReportUnavailableError();
}

export type OrderListRow = {
  orderId: string;
  externalId: string;
  orderedAt: string;
  lineCount: number;
  units: number;
  net: number;
  shippingCharged: number;
  taxes: number;
  shippingCost: number | null;
  shippingEstimated: boolean;
  fees: number | null;
  feesEstimated: boolean;
  cogs: number;
  linesWithoutCost: number;
  refunds: number;
  source: string;
  convertedFromTaxInclusive: boolean;
};

export async function listOrders(store: Pick<Store, "id">, range: DateRange, opts: { search?: string; page: number; pageSize: number }) {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .rpc("report_order_list", { p_store_id: store.id, p_from: range.from, p_to: range.to, p_search: opts.search || undefined }, { count: "exact" })
    .order("ordered_at", { ascending: false })
    .range(opts.page * opts.pageSize, opts.page * opts.pageSize + opts.pageSize - 1);
  check(error, "orders");
  const rows: OrderListRow[] = (data ?? []).map((r) => ({
    orderId: r.order_id,
    externalId: r.external_id,
    orderedAt: r.ordered_at,
    lineCount: Number(r.line_count),
    units: Number(r.units),
    net: Number(r.net),
    shippingCharged: Number(r.shipping_charged),
    taxes: Number(r.taxes),
    shippingCost: r.shipping_cost === null ? null : Number(r.shipping_cost),
    shippingEstimated: Boolean(r.shipping_estimated),
    fees: r.fees === null ? null : Number(r.fees),
    feesEstimated: Boolean(r.fees_estimated),
    cogs: Number(r.cogs),
    linesWithoutCost: Number(r.lines_without_cost),
    refunds: Number(r.refunds),
    source: r.source,
    convertedFromTaxInclusive: Boolean(r.converted_from_tax_inclusive),
  }));
  return { rows, total: count ?? 0 };
}

export type OrderDetail = {
  id: string;
  externalId: string;
  orderedAt: string;
  shippingChargedMinor: number;
  shippingCostMinor: number | null;
  transactionFeesMinor: number | null;
  taxesMinor: number;
  convertedFromTaxInclusive: boolean;
  note: string | null;
  source: string;
  importJobId: string | null;
  lines: { id: string; position: number; name: string; sku: string | null; quantity: number; grossMinor: number; discountMinor: number; unitCostE4: number | null; productId: string | null; productCostE4: number | null }[];
  refunds: { id: string; refundedAt: string; amountMinor: number; reason: string | null; dateEstimated: boolean; source: string }[];
};

export async function getOrder(id: string): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, external_id, ordered_at, shipping_charged_minor, shipping_cost_minor, transaction_fees_minor, taxes_minor, converted_from_tax_inclusive, note, source, import_job_id, order_items(id, position, name, sku, quantity, gross_minor, discount_minor, unit_cost_e4, product_id, product:products(unit_cost_e4)), refunds(id, refunded_at, amount_minor, reason, date_estimated, source)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    externalId: data.external_id,
    orderedAt: data.ordered_at,
    shippingChargedMinor: data.shipping_charged_minor,
    shippingCostMinor: data.shipping_cost_minor,
    transactionFeesMinor: data.transaction_fees_minor,
    taxesMinor: data.taxes_minor,
    convertedFromTaxInclusive: data.converted_from_tax_inclusive,
    note: data.note,
    source: data.source,
    importJobId: data.import_job_id,
    lines: [...data.order_items]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        position: l.position,
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        grossMinor: l.gross_minor,
        discountMinor: l.discount_minor,
        unitCostE4: l.unit_cost_e4,
        productId: l.product_id,
        productCostE4: (l.product as { unit_cost_e4: number | null } | null)?.unit_cost_e4 ?? null,
      })),
    refunds: data.refunds
      .map((r) => ({ id: r.id, refundedAt: r.refunded_at, amountMinor: r.amount_minor, reason: r.reason, dateEstimated: r.date_estimated, source: r.source }))
      .sort((a, b) => (a.refundedAt < b.refundedAt ? -1 : 1)),
  };
}

export type RefundRow = { id: string; refundedAt: string; amountMinor: number; reason: string | null; dateEstimated: boolean; source: string; orderId: string | null; orderExternalId: string | null };

export async function listRefunds(store: Pick<Store, "id" | "timezone">, range: DateRange, page: number, pageSize: number) {
  const supabase = await createClient();
  const bounds = rangeToUtcBounds(range, store.timezone);
  const { data, error, count } = await supabase
    .from("refunds")
    .select("id, refunded_at, amount_minor, reason, date_estimated, source, order_id, order:orders(external_id)", { count: "exact" })
    .eq("store_id", store.id)
    .gte("refunded_at", bounds.start)
    .lt("refunded_at", bounds.end)
    .order("refunded_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  check(error, "refunds");
  const rows: RefundRow[] = (data ?? []).map((r) => ({
    id: r.id,
    refundedAt: r.refunded_at,
    amountMinor: r.amount_minor,
    reason: r.reason,
    dateEstimated: r.date_estimated,
    source: r.source,
    orderId: r.order_id,
    orderExternalId: (r.order as { external_id: string } | null)?.external_id ?? null,
  }));
  return { rows, total: count ?? 0 };
}

export type ExpenseRow = { id: string; incurredOn: string; category: ExpenseCategory; kind: ExpenseKind; amountMinor: number; description: string | null; source: string };

export async function listExpenses(store: Pick<Store, "id">, range: DateRange, page: number, pageSize: number) {
  const supabase = await createClient();
  const [list, totals] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, incurred_on, category, kind, amount_minor, description, source", { count: "exact" })
      .eq("store_id", store.id)
      .gte("incurred_on", range.from)
      .lte("incurred_on", range.to)
      .order("incurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1),
    supabase.from("expenses").select("kind, amount_minor").eq("store_id", store.id).gte("incurred_on", range.from).lte("incurred_on", range.to).limit(10_000),
  ]);
  check(list.error, "expenses");
  const sums = { variable: 0, fixed: 0 };
  for (const e of totals.data ?? []) sums[e.kind as ExpenseKind] += e.amount_minor;
  const rows: ExpenseRow[] = (list.data ?? []).map((e) => ({
    id: e.id,
    incurredOn: e.incurred_on,
    category: e.category as ExpenseCategory,
    kind: e.kind as ExpenseKind,
    amountMinor: e.amount_minor,
    description: e.description,
    source: e.source,
  }));
  return { rows, total: list.count ?? 0, sums };
}

export async function listProductOptions(store: Pick<Store, "id">) {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, name, sku, price_minor").eq("store_id", store.id).is("archived_at", null).order("name").limit(1000);
  return data ?? [];
}
