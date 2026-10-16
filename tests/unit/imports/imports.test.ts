import { describe, expect, it } from "vitest";
import { detectDateOrder, parseDateTime, parseLocalDate } from "@/lib/imports/dates";
import { autoMap, detectSource, extractMapped, missingRequired, normalizeHeader } from "@/lib/imports/mapping";
import { mapCategory, mapPlatform, matchKey, normalizeRows, normalizeText, type RawRow } from "@/lib/imports/normalize";
import { DEFAULT_OPTIONS, type ImportOptions } from "@/lib/imports/schema";

const ctx = { currency: "EUR", timezone: "Europe/Paris" };
const opts = (o: Partial<ImportOptions> = {}): ImportOptions => ({ ...DEFAULT_OPTIONS, ...o });
const rows = (list: Record<string, string>[]): RawRow[] => list.map((values, i) => ({ rowNumber: i + 2, values }));

describe("header mapping", () => {
  it("normalises headers", () => {
    expect(normalizeHeader("Amount spent (EUR)")).toBe("amountspent");
    expect(normalizeHeader("﻿Coût unitaire")).toBe("coutunitaire");
    expect(normalizeHeader("Impr.")).toBe("impr");
  });

  it("maps a Shopify order export", () => {
    const headers = ["Name", "Email", "Financial Status", "Currency", "Subtotal", "Shipping", "Taxes", "Total", "Discount Code", "Discount Amount", "Created at", "Lineitem quantity", "Lineitem name", "Lineitem price", "Lineitem sku", "Refunded Amount", "Cancelled at", "Lineitem discount"];
    expect(detectSource(headers)).toBe("shopify_orders");
    const m = autoMap("orders", headers);
    expect(m).toMatchObject({
      order_number: 0,
      currency: 3,
      shipping_charged: 5,
      taxes: 6,
      order_discount: 9,
      ordered_at: 10,
      quantity: 11,
      line_name: 12,
      unit_price: 13,
      line_sku: 14,
      refunded_amount: 15,
      cancelled_at: 16,
      line_discount: 17,
    });
    expect(missingRequired("orders", m)).toEqual([]);
  });

  it("maps Meta and Google Ads reports", () => {
    const meta = ["Reporting starts", "Reporting ends", "Campaign name", "Day", "Amount spent (EUR)", "Impressions", "Link clicks", "Results", "Purchases conversion value"];
    expect(detectSource(meta)).toBe("meta_ads");
    expect(autoMap("ad_spend", meta)).toMatchObject({ date: 3, campaign: 2, spend: 4, impressions: 5, clicks: 6, conversions: 7, conversion_value: 8 });
    const google = ["Campaign", "Campaign ID", "Day", "Cost", "Impr.", "Clicks", "Conversions", "Conv. value"];
    expect(detectSource(google)).toBe("google_ads");
    expect(autoMap("ad_spend", google)).toMatchObject({ campaign: 0, campaign_id: 1, date: 2, spend: 3, impressions: 4, clicks: 5, conversions: 6, conversion_value: 7 });
  });

  it("reports missing required fields and sends only mapped cells", () => {
    const m = autoMap("expenses", ["Date", "Note"]);
    expect(missingRequired("expenses", m)).toEqual(["Amount"]);
    expect(extractMapped(["2026-03-01", "secret column"], { date: 0, amount: null })).toEqual({ date: "2026-03-01" });
  });
});

describe("dates", () => {
  it("parses Shopify timestamps with an offset exactly", () => {
    const r = parseDateTime("2026-03-15 23:30:00 +0100", "ymd", "Europe/Paris");
    expect(r).toEqual({ ok: true, instant: "2026-03-15T22:30:00.000Z", localDate: "2026-03-15", hadTime: true });
  });

  it("reads times without an offset in the store time zone, across DST", () => {
    expect(parseDateTime("2026-10-25 12:00", "ymd", "Europe/Paris")).toMatchObject({ ok: true, instant: "2026-10-25T11:00:00.000Z" });
    expect(parseDateTime("2026-10-24 12:00", "ymd", "Europe/Paris")).toMatchObject({ ok: true, instant: "2026-10-24T10:00:00.000Z" });
  });

  it("places date-only values at local noon, keeping the local day", () => {
    expect(parseDateTime("15/03/2026", "dmy", "Pacific/Auckland")).toMatchObject({ ok: true, localDate: "2026-03-15", hadTime: false });
  });

  it("honours day/month order and rejects impossible dates", () => {
    expect(parseLocalDate("03/04/2026", "dmy")).toEqual({ ok: true, date: "2026-04-03" });
    expect(parseLocalDate("03/04/2026", "mdy")).toEqual({ ok: true, date: "2026-03-04" });
    expect(parseLocalDate("31/02/2026", "dmy").ok).toBe(false);
    expect(parseLocalDate("15.03.26", "dmy")).toEqual({ ok: true, date: "2026-03-15" });
    expect(parseDateTime("03/15/2026 2:05 PM", "mdy", "UTC")).toMatchObject({ ok: true, instant: "2026-03-15T14:05:00.000Z" });
    expect(parseLocalDate("next tuesday", "ymd").ok).toBe(false);
  });

  it("detects the day/month order and flags ambiguity", () => {
    expect(detectDateOrder(["2026-03-15", "2026-03-16"])).toEqual({ order: "ymd", ambiguous: false });
    expect(detectDateOrder(["15/03/2026", "01/04/2026"])).toEqual({ order: "dmy", ambiguous: false });
    expect(detectDateOrder(["03/15/2026"])).toEqual({ order: "mdy", ambiguous: false });
    expect(detectDateOrder(["03/04/2026"])).toEqual({ order: "dmy", ambiguous: true });
  });
});

