import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The single write path for orders entered in the app (manual orders on the
 * Transactions page and reseller quick sales). Amounts are already validated
 * and excluding tax. Runs with the caller's session, so RLS checks every row.
 */

export type OrderLineToWrite = {
  productId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  gross: number;
  discount: number;
  unitCostE4: number | null;
};

export type OrderToWrite = {
  organizationId: string;
  storeId: string;
  externalId: string;
  orderedAt: string;
  shippingCharged: number;
  taxes: number;
  shippingCost: number | null;
  fees: number | null;
  convertedFromTaxInclusive: boolean;
  salesChannel?: string | null;
  lines: OrderLineToWrite[];
};

export type WriteOrderResult = { ok: true; orderId: string } | { ok: false; reason: "duplicate" | "order" | "lines" };

export async function writeOrder(supabase: SupabaseClient<Database>, order: OrderToWrite): Promise<WriteOrderResult> {
  const { data: created, error } = await supabase
    .from("orders")
    .insert({
      organization_id: order.organizationId,
      store_id: order.storeId,
      external_id: order.externalId,
      ordered_at: order.orderedAt,
      shipping_charged_minor: order.shippingCharged,
      taxes_minor: order.taxes,
      shipping_cost_minor: order.shippingCost,
      transaction_fees_minor: order.fees,
      converted_from_tax_inclusive: order.convertedFromTaxInclusive,
      sales_channel: order.salesChannel ?? null,
      source: "manual",
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, reason: error?.code === "23505" ? "duplicate" : "order" };

  // Lines without a chosen product are matched by SKU or name, creating the product if needed.
  const lines = order.lines.map((l) => ({ ...l }));
  for (const l of lines) {
    if (l.productId) continue;
    const key = (l.sku ? l.sku : `name:${l.name}`).toLowerCase();
    const { data: existing } = await supabase.from("products").select("id").eq("store_id", order.storeId).eq("match_key", key).maybeSingle();
    if (existing) l.productId = existing.id;
    else {
      const { data: product } = await supabase
        .from("products")
        .insert({ organization_id: order.organizationId, store_id: order.storeId, name: l.name, sku: l.sku, source: "manual" })
        .select("id")
        .single();
      l.productId = product?.id ?? null;
    }
  }
  const { error: linesError } = await supabase.from("order_items").insert(
    lines.map((l, i) => ({
      organization_id: order.organizationId,
      order_id: created.id,
      position: i,
      product_id: l.productId,
      name: l.name,
      sku: l.sku,
      quantity: l.quantity,
      gross_minor: l.gross,
      discount_minor: l.discount,
      unit_cost_e4: l.unitCostE4,
    })),
  );
  if (linesError) {
    await supabase.from("orders").delete().eq("id", created.id);
    return { ok: false, reason: "lines" };
  }
  return { ok: true, orderId: created.id };
}
