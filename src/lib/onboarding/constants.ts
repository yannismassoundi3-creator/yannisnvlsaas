import type { Locale } from "@/i18n/config";

/**
 * Where the store sells. Stored in stores.platform, whose CHECK constraint
 * lists the same values (supabase/migrations/*_resale_platforms.sql).
 */
export const PLATFORMS = [
  "shopify",
  "woocommerce",
  "prestashop",
  "wix",
  "squarespace",
  "etsy",
  "amazon",
  "vinted",
  "leboncoin",
  "ebay",
  "vestiaire_collective",
  "other",
] as const;

export type PlatformId = (typeof PLATFORMS)[number];

export const PLATFORM_NAMES: Record<PlatformId, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  prestashop: "PrestaShop",
  wix: "Wix",
  squarespace: "Squarespace",
  etsy: "Etsy",
  amazon: "Amazon",
  vinted: "Vinted",
  leboncoin: "Leboncoin",
  ebay: "eBay",
  vestiaire_collective: "Vestiaire Collective",
  other: "Other or custom",
};

/** Brand names stay as they are; only "Other or custom" is translated. */
const PLATFORM_NAMES_FR: Record<PlatformId, string> = { ...PLATFORM_NAMES, other: "Autre ou sur mesure" };

export function platformName(platform: PlatformId, locale: Locale = "en"): string {
  return (locale === "fr" ? PLATFORM_NAMES_FR : PLATFORM_NAMES)[platform];
}

/**
 * Answers to the onboarding question "Do your selling prices include VAT?":
 * - "yes": prices include VAT, which is removed using each order's tax amount;
 * - "no": tax is added on top at checkout;
 * - "none": no VAT is charged at all (private sellers, VAT-exempt
 *   micro-businesses such as French "franchise en base de TVA").
 */
export const TAX_CHOICES = ["yes", "no", "none"] as const;
export type TaxChoice = (typeof TAX_CHOICES)[number];

/**
 * The store's prices_include_tax flag for an answer. "none" leaves it off like
 * "no": amounts are stored as entered, so without tax the net is exactly the
 * price collected (as it would also be with the flag on, since a zero tax
 * removes nothing). Off is the label that fits these sellers (amounts
 * "excluding tax", as on an invoice marked "TVA non applicable"), spares them
 * the warning about a missing Taxes column on every import, and keeps any tax
 * a marketplace adds on top out of their sales instead of deducting it.
 */
export function pricesIncludeTaxFor(choice: TaxChoice): boolean {
  return choice === "yes";
}

/** Resale marketplaces: choosing one in onboarding suggests the reseller mode. */
export const RESALE_PLATFORMS = ["vinted", "leboncoin", "ebay", "vestiaire_collective"] as const satisfies readonly PlatformId[];

export function isResalePlatform(platform: string): boolean {
  return (RESALE_PLATFORMS as readonly string[]).includes(platform);
}

/**
 * How the store sells, stored in stores.business_model:
 * - "ecommerce": an online shop that imports orders, costs and ad spend;
 * - "reseller": someone who resells items one by one (Vinted, Leboncoin…)
 *   and records each purchase and sale by hand in a few seconds.
 */
export const BUSINESS_MODELS = ["ecommerce", "reseller"] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];

export function isReseller(store: { business_model: string } | null | undefined): boolean {
  return store?.business_model === "reseller";
}

/** The mode suggested for a platform picked in onboarding. */
export function suggestedBusinessModel(platform: string): BusinessModel {
  return isResalePlatform(platform) ? "reseller" : "ecommerce";
}

/**
 * Selling platforms offered when recording a sale (orders.sales_channel):
 * every platform, resale marketplaces first.
 */
export const SALES_CHANNELS: readonly PlatformId[] = [...RESALE_PLATFORMS, ...PLATFORMS.filter((p) => !isResalePlatform(p))];

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}
