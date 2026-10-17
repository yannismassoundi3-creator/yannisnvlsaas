import { isLocale, type Locale } from "@/i18n/config";
import { importRows } from "@/i18n/messages/imports-rows";
import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseKind, type Platform } from "@/lib/domain/types";
import { parseDecimal, rescale } from "@/lib/finance/decimal";
import { allocateProportionally, MAX_AMOUNT_MINOR, mulDivRound, parseAmountToMinor, parseUnitCostToE4 } from "@/lib/finance/money";
import { removeIncludedTax } from "@/lib/finance/tax";
import { parseDateTime, parseLocalDate } from "./dates";
import { normalizeHeader } from "./mapping";
import { fieldLabels, IMPORT_LIMITS, type ImportKind, type ImportOptions } from "./schema";

/**
 * Row validation and normalisation, shared by the browser preview and the
 * server, which re-validates every row it receives. Rows are never silently
 * dropped and values are never invented: each problem becomes an error (row
 * held back) or a warning (row kept, decision explained). Messages are written
 * in the job's language (options.locale, English by default).
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
type Messages = (typeof importRows)[Locale];

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
  private readonly t: Messages["cell"];
  constructor(
    readonly raw: RawRow,
    private readonly opts: ImportOptions,
    private readonly ctx: StoreContext,
    m: Messages,
  ) {
    this.t = m.cell;
    for (const [key, value] of Object.entries(raw.values)) {
      if (value.length > IMPORT_LIMITS.maxCellChars) this.error(key, this.t.tooLong(IMPORT_LIMITS.maxCellChars));
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
      if (required) this.error(key, this.t.missing(label));
      return null;
    }
    if (v.length > max) {
      this.error(key, this.t.longerThan(label, max));
      return null;
    }
    return v;
  }
  /** Amount in minor units: undefined when the column is not mapped or the cell is empty. */
  amount(key: string, label: string, { required = false, positive = false } = {}): number | undefined {
    const v = (this.raw.values[key] ?? "").trim();
    if (!v) {
      if (required) this.error(key, this.t.missing(label));
      return undefined;
    }
    const r = parseAmountToMinor(v, this.ctx.currency, { decimalSeparator: this.opts.decimalSeparator });
    if (!r.ok) {
      this.error(
        key,
        r.error === "negative_not_allowed"
          ? this.t.negative(label)
          : r.error === "too_large"
            ? this.t.tooLarge(label)
            : this.t.notNumberDecimal(label, v.slice(0, 40)),
      );
      return undefined;
    }
    if (positive && r.value === 0) {
      this.error(key, this.t.notPositive(label));
      return undefined;
    }
    if (r.rounded) this.warn(key, this.t.roundedCurrency(label, this.ctx.currency));
    return r.value;
  }
  unitCost(key: string, label: string): number | undefined {
    const v = (this.raw.values[key] ?? "").trim();
    if (!v) return undefined;
    const r = parseUnitCostToE4(v, { decimalSeparator: this.opts.decimalSeparator });
    if (!r.ok) {
      this.error(key, r.error === "negative_not_allowed" ? this.t.negative(label) : this.t.invalidAmount(label, v.slice(0, 40)));
      return undefined;
    }
    if (r.rounded) this.warn(key, this.t.roundedFour(label));
    return r.value;
  }
  /** Whole number; "2.00" is accepted, "2.5" is not. */
  integer(key: string, label: string, { required = false, min = 0, max = 1_000_000_000_000 } = {}): number | undefined {
    const v = (this.raw.values[key] ?? "").trim();
    if (!v) {
      if (required) this.error(key, this.t.missing(label));
      return undefined;
    }
    const p = parseDecimal(v, this.opts.decimalSeparator);
    if (!p.ok) {
      this.error(key, this.t.notNumber(label, v.slice(0, 40)));
      return undefined;
    }
    const { value, rounded } = rescale(p.value, 0);
    if (rounded) {
      this.error(key, this.t.notWhole(label));
      return undefined;
    }
    const n = Number(value);
    if (n < min || n > max) {
      this.error(key, min > 0 && n < min ? this.t.atLeast(label, min) : this.t.outOfRange(label));
      return undefined;
    }
    return n;
  }
  decimal2(key: string, label: string): number | undefined {
    const v = (this.raw.values[key] ?? "").trim();
    if (!v) return undefined;
    const p = parseDecimal(v, this.opts.decimalSeparator);
    if (!p.ok) {
      this.error(key, this.t.notNumber(label, v.slice(0, 40)));
      return undefined;
    }
    const { value } = rescale(p.value, 2);
    if (value < 0n) {
      this.error(key, this.t.negative(label));
      return undefined;
    }
    if (value > 100_000_000_000n) {
      this.error(key, this.t.tooLarge(label));
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

function normalizeOrders(rows: RawRow[], opts: ImportOptions, ctx: StoreContext, m: Messages, label: Record<string, string>): NormalizedRow[] {
  const groups = new Map<string, Row[]>();
  const out = new Map<number, NormalizedRow>();

  for (const raw of rows) {
    const row = new Row(raw, opts, ctx, m);
    const key = row.text("order_number", 100, label.order_number, true);
    if (!key) {
      out.set(raw.rowNumber, row.result("invalid", null, null));
      continue;
    }
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  for (const [key, group] of groups) {
    for (const r of normalizeOrderGroup(key, group, opts, ctx, m, label)) out.set(r.rowNumber, r);
  }
  return rows.map((r) => out.get(r.rowNumber)!);
}

function normalizeOrderGroup(key: string, group: Row[], opts: ImportOptions, ctx: StoreContext, m: Messages, label: Record<string, string>): NormalizedRow[] {
  const first = group[0];
  const t = m.orders;

  // Order-level cells: first non-empty value wins; later different values are flagged.
  const source = new Map<string, Row>();
  for (const field of ORDER_LEVEL) {
    let chosen: Row | undefined;
    for (const row of group) {
      const v = normalizeText(row.raw.values[field]);
      if (!v) continue;
      if (!chosen) chosen = row;
      else if (v !== normalizeText(chosen.raw.values[field])) {
        row.warn(field, t.differs(chosen.raw.rowNumber));
      }
    }
    if (chosen) source.set(field, chosen);
  }
  const at = (field: (typeof ORDER_LEVEL)[number]) => source.get(field) ?? first;

  const cancelled = normalizeText(source.get("cancelled_at")?.raw.values.cancelled_at);
  if (cancelled && opts.skipCancelled) {
    return group.map((row) => {
      row.warnings.push({ field: "cancelled_at", message: t.cancelled });
      return { rowNumber: row.raw.rowNumber, status: "skipped" as const, data: null, raw: row.raw.values, errors: [], warnings: row.warnings, dedupeKey: key };
    });
  }

  const currency = normalizeText(source.get("currency")?.raw.values.currency).toUpperCase();
  if (currency && currency !== ctx.currency.toUpperCase()) {
    at("currency").error("currency", t.otherCurrency(currency, ctx.currency));
  }

  const orderedAtRow = at("ordered_at");
  const orderedAt = (() => {
    const v = orderedAtRow.raw.values.ordered_at ?? "";
    if (!v.trim()) {
      orderedAtRow.error("ordered_at", m.cell.missing(label.ordered_at));
      return null;
    }
    const r = parseDateTime(v, opts.dateFormat, ctx.timezone, opts.locale);
    if (!r.ok) {
      orderedAtRow.error("ordered_at", r.message);
      return null;
    }
    return r.instant;
  })();

  const shippingCharged = at("shipping_charged").amount("shipping_charged", label.shipping_charged) ?? 0;
  const taxes = at("taxes").amount("taxes", label.taxes) ?? 0;
  const orderDiscount = at("order_discount").amount("order_discount", label.order_discount);
  const shippingCost = at("shipping_cost").amount("shipping_cost", label.shipping_cost);
  const fees = at("transaction_fees").amount("transaction_fees", label.transaction_fees);
  const refund = at("refunded_amount").amount("refunded_amount", label.refunded_amount);
  let refundedAt: string | null = null;
  const refundedAtRow = source.get("refunded_at");
  if (refundedAtRow) {
    const r = parseDateTime(refundedAtRow.raw.values.refunded_at ?? "", opts.dateFormat, ctx.timezone, opts.locale);
    if (r.ok) refundedAt = r.instant;
    else refundedAtRow.error("refunded_at", r.message);
  }

  if (group.length > IMPORT_LIMITS.maxLinesPerOrder) {
    first.error("order_number", t.tooManyLines(IMPORT_LIMITS.maxLinesPerOrder));
  }

  // Lines.
  const lines = group.map((row) => {
    const name = row.text("line_name", 300, label.line_name, true);
    const sku = row.text("line_sku", 100, label.line_sku);
    const quantity = row.integer("quantity", label.quantity, { required: true, min: 1, max: 1_000_000 });
    const unitPrice = row.amount("unit_price", label.unit_price, { required: true });
    const lineDiscount = row.amount("line_discount", label.line_discount);
    const unitCost = row.unitCost("unit_cost", label.unit_cost);
    let gross: number | undefined;
    if (quantity !== undefined && unitPrice !== undefined) {
      gross = unitPrice * quantity;
      if (!Number.isSafeInteger(gross) || gross > MAX_AMOUNT_MINOR) {
        row.error("unit_price", t.lineTooLarge);
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
      at("order_discount").warn("order_discount", t.discountMismatch);
    }
  } else if (orderDiscount && orderDiscount > 0 && lines.every((l) => l.gross !== undefined)) {
    const totalGross = grossValues.reduce((a, b) => a + b, 0);
    if (orderDiscount > totalGross) at("order_discount").error("order_discount", t.discountTooLarge);
    else discounts = allocateProportionally(orderDiscount, grossValues);
  }
  lines.forEach((l, i) => {
    if (l.gross !== undefined && discounts[i] > l.gross) l.row.error("line_discount", t.lineDiscountTooLarge);
  });

  const anyErrors = group.some((row) => row.errors.length > 0);
  if (anyErrors) {
    return group.map((row) => {
      if (row.errors.length === 0) row.error(null, t.heldBack);
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
      const message = converted.error === "tax_exceeds_total" ? t.taxExceedsTotal : t.totalNotPositive;
      return group.map((row, i) => {
        row.error(i === 0 ? "taxes" : null, i === 0 ? message : t.heldBack);
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
    at("refunded_amount").warn("refunded_amount", t.refundTooLarge);
  }
  if (refund !== undefined && refund > 0 && !refundedAt) {
    at("refunded_amount").warn("refunded_amount", t.noRefundDate);
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
function normalizeProducts(rows: RawRow[], opts: ImportOptions, ctx: StoreContext, m: Messages, label: Record<string, string>): NormalizedRow[] {
  let lastHandle = "";
  let lastTitle = "";
  return rows.map((raw) => {
    const row = new Row(raw, opts, ctx, m);
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
    const sku = row.text("sku", 100, label.sku);
    const hasVariantData = Boolean(sku || normalizeText(raw.values.price) || normalizeText(raw.values.unit_cost) || options.length);
    if (handle && !normalizeText(raw.values.name) && !hasVariantData) {
      row.warn(null, m.products.emptyVariant);
      return row.result("skipped", null, null);
    }
    const name = title ? (options.length ? `${title} - ${options.join(" / ")}` : title) : "";
    if (!name) row.error("name", m.cell.missing(label.name));
    else if (name.length > 300) row.error("name", m.cell.longerThan(label.name, 300));
    const unitCost = row.unitCost("unit_cost", label.unit_cost);
    const price = row.amount("price", label.price);
    if (row.mapped("unit_cost") && unitCost === undefined && row.errors.length === 0) {
      row.warn("unit_cost", m.products.noUnitCost);
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

function normalizeAdSpend(rows: RawRow[], opts: ImportOptions, ctx: StoreContext, m: Messages, label: Record<string, string>): NormalizedRow[] {
  return rows.map((raw) => {
    const row = new Row(raw, opts, ctx, m);
    const campaignCell = normalizeText(raw.values.campaign);
    if (/^total\b/i.test(campaignCell)) {
      row.warn("campaign", m.adSpend.summary);
      return row.result("skipped", null, null);
    }
    const dateCell = raw.values.date ?? "";
    const date = parseLocalDate(dateCell, opts.dateFormat, opts.locale);
    if (!date.ok) row.error("date", dateCell.trim() ? date.message : m.cell.missing(label.date));
    const campaign = row.text("campaign", 300, label.campaign, true);
    const campaignId = row.text("campaign_id", 120, label.campaign_id);
    let platform: Platform = opts.defaultPlatform;
    const platformCell = normalizeText(raw.values.platform);
    if (platformCell) {
      const mapped = mapPlatform(platformCell);
      if (mapped) platform = mapped;
      if (mapped === "other") row.warn("platform", m.adSpend.unknownPlatform(platformCell.slice(0, 40)));
    }
    const spend = row.amount("spend", label.spend, { required: true });
    const impressions = row.integer("impressions", label.impressions);
    const clicks = row.integer("clicks", label.clicks);
    const conversions = row.decimal2("conversions", label.conversions);
    const conversionValue = row.amount("conversion_value", label.conversion_value);
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

/** "fixed" / "variable", in English or French ("fixe", "frais fixes", "variables"). */
export function mapKind(value: string): ExpenseKind | null {
  const v = normalizeHeader(value);
  if (["fixed", "fixe", "fixes", "fix", "f", "fraisfixe", "fraisfixes", "coutfixe", "coutsfixes"].includes(v)) return "fixed";
  if (["variable", "variables", "var", "v", "fraisvariable", "fraisvariables", "coutvariable", "coutsvariables"].includes(v)) return "variable";
  return null;
}

function normalizeExpenses(rows: RawRow[], opts: ImportOptions, ctx: StoreContext, m: Messages, label: Record<string, string>): NormalizedRow[] {
  return rows.map((raw) => {
    const row = new Row(raw, opts, ctx, m);
    const dateCell = raw.values.date ?? "";
    const date = parseLocalDate(dateCell, opts.dateFormat, opts.locale);
    if (!date.ok) row.error("date", dateCell.trim() ? date.message : m.cell.missing(label.date));
    const amount = row.amount("amount", label.amount, { required: true, positive: true });
    let category: ExpenseCategory = opts.defaultCategory;
    const categoryCell = normalizeText(raw.values.category);
    if (categoryCell) {
      const mapped = mapCategory(categoryCell);
      if (mapped) category = mapped;
      else {
        category = "other";
        row.warn("category", m.expenses.unknownCategory(categoryCell.slice(0, 40)));
      }
    }
    let kind: ExpenseKind = opts.defaultKind ?? EXPENSE_CATEGORIES[category].defaultKind;
    const kindCell = normalizeText(raw.values.kind);
    if (kindCell) {
      const mapped = mapKind(kindCell);
      if (mapped) kind = mapped;
      else row.error("kind", m.expenses.badKind(kindCell.slice(0, 40)));
    }
    const description = row.text("description", 300, label.description);
    return row.result("valid", { incurred_on: date.ok ? date.date : null, category, kind, amount_minor: amount, description }, null);
  });
}

/**
 * Validates and normalises rows. Messages are written in `locale`, which
 * defaults to the language stored in the options (English when absent).
 */
export function normalizeRows(kind: ImportKind, rows: RawRow[], opts: ImportOptions, ctx: StoreContext, locale: Locale = opts.locale ?? "en"): NormalizedRow[] {
  const lang: Locale = isLocale(locale) ? locale : "en";
  const o: ImportOptions = { ...opts, locale: lang };
  const m = importRows[lang];
  const label = fieldLabels(kind, lang);
  switch (kind) {
    case "orders":
      return normalizeOrders(rows, o, ctx, m, label);
    case "products":
      return normalizeProducts(rows, o, ctx, m, label);
    case "ad_spend":
      return normalizeAdSpend(rows, o, ctx, m, label);
    case "expenses":
      return normalizeExpenses(rows, o, ctx, m, label);
  }
}
