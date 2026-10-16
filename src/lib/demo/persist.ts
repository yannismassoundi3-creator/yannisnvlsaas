import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dataset } from "@/lib/domain/types";
import type { Database } from "@/lib/supabase/database.types";

type Ctx = { organizationId: string; storeId: string; source: "demo" | "manual" };

const BATCH = 500;

async function insertInBatches<T extends Record<string, unknown>>(
  supabase: SupabaseClient<Database>,
  table: keyof Database["public"]["Tables"],
  rows: T[],
) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + BATCH) as never);
    if (error) throw new Error(`Insert into ${String(table)} failed: ${error.message}`);
  }
}

/**
 * Writes a generated dataset into a store. Identifiers from the generator are
 * replaced with fresh UUIDs, so the same dataset can be created many times.
 */
export async function insertDataset(supabase: SupabaseClient<Database>, ctx: Ctx, ds: Dataset) {
  const base = { organization_id: ctx.organizationId, store_id: ctx.storeId };
  const productIds = new Map(ds.products.map((p) => [p.id, randomUUID()]));
  const orderIds = new Map(ds.orders.map((o) => [o.id, randomUUID()]));
  const campaignIds = new Map(ds.campaigns.map((c) => [c.id, randomUUID()]));

  await insertInBatches(
    supabase,
    "products",
    ds.products.map((p) => ({ ...base, id: productIds.get(p.id)!, sku: p.sku, name: p.name, unit_cost_e4: p.unitCostE4, price_minor: p.priceMinor, source: ctx.source })),
  );
  await insertInBatches(
    supabase,
    "orders",
    ds.orders.map((o) => ({
      ...base,
      id: orderIds.get(o.id)!,
      external_id: o.externalId,
      ordered_at: o.orderedAt,
      shipping_charged_minor: o.shippingChargedMinor,
      shipping_cost_minor: o.shippingCostMinor,
      transaction_fees_minor: o.transactionFeesMinor,
      taxes_minor: o.taxesMinor,
      source: ctx.source,
    })),
  );
  await insertInBatches(
    supabase,
    "order_items",
    ds.orders.flatMap((o) =>
      o.lines.map((l) => ({
        organization_id: ctx.organizationId,
        order_id: orderIds.get(o.id)!,
        position: l.position,
        product_id: l.productId ? (productIds.get(l.productId) ?? null) : null,
        sku: l.sku,
        name: l.name,
        quantity: l.quantity,
        gross_minor: l.grossMinor,
        discount_minor: l.discountMinor,
        unit_cost_e4: l.unitCostE4,
      })),
    ),
  );
  await insertInBatches(
    supabase,
    "refunds",
    ds.refunds.map((r) => ({
      ...base,
      order_id: r.orderId ? (orderIds.get(r.orderId) ?? null) : null,
      refunded_at: r.refundedAt,
      amount_minor: r.amountMinor,
      source: ctx.source,
    })),
  );
  await insertInBatches(
    supabase,
    "ad_campaigns",
    ds.campaigns.map((c) => ({
      ...base,
      id: campaignIds.get(c.id)!,
      platform: c.platform,
      external_id: c.externalId,
      name: c.name,
      product_id: c.productId ? (productIds.get(c.productId) ?? null) : null,
    })),
  );
  await insertInBatches(
    supabase,
    "ad_spend_daily",
    ds.adSpend.map((d) => ({
      ...base,
      campaign_id: campaignIds.get(d.campaignId)!,
      spend_date: d.date,
      spend_minor: d.spendMinor,
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      conversion_value_minor: d.conversionValueMinor,
      source: ctx.source,
    })),
  );
  await insertInBatches(
    supabase,
    "expenses",
    ds.expenses.map((e) => ({
      ...base,
      incurred_on: e.incurredOn,
      category: e.category,
      kind: e.kind,
      amount_minor: e.amountMinor,
      description: e.description,
      source: ctx.source,
    })),
  );
  return { productIds, orderIds, campaignIds };
}
