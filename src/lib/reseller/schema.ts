import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { resellerMessages } from "@/i18n/messages/reseller";
import { isValidDateString } from "@/lib/dates";
import { parseUserAmount, parseUserInteger, parseUserUnitCost } from "@/lib/finance/input";
import { normalizeText } from "@/lib/imports/normalize";
import { PLATFORMS, type PlatformId } from "@/lib/onboarding/constants";
import { lotUnitCostE4, MAX_ITEM_QUANTITY } from "./logic";

/**
 * Input schemas and validation of the reseller quick actions. Pure (no I/O):
 * server actions call these, and unit tests cover them. Amounts are typed by
 * people ("18,50", "18.50", "18") and parsed exactly into minor units; purchase
 * prices are unit costs in e4, like every product cost.
 */

const text = (max: number) => z.string().max(max);
const optionalText = (max: number) => z.string().max(max).optional().default("");

export const PRICE_MODES = ["unit", "lot"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];

export const itemInput = z.object({
  name: text(400),
  purchasePrice: optionalText(40),
  acquiredOn: optionalText(10),
  /** Number of identical pieces ("" = 1). */
  quantity: optionalText(12),
  /** "unit": purchasePrice is the price of one piece; "lot": the price of all the pieces. */
  priceMode: z.enum(PRICE_MODES).optional().default("unit"),
});
export type ItemInput = z.input<typeof itemInput>;

export const saleInput = z.object({
  /** An item from the stock, or "" with newItemName for an item not recorded yet. */
  productId: optionalText(40),
  newItemName: optionalText(400),
  newItemCost: optionalText(40),
  price: text(40),
  channel: z.enum(PLATFORMS),
  date: text(10),
  shippingCost: optionalText(40),
  platformFee: optionalText(40),
  /** Forwarded sale email this sale confirms, if any. */
  inboundEmailId: optionalText(40),
  /** Pieces sold ("" = 1); the price is then the total received for them. */
  quantity: optionalText(12),
});
export type SaleInput = z.input<typeof saleInput>;

const uuid = z.string().uuid();

type FieldErrors = Record<string, string>;
type Parsed<T> = { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors };

export type ParsedItem = {
  name: string;
  unitCostE4: number | null;
  acquiredOn: string | null;
  /** Pieces bought (1 to MAX_ITEM_QUANTITY). */
  quantity: number;
  /** True when a lot price did not divide exactly and the unit cost was rounded to 4 decimals. */
  costRounded: boolean;
};

/** Number of pieces typed in a form: empty means one. */
export function parseQuantity(raw: string, ctx: { locale: Locale; max: number }) {
  if (raw.trim() === "") return { ok: true as const, value: 1 };
  const r = parseUserInteger(raw, { min: 1, max: ctx.max, locale: ctx.locale });
  return r.ok ? { ok: true as const, value: r.value ?? 1 } : r;
}

/**
 * Unit cost from a typed purchase price: the price of one piece, or the price
 * of the whole lot divided by the number of pieces (exact decimal arithmetic,
 * rounded half away from zero to 4 decimals).
 */
export function unitCostFromInput(raw: string, mode: PriceMode, quantity: number, locale: Locale) {
  const cost = parseUserUnitCost(raw, { optional: true, locale });
  if (!cost.ok || cost.value === null || mode === "unit") return cost.ok ? { ok: true as const, value: cost.value, rounded: false } : cost;
  const unit = lotUnitCostE4(cost.value, quantity);
  return { ok: true as const, value: unit.value, rounded: unit.rounded };
}

function itemName(raw: string, locale: Locale, errors: FieldErrors, key: string): string {
  const name = normalizeText(raw);
  if (!name) errors[key] = resellerMessages[locale].add.nameRequired;
  else if (name.length > 300) errors[key] = catalogCommon[locale].nameTooLong;
  return name;
}

