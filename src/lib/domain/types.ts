/**
 * Domain types shared by the demo generator, the in-memory reference
 * aggregator and the database mappers. Amounts are integers in minor units
 * (see src/lib/finance/money.ts); unit costs are e4 integers. All stored
 * amounts exclude sales tax / VAT.
 */

export type Platform = "meta" | "google" | "tiktok" | "pinterest" | "microsoft" | "other";

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: "Meta",
  google: "Google Ads",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  microsoft: "Microsoft Ads",
  other: "Other",
};

export type ExpenseKind = "variable" | "fixed";

export type ExpenseCategory =
  | "shipping"
  | "packaging"
  | "payment_fees"
  | "marketplace_fees"
  | "fulfilment"
  | "marketing_other"
  | "software"
  | "staff"
  | "rent"
  | "professional_services"
  | "other";

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string; defaultKind: ExpenseKind }> = {
  shipping: { label: "Shipping & carriers", defaultKind: "variable" },
  packaging: { label: "Packaging", defaultKind: "variable" },
  payment_fees: { label: "Payment fees", defaultKind: "variable" },
  marketplace_fees: { label: "Marketplace fees", defaultKind: "variable" },
  fulfilment: { label: "Fulfilment & warehousing", defaultKind: "variable" },
  marketing_other: { label: "Other marketing", defaultKind: "fixed" },
  software: { label: "Software & subscriptions", defaultKind: "fixed" },
  staff: { label: "Staff & contractors", defaultKind: "fixed" },
  rent: { label: "Rent & utilities", defaultKind: "fixed" },
  professional_services: { label: "Professional services", defaultKind: "fixed" },
  other: { label: "Other", defaultKind: "fixed" },
};

export type StoreSettings = {
  currency: string;
  /** IANA time zone used to assign orders to reporting days. */
  timezone: string;
  pricesIncludeTax: boolean;
  /** Estimated payment fee rule; null when not configured. */
  feeRuleBasisPoints: number | null;
  feeRuleFixedMinor: number | null;
  /** Estimated shipping cost per order when none is recorded; null when not configured. */
  defaultShippingCostMinor: number | null;
};

export type Product = {
  id: string;
  sku: string | null;
  name: string;
  /** Current unit cost (e4); null when unknown. */
  unitCostE4: number | null;
  /** Reference selling price, informational only. */
  priceMinor: number | null;
};

export type OrderLine = {
  id: string;
  /** 0-based position within the order; tie-breaker for allocations. */
  position: number;
  productId: string | null;
  sku: string | null;
  name: string;
  quantity: number;
  /** Unit price × quantity before discounts. */
  grossMinor: number;
  /** All discounts on this line, including its share of order-level discounts. */
  discountMinor: number;
  /** Cost snapshot recorded with the order (e4); falls back to the product cost. */
  unitCostE4: number | null;
};

export type Order = {
  id: string;
  externalId: string;
  /** UTC instant, ISO 8601. */
  orderedAt: string;
  shippingChargedMinor: number;
  /** Recorded shipping & fulfilment cost; null when unknown. */
  shippingCostMinor: number | null;
  /** Recorded payment fees; null when unknown. */
  transactionFeesMinor: number | null;
  taxesMinor: number;
  lines: OrderLine[];
};

export type Refund = {
  id: string;
  orderId: string | null;
  /** UTC instant, ISO 8601. */
  refundedAt: string;
  amountMinor: number;
};

export type AdCampaign = {
  id: string;
  platform: Platform;
  externalId: string;
  name: string;
  /** When a campaign promotes a single product its spend can be attributed to it. */
  productId: string | null;
};

export type AdSpendDay = {
  campaignId: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Conversion value reported by the platform (its own attribution). */
  conversionValueMinor: number;
};

export type Expense = {
  id: string;
  /** Local date, YYYY-MM-DD. */
  incurredOn: string;
  category: ExpenseCategory;
  kind: ExpenseKind;
  amountMinor: number;
  description: string;
};

export type Dataset = {
  settings: StoreSettings;
  products: Product[];
  orders: Order[];
  refunds: Refund[];
  campaigns: AdCampaign[];
  adSpend: AdSpendDay[];
  expenses: Expense[];
};

/** Inclusive local date range, YYYY-MM-DD. */
export type DateRange = { from: string; to: string };
