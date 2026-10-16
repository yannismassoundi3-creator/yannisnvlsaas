import type { Locale } from "@/i18n/config";
import { importKindsFr } from "@/i18n/messages/imports-fields";
import type { ExpenseCategory, ExpenseKind, Platform } from "@/lib/domain/types";

/**
 * Import kinds and their fields. Header synonyms are compared after
 * normalisation (lower case, accents and punctuation removed, text in
 * parentheses dropped), so "Amount spent (EUR)" matches "amountspent".
 */

export type ImportKind = "orders" | "products" | "ad_spend" | "expenses";

export type FieldDef = {
  key: string;
  label: string;
  required: boolean;
  description: string;
  /** Normalised header names recognised automatically, best match first. */
  synonyms: string[];
};

export type KindDef = {
  kind: ImportKind;
  label: string;
  description: string;
  fields: FieldDef[];
  /** Template file: header row and example rows (fictional). */
  template: string[][];
};

const f = (key: string, label: string, required: boolean, description: string, synonyms: string[]): FieldDef => ({
  key,
  label,
  required,
  description,
  synonyms,
});

export const IMPORT_KINDS: Record<ImportKind, KindDef> = {
  orders: {
    kind: "orders",
    label: "Orders",
    description: "One row per order line. Shopify order exports are recognised automatically.",
    fields: [
      f("order_number", "Order number", true, "Identifies the order, e.g. #1001. Rows with the same number are lines of one order.", [
        "ordernumber",
        "orderno",
        "orderid",
        "ordername",
        "order",
        "numerodecommande",
        "commande",
        "name",
      ]),
      f("ordered_at", "Order date", true, "When the order was placed. A time zone offset is used when present; otherwise your store's time zone.", [
        "createdat",
        "orderdate",
        "orderedat",
        "date",
        "datedecommande",
        "processedat",
      ]),
      f("line_name", "Product name", true, "Name of the product on this line.", ["lineitemname", "productname", "itemname", "product", "item", "title", "produit", "article"]),
      f("line_sku", "SKU", false, "Used to match the line to a product. Without it, products are matched by name.", [
        "lineitemsku",
        "sku",
        "variantsku",
        "reference",
        "ref",
      ]),
      f("quantity", "Quantity", true, "Units sold on this line.", ["lineitemquantity", "quantity", "qty", "quantite", "qte"]),
      f("unit_price", "Unit price", true, "Selling price of one unit, before discounts.", ["lineitemprice", "unitprice", "itemprice", "price", "prixunitaire", "prix"]),
      f("line_discount", "Line discount", false, "Total discount on this line (not per unit).", ["lineitemdiscount", "linediscount", "itemdiscount"]),
      f("order_discount", "Order discount", false, "Discount on the whole order. Used only when no line discounts are provided; split across lines by value.", [
        "discountamount",
        "orderdiscount",
        "discount",
        "remise",
      ]),
      f("shipping_charged", "Shipping charged", false, "Shipping paid by the customer for the order.", [
        "shipping",
        "shippingcharged",
        "shippingprice",
        "shippingamount",
        "fraisdeport",
        "livraison",
      ]),
      f("taxes", "Taxes", false, "Tax (VAT / sales tax) on the order. Needed to remove tax from tax-inclusive prices.", ["taxes", "tax", "totaltax", "vat", "tva"]),
      f("shipping_cost", "Shipping cost", false, "What you paid to ship the order. Without it, your default estimate is used.", [
        "shippingcost",
        "fulfillmentcost",
        "fulfilmentcost",
        "postage",
        "coutdelivraison",
      ]),
      f("transaction_fees", "Payment fees", false, "Fees charged by the payment provider. Without them, your fee rule is used.", [
        "transactionfees",
        "transactionfee",
        "paymentfees",
        "processingfees",
        "fees",
        "fraisdepaiement",
      ]),
      f("refunded_amount", "Refunded amount", false, "Total refunded for the order.", ["refundedamount", "refunded", "refundamount", "montantrembourse"]),
      f("refunded_at", "Refund date", false, "When the refund was made. Without it, the refund is dated to the order and marked as estimated.", [
        "refundedat",
        "refunddate",
      ]),
      f("unit_cost", "Unit cost", false, "What one unit cost you. Stored with the line, so later cost changes do not rewrite this order.", [
        "costperitem",
        "unitcost",
        "lineitemcost",
        "cost",
        "cogs",
        "coutunitaire",
      ]),
      f("currency", "Currency", false, "Checked against your store currency.", ["currency", "devise"]),
      f("cancelled_at", "Cancelled at", false, "Cancelled orders can be skipped.", ["cancelledat", "canceledat", "cancelled", "canceled"]),
    ],
    template: [
      ["Order number", "Order date", "Product name", "SKU", "Quantity", "Unit price", "Line discount", "Shipping charged", "Taxes", "Shipping cost", "Payment fees", "Refunded amount"],
      ["#1001", "2026-03-02 10:15", "Linen tote bag", "TOTE-01", "2", "24.00", "0", "4.90", "0", "5.50", "1.10", "0"],
      ["#1001", "2026-03-02 10:15", "Organic cotton tee", "TEE-01", "1", "29.00", "2.90", "", "", "", "", ""],
      ["#1002", "2026-03-02 16:40", "Ceramic pour-over set", "POUR-01", "1", "45.00", "0", "0", "0", "", "", "45.00"],
    ],
  },
  products: {
    kind: "products",
    label: "Products and costs",
    description: "Your catalogue with unit costs. Shopify product exports are recognised automatically.",
    fields: [
      f("name", "Product name", true, "Product (and variant) name.", ["title", "productname", "name", "product", "nom", "produit"]),
      f("sku", "SKU", false, "Strongly recommended: order lines are matched to products by SKU.", ["variantsku", "sku", "reference", "ref"]),
      f("unit_cost", "Unit cost", false, "What one unit costs you, excluding VAT. Up to four decimals.", [
        "costperitem",
        "unitcost",
        "cost",
        "purchaseprice",
        "coutunitaire",
        "prixdachat",
        "cout",
      ]),
      f("price", "Selling price", false, "Current selling price, for reference.", ["variantprice", "price", "sellingprice", "prix"]),
      f("handle", "Handle", false, "Shopify product handle: names variant rows that leave the title empty.", ["handle"]),
      f("option1", "Variant option 1", false, "Shopify variant option value, added to the name.", ["option1value"]),
      f("option2", "Variant option 2", false, "Shopify variant option value, added to the name.", ["option2value"]),
      f("option3", "Variant option 3", false, "Shopify variant option value, added to the name.", ["option3value"]),
    ],
    template: [
      ["Product name", "SKU", "Unit cost", "Selling price"],
      ["Linen tote bag", "TOTE-01", "6.80", "24.00"],
      ["Organic cotton tee", "TEE-01", "9.4500", "29.00"],
      ["Ceramic pour-over set", "POUR-01", "14.20", "45.00"],
    ],
  },
  ad_spend: {
    kind: "ad_spend",
    label: "Advertising spend",
    description: "Daily spend per campaign. Meta, Google Ads and TikTok exports with a daily breakdown are recognised.",
    fields: [
      f("date", "Day", true, "The day of the spend. Export your report with a breakdown by day.", ["day", "date", "reportingstarts", "jour"]),
      f("campaign", "Campaign", true, "Campaign name.", ["campaignname", "campaign", "campagne", "nomdelacampagne"]),
      f("campaign_id", "Campaign ID", false, "Platform campaign ID; keeps a campaign matched when it is renamed.", ["campaignid", "idcampagne"]),
      f("platform", "Platform", false, "Meta, Google, TikTok… Without it, the platform chosen below is used.", ["platform", "network", "channel", "source", "plateforme"]),
      f("spend", "Spend", true, "Amount spent that day, excluding VAT.", ["amountspent", "spend", "cost", "montantdepense", "depense", "cout"]),
      f("impressions", "Impressions", false, "", ["impressions", "impr"]),
      f("clicks", "Clicks", false, "", ["linkclicks", "clicks", "clicksall", "clics"]),
      f("conversions", "Conversions", false, "As reported by the platform.", ["conversions", "purchases", "results", "conv", "websitepurchases", "achats"]),
      f("conversion_value", "Conversion value", false, "Revenue the platform attributes to the campaign.", [
        "conversionvalue",
        "convvalue",
        "purchasesconversionvalue",
        "websitepurchasesconversionvalue",
        "totalconversionvalue",
        "purchasevalue",
        "valeurdeconversion",
      ]),
    ],
    template: [
      ["Day", "Campaign", "Platform", "Spend", "Impressions", "Clicks", "Conversions", "Conversion value"],
      ["2026-03-01", "Prospecting – broad audiences", "Meta", "42.10", "8120", "164", "3", "96.00"],
      ["2026-03-01", "Search – brand", "Google", "12.80", "910", "77", "4", "141.50"],
    ],
  },
  expenses: {
    kind: "expenses",
    label: "Expenses",
    description: "Other costs: packaging, subscriptions, marketplace commissions, rent.",
    fields: [
      f("date", "Date", true, "When the cost was incurred.", ["date", "incurredon", "day", "jour"]),
      f("amount", "Amount", true, "Amount excluding VAT.", ["amount", "montant", "total", "cost", "cout"]),
      f("category", "Category", false, "Packaging, software, rent… Without it, the category chosen below is used.", ["category", "categorie", "type"]),
      f("kind", "Fixed or variable", false, "'fixed' or 'variable'. Without it, each category's usual kind is used.", ["kind", "costtype", "nature", "fixedvariable"]),
      f("description", "Description", false, "", ["description", "label", "memo", "libelle", "note", "details"]),
    ],
    template: [
      ["Date", "Category", "Fixed or variable", "Amount", "Description"],
      ["2026-03-01", "software", "fixed", "29.00", "Email marketing tool"],
      ["2026-03-04", "packaging", "variable", "86.40", "Mailer boxes, 200 pcs"],
    ],
  },
};

