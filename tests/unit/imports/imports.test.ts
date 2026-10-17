import { describe, expect, it } from "vitest";
import { detectDecimalSeparator } from "@/lib/finance/decimal";
import { detectDateOrder, parseDateTime, parseLocalDate } from "@/lib/imports/dates";
import { autoMap, detectSource, extractMapped, missingRequired, normalizeHeader, sourceLabel } from "@/lib/imports/mapping";
import { mapCategory, mapKind, mapPlatform, matchKey, normalizeRows, normalizeText, type NormalizedRow, type RawRow } from "@/lib/imports/normalize";
import { parseCsvText, uniqueHeaders } from "@/lib/imports/parse-file";
import { DEFAULT_OPTIONS, fieldCopy, IMPORT_KINDS, KIND_ORDER, kindCopy, templateFile, type ImportKind, type ImportOptions } from "@/lib/imports/schema";

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

  it("stores amounts as collected when no tax is charged, whatever the tax setting", () => {
    // Sellers who charge no VAT ("I don't charge VAT" at onboarding): net equals the price collected.
    const order = rows([{ order_number: "A-3", ordered_at: "2026-03-02", line_name: "Vase", quantity: "2", unit_price: "12.50", shipping_charged: "4.90" }]);
    const [included] = normalizeRows("orders", order, opts({ pricesIncludeTax: true }), ctx);
    const [excluded] = normalizeRows("orders", order, opts({ pricesIncludeTax: false }), ctx);
    expect(excluded.data!.line).toMatchObject({ gross_minor: 2500, discount_minor: 0 });
    expect(excluded.data!.order).toMatchObject({ shipping_charged_minor: 490, taxes_minor: 0 });
    expect(included.data!.line).toEqual(excluded.data!.line);
    expect({ ...(included.data!.order as Record<string, unknown>), converted_from_tax_inclusive: false }).toEqual(excluded.data!.order);
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

describe("messages in the interface language", () => {
  it("keeps English by default and the exact wording the interface relies on", () => {
    const [r] = normalizeRows("orders", rows([{ order_number: "#1", ordered_at: "2026-03-02", line_name: "A", quantity: "two", unit_price: "10" }]), opts(), ctx);
    expect(r.errors[0].message).toBe('Quantity is not a number: "two".');
    expect(DEFAULT_OPTIONS.locale).toBe("en");
  });

  it("writes row errors and warnings in French when the options say so", () => {
    const out = normalizeRows(
      "orders",
      rows([
        { order_number: "#1", ordered_at: "2026-03-02", line_name: "A", quantity: "two", unit_price: "10" },
        { order_number: "#2", ordered_at: "31/02/2026", line_name: "B", quantity: "1", unit_price: "10" },
        { order_number: "#3", ordered_at: "2026-03-02", line_name: "C", quantity: "1", unit_price: "10", refunded_amount: "5" },
      ]),
      opts({ locale: "fr" }),
      ctx,
    );
    expect(out[0].errors[0].message).toBe("Quantité : « two » n'est pas un nombre.");
    expect(out[1].errors[0].message).toMatch(/^Cette date n'existe pas/);
    expect(out[2].warnings[0].message).toMatch(/^Pas de date de remboursement/);
  });

  it("lets an explicit locale override the options", () => {
    const [r] = normalizeRows("expenses", rows([{ date: "", amount: "10" }]), opts({ locale: "en" }), ctx, "fr");
    expect(r.errors[0].message).toBe("Date : valeur manquante.");
    const [e] = normalizeRows("expenses", rows([{ date: "", amount: "10" }]), opts(), ctx);
    expect(e.errors[0].message).toBe("Date is missing.");
  });

  it("parses dates with French messages", () => {
    expect(parseLocalDate("", "ymd", "fr")).toEqual({ ok: false, message: "Saisissez une date." });
    expect(parseDateTime("31/02/2026", "dmy", "UTC", "fr")).toMatchObject({ ok: false, message: expect.stringMatching(/^Cette date n'existe pas/) });
  });

  it("reports file problems, missing fields and recognised exports in French", () => {
    expect(parseCsvText("Order number\n", "orders", 100, "fr")).toEqual({ ok: false, message: "Le fichier contient des noms de colonnes mais aucune ligne de données." });
    expect(uniqueHeaders(["", "a"], "fr")).toEqual(["Colonne 1", "a"]);
    expect(missingRequired("expenses", autoMap("expenses", ["Date"]), "fr")).toEqual(["Montant"]);
    expect(sourceLabel("shopify_orders")).toBe("Shopify order export");
    expect(sourceLabel("shopify_orders", "fr")).toBe("Export de commandes Shopify");
  });

  it("has French copy for every import kind and field", () => {
    for (const kind of KIND_ORDER) {
      expect(kindCopy(kind, "fr").label).not.toBe(IMPORT_KINDS[kind].label);
      for (const field of IMPORT_KINDS[kind].fields) {
        const fr = fieldCopy(kind, field.key, "fr");
        expect(fr.label, `${kind}.${field.key}`).toBeTruthy();
        expect(Boolean(fr.description), `${kind}.${field.key}`).toBe(Boolean(field.description));
        expect(fieldCopy(kind, field.key)).toEqual({ label: field.label, description: field.description });
      }
    }
  });
});

describe("French headers and templates", () => {
  it("maps French headers, including selling price and the expense type", () => {
    expect(autoMap("products", ["Nom", "Référence", "Prix d'achat", "Prix de vente"])).toEqual({
      name: 0,
      sku: 1,
      unit_cost: 2,
      price: 3,
      handle: null,
      option1: null,
      option2: null,
      option3: null,
    });
    expect(autoMap("products", ["Nom du produit", "Prix de vente (TTC)"])).toMatchObject({ name: 0, price: 1 });
    expect(autoMap("expenses", ["Date", "Catégorie", "Type", "Montant", "Description"])).toEqual({ date: 0, category: 1, kind: 2, amount: 3, description: 4 });
    // A lone "Type" column is still read as the category, as before.
    expect(autoMap("expenses", ["Date", "Type", "Montant"])).toMatchObject({ category: 1, kind: null, amount: 2 });
    expect(autoMap("expenses", ["Date", "Fixed or variable", "Amount"])).toMatchObject({ kind: 1 });
    expect(autoMap("ad_spend", ["Jour", "Campagne", "ID de campagne", "Plateforme", "Dépense", "Clics", "Valeur de conversion"])).toMatchObject({
      date: 0,
      campaign: 1,
      campaign_id: 2,
      platform: 3,
      spend: 4,
      clicks: 5,
      conversion_value: 6,
    });
  });

  it("accepts the expense kind in English and French", () => {
    expect(mapKind("fixed")).toBe("fixed");
    expect(mapKind("fixe")).toBe("fixed");
    expect(mapKind("Fixes")).toBe("fixed");
    expect(mapKind("Frais fixes")).toBe("fixed");
    expect(mapKind("variable")).toBe("variable");
    expect(mapKind("Variables")).toBe("variable");
    expect(mapKind("parfois")).toBeNull();
    const [r] = normalizeRows("expenses", rows([{ date: "15/03/2026", amount: "29,00", category: "logiciel", kind: "fixe" }]), opts({ decimalSeparator: ",", dateFormat: "dmy" }), ctx);
    expect(r.status).toBe("valid");
    expect(r.data).toMatchObject({ incurred_on: "2026-03-15", category: "software", kind: "fixed", amount_minor: 2900 });
  });

  it("maps every template column automatically, to the same field in both languages", () => {
    for (const kind of KIND_ORDER) {
      for (const template of [IMPORT_KINDS[kind].template, IMPORT_KINDS[kind].templateFr]) {
        const header = template[0];
        const mapping = autoMap(kind, header);
        const columns = Object.values(mapping)
          .filter((c): c is number => c !== null)
          .sort((a, b) => a - b);
        expect(columns, `${kind}: ${header.join(" | ")}`).toEqual(header.map((_, i) => i));
        expect(missingRequired(kind, mapping)).toEqual([]);
        expect(template.slice(1).every((row) => row.length === header.length)).toBe(true);
      }
      expect(autoMap(kind, IMPORT_KINDS[kind].templateFr[0])).toEqual(autoMap(kind, IMPORT_KINDS[kind].template[0]));
    }
  });

  it("writes French templates for Excel: BOM, semicolons, decimal commas, CRLF", () => {
    const fr = templateFile("expenses", "fr");
    expect(fr.fileName).toBe("narixia-modele-depenses.csv");
    expect(fr.csv).toBe(
      "\uFEFFDate;Catégorie;Type;Montant;Description\r\n15/03/2026;logiciel;fixe;29,00;Outil d'e-mailing\r\n18/03/2026;emballage;variable;86,40;Cartons d'expédition, 200 pièces\r\n",
    );
    expect(templateFile("products", "fr").csv.split("\r\n")[0]).toBe("\uFEFFNom;Référence;Prix d'achat;Prix de vente");
    expect(templateFile("orders", "fr").fileName).toBe("narixia-modele-commandes.csv");
    expect(templateFile("ad_spend", "fr").fileName).toBe("narixia-modele-depenses-publicitaires.csv");

    const en = templateFile("expenses");
    expect(en.fileName).toBe("narixia-expenses-template.csv");
    expect(en.csv.split("\r\n")[0]).toBe("\uFEFFDate,Category,Fixed or variable,Amount,Description");
    expect(en.csv).toContain('"Mailer boxes, 200 pcs"');
    expect(en.csv.endsWith("\r\n")).toBe(true);
  });

  it("reads the French templates back without any manual setting", () => {
    const dateFields: Record<ImportKind, string[]> = { orders: ["ordered_at", "refunded_at"], products: [], ad_spend: ["date"], expenses: ["date"] };
    const amountFields: Record<ImportKind, string[]> = {
      orders: ["unit_price", "line_discount", "shipping_charged", "taxes", "shipping_cost", "transaction_fees", "refunded_amount"],
      products: ["unit_cost", "price"],
      ad_spend: ["spend", "conversion_value"],
      expenses: ["amount"],
    };
    const read = (kind: ImportKind): NormalizedRow[] => {
      const parsed = parseCsvText(templateFile(kind, "fr").csv, kind, 100, "fr");
      if (!parsed.ok) throw new Error(parsed.message);
      expect(parsed.csv.delimiter).toBe(";");
      const mapping = autoMap(kind, parsed.csv.headers);
      const samples = (fields: string[]) =>
        fields.flatMap((f) => {
          const column = mapping[f];
          return column === null || column === undefined ? [] : parsed.csv.rows.map((r) => r.cells[column] ?? "");
        });
      const dates = detectDateOrder(samples(dateFields[kind]));
      expect(dates.ambiguous).toBe(false);
      const options = opts({ dateFormat: dates.order, decimalSeparator: detectDecimalSeparator(samples(amountFields[kind])), locale: "fr" });
      const out = normalizeRows(kind, parsed.csv.rows.map((r) => ({ rowNumber: r.rowNumber, values: extractMapped(r.cells, mapping) })), options, ctx);
      for (const row of out) expect(row.errors, `${kind} row ${row.rowNumber}`).toEqual([]);
      expect(out.every((row) => row.status === "valid")).toBe(true);
      return out;
    };

    const orders = read("orders");
    expect(orders[0].data!.order).toMatchObject({ external_id: "#1001", ordered_at: "2026-03-14T09:15:00.000Z", shipping_charged_minor: 490 });
    expect(orders[0].data!.line).toMatchObject({ name: "Tote bag en lin", sku: "TOTE-01", quantity: 2, gross_minor: 4800 });
    expect(orders[1].data!.line).toMatchObject({ gross_minor: 2900, discount_minor: 290 });

    const products = read("products");
    expect(products[0].data).toMatchObject({ name: "Tote bag en lin", sku: "TOTE-01", unit_cost_e4: 68000, price_minor: 2400 });
    expect(products[1].data).toMatchObject({ unit_cost_e4: 94500 });

    const ads = read("ad_spend");
    expect(ads[0].data).toMatchObject({ date: "2026-03-15", platform: "meta", campaign_name: "Prospection – audiences larges", spend_minor: 4210, impressions: 8120, conversion_value_minor: 9600 });
    expect(ads[1].data).toMatchObject({ platform: "google", conversion_value_minor: 14150 });

    const expenses = read("expenses");
    expect(expenses[0].data).toMatchObject({ incurred_on: "2026-03-15", category: "software", kind: "fixed", amount_minor: 2900 });
    expect(expenses[1].data).toMatchObject({ category: "packaging", kind: "variable", amount_minor: 8640, description: "Cartons d'expédition, 200 pièces" });
  });
});
