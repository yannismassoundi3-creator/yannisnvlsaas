"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStore } from "@/lib/auth/workspace";
import { parseUserAmount, parseUserUnitCost } from "@/lib/finance/input";
import { normalizeText } from "@/lib/imports/normalize";
import { removePhotoPaths } from "@/lib/photos/storage";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/config";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { productsMessages } from "@/i18n/messages/catalog-products";
import { getRequestLocale } from "@/i18n/request";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string; fieldErrors?: Record<string, string> };

const uuid = z.string().uuid();

const productInput = z.object({
  name: z.string().max(400),
  sku: z.string().max(200),
  unitCost: z.string().max(40),
  price: z.string().max(40),
});

/** Messages of the current request's language. */
async function messages() {
  const locale = await getRequestLocale();
  return { locale, t: productsMessages[locale], c: catalogCommon[locale] };
}

function parseProduct(input: z.infer<typeof productInput>, currency: string, locale: Locale) {
  const t = productsMessages[locale];
  const fieldErrors: Record<string, string> = {};
  const name = normalizeText(input.name);
  const sku = normalizeText(input.sku);
  if (!name) fieldErrors.name = t.nameRequired;
  else if (name.length > 300) fieldErrors.name = catalogCommon[locale].nameTooLong;
  if (sku.length > 100) fieldErrors.sku = t.skuTooLong;
  const cost = parseUserUnitCost(input.unitCost, { optional: true, locale });
  if (!cost.ok) fieldErrors.unitCost = cost.message;
  const price = parseUserAmount(input.price, currency, { optional: true, locale });
  if (!price.ok) fieldErrors.price = price.message;
  if (Object.keys(fieldErrors).length > 0) return { ok: false as const, fieldErrors };
  return {
    ok: true as const,
    value: { name, sku: sku || null, unit_cost_e4: cost.ok ? cost.value : null, price_minor: price.ok ? price.value : null },
  };
}

function dbMessage(code: string | undefined, locale: Locale): string {
  if (code === "23505") return productsMessages[locale].duplicate;
  if (code === "42501") return catalogCommon[locale].pausedExportable;
  return productsMessages[locale].saveFailed;
}

export async function createProduct(input: z.input<typeof productInput>): Promise<Result<{ productId: string }>> {
  const ws = await requireStore();
  const { locale, c } = await messages();
  if (!ws.entitlements.canWrite) return { ok: false, message: c.pausedExportable };
  const parsed = productInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.checkForm };
  const product = parseProduct(parsed.data, ws.activeStore.currency, locale);
  if (!product.ok) return { ok: false, message: c.checkFields, fieldErrors: product.fieldErrors };
  if (!(await consumeRateLimit(`product-write:${ws.user.id}`, 300, 3600))) return { ok: false, message: c.rateLimited };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ organization_id: ws.organization.id, store_id: ws.activeStore.id, source: "manual", ...product.value })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: dbMessage(error?.code, locale) };
  refresh();
  return { ok: true, productId: data.id };
}

export async function updateProduct(productId: string, input: z.input<typeof productInput>): Promise<Result> {
  const ws = await requireStore();
  const { locale, t, c } = await messages();
  if (!ws.entitlements.canWrite) return { ok: false, message: c.pausedExportable };
  const parsed = productInput.safeParse(input);
  if (!uuid.safeParse(productId).success || !parsed.success) return { ok: false, message: c.checkForm };
  const product = parseProduct(parsed.data, ws.activeStore.currency, locale);
  if (!product.ok) return { ok: false, message: c.checkFields, fieldErrors: product.fieldErrors };
  if (!(await consumeRateLimit(`product-write:${ws.user.id}`, 300, 3600))) return { ok: false, message: c.rateLimited };

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update(product.value).eq("id", productId).eq("store_id", ws.activeStore.id).select("id");
  if (error) return { ok: false, message: dbMessage(error.code, locale) };
  if (!data?.length) return { ok: false, message: t.notFound };
  refresh();
  return { ok: true };
}

/** Inline cost edit from the products table. An empty value clears the cost. */
export async function updateProductCost(productId: string, value: string): Promise<Result<{ unitCostE4: number | null }>> {
  const ws = await requireStore();
  const { locale, t, c } = await messages();
  if (!ws.entitlements.canWrite) return { ok: false, message: c.pausedExportable };
  if (!uuid.safeParse(productId).success || typeof value !== "string" || value.length > 40) return { ok: false, message: c.invalidRequest };
  const cost = parseUserUnitCost(value, { optional: true, locale });
  if (!cost.ok) return { ok: false, message: cost.message };
  if (!(await consumeRateLimit(`product-write:${ws.user.id}`, 300, 3600))) return { ok: false, message: c.rateLimited };

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({ unit_cost_e4: cost.value }).eq("id", productId).eq("store_id", ws.activeStore.id).select("id");
  if (error) return { ok: false, message: dbMessage(error.code, locale) };
  if (!data?.length) return { ok: false, message: t.notFound };
  refresh();
  return { ok: true, unitCostE4: cost.value };
}

export async function setProductArchived(productId: string, archived: boolean): Promise<Result> {
  const ws = await requireStore();
  const { locale, c } = await messages();
  if (!ws.entitlements.canWrite) return { ok: false, message: c.pausedExportable };
  if (!uuid.safeParse(productId).success) return { ok: false, message: c.invalidRequest };
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", productId)
    .eq("store_id", ws.activeStore.id);
  if (error) return { ok: false, message: dbMessage(error.code, locale) };
  refresh();
  return { ok: true };
}

/** Deletes a product that has never been sold. Products with sales are archived instead, so history keeps its costs. */
export async function deleteProduct(productId: string): Promise<Result> {
  const ws = await requireStore();
  const { t, c } = await messages();
  if (!uuid.safeParse(productId).success) return { ok: false, message: c.invalidRequest };
  const supabase = await createClient();
  const { count } = await supabase.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", productId);
  if ((count ?? 0) > 0) return { ok: false, message: t.inOrders };
  // "*" so the delete also works before the photos migration (no photo_path column yet).
  const { data, error } = await supabase.from("products").delete().eq("id", productId).eq("store_id", ws.activeStore.id).select("*");
  if (error) return { ok: false, message: t.deleteFailed };
  if (!data?.length) return { ok: false, message: t.notFound };
  // Its thumbnail goes with it (storage files are not deleted by the database).
  const photo = "photo_path" in data[0] ? data[0].photo_path : null;
  if (photo) await removePhotoPaths(supabase, [photo]);
  return { ok: true };
}
