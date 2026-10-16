"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStore } from "@/lib/auth/workspace";
import { parseUserAmount, parseUserUnitCost } from "@/lib/finance/input";
import { normalizeText } from "@/lib/imports/normalize";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string; fieldErrors?: Record<string, string> };

const uuid = z.string().uuid();
const PAUSED = "Editing is paused because your trial or subscription has ended. Your data can still be exported.";

const productInput = z.object({
  name: z.string().max(400),
  sku: z.string().max(200),
  unitCost: z.string().max(40),
  price: z.string().max(40),
});

function parseProduct(input: z.infer<typeof productInput>, currency: string) {
  const fieldErrors: Record<string, string> = {};
  const name = normalizeText(input.name);
  const sku = normalizeText(input.sku);
  if (!name) fieldErrors.name = "Enter a product name.";
  else if (name.length > 300) fieldErrors.name = "Keep the name under 300 characters.";
  if (sku.length > 100) fieldErrors.sku = "Keep the SKU under 100 characters.";
  const cost = parseUserUnitCost(input.unitCost, { optional: true });
  if (!cost.ok) fieldErrors.unitCost = cost.message;
  const price = parseUserAmount(input.price, currency, { optional: true });
  if (!price.ok) fieldErrors.price = price.message;
  if (Object.keys(fieldErrors).length > 0) return { ok: false as const, fieldErrors };
  return {
    ok: true as const,
    value: { name, sku: sku || null, unit_cost_e4: cost.ok ? cost.value : null, price_minor: price.ok ? price.value : null },
  };
}

function dbMessage(code: string | undefined): string {
  if (code === "23505") return "Another product in this store already uses this SKU (or this name, for products without a SKU).";
  if (code === "42501") return PAUSED;
  return "We could not save the product. Please try again.";
}

export async function createProduct(input: z.input<typeof productInput>): Promise<Result<{ productId: string }>> {
  const ws = await requireStore();
  if (!ws.entitlements.canWrite) return { ok: false, message: PAUSED };
  const parsed = productInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the form." };
  const product = parseProduct(parsed.data, ws.activeStore.currency);
  if (!product.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: product.fieldErrors };
  if (!(await consumeRateLimit(`product-write:${ws.user.id}`, 300, 3600))) return { ok: false, message: "Too many changes in a short time. Please wait a moment." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ organization_id: ws.organization.id, store_id: ws.activeStore.id, source: "manual", ...product.value })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: dbMessage(error?.code) };
  refresh();
  return { ok: true, productId: data.id };
}

export async function updateProduct(productId: string, input: z.input<typeof productInput>): Promise<Result> {
  const ws = await requireStore();
  if (!ws.entitlements.canWrite) return { ok: false, message: PAUSED };
  const parsed = productInput.safeParse(input);
  if (!uuid.safeParse(productId).success || !parsed.success) return { ok: false, message: "Check the form." };
  const product = parseProduct(parsed.data, ws.activeStore.currency);
  if (!product.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: product.fieldErrors };
  if (!(await consumeRateLimit(`product-write:${ws.user.id}`, 300, 3600))) return { ok: false, message: "Too many changes in a short time. Please wait a moment." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update(product.value).eq("id", productId).eq("store_id", ws.activeStore.id).select("id");
  if (error) return { ok: false, message: dbMessage(error.code) };
  if (!data?.length) return { ok: false, message: "Product not found in this store." };
  refresh();
  return { ok: true };
}

/** Inline cost edit from the products table. An empty value clears the cost. */
export async function updateProductCost(productId: string, value: string): Promise<Result<{ unitCostE4: number | null }>> {
  const ws = await requireStore();
  if (!ws.entitlements.canWrite) return { ok: false, message: PAUSED };
  if (!uuid.safeParse(productId).success || typeof value !== "string" || value.length > 40) return { ok: false, message: "Invalid request." };
  const cost = parseUserUnitCost(value, { optional: true });
  if (!cost.ok) return { ok: false, message: cost.message };
  if (!(await consumeRateLimit(`product-write:${ws.user.id}`, 300, 3600))) return { ok: false, message: "Too many changes in a short time. Please wait a moment." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({ unit_cost_e4: cost.value }).eq("id", productId).eq("store_id", ws.activeStore.id).select("id");
  if (error) return { ok: false, message: dbMessage(error.code) };
  if (!data?.length) return { ok: false, message: "Product not found in this store." };
  refresh();
  return { ok: true, unitCostE4: cost.value };
}

export async function setProductArchived(productId: string, archived: boolean): Promise<Result> {
  const ws = await requireStore();
  if (!ws.entitlements.canWrite) return { ok: false, message: PAUSED };
  if (!uuid.safeParse(productId).success) return { ok: false, message: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", productId)
    .eq("store_id", ws.activeStore.id);
  if (error) return { ok: false, message: dbMessage(error.code) };
  refresh();
  return { ok: true };
}

/** Deletes a product that has never been sold. Products with sales are archived instead, so history keeps its costs. */
export async function deleteProduct(productId: string): Promise<Result> {
  const ws = await requireStore();
  if (!uuid.safeParse(productId).success) return { ok: false, message: "Invalid request." };
  const supabase = await createClient();
  const { count } = await supabase.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", productId);
  if ((count ?? 0) > 0) return { ok: false, message: "This product appears in orders, so it can be archived but not deleted." };
  const { data, error } = await supabase.from("products").delete().eq("id", productId).eq("store_id", ws.activeStore.id).select("id");
  if (error) return { ok: false, message: "We could not delete the product." };
  if (!data?.length) return { ok: false, message: "Product not found in this store." };
  return { ok: true };
}
