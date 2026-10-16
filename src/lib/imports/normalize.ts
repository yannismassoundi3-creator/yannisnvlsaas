import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseKind, type Platform } from "@/lib/domain/types";
import { parseDecimal, rescale } from "@/lib/finance/decimal";
import { allocateProportionally, MAX_AMOUNT_MINOR, mulDivRound, parseAmountToMinor, parseUnitCostToE4 } from "@/lib/finance/money";
import { removeIncludedTax } from "@/lib/finance/tax";
import { parseDateTime, parseLocalDate } from "./dates";
import { normalizeHeader } from "./mapping";
import { IMPORT_LIMITS, type ImportKind, type ImportOptions } from "./schema";

/**
 * Row validation and normalisation, shared by the browser preview and the
 * server, which re-validates every row it receives. Rows are never silently
 * dropped and values are never invented: each problem becomes an error (row
 * held back) or a warning (row kept, decision explained).
 */

export type RowIssue = { field: string | null; message: string };
export type RawRow = { rowNumber: number; values: Record<string, string> };
export type StagedStatus = "valid" | "invalid" | "skipped";
export type NormalizedRow = {
  rowNumber: number;
  status: StagedStatus;
  data: Record<string, unknown> | null;
  raw: Record<string, string>;
  errors: RowIssue[];
  warnings: RowIssue[];
  dedupeKey: string | null;
};
export type StoreContext = { currency: string; timezone: string };

const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Collapses whitespace (including no-break spaces) and removes control characters. */
export function normalizeText(value: string | undefined): string {
  return (value ?? "").replace(CONTROL_RE, " ").replace(/[\s  ]+/g, " ").trim();
}

/** Product identity, as the database computes products.match_key. */
export function matchKey(sku: string | null, name: string): string {
  const s = normalizeText(sku ?? "");
  return (s ? s : `name:${normalizeText(name)}`).toLowerCase();
}

