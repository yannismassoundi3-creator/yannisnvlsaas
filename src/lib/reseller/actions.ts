"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { resellerMessages } from "@/i18n/messages/reseller";
import { getRequestLocale } from "@/i18n/request";
import { audit } from "@/lib/audit";
import { requireStore } from "@/lib/auth/workspace";
import { todayIn, zonedTimeToUtc } from "@/lib/dates";
import { BUSINESS_MODELS } from "@/lib/onboarding/constants";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { writeOrder } from "@/lib/transactions/write";
import { itemReference, saleNumber } from "./logic";
import { itemInput, parseItem, parseSale, saleInput, type ItemInput, type SaleInput } from "./schema";

/**
 * Reseller quick actions. Same path as every other write: resolve the store,
 * check the role and entitlements, validate with zod and exact decimal
 * parsing, rate-limit, write through the user's session (RLS), refresh().
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string; fieldErrors?: Record<string, string> };

const uuid = z.string().uuid();

async function writeContext(limitKey: string) {
  const ws = await requireStore();
  const locale = await getRequestLocale();
  const t = resellerMessages[locale];
  const c = catalogCommon[locale];
  if (!ws.entitlements.canWrite) return { ws, locale, t, c, error: c.paused };
  if (!(await consumeRateLimit(`${limitKey}:${ws.user.id}`, 300, 3600))) return { ws, locale, t, c, error: c.rateLimited };
  return { ws, locale, t, c, error: null };
}

/** Inserts an item with a fresh internal reference (several pieces may share a name). */
async function insertItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  storeId: string,
  item: { name: string; unitCostE4: number | null; acquiredOn: string | null },
): Promise<{ ok: true; id: string; name: string; unit_cost_e4: number | null } | { ok: false; code: string | undefined }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from("products")
      .insert({
        organization_id: organizationId,
        store_id: storeId,
        name: item.name,
        sku: itemReference(),
        unit_cost_e4: item.unitCostE4,
        acquired_on: item.acquiredOn,
        source: "manual",
      })
      .select("id, name, unit_cost_e4")
      .single();
    if (data) return { ok: true, ...data };
    if (error?.code !== "23505") return { ok: false, code: error?.code };
  }
  return { ok: false, code: "23505" };
}

/** Adds an item bought for resale: a product with its purchase price as unit cost. */
export async function addItem(input: ItemInput): Promise<Result<{ productId: string }>> {
  const { ws, locale, t, c, error: blocked } = await writeContext("product-write");
  if (blocked) return { ok: false, message: blocked };
  const parsed = itemInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.checkForm };
  const item = parseItem(parsed.data, { locale, today: todayIn(ws.activeStore.timezone) });
  if (!item.ok) return { ok: false, message: c.checkFields, fieldErrors: item.fieldErrors };

  const created = await insertItem(await createClient(), ws.organization.id, ws.activeStore.id, item.value);
  if (!created.ok) return { ok: false, message: created.code === "42501" ? c.paused : t.actions.itemSaveFailed };
  refresh();
  return { ok: true, productId: created.id };
}

/** Edits an item's name, purchase price and purchase date. Its internal reference is kept. */
export async function updateItem(productId: string, input: ItemInput): Promise<Result> {
  const { ws, locale, t, c, error: blocked } = await writeContext("product-write");
  if (blocked) return { ok: false, message: blocked };
  const parsed = itemInput.safeParse(input);
  if (!uuid.safeParse(productId).success || !parsed.success) return { ok: false, message: c.checkForm };
  const item = parseItem(parsed.data, { locale, today: todayIn(ws.activeStore.timezone) });
  if (!item.ok) return { ok: false, message: c.checkFields, fieldErrors: item.fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ name: item.value.name, unit_cost_e4: item.value.unitCostE4, acquired_on: item.value.acquiredOn })
    .eq("id", productId)
    .eq("store_id", ws.activeStore.id)
    .select("id");
  if (error) return { ok: false, message: error.code === "42501" ? c.paused : t.actions.itemSaveFailed };
  if (!data?.length) return { ok: false, message: t.actions.itemNotFound };
  refresh();
  return { ok: true };
}

