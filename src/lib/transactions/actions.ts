"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStore } from "@/lib/auth/workspace";
import { isValidDateString, zonedTimeToUtc } from "@/lib/dates";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/domain/types";
import { parseUserAmount, parseUserInteger, parseUserUnitCost } from "@/lib/finance/input";
import { MAX_AMOUNT_MINOR } from "@/lib/finance/money";
import { removeIncludedTax } from "@/lib/finance/tax";
import { normalizeText } from "@/lib/imports/normalize";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { transactionsMessages } from "@/i18n/messages/catalog-transactions";
import { getRequestLocale } from "@/i18n/request";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string; fieldErrors?: Record<string, string> };

const uuid = z.string().uuid();
const TIME_RE = /^\d{2}:\d{2}$/;

/** Messages of the current request's language. */
async function messages() {
  const locale = await getRequestLocale();
  return { locale, t: transactionsMessages[locale], c: catalogCommon[locale] };
}

async function writeContext(limitKey: string) {
  const ws = await requireStore();
  const m = await messages();
  if (!ws.entitlements.canWrite) return { ws, ...m, error: m.c.paused };
  if (!(await consumeRateLimit(`${limitKey}:${ws.user.id}`, 300, 3600))) return { ws, ...m, error: m.c.rateLimited };
  return { ws, ...m, error: null };
}

// -----------------------------------------------------------------------------
// Expenses
// -----------------------------------------------------------------------------
const expenseInput = z.object({
  date: z.string().max(10),
  category: z.enum(Object.keys(EXPENSE_CATEGORIES) as [ExpenseCategory, ...ExpenseCategory[]]),
  kind: z.enum(["variable", "fixed"]),
  amount: z.string().max(40),
  description: z.string().max(600),
});

export async function createExpense(input: z.input<typeof expenseInput>): Promise<Result> {
  const { ws, locale, t, c, error: blocked } = await writeContext("expense");
  if (blocked) return { ok: false, message: blocked };
  const parsed = expenseInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.checkForm };
  const v = parsed.data;
  const fieldErrors: Record<string, string> = {};
  if (!isValidDateString(v.date)) fieldErrors.date = c.validDate;
  const amount = parseUserAmount(v.amount, ws.activeStore.currency, { locale });
  if (!amount.ok) fieldErrors.amount = amount.message;
  else if (amount.value === 0) fieldErrors.amount = t.amountPositive;
  const description = normalizeText(v.description);
  if (description.length > 300) fieldErrors.description = t.descriptionTooLong;
  if (Object.keys(fieldErrors).length) return { ok: false, message: c.checkFields, fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    organization_id: ws.organization.id,
    store_id: ws.activeStore.id,
    incurred_on: v.date,
    category: v.category,
    kind: v.kind,
    amount_minor: amount.ok ? (amount.value as number) : 0,
    description: description || null,
    source: "manual",
  });
  if (error) return { ok: false, message: t.expenseSaveFailed };
  refresh();
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<Result> {
  const ws = await requireStore();
  const { t, c } = await messages();
  if (!uuid.safeParse(id).success) return { ok: false, message: c.invalidRequest };
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").delete().eq("id", id).eq("store_id", ws.activeStore.id).select("id");
  if (error || !data?.length) return { ok: false, message: t.expenseDeleteFailed };
  refresh();
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Refunds
// -----------------------------------------------------------------------------
const refundInput = z.object({
  orderNumber: z.string().max(200),
  date: z.string().max(10),
  amount: z.string().max(40),
  reason: z.string().max(600),
});

/** Records a refund, excluding tax. Linked to an order when its number is given, so product margins include it. */
export async function createRefund(input: z.input<typeof refundInput>): Promise<Result> {
  const { ws, locale, t, c, error: blocked } = await writeContext("refund");
  if (blocked) return { ok: false, message: blocked };
  const parsed = refundInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.checkForm };
  const v = parsed.data;
  const fieldErrors: Record<string, string> = {};
  if (!isValidDateString(v.date)) fieldErrors.date = c.validDate;
  const amount = parseUserAmount(v.amount, ws.activeStore.currency, { locale });
  if (!amount.ok) fieldErrors.amount = amount.message;
  else if (amount.value === 0) fieldErrors.amount = t.amountPositive;
  const reason = normalizeText(v.reason);
  if (reason.length > 300) fieldErrors.reason = t.reasonTooLong;

  const supabase = await createClient();
  let orderId: string | null = null;
  const orderNumber = normalizeText(v.orderNumber);
  if (orderNumber) {
    const { data: order } = await supabase.from("orders").select("id").eq("store_id", ws.activeStore.id).eq("external_id", orderNumber).maybeSingle();
    if (!order) fieldErrors.orderNumber = t.noOrderInStore(orderNumber);
    else orderId = order.id;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, message: c.checkFields, fieldErrors };

  const { error } = await supabase.from("refunds").insert({
    organization_id: ws.organization.id,
    store_id: ws.activeStore.id,
    order_id: orderId,
    refunded_at: zonedTimeToUtc(v.date, "12:00:00", ws.activeStore.timezone),
    amount_minor: amount.ok ? (amount.value as number) : 0,
    reason: reason || null,
    source: "manual",
  });
  if (error) return { ok: false, message: t.refundSaveFailed };
  refresh();
  return { ok: true };
}

