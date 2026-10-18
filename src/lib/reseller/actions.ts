"use server";

import { refresh } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { resellerMessages } from "@/i18n/messages/reseller";
import { getRequestLocale } from "@/i18n/request";
import { audit } from "@/lib/audit";
import { requireStore } from "@/lib/auth/workspace";
import { todayIn, zonedTimeToUtc } from "@/lib/dates";
import { BUSINESS_MODELS } from "@/lib/onboarding/constants";
import { isMissingObject } from "@/lib/listing/quota";
import { sniffImage } from "@/lib/listing/schema";
import { ITEM_PHOTOS_BUCKET, MAX_THUMBNAIL_BYTES, removePhotoPaths } from "@/lib/photos/storage";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { writeOrder } from "@/lib/transactions/write";
import { itemReference, remainingPieces, saleNumber } from "./logic";
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

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * PostgREST codes meaning the database does not have the quantities migration
 * yet (the code can be deployed a few minutes before the SQL is run): unknown
 * column in a write (PGRST204) or a read (42703), unknown function (PGRST202,
 * 42883). Single pieces keep working through the previous path meanwhile.
 */
const MISSING_COLUMN = new Set(["PGRST204", "42703"]);
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);

/** stock_quantity to store: null for a single piece (the meaning of null), so single items never need the new column. */
const storedQuantity = (quantity: number) => (quantity > 1 ? quantity : null);

/** Inserts an item with a fresh internal reference (several pieces may share a name). */
async function insertItem(
  supabase: Supabase,
  organizationId: string,
  storeId: string,
  item: { name: string; unitCostE4: number | null; acquiredOn: string | null; quantity: number },
): Promise<{ ok: true; id: string; name: string; unit_cost_e4: number | null } | { ok: false; code: string | undefined }> {
  const quantity = storedQuantity(item.quantity);
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
        ...(quantity === null ? {} : { stock_quantity: quantity }),
      })
      .select("id, name, unit_cost_e4")
      .single();
    if (data) return { ok: true, ...data };
    if (error?.code !== "23505") return { ok: false, code: error?.code };
  }
  return { ok: false, code: "23505" };
}

function itemWriteError(code: string | undefined, t: (typeof resellerMessages)["en"], c: (typeof catalogCommon)["en"]) {
  if (code === "42501") return c.paused;
  if (code && MISSING_COLUMN.has(code)) return t.actions.quantityUnavailable;
  return t.actions.itemSaveFailed;
}

/**
 * Adds an item bought for resale: a product with its purchase price as unit
 * cost and, for several identical pieces, their number (a lot price is
 * divided by it, exactly, in parseItem).
 */
export async function addItem(input: ItemInput): Promise<Result<{ productId: string }>> {
  const { ws, locale, t, c, error: blocked } = await writeContext("product-write");
  if (blocked) return { ok: false, message: blocked };
  const parsed = itemInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.checkForm };
  const item = parseItem(parsed.data, { locale, today: todayIn(ws.activeStore.timezone) });
  if (!item.ok) return { ok: false, message: c.checkFields, fieldErrors: item.fieldErrors };

  const created = await insertItem(await createClient(), ws.organization.id, ws.activeStore.id, item.value);
  if (!created.ok) return { ok: false, message: itemWriteError(created.code, t, c) };
  refresh();
  return { ok: true, productId: created.id };
}

/**
 * Edits an item's name, purchase price, purchase date and number of pieces.
 * Its internal reference is kept. The quantity may not go below the pieces
 * already sold: checked here for a clear message, and enforced by the
 * products_stock_quantity_guard trigger, which serialises with sales on the
 * item's row lock.
 */
