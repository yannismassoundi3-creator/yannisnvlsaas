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