export async function deleteRefund(id: string): Promise<Result> {
  const ws = await requireStore();
  const { t, c } = await messages();
  if (!uuid.safeParse(id).success) return { ok: false, message: c.invalidRequest };
  const supabase = await createClient();
  const { data, error } = await supabase.from("refunds").delete().eq("id", id).eq("store_id", ws.activeStore.id).select("id");
  if (error || !data?.length) return { ok: false, message: t.refundDeleteFailed };
  refresh();
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Orders
// -----------------------------------------------------------------------------
const costsInput = z.object({ shippingCost: z.string().max(40), fees: z.string().max(40) });

/** Records actual shipping cost and payment fees for an order. Empty means "use the store's estimate rule". */
export async function updateOrderCosts(orderId: string, input: z.input<typeof costsInput>): Promise<Result> {
  const { ws, locale, t, c, error: blocked } = await writeContext("order");
  if (blocked) return { ok: false, message: blocked };
  const parsed = costsInput.safeParse(input);
  if (!uuid.safeParse(orderId).success || !parsed.success) return { ok: false, message: c.invalidRequest };
  const shipping = parseUserAmount(parsed.data.shippingCost, ws.activeStore.currency, { optional: true, locale });
  const fees = parseUserAmount(parsed.data.fees, ws.activeStore.currency, { optional: true, locale });
  const fieldErrors: Record<string, string> = {};
  if (!shipping.ok) fieldErrors.shippingCost = shipping.message;
  if (!fees.ok) fieldErrors.fees = fees.message;
  if (Object.keys(fieldErrors).length) return { ok: false, message: c.checkFields, fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ shipping_cost_minor: shipping.ok ? shipping.value : null, transaction_fees_minor: fees.ok ? fees.value : null })
    .eq("id", orderId)
    .eq("store_id", ws.activeStore.id)
    .select("id");
  if (error || !data?.length) return { ok: false, message: t.costsSaveFailed };
  refresh();
  return { ok: true };
}

export async function deleteOrder(orderId: string): Promise<Result> {
  const ws = await requireStore();
  const { t, c } = await messages();
  if (!uuid.safeParse(orderId).success) return { ok: false, message: c.invalidRequest };
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").delete().eq("id", orderId).eq("store_id", ws.activeStore.id).select("id");
  if (error || !data?.length) return { ok: false, message: t.orderDeleteFailed };
  return { ok: true };
}

const lineInput = z.object({ productId: z.string().max(40), name: z.string().max(400), sku: z.string().max(200), quantity: z.string().max(20), unitPrice: z.string().max(40), discount: z.string().max(40), unitCost: z.string().max(40) });
const orderInput = z.object({
  orderNumber: z.string().max(200),
  date: z.string().max(10),
  time: z.string().max(5),
  lines: z.array(lineInput).min(1).max(100),
  shippingCharged: z.string().max(40),
  taxes: z.string().max(40),
  shippingCost: z.string().max(40),
  fees: z.string().max(40),
});

/**
 * Manual order entry for stores without exports. Amounts are entered as shown
 * to the customer; if the store's prices include tax, the order's tax is
 * removed exactly as during imports.
 */