export async function updateItem(productId: string, input: ItemInput): Promise<Result> {
  const { ws, locale, t, c, error: blocked } = await writeContext("product-write");
  if (blocked) return { ok: false, message: blocked };
  const parsed = itemInput.safeParse(input);
  if (!uuid.safeParse(productId).success || !parsed.success) return { ok: false, message: c.checkForm };
  const item = parseItem(parsed.data, { locale, today: todayIn(ws.activeStore.timezone) });
  if (!item.ok) return { ok: false, message: c.checkFields, fieldErrors: item.fieldErrors };
  const supabase = await createClient();
  // "*" so the read also works before the quantities migration (no stock_quantity column yet).
  const { data: current } = await supabase.from("products").select("*").eq("id", productId).eq("store_id", ws.activeStore.id).maybeSingle();
  if (!current) return { ok: false, message: t.actions.itemNotFound };
  const hasQuantity = "stock_quantity" in current;
  const quantityChanged = item.value.quantity !== ((hasQuantity ? current.stock_quantity : null) ?? 1);
  if (quantityChanged) {
    if (!hasQuantity) return { ok: false, message: t.actions.quantityUnavailable };
    const sold = await soldUnits(supabase, productId);
    if (item.value.quantity < sold) return { ok: false, message: c.checkFields, fieldErrors: { quantity: t.items.quantityBelowSold(sold) } };
  }
  const { data, error } = await supabase
    .from("products")
    .update({
      name: item.value.name,
      unit_cost_e4: item.value.unitCostE4,
      acquired_on: item.value.acquiredOn,
      ...(quantityChanged ? { stock_quantity: storedQuantity(item.value.quantity) } : {}),
    })
    .eq("id", productId)
    .eq("store_id", ws.activeStore.id)
    .select("id");
  if (error?.code === "23514" && error.message.includes("stock_quantity_below_sold")) {
    // A sale was recorded in the meantime.
    const sold = Number(error.details) || (await soldUnits(supabase, productId));
    return { ok: false, message: c.checkFields, fieldErrors: { quantity: t.items.quantityBelowSold(sold) } };
  }
  if (error) return { ok: false, message: itemWriteError(error.code, t, c) };
  if (!data?.length) return { ok: false, message: t.actions.itemNotFound };
  refresh();
  return { ok: true };
}

/** Pieces of an item already sold (sum of its order line quantities). */
async function soldUnits(supabase: Supabase, productId: string): Promise<number> {
  const { data } = await supabase.from("order_items").select("quantity").eq("product_id", productId).limit(10_000);
  return (data ?? []).reduce((sum, l) => sum + Number(l.quantity ?? 0), 0);
}

/**
 * Records a sale in one action: an order (generated number, sale date at noon
 * local time, selling platform, optional shipping cost and platform fee) with
 * one line (the pieces sold, the total received for them, the item's
 * purchase price as unit cost snapshot). An item not yet in stock is created
 * first, with as many pieces as are sold.
 *
 * The write goes through public.reseller_record_sale, which locks the item
 * row, checks the remaining pieces and writes the order and its line in one
 * transaction: two quick sales of the last piece cannot both succeed. Until
 * that function exists in the database (code deployed before the migration),
 * single-piece sales use the previous path: the item must have no order line
 * yet, checked just before the write (a narrow race, as before).
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

  const fail = (message: string, field?: string) => (field ? { ok: false as const, message: c.checkFields, fieldErrors: { [field]: message } } : { ok: false as const, message });
  const notEnough = (remaining: number) => (remaining <= 0 ? fail(t.sell.alreadySold, "productId") : fail(t.sell.notEnough(remaining), "quantity"));

  let product: { id: string; name: string; unit_cost_e4: number | null };
  if (v.productId) {
    // "*" so the read also works before the quantities migration (no stock_quantity column yet).
    const { data } = await supabase.from("products").select("*").eq("id", v.productId).eq("store_id", store.id).maybeSingle();
    if (!data) return fail(t.sell.itemNotFound, "productId");
    // Early, friendly check; the database checks again under a row lock.
    const remaining = remainingPieces("stock_quantity" in data ? data.stock_quantity : null, await soldUnits(supabase, data.id));
    if (v.quantity > remaining) return notEnough(remaining);
    product = data;
  } else {
    const created = await insertItem(supabase, ws.organization.id, store.id, { ...v.newItem!, acquiredOn: null, quantity: v.quantity });
    if (!created.ok) return { ok: false, message: itemWriteError(created.code, t, c) };
    product = created;
  }

  const done = async (orderId: string) => {
    if (v.inboundEmailId) {
      // The forwarded sale email is now confirmed (RLS: members of this organisation only).
      await supabase
        .from("inbound_emails")
        .update({ status: "confirmed", order_id: orderId })
        .eq("id", v.inboundEmailId)
        .eq("store_id", store.id)
        .eq("status", "pending");
    }
    refresh();
    return { ok: true as const, orderId, productId: product.id };
  };

  // Order numbers are unique per store: retry on the (rare) collision.
  let legacy = false;
  for (let attempt = 0; attempt < 3 && !legacy; attempt++) {
    const { data: orderId, error } = await supabase.rpc("reseller_record_sale", {
      p_store_id: store.id,
      p_product_id: product.id,
      p_quantity: v.quantity,
      p_external_id: saleNumber(v.date),
      p_ordered_at: zonedTimeToUtc(v.date, "12:00:00", store.timezone),
      p_gross_minor: v.priceMinor,
      p_shipping_cost_minor: v.shippingCostMinor ?? undefined,
      p_fees_minor: v.platformFeeMinor ?? undefined,
      p_sales_channel: v.channel,
    });
    if (!error && orderId) return done(orderId);
    if (error?.code === "23505") continue;
    if (error && MISSING_FUNCTION.has(error.code)) {
      legacy = true;
      break;
    }
    if (error?.message === "insufficient_stock") return notEnough(Number(error.details) || 0);
    if (error?.message === "item_not_found") return fail(t.sell.itemNotFound, "productId");
    if (error?.code === "42501") return fail(c.paused);
    return fail(t.actions.saleSaveFailed);
  }
  if (!legacy) return fail(t.actions.saleSaveFailed);

  // Previous path (database without the quantities migration): one piece per item.
  if (v.quantity > 1) return fail(t.actions.quantityUnavailable);
  if (v.productId) {
    const { count } = await supabase.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", product.id);
    if ((count ?? 0) > 0) return fail(t.sell.alreadySold, "productId");
  }
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
    if (written.ok) return done(written.orderId);
    if (written.reason !== "duplicate") break;
  }
  return fail(t.actions.saleSaveFailed);
}

/**
 * Stores the thumbnail of an item (a 480 px square JPEG made in the browser
 * from the first enhanced photo) and replaces the previous one. The file goes
 * to the private item-photos bucket with the user's session, so the storage
 * policies apply (members of the organisation, active trial or subscription,
 * an existing item of the organisation in the path).
 *
 * "unavailable" means the photos migration is not in the database yet: the
 * item stays saved without a thumbnail and the interface says nothing.
 */