describe("orders", () => {
  const shopify = (o: Partial<ImportOptions> = {}) =>
    normalizeRows(
      "orders",
      rows([
        { order_number: "#1001", ordered_at: "2026-03-02 10:15:00 +0100", line_name: "Tote - Natural", line_sku: "TOTE-N", quantity: "2", unit_price: "24.00", shipping_charged: "4.90", taxes: "0.00", order_discount: "4.80", refunded_amount: "0.00", currency: "EUR" },
        { order_number: "#1001", ordered_at: "", line_name: "Tee", line_sku: "TEE-1", quantity: "1", unit_price: "28.80", shipping_charged: "", taxes: "", order_discount: "", refunded_amount: "", currency: "" },
      ]),
      opts(o),
      ctx,
    );

  it("groups lines and takes order-level values from the first row", () => {
    const [a, b] = shopify();
    expect(a.status).toBe("valid");
    expect(b.status).toBe("valid");
    expect(a.dedupeKey).toBe("#1001");
    expect(a.data!.order).toEqual(b.data!.order);
    expect(a.data!.order).toMatchObject({ external_id: "#1001", ordered_at: "2026-03-02T09:15:00.000Z", shipping_charged_minor: 490, taxes_minor: 0, refund_minor: 0 });
  });

  it("splits an order discount across lines by value when there are no line discounts", () => {
    const [a, b] = shopify();
    // 4.80 over 48.00 and 28.80 -> 3.00 and 1.80
    expect(a.data!.line).toMatchObject({ gross_minor: 4800, discount_minor: 300 });
    expect(b.data!.line).toMatchObject({ gross_minor: 2880, discount_minor: 180 });
  });

  it("removes included tax so stored amounts exclude VAT", () => {
    const [r] = normalizeRows(
      "orders",
      rows([{ order_number: "A-1", ordered_at: "2026-03-02", line_name: "Mug", quantity: "1", unit_price: "120.00", shipping_charged: "0", taxes: "20.00" }]),
      opts({ pricesIncludeTax: true }),
      ctx,
    );
    expect(r.data!.line).toMatchObject({ gross_minor: 10000, discount_minor: 0 });
    expect(r.data!.order).toMatchObject({ taxes_minor: 2000, converted_from_tax_inclusive: true });
  });

  it("removes tax from refunds that include it when prices do not", () => {
    const [r] = normalizeRows(
      "orders",
      rows([{ order_number: "A-2", ordered_at: "2026-03-02", line_name: "Mug", quantity: "1", unit_price: "100.00", taxes: "20.00", refunded_amount: "60.00" }]),
      opts({ pricesIncludeTax: false, refundsIncludeTax: true }),
      ctx,
    );
    expect(r.data!.order).toMatchObject({ refund_minor: 5000, refunded_at: null });
    expect(r.warnings.map((w) => w.message).join(" ")).toMatch(/marked as estimated/);
  });

  it("holds back the whole order when one line is invalid, never part of it", () => {
    const out = normalizeRows(
      "orders",
      rows([
        { order_number: "#7", ordered_at: "2026-03-02", line_name: "A", quantity: "1", unit_price: "10" },
        { order_number: "#7", ordered_at: "", line_name: "B", quantity: "zero", unit_price: "10" },
      ]),
      opts(),
      ctx,
    );
    expect(out.map((r) => r.status)).toEqual(["invalid", "invalid"]);
    expect(out[0].errors[0].message).toMatch(/Another row of this order/);
    expect(out[1].errors[0]).toMatchObject({ field: "quantity" });
  });

  it("skips cancelled orders when asked, and rejects other currencies", () => {
    const cancelled = normalizeRows("orders", rows([{ order_number: "#8", ordered_at: "2026-03-02", line_name: "A", quantity: "1", unit_price: "10", cancelled_at: "2026-03-03" }]), opts(), ctx);
    expect(cancelled[0].status).toBe("skipped");
    const usd = normalizeRows("orders", rows([{ order_number: "#9", ordered_at: "2026-03-02", line_name: "A", quantity: "1", unit_price: "10", currency: "USD" }]), opts(), ctx);
    expect(usd[0].status).toBe("invalid");
    expect(usd[0].errors[0].message).toMatch(/USD/);
  });

  it("flags conflicting order-level values instead of guessing silently", () => {
    const out = normalizeRows(
      "orders",
      rows([
        { order_number: "#10", ordered_at: "2026-03-02", line_name: "A", quantity: "1", unit_price: "10", shipping_charged: "4" },
        { order_number: "#10", ordered_at: "2026-03-02", line_name: "B", quantity: "1", unit_price: "10", shipping_charged: "5" },
      ]),
      opts(),
      ctx,
    );
    expect(out[0].data!.order).toMatchObject({ shipping_charged_minor: 400 });
    expect(out[1].warnings[0].message).toMatch(/Differs from row 2/);
  });

  it("parses comma decimals and keeps cost snapshots", () => {
    const [r] = normalizeRows(
      "orders",
      rows([{ order_number: "#11", ordered_at: "02/03/2026", line_name: "A", quantity: "3", unit_price: "1.234,50", unit_cost: "0,0450" }]),
      opts({ decimalSeparator: ",", dateFormat: "dmy" }),
      ctx,
    );
    expect(r.data!.line).toMatchObject({ gross_minor: 370350, unit_cost_e4: 450 });
  });

  it("does not include optional order columns that are absent, so updates keep existing values", () => {
    const [r] = normalizeRows("orders", rows([{ order_number: "#12", ordered_at: "2026-03-02", line_name: "A", quantity: "1", unit_price: "10" }]), opts(), ctx);
    expect(r.data!.order).not.toHaveProperty("shipping_cost_minor");
    expect(r.data!.order).not.toHaveProperty("refund_minor");
  });
});