export async function createManualOrder(input: z.input<typeof orderInput>): Promise<Result<{ orderId: string }>> {
  const { ws, locale, t, c, error: blocked } = await writeContext("order");
  if (blocked) return { ok: false, message: blocked };
  const parsed = orderInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.checkForm };
  const v = parsed.data;
  const store = ws.activeStore;
  const currency = store.currency;
  const fieldErrors: Record<string, string> = {};

  const orderNumber = normalizeText(v.orderNumber);
  if (!orderNumber) fieldErrors.orderNumber = t.orderNumberRequired;
  else if (orderNumber.length > 100) fieldErrors.orderNumber = t.orderNumberTooLong;
  if (!isValidDateString(v.date)) fieldErrors.date = c.validDate;
  const time = TIME_RE.test(v.time) ? v.time : "12:00";

  const supabase = await createClient();
  const productIds = v.lines.map((l) => l.productId).filter((id) => uuid.safeParse(id).success);
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name, sku").eq("store_id", store.id).in("id", productIds)
    : { data: [] as { id: string; name: string; sku: string | null }[] };
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const lines = v.lines.map((l, i) => {
    const product = productById.get(l.productId);
    const name = normalizeText(product?.name ?? l.name);
    const sku = normalizeText(product?.sku ?? l.sku) || null;
    if (!name) fieldErrors[`lines.${i}.name`] = t.lineNameRequired;
    const qty = parseUserInteger(l.quantity, { min: 1, max: 1_000_000, locale });
    if (!qty.ok) fieldErrors[`lines.${i}.quantity`] = qty.message;
    const price = parseUserAmount(l.unitPrice, currency, { locale });
    if (!price.ok) fieldErrors[`lines.${i}.unitPrice`] = price.message;
    const discount = parseUserAmount(l.discount, currency, { optional: true, locale });
    if (!discount.ok) fieldErrors[`lines.${i}.discount`] = discount.message;
    const cost = parseUserUnitCost(l.unitCost, { optional: true, locale });
    if (!cost.ok) fieldErrors[`lines.${i}.unitCost`] = cost.message;
    const gross = qty.ok && price.ok ? (qty.value as number) * (price.value as number) : 0;
    if (gross > MAX_AMOUNT_MINOR) fieldErrors[`lines.${i}.unitPrice`] = t.lineTooLarge;
    const disc = discount.ok ? (discount.value ?? 0) : 0;
    if (disc > gross) fieldErrors[`lines.${i}.discount`] = t.discountTooLarge;
    return { productId: product?.id ?? null, name, sku, quantity: qty.ok ? (qty.value as number) : 0, gross, discount: disc, unitCostE4: cost.ok ? cost.value : null };
  });
  const shippingCharged = parseUserAmount(v.shippingCharged, currency, { optional: true, locale });
  const taxes = parseUserAmount(v.taxes, currency, { optional: true, locale });
  const shippingCost = parseUserAmount(v.shippingCost, currency, { optional: true, locale });
  const fees = parseUserAmount(v.fees, currency, { optional: true, locale });
  if (!shippingCharged.ok) fieldErrors.shippingCharged = shippingCharged.message;
  if (!taxes.ok) fieldErrors.taxes = taxes.message;
  if (!shippingCost.ok) fieldErrors.shippingCost = shippingCost.message;
  if (!fees.ok) fieldErrors.fees = fees.message;
  if (Object.keys(fieldErrors).length) return { ok: false, message: c.checkFields, fieldErrors };

  let lineAmounts = lines.map((l) => ({ gross: l.gross, discount: l.discount }));
  let shipping = shippingCharged.ok ? (shippingCharged.value ?? 0) : 0;
  const tax = taxes.ok ? (taxes.value ?? 0) : 0;
  if (store.prices_include_tax) {
    const converted = removeIncludedTax({ lines: lineAmounts, orderDiscount: 0, shippingCharged: shipping, refunds: [], taxes: tax });
    if (!converted.ok) return { ok: false, message: t.checkAmounts, fieldErrors: { taxes: t.taxesTooLarge } };
    lineAmounts = converted.order.lines;
    shipping = converted.order.shippingCharged;
  }

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      organization_id: ws.organization.id,
      store_id: store.id,
      external_id: orderNumber,
      ordered_at: zonedTimeToUtc(v.date, `${time}:00`, store.timezone),
      shipping_charged_minor: shipping,
      taxes_minor: tax,
      shipping_cost_minor: shippingCost.ok ? shippingCost.value : null,
      transaction_fees_minor: fees.ok ? fees.value : null,
      converted_from_tax_inclusive: store.prices_include_tax,
      source: "manual",
    })
    .select("id")
    .single();
  if (error || !order) {
    return error?.code === "23505"
      ? { ok: false, message: c.checkFields, fieldErrors: { orderNumber: t.duplicateOrder } }
      : { ok: false, message: t.orderSaveFailed };
  }

  // Lines without a chosen product are matched by SKU or name, creating the product if needed.
  for (const l of lines) {
    if (l.productId) continue;
    const key = (l.sku ? l.sku : `name:${l.name}`).toLowerCase();
    const { data: existing } = await supabase.from("products").select("id").eq("store_id", store.id).eq("match_key", key).maybeSingle();
    if (existing) l.productId = existing.id;
    else {
      const { data: created } = await supabase.from("products").insert({ organization_id: ws.organization.id, store_id: store.id, name: l.name, sku: l.sku, source: "manual" }).select("id").single();
      l.productId = created?.id ?? null;
    }
  }
  const { error: linesError } = await supabase.from("order_items").insert(
    lines.map((l, i) => ({
      organization_id: ws.organization.id,
      order_id: order.id,
      position: i,
      product_id: l.productId,
      name: l.name,
      sku: l.sku,
      quantity: l.quantity,
      gross_minor: lineAmounts[i].gross,
      discount_minor: lineAmounts[i].discount,
      unit_cost_e4: l.unitCostE4,
    })),
  );
  if (linesError) {
    await supabase.from("orders").delete().eq("id", order.id);
    return { ok: false, message: t.linesSaveFailed };
  }
  refresh();
  return { ok: true, orderId: order.id };
}