/** Label and description of an import kind in a language. */
export function kindCopy(kind: ImportKind, locale: Locale = "en"): { label: string; description: string } {
  const copy = locale === "fr" ? importKindsFr[kind] : IMPORT_KINDS[kind];
  return { label: copy.label, description: copy.description };
}

/** Label and description of a field in a language (the key itself when unknown). */
export function fieldCopy(kind: ImportKind, key: string, locale: Locale = "en"): { label: string; description: string } {
  const fr = locale === "fr" ? importKindsFr[kind]?.fields[key] : undefined;
  if (fr) return fr;
  const field = IMPORT_KINDS[kind]?.fields.find((f) => f.key === key);
  return field ? { label: field.label, description: field.description } : { label: key, description: "" };
}

/** Field key -> label, for tables and messages. */
export function fieldLabels(kind: ImportKind, locale: Locale = "en"): Record<string, string> {
  return Object.fromEntries(IMPORT_KINDS[kind].fields.map((f) => [f.key, fieldCopy(kind, f.key, locale).label]));
}

export const KIND_ORDER: ImportKind[] = ["orders", "products", "ad_spend", "expenses"];

export function isImportKind(value: unknown): value is ImportKind {
  return typeof value === "string" && value in IMPORT_KINDS;
}

export type DuplicateStrategy = "skip" | "update";

