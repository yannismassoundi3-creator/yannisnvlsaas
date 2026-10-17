-- =============================================================================
-- Resale marketplaces as selling platforms: Vinted, Leboncoin, eBay and
-- Vestiaire Collective. Mirrors PLATFORMS in src/lib/onboarding/constants.ts.
-- Existing rows are unaffected: the new list only adds values.
-- =============================================================================

alter table public.stores drop constraint if exists stores_platform_check;

alter table public.stores
  add constraint stores_platform_check
  check (platform in (
    'shopify', 'woocommerce', 'prestashop', 'wix', 'squarespace', 'etsy', 'amazon',
    'vinted', 'leboncoin', 'ebay', 'vestiaire_collective',
    'other'
  ));