/**
 * Records a sale in one action: an order (generated number, sale date at noon
 * local time, selling platform, optional shipping cost and platform fee) with
 * one line (quantity 1, the sale price, the item's purchase price as cost
 * snapshot). An item not yet in stock is created first. A stock item can be
 * sold once: resellers sell unique pieces.
 */
export async function sellItem(input: SaleInput): Promise<Result<{ orderId: string; productId: string }>> {
  const { ws, locale, t, c, error: blocked } = await writeContext("order");
  if (blocked) return { ok: false, message: blocked };
  const parsed = saleInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.checkForm };
  const store = ws.activeStore;
  const sale = parseSale(parsed.data, { currency: store.currency, locale, today: todayIn(store.timezone) });
  if (!sale.ok) return { ok: false, message: c.checkFields, fieldErrors: sale.fieldErrors };
  const v = sale.value;
  const supabase = await createClient();

  let product: { id: string; name: string; unit_cost_e4: number | null };
  if (v.productId) {
    const { data } = await supabase.from("products").select("id, name, unit_cost_e4").eq("id", v.productId).eq("store_id", store.id).maybeSingle();
    if (!data) return { ok: false, message: c.checkFields, fieldErrors: { productId: t.sell.itemNotFound } };
    const { count } = await supabase.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", data.id);
    if ((count ?? 0) > 0) return { ok: false, message: c.checkFields, fieldErrors: { productId: t.sell.alreadySold } };
    product = data;
  } else {
    const created = await insertItem(supabase, ws.organization.id, store.id, { ...v.newItem!, acquiredOn: null });
    if (!created.ok) return { ok: false, message: created.code === "42501" ? c.paused : t.actions.itemSaveFailed };
    product = created;
  }

  // Order numbers are unique per store: retry on the (rare) collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const written = await writeOrder(supabase, {
      organizationId: ws.organization.id,
      storeId: store.id,
      externalId: saleNumber(v.date),
      orderedAt: zonedTimeToUtc(v.date, "12:00:00", store.timezone),
      shippingCharged: 0,
      taxes: 0,
      shippingCost: v.shippingCostMinor,
      fees: v.platformFeeMinor,
      convertedFromTaxInclusive: false,
      salesChannel: v.channel,
      lines: [{ productId: product.id, name: product.name, sku: null, quantity: 1, gross: v.priceMinor, discount: 0, unitCostE4: product.unit_cost_e4 }],
    });
    if (written.ok) {
      if (v.inboundEmailId) {
        // The forwarded sale email is now confirmed (RLS: members of this organisation only).
        await supabase
          .from("inbound_emails")
          .update({ status: "confirmed", order_id: written.orderId })
          .eq("id", v.inboundEmailId)
          .eq("store_id", store.id)
          .eq("status", "pending");
      }
      refresh();
      return { ok: true, orderId: written.orderId, productId: product.id };
    }
    if (written.reason !== "duplicate") break;
  }
  return { ok: false, message: t.actions.saleSaveFailed };
}

/** Switches how the store sells (owner or admin). Only the home page, menu and defaults change. */
export async function updateBusinessModel(model: string): Promise<Result> {
  const ws = await requireStore();
  const locale = await getRequestLocale();
  const t = resellerMessages[locale];
  const c = catalogCommon[locale];
  if (!ws.entitlements.canWrite) return { ok: false, message: c.paused };
  if (ws.role === "member") return { ok: false, message: t.settings.forbidden };
  const parsed = z.enum(BUSINESS_MODELS).safeParse(model);
  if (!parsed.success) return { ok: false, message: c.invalidRequest };
  if (ws.activeStore.business_model === parsed.data) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.from("stores").update({ business_model: parsed.data }).eq("id", ws.activeStore.id);
  if (error) return { ok: false, message: error.code === "42501" ? c.paused : t.settings.failed };
  audit("store.updated", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "store", id: ws.activeStore.id }, { business_model: parsed.data });
  refresh();
  return { ok: true };
}