class Row {
  errors: RowIssue[] = [];
  warnings: RowIssue[] = [];
  constructor(
    readonly raw: RawRow,
    private readonly opts: ImportOptions,
    private readonly ctx: StoreContext,
  ) {
    for (const [key, value] of Object.entries(raw.values)) {
      if (value.length > IMPORT_LIMITS.maxCellChars) this.error(key, `This cell is longer than ${IMPORT_LIMITS.maxCellChars} characters.`);
    }
  }
  error(field: string | null, message: string) {
    this.errors.push({ field, message });
  }
  warn(field: string | null, message: string) {
    this.warnings.push({ field, message });
  }
  mapped(key: string) {
    return key in this.raw.values;
  }
  text(key: string, max: number, label: string, required = false): string | null {
    const v = normalizeText(this.raw.values[key]);
    if (!v) {
      if (required) this.error(key, `${label} is missing.`);
      return null;
    }
    if (v.length > max) {
      this.error(key, `${label} is longer than ${max} characters.`);
      return null;
    }
    return v;
  }
  /** Amount in minor units: undefined when the column is not mapped or the cell is empty. */
  amount(key: string, label: string, { required = false, positive = false } = {}): number | undefined {
    const v = (this.raw.values[key] ?? "").trim();
    if (!v) {
      if (required) this.error(key, `${label} is missing.`);
      return undefined;
    }
    const r = parseAmountToMinor(v, this.ctx.currency, { decimalSeparator: this.opts.decimalSeparator });
    if (!r.ok) {
      this.error(
        key,
        r.error === "negative_not_allowed"
          ? `${label} cannot be negative.`
          : r.error === "too_large"
            ? `${label} is too large.`
            : `${label} is not a number: "${v.slice(0, 40)}". Check the decimal separator in the import options.`,
      );
      return undefined;
    }
    if (positive && r.value === 0) {
      this.error(key, `${label} must be greater than zero.`);
      return undefined;
    }
    if (r.rounded) this.warn(key, `${label} had more decimals than ${this.ctx.currency} uses and was rounded.`);
    return r.value;
  }
  unitCost(key: string, label: string): number | undefined {
    const v = (this.raw.values[key] ?? "").trim();
    if (!v) return undefined;
    const r = parseUnitCostToE4(v, { decimalSeparator: this.opts.decimalSeparator });
    if (!r.ok) {
      this.error(key, r.error === "negative_not_allowed" ? `${label} cannot be negative.` : `${label} is not a valid amount: "${v.slice(0, 40)}".`);
      return undefined;
    }
    if (r.rounded) this.warn(key, `${label} was rounded to four decimals.`);
    return r.value;
  }
  /** Whole number; "2.00" is accepted, "2.5" is not. */
  integer(key: string, label: string, { required = false, min = 0, max = 1_000_000_000_000 } = {}): number | undefined {
    const v = (this.raw.values[key] ?? "").trim();
    if (!v) {
      if (required) this.error(key, `${label} is missing.`);
      return undefined;
    }
    const p = parseDecimal(v, this.opts.decimalSeparator);
    if (!p.ok) {
      this.error(key, `${label} is not a number: "${v.slice(0, 40)}".`);
      return undefined;
    }
    const { value, rounded } = rescale(p.value, 0);
    if (rounded) {
      this.error(key, `${label} must be a whole number.`);
      return undefined;
    }
    const n = Number(value);
    if (n < min || n > max) {
      this.error(key, min > 0 && n < min ? `${label} must be at least ${min}.` : `${label} is out of range.`);
      return undefined;
    }
    return n;
  }
  decimal2(key: string, label: string): number | undefined {
    const v = (this.raw.values[key] ?? "").trim();
    if (!v) return undefined;
    const p = parseDecimal(v, this.opts.decimalSeparator);
    if (!p.ok) {
      this.error(key, `${label} is not a number: "${v.slice(0, 40)}".`);
      return undefined;
    }
    const { value } = rescale(p.value, 2);
    if (value < 0n) {
      this.error(key, `${label} cannot be negative.`);
      return undefined;
    }
    if (value > 100_000_000_000n) {
      this.error(key, `${label} is too large.`);
      return undefined;
    }
    return Number(value) / 100;
  }
  result(status: StagedStatus, data: Record<string, unknown> | null, dedupeKey: string | null): NormalizedRow {
    const invalid = this.errors.length > 0;
    return {
      rowNumber: this.raw.rowNumber,
      status: invalid ? "invalid" : status,
      data: invalid ? null : data,
      raw: this.raw.values,
      errors: this.errors,
      warnings: this.warnings,
      dedupeKey,
    };
  }
}

// -----------------------------------------------------------------------------
// Orders: rows are grouped by order number; order-level values come from the
// first row that has them (Shopify fills them on the first line only).
// -----------------------------------------------------------------------------
const ORDER_LEVEL = ["ordered_at", "shipping_charged", "taxes", "order_discount", "shipping_cost", "transaction_fees", "refunded_amount", "refunded_at", "currency", "cancelled_at"] as const;

