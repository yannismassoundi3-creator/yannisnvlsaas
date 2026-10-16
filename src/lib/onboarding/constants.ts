export const PLATFORMS = ["shopify", "woocommerce", "prestashop", "wix", "squarespace", "etsy", "amazon", "other"] as const;

export type PlatformId = (typeof PLATFORMS)[number];

export const PLATFORM_NAMES: Record<PlatformId, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  prestashop: "PrestaShop",
  wix: "Wix",
  squarespace: "Squarespace",
  etsy: "Etsy",
  amazon: "Amazon",
  other: "Other or custom",
};