export type ImportOptions = {
  dateFormat: "ymd" | "dmy" | "mdy";
  decimalSeparator: "." | ",";
  duplicates: DuplicateStrategy;
  /** Orders: amounts in the file include tax (VAT). */
  pricesIncludeTax: boolean;
  /** Orders: refunded amounts include tax even when prices do not (Shopify). */
  refundsIncludeTax: boolean;
  /** Orders: skip orders with a cancellation date. */
  skipCancelled: boolean;
  /** Ad spend: platform for rows without one. */
  defaultPlatform: Platform;
  /** Expenses: category for rows without one. */
  defaultCategory: ExpenseCategory;
  /** Expenses: overrides each category's usual kind for rows without one. */
  defaultKind: ExpenseKind | null;
  /** Language of the row messages (set on the server from the request when the job is created). */
  locale: Locale;
};

export const DEFAULT_OPTIONS: ImportOptions = {
  dateFormat: "ymd",
  decimalSeparator: ".",
  duplicates: "skip",
  pricesIncludeTax: false,
  refundsIncludeTax: true,
  skipCancelled: true,
  defaultPlatform: "meta",
  defaultCategory: "other",
  defaultKind: null,
  locale: "en",
};

/** Limits independent of the plan. */
export const IMPORT_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxColumns: 300,
  maxCellChars: 2000,
  chunkRows: 500,
  maxLinesPerOrder: 500,
} as const;