function normalizeOrders(rows: RawRow[], opts: ImportOptions, ctx: StoreContext): NormalizedRow[] {
  const groups = new Map<string, Row[]>();
  const out = new Map<number, NormalizedRow>();

  for (const raw of rows) {
    const row = new Row(raw, opts, ctx);
    const key = row.text("order_number", 100, "Order number", true);
    if (!key) {
      out.set(raw.rowNumber, row.result("invalid", null, null));
      continue;
    }
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  for (const [key, group] of groups) {
    for (const r of normalizeOrderGroup(key, group, opts, ctx)) out.set(r.rowNumber, r);
  }
  return rows.map((r) => out.get(r.rowNumber)!);
}

function normalizeOrderGroup(key: string, group: Row[], opts: ImportOptions, ctx: StoreContext): NormalizedRow[] {
  const first = group[0];

  // Order-level cells: first non-empty value wins; later different values are flagged.
  const source = new Map<string, Row>();
  for (const field of ORDER_LEVEL) {
    let chosen: Row | undefined;
    for (const row of group) {
      const v = normalizeText(row.raw.values[field]);
      if (!v) continue;
      if (!chosen) chosen = row;
      else if (v !== normalizeText(chosen.raw.values[field])) {
        row.warn(field, `Differs from row ${chosen.raw.rowNumber} of the same order; the value on row ${chosen.raw.rowNumber} is used.`);
      }
    }
    if (chosen) source.set(field, chosen);
  }
  const at = (field: (typeof ORDER_LEVEL)[number]) => source.get(field) ?? first;

  const cancelled = normalizeText(source.get("cancelled_at")?.raw.values.cancelled_at);
  if (cancelled && opts.skipCancelled) {
    return group.map((row) => {
      row.warnings.push({ field: "cancelled_at", message: "Cancelled order: skipped, as chosen in the import options." });
      return { rowNumber: row.raw.rowNumber, status: "skipped" as const, data: null, raw: row.raw.values, errors: [], warnings: row.warnings, dedupeKey: key };
    });
  }

  const currency = normalizeText(source.get("currency")?.raw.values.currency).toUpperCase();
  if (currency && currency !== ctx.currency.toUpperCase()) {
    at("currency").error("currency", `The order is in ${currency}, but this store uses ${ctx.currency}. Import it into a store with that currency.`);
  }

  const orderedAtRow = at("ordered_at");
  const orderedAt = (() => {
    const v = orderedAtRow.raw.values.ordered_at ?? "";
    if (!v.trim()) {
      orderedAtRow.error("ordered_at", "Order date is missing.");
      return null;
    }
    const r = parseDateTime(v, opts.dateFormat, ctx.timezone);
    if (!r.ok) {
      orderedAtRow.error("ordered_at", r.message);
      return null;
    }
    return r.instant;
  })();

  const shippingCharged = at("shipping_charged").amount("shipping_charged", "Shipping charged") ?? 0;
  const taxes = at("taxes").amount("taxes", "Taxes") ?? 0;
  const orderDiscount = at("order_discount").amount("order_discount", "Order discount");
  const shippingCost = at("shipping_cost").amount("shipping_cost", "Shipping cost");
  const fees = at("transaction_fees").amount("transaction_fees", "Payment fees");
  const refund = at("refunded_amount").amount("refunded_amount", "Refunded amount");
  let refundedAt: string | null = null;
  const refundedAtRow = source.get("refunded_at");
  if (refundedAtRow) {
    const r = parseDateTime(refundedAtRow.raw.values.refunded_at ?? "", opts.dateFormat, ctx.timezone);
    if (r.ok) refundedAt = r.instant;
    else refundedAtRow.error("refunded_at", r.message);
  }

  if (group.length > IMPORT_LIMITS.maxLinesPerOrder) {
    first.error("order_number", `This order has more than ${IMPORT_LIMITS.maxLinesPerOrder} lines, which is not supported.`);
  }

  // Lines.
  const lines = group.map((row) => {
    const name = row.text("line_name", 300, "Product name", true);
    const sku = row.text("line_sku", 100, "SKU");
    const quantity = row.integer("quantity", "Quantity", { required: true, min: 1, max: 1_000_000 });
    const unitPrice = row.amount("unit_price", "Unit price", { required: true });
    const lineDiscount = row.amount("line_discount", "Line discount");
    const unitCost = row.unitCost("unit_cost", "Unit cost");
    let gross: number | undefined;
    if (quantity !== undefined && unitPrice !== undefined) {
      gross = unitPrice * quantity;
      if (!Number.isSafeInteger(gross) || gross > MAX_AMOUNT_MINOR) {
        row.error("unit_price", "Line amount (unit price × quantity) is too large.");
        gross = undefined;
      }
    }
    return { row, name, sku, quantity, gross, lineDiscount, unitCost };
  });

  // Discounts: line discounts when provided, otherwise the order discount split by line value.
  const hasLineDiscounts = lines.some((l) => l.lineDiscount !== undefined);
  let discounts = lines.map((l) => l.lineDiscount ?? 0);
  const grossValues = lines.map((l) => l.gross ?? 0);
  if (hasLineDiscounts) {
    const lineTotal = discounts.reduce((a, b) => a + b, 0);
    if (orderDiscount !== undefined && orderDiscount !== lineTotal) {
      at("order_discount").warn(
        "order_discount",
        "The order discount differs from the sum of the line discounts; the line discounts are used, so the order discount is not counted twice.",
      );
    }
  } else if (orderDiscount && orderDiscount > 0 && lines.every((l) => l.gross !== undefined)) {
    const totalGross = grossValues.reduce((a, b) => a + b, 0);
    if (orderDiscount > totalGross) at("order_discount").error("order_discount", "The order discount is larger than the order's product sales.");
    else discounts = allocateProportionally(orderDiscount, grossValues);
  }
  lines.forEach((l, i) => {
    if (l.gross !== undefined && discounts[i] > l.gross) l.row.error("line_discount", "The discount is larger than the line amount.");
  });

  const anyErrors = group.some((row) => row.errors.length > 0);
  if (anyErrors) {
    return group.map((row) => {
      if (row.errors.length === 0) row.error(null, "Another row of this order has an error, so the whole order was held back.");
      return row.result("invalid", null, key);
    });
  }

  // Remove tax so that every stored amount excludes VAT / sales tax.
  let lineAmounts = lines.map((l, i) => ({ gross: l.gross!, discount: discounts[i] }));
  let shipping = shippingCharged;
  let refundEx = refund;
  if (opts.pricesIncludeTax) {
    const converted = removeIncludedTax({ lines: lineAmounts, orderDiscount: 0, shippingCharged, refunds: refund ? [refund] : [], taxes });
    if (!converted.ok) {
      const message =
        converted.error === "tax_exceeds_total"
          ? "Taxes are larger than the order total, so tax cannot be removed from the prices."
          : "The order total is zero or negative, so tax cannot be removed from the prices.";
      return group.map((row, i) => {
        row.error(i === 0 ? "taxes" : null, i === 0 ? message : "Another row of this order has an error, so the whole order was held back.");
        return row.result("invalid", null, key);
      });
    }
    lineAmounts = converted.order.lines;
    shipping = converted.order.shippingCharged;
    refundEx = refund ? converted.order.refunds[0] : refund;
  } else if (refund && opts.refundsIncludeTax && taxes > 0) {
    const exTaxTotal = lineAmounts.reduce((a, l) => a + l.gross - l.discount, 0) + shippingCharged;
    if (exTaxTotal > 0) refundEx = mulDivRound(refund, exTaxTotal, exTaxTotal + taxes);
  }
  const orderTotal = lineAmounts.reduce((a, l) => a + l.gross - l.discount, 0) + shipping;
  if (refundEx !== undefined && refundEx > orderTotal) {
    at("refunded_amount").warn("refunded_amount", "The refund is larger than the order total (excluding tax).");
  }
  if (refund !== undefined && refund > 0 && !refundedAt) {
    at("refunded_amount").warn("refunded_amount", "No refund date: the refund is dated to the order and marked as estimated.");
  }

  const order: Record<string, unknown> = {
    external_id: key,
    ordered_at: orderedAt,
    shipping_charged_minor: shipping,
    taxes_minor: taxes,
    converted_from_tax_inclusive: opts.pricesIncludeTax,
  };
  if (shippingCost !== undefined) order.shipping_cost_minor = shippingCost;
  if (fees !== undefined) order.transaction_fees_minor = fees;
  if (refundEx !== undefined) {
    order.refund_minor = refundEx;
    order.refunded_at = refundedAt;
  }

  return lines.map((l, i) =>
    l.row.result(
      "valid",
      {
        order,
        line: {
          name: l.name,
          sku: l.sku,
          quantity: l.quantity,
          gross_minor: lineAmounts[i].gross,
          discount_minor: lineAmounts[i].discount,
          unit_cost_e4: l.unitCost ?? null,
        },
      },
      key,
    ),
  );
}

// -----------------------------------------------------------------------------
// Products (Shopify variant rows inherit the title of their handle).
// -----------------------------------------------------------------------------
function normalizeProducts(rows: RawRow[], opts: ImportOptions, ctx: StoreContext): NormalizedRow[] {
  let lastHandle = "";
  let lastTitle = "";
  return rows.map((raw) => {
    const row = new Row(raw, opts, ctx);
    const handle = normalizeText(raw.values.handle);
    let title = normalizeText(raw.values.name);
    if (handle) {
      if (title) {
        lastHandle = handle;
        lastTitle = title;
      } else if (handle === lastHandle) {
        title = lastTitle;
      }
    }
    const options = ["option1", "option2", "option3"].map((k) => normalizeText(raw.values[k])).filter((v) => v && v.toLowerCase() !== "default title");
    const sku = row.text("sku", 100, "SKU");
    const hasVariantData = Boolean(sku || normalizeText(raw.values.price) || normalizeText(raw.values.unit_cost) || options.length);
    if (handle && !normalizeText(raw.values.name) && !hasVariantData) {
      row.warn(null, "Image or empty variant row without product data: skipped.");
      return row.result("skipped", null, null);
    }
    const name = title ? (options.length ? `${title} - ${options.join(" / ")}` : title) : "";
    if (!name) row.error("name", "Product name is missing.");
    else if (name.length > 300) row.error("name", "Product name is longer than 300 characters.");
    const unitCost = row.unitCost("unit_cost", "Unit cost");
    const price = row.amount("price", "Selling price");
    if (row.mapped("unit_cost") && unitCost === undefined && row.errors.length === 0) {
      row.warn("unit_cost", "No unit cost: margins for this product stay incomplete until you add one.");
    }
    const data: Record<string, unknown> = { name, sku };
    if (unitCost !== undefined) data.unit_cost_e4 = unitCost;
    if (price !== undefined) data.price_minor = price;
    return row.result("valid", data, name ? matchKey(sku, name) : null);
  });
}

// -----------------------------------------------------------------------------
// Advertising spend.
// -----------------------------------------------------------------------------
export function mapPlatform(value: string): Platform | null {
  const v = normalizeHeader(value);
  if (!v) return null;
  if (/facebook|meta|instagram|fb/.test(v)) return "meta";
  if (/google|adwords|youtube/.test(v)) return "google";
  if (/tiktok/.test(v)) return "tiktok";
  if (/pinterest/.test(v)) return "pinterest";
  if (/bing|microsoft/.test(v)) return "microsoft";
  return "other";
}

function normalizeAdSpend(rows: RawRow[], opts: ImportOptions, ctx: StoreContext): NormalizedRow[] {
  return rows.map((raw) => {
    const row = new Row(raw, opts, ctx);
    const campaignCell = normalizeText(raw.values.campaign);
    if (/^total\b/i.test(campaignCell)) {
      row.warn("campaign", "Summary row: skipped.");
      return row.result("skipped", null, null);
    }
    const dateCell = raw.values.date ?? "";
    const date = parseLocalDate(dateCell, opts.dateFormat);
    if (!date.ok) row.error("date", dateCell.trim() ? date.message : "Day is missing.");
    const campaign = row.text("campaign", 300, "Campaign", true);
    const campaignId = row.text("campaign_id", 120, "Campaign ID");
    let platform: Platform = opts.defaultPlatform;
    const platformCell = normalizeText(raw.values.platform);
    if (platformCell) {
      const mapped = mapPlatform(platformCell);
      if (mapped) platform = mapped;
      if (mapped === "other") row.warn("platform", `Unknown platform "${platformCell.slice(0, 40)}": recorded as Other.`);
    }
    const spend = row.amount("spend", "Spend", { required: true });
    const impressions = row.integer("impressions", "Impressions");
    const clicks = row.integer("clicks", "Clicks");
    const conversions = row.decimal2("conversions", "Conversions");
    const conversionValue = row.amount("conversion_value", "Conversion value");
    return row.result(
      "valid",
      {
        date: date.ok ? date.date : null,
        platform,
        campaign_name: campaign,
        campaign_external_id: campaignId,
        spend_minor: spend,
        impressions: impressions ?? 0,
        clicks: clicks ?? 0,
        conversions: conversions ?? 0,
        conversion_value_minor: conversionValue ?? 0,
      },
      date.ok && campaign ? `${platform}|${matchKey(campaignId, campaign)}|${date.date}` : null,
    );
  });
}

// -----------------------------------------------------------------------------
// Expenses.
// -----------------------------------------------------------------------------
const CATEGORY_WORDS: [ExpenseCategory, string[]][] = [
  ["payment_fees", ["paymentfees", "payment", "stripe", "paypal", "fraisdepaiement", "fraisbancaires", "bankfees"]],
  ["marketplace_fees", ["marketplacefees", "marketplace", "commission", "commissions", "etsy", "amazon"]],
  ["shipping", ["shipping", "carrier", "carriers", "postage", "livraison", "transport", "expedition"]],
  ["packaging", ["packaging", "packing", "boxes", "emballage", "emballages"]],
  ["fulfilment", ["fulfilment", "fulfillment", "warehouse", "warehousing", "logistics", "logistique", "entrepot"]],
  ["marketing_other", ["marketingother", "marketing", "influencer", "influencers", "sponsoring", "publicite"]],
  ["software", ["software", "saas", "subscription", "subscriptions", "apps", "logiciel", "logiciels", "abonnement", "abonnements"]],
  ["staff", ["staff", "salary", "salaries", "payroll", "contractor", "contractors", "freelance", "salaire", "salaires"]],
  ["rent", ["rent", "utilities", "loyer", "electricity", "office"]],
  ["professional_services", ["professionalservices", "accounting", "accountant", "legal", "lawyer", "comptable", "comptabilite", "consulting"]],
  ["other", ["other", "misc", "miscellaneous", "divers", "autre", "autres"]],
];

export function mapCategory(value: string): ExpenseCategory | null {
  const v = normalizeHeader(value);
  if (!v) return null;
  for (const [category, words] of CATEGORY_WORDS) {
    if (words.includes(v)) return category;
  }
  return null;
}

export function mapKind(value: string): ExpenseKind | null {
  const v = normalizeHeader(value);
  if (["fixed", "fixe", "fix", "f"].includes(v)) return "fixed";
  if (["variable", "var", "v"].includes(v)) return "variable";
  return null;
}

function normalizeExpenses(rows: RawRow[], opts: ImportOptions, ctx: StoreContext): NormalizedRow[] {
  return rows.map((raw) => {
    const row = new Row(raw, opts, ctx);
    const dateCell = raw.values.date ?? "";
    const date = parseLocalDate(dateCell, opts.dateFormat);
    if (!date.ok) row.error("date", dateCell.trim() ? date.message : "Date is missing.");
    const amount = row.amount("amount", "Amount", { required: true, positive: true });
    let category: ExpenseCategory = opts.defaultCategory;
    const categoryCell = normalizeText(raw.values.category);
    if (categoryCell) {
      const mapped = mapCategory(categoryCell);
      if (mapped) category = mapped;
      else {
        category = "other";
        row.warn("category", `Unknown category "${categoryCell.slice(0, 40)}": recorded as Other.`);
      }
    }
    let kind: ExpenseKind = opts.defaultKind ?? EXPENSE_CATEGORIES[category].defaultKind;
    const kindCell = normalizeText(raw.values.kind);
    if (kindCell) {
      const mapped = mapKind(kindCell);
      if (mapped) kind = mapped;
      else row.error("kind", `"${kindCell.slice(0, 40)}" is not "fixed" or "variable".`);
    }
    const description = row.text("description", 300, "Description");
    return row.result("valid", { incurred_on: date.ok ? date.date : null, category, kind, amount_minor: amount, description }, null);
  });
}

export function normalizeRows(kind: ImportKind, rows: RawRow[], opts: ImportOptions, ctx: StoreContext): NormalizedRow[] {
  switch (kind) {
    case "orders":
      return normalizeOrders(rows, opts, ctx);
    case "products":
      return normalizeProducts(rows, opts, ctx);
    case "ad_spend":
      return normalizeAdSpend(rows, opts, ctx);
    case "expenses":
      return normalizeExpenses(rows, opts, ctx);
  }
}