export async function attachItemPhoto(productId: string, form: FormData): Promise<{ ok: true } | { ok: false; code: "unavailable" | "invalid" | "failed" | "paused" | "rate_limited" }> {
  const ws = await requireStore();
  if (!ws.entitlements.canWrite) return { ok: false, code: "paused" };
  if (!uuid.safeParse(productId).success) return { ok: false, code: "invalid" };
  const file = form.get("photo");
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_THUMBNAIL_BYTES) return { ok: false, code: "invalid" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (type !== "image/jpeg" && type !== "image/webp") return { ok: false, code: "invalid" };
  if (!(await consumeRateLimit(`product-write:${ws.user.id}`, 300, 3600))) return { ok: false, code: "rate_limited" };

  const supabase = await createClient();
  const { data: item, error: readError } = await supabase.from("products").select("id, photo_path").eq("id", productId).eq("store_id", ws.activeStore.id).maybeSingle();
  if (readError) return { ok: false, code: isMissingObject(readError.code) ? "unavailable" : "failed" };
  if (!item) return { ok: false, code: "invalid" };

  const path = `${ws.organization.id}/${productId}/${randomUUID()}.${type === "image/webp" ? "webp" : "jpg"}`;
  const { error: uploadError } = await supabase.storage.from(ITEM_PHOTOS_BUCKET).upload(path, bytes, { contentType: type, upsert: false, cacheControl: "3600" });
  if (uploadError) {
    const status = Number((uploadError as { statusCode?: string | number; status?: number }).statusCode ?? (uploadError as { status?: number }).status ?? 0);
    console.error("[photos] upload failed", { status });
    // 404: no bucket yet (migration not applied); 403: storage policies refused (e.g. access ended).
    return { ok: false, code: status === 404 ? "unavailable" : status === 403 ? "paused" : "failed" };
  }
  const { error: updateError } = await supabase.from("products").update({ photo_path: path }).eq("id", productId).eq("store_id", ws.activeStore.id);
  if (updateError) {
    await removePhotoPaths(supabase, [path]);
    return { ok: false, code: isMissingObject(updateError.code) ? "unavailable" : "failed" };
  }
  if (item.photo_path && item.photo_path !== path) await removePhotoPaths(supabase, [item.photo_path]);
  refresh();
  return { ok: true };
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