describe("products", () => {
  it("names Shopify variants and skips image rows", () => {
    const out = normalizeRows(
      "products",
      rows([
        { handle: "tote", name: "Linen tote", sku: "TOTE-N", option1: "Natural", unit_cost: "6.80", price: "24" },
        { handle: "tote", name: "", sku: "TOTE-B", option1: "Black", unit_cost: "7.10", price: "24" },
        { handle: "tote", name: "", sku: "", option1: "", unit_cost: "", price: "" },
        { handle: "mug", name: "Mug", sku: "", option1: "Default Title", unit_cost: "", price: "12" },
      ]),
      opts(),
      ctx,
    );
    expect(out.map((r) => r.status)).toEqual(["valid", "valid", "skipped", "valid"]);
    expect(out[0].data).toMatchObject({ name: "Linen tote - Natural", sku: "TOTE-N", unit_cost_e4: 68000, price_minor: 2400 });
    expect(out[1].data).toMatchObject({ name: "Linen tote - Black" });
    expect(out[3].data).toMatchObject({ name: "Mug", sku: null });
    expect(out[3].data).not.toHaveProperty("unit_cost_e4");
    expect(out[3].warnings[0].message).toMatch(/No unit cost/);
  });

  it("matches like the database: SKU first, else the name", () => {
    expect(matchKey(" Tote-01 ", "Tote")).toBe("tote-01");
    expect(matchKey(null, "Linen  Napkins")).toBe("name:linen napkins");
    expect(normalizeText("a \tb\u0007")).toBe("a b");
  });
});

describe("ad spend and expenses", () => {
  it("normalises ad rows and skips report totals", () => {
    const out = normalizeRows(
      "ad_spend",
      rows([
        { date: "2026-03-01", campaign: "Prospecting", spend: "42,10", impressions: "8 120", clicks: "164", conversions: "3", conversion_value: "96" },
        { date: "", campaign: "Total: Account", spend: "100" },
      ]),
      opts({ decimalSeparator: ",", defaultPlatform: "meta" }),
      ctx,
    );
    expect(out[0].data).toMatchObject({ date: "2026-03-01", platform: "meta", campaign_name: "Prospecting", spend_minor: 4210, impressions: 8120, clicks: 164, conversions: 3, conversion_value_minor: 9600 });
    expect(out[1].status).toBe("skipped");
    expect(mapPlatform("Facebook Ads")).toBe("meta");
    expect(mapPlatform("AdWords")).toBe("google");
    expect(mapPlatform("Snapchat")).toBe("other");
  });

  it("maps expense categories and kinds, and rejects zero amounts", () => {
    const out = normalizeRows(
      "expenses",
      rows([
        { date: "2026-03-01", amount: "29", category: "Abonnement", kind: "" },
        { date: "2026-03-02", amount: "12.5", category: "Mystery", kind: "variable" },
        { date: "2026-03-03", amount: "0", category: "rent" },
        { date: "2026-03-04", amount: "10", kind: "sometimes" },
      ]),
      opts({ defaultCategory: "packaging" }),
      ctx,
    );
    expect(out[0].data).toMatchObject({ category: "software", kind: "fixed", amount_minor: 2900 });
    expect(out[1].data).toMatchObject({ category: "other", kind: "variable" });
    expect(out[1].warnings[0].message).toMatch(/Unknown category/);
    expect(out[2].status).toBe("invalid");
    expect(out[3].status).toBe("invalid");
    expect(mapCategory("payment_fees")).toBe("payment_fees");
  });
});
