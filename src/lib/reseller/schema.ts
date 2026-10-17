import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { resellerMessages } from "@/i18n/messages/reseller";
import { isValidDateString } from "@/lib/dates";
import { parseUserAmount, parseUserUnitCost } from "@/lib/finance/input";
import { normalizeText } from "@/lib/imports/normalize";
import { PLATFORMS, type PlatformId } from "@/lib/onboarding/constants";

/**
 * Input schemas and validation of the reseller quick actions. Pure (no I/O):
 * server actions call these, and unit tests cover them. Amounts are typed by
 * people ("18,50", "18.50", "18") and parsed exactly into minor units; purchase
 * prices are unit costs in e4, like every product cost.
 */

const text = (max: number) => z.string().max(max);
const optionalText = (max: number) => z.string().max(max).optional().default("");

export const itemInput = z.object({
  name: text(400),
  purchasePrice: optionalText(40),
  acquiredOn: optionalText(10),
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
});
export type SaleInput = z.input<typeof saleInput>;

const uuid = z.string().uuid();

type FieldErrors = Record<string, string>;
type Parsed<T> = { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors };

export type ParsedItem = { name: string; unitCostE4: number | null; acquiredOn: string | null };

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
  const cost = parseUserUnitCost(input.purchasePrice, { optional: true, locale: ctx.locale });
  if (!cost.ok) errors.purchasePrice = cost.message;
  const acquiredOn = input.acquiredOn.trim() || null;
  if (acquiredOn && (!isValidDateString(acquiredOn) || acquiredOn > ctx.today || acquiredOn < "2000-01-01")) {
    errors.acquiredOn = catalogCommon[ctx.locale].validDate;
  }
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { name, unitCostE4: cost.ok ? cost.value : null, acquiredOn } };
}

export type ParsedSale = {
  /** Existing stock item, or null when `newItem` is set. */
  productId: string | null;
  newItem: { name: string; unitCostE4: number | null } | null;
  priceMinor: number;
  channel: PlatformId;
  date: string;
  shippingCostMinor: number | null;
  platformFeeMinor: number | null;
};

/**
 * Validates a sale. Exactly one of an existing item (UUID) or a new item name
 * is required; the price is required (zero is allowed for a gift); fees are
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
  if (!isValidDateString(input.date) || input.date > ctx.today || input.date < "2000-01-01") errors.date = catalogCommon[ctx.locale].validDate;
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      productId: productId || null,
      newItem,
      priceMinor: price && price.ok ? (price.value as number) : 0,
      channel: input.channel,
      date: input.date,
      shippingCostMinor: shipping.ok ? shipping.value : null,
      platformFeeMinor: fee.ok ? fee.value : null,
    },
  };
}