/** Validates an item (add or edit). The purchase date may not be in the future. */
export function parseItem(input: z.output<typeof itemInput>, ctx: { locale: Locale; today: string }): Parsed<ParsedItem> {
  const errors: FieldErrors = {};
  const name = itemName(input.name, ctx.locale, errors, "name");
  const quantity = parseQuantity(input.quantity, { locale: ctx.locale, max: MAX_ITEM_QUANTITY });
  if (!quantity.ok) errors.quantity = quantity.message;
  const cost = unitCostFromInput(input.purchasePrice, input.priceMode, quantity.ok ? quantity.value : 1, ctx.locale);
  if (!cost.ok) errors.purchasePrice = cost.message;
  const acquiredOn = input.acquiredOn.trim() || null;
  if (acquiredOn && (!isValidDateString(acquiredOn) || acquiredOn > ctx.today || acquiredOn < "2000-01-01")) {
    errors.acquiredOn = catalogCommon[ctx.locale].validDate;
  }
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: { name, unitCostE4: cost.ok ? cost.value : null, acquiredOn, quantity: quantity.ok ? quantity.value : 1, costRounded: cost.ok ? cost.rounded : false },
  };
}

export type ParsedSale = {
  /** Existing stock item, or null when `newItem` is set. */
  productId: string | null;
  newItem: { name: string; unitCostE4: number | null } | null;
  /** Total received for all the pieces sold. */
  priceMinor: number;
  /** Pieces sold (checked against the remaining pieces when the sale is written). */
  quantity: number;
  channel: PlatformId;
  date: string;
  shippingCostMinor: number | null;
  platformFeeMinor: number | null;
  inboundEmailId: string | null;
};

/**
 * Validates a sale. Exactly one of an existing item (UUID) or a new item name
 * is required; the price is required (zero is allowed for a gift) and is the
 * total received for the pieces sold (one by default); fees are
 * optional and, when empty, follow the store's estimate rules. The sale date
 * may not be in the future.
 */
export function parseSale(input: z.output<typeof saleInput>, ctx: { currency: string; locale: Locale; today: string }): Parsed<ParsedSale> {
  const t = resellerMessages[ctx.locale].sell;
  const errors: FieldErrors = {};
  const productId = input.productId.trim();
  let newItem: ParsedSale["newItem"] = null;
  if (productId) {
    if (!uuid.safeParse(productId).success) errors.productId = t.itemRequired;
  } else if (!normalizeText(input.newItemName)) {
    errors.productId = t.itemRequired;
  } else {
    const name = itemName(input.newItemName, ctx.locale, errors, "newItemName");
    const cost = parseUserUnitCost(input.newItemCost, { optional: true, locale: ctx.locale });
    if (!cost.ok) errors.newItemCost = cost.message;
    newItem = { name, unitCostE4: cost.ok ? cost.value : null };
  }
  const price = input.price.trim() === "" ? null : parseUserAmount(input.price, ctx.currency, { locale: ctx.locale });
  if (price === null) errors.price = t.priceRequired;
  else if (!price.ok) errors.price = price.message;
  const shipping = parseUserAmount(input.shippingCost, ctx.currency, { optional: true, locale: ctx.locale });
  if (!shipping.ok) errors.shippingCost = shipping.message;
  const fee = parseUserAmount(input.platformFee, ctx.currency, { optional: true, locale: ctx.locale });
  if (!fee.ok) errors.platformFee = fee.message;
  const quantity = parseQuantity(input.quantity, { locale: ctx.locale, max: 100_000 });
  if (!quantity.ok) errors.quantity = quantity.message;
  if (!isValidDateString(input.date) || input.date > ctx.today || input.date < "2000-01-01") errors.date = catalogCommon[ctx.locale].validDate;
  const inboundEmailId = input.inboundEmailId.trim() || null;
  if (inboundEmailId && !uuid.safeParse(inboundEmailId).success) errors.inboundEmailId = catalogCommon[ctx.locale].invalidRequest;
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      productId: productId || null,
      newItem,
      priceMinor: price && price.ok ? (price.value as number) : 0,
      quantity: quantity.ok ? quantity.value : 1,
      channel: input.channel,
      date: input.date,
      shippingCostMinor: shipping.ok ? shipping.value : null,
      platformFeeMinor: fee.ok ? fee.value : null,
      inboundEmailId,
    },
  };
}
