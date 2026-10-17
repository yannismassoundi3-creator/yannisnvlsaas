import { describe, expect, it } from "vitest";
import { isResalePlatform, isReseller, PLATFORMS, SALES_CHANNELS, suggestedBusinessModel } from "@/lib/onboarding/constants";
import { bestNameMatch, daysBetween, defaultSalesChannel, itemReference, nameSimilarity, randomBase32, saleNumber, staleBefore } from "@/lib/reseller/logic";
import { itemInput, parseItem, parseSale, saleInput } from "@/lib/reseller/schema";

const fixed = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i * 7));

describe("reseller references", () => {
  it("builds sale numbers from the date and Crockford base32 characters", () => {
    expect(saleNumber("2026-10-17", fixed)).toBe("V-20261017-07ENW3");
    expect(saleNumber("2026-10-17")).toMatch(/^V-20261017-[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(() => saleNumber("2026-13-40")).toThrow();
  });

  it("never uses ambiguous letters and stays within order-number limits", () => {
    const sample = Array.from({ length: 200 }, () => randomBase32(12)).join("");
    expect(sample).not.toMatch(/[ILOU]/);
    expect(itemReference()).toMatch(/^R-[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(saleNumber("2026-10-17").length).toBeLessThanOrEqual(100);
  });

  it("gives distinct numbers to sales of the same day", () => {
    const numbers = new Set(Array.from({ length: 1000 }, () => saleNumber("2026-10-17")));
    expect(numbers.size).toBe(1000);
  });
});

describe("stock rules", () => {
  it("flags items in stock for more than 60 days", () => {
    expect(staleBefore("2026-10-17")).toBe("2026-08-18");
    expect(daysBetween("2026-08-18", "2026-10-17")).toBe(60);
    // Stale means stocked_on < staleBefore(today): 61 days and more.
    expect("2026-08-17" < staleBefore("2026-10-17")).toBe(true);
    expect("2026-08-18" < staleBefore("2026-10-17")).toBe(false);
  });

  it("counts whole days and never negative ones", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2); // across a DST change
    expect(daysBetween("2026-10-18", "2026-10-17")).toBe(0);
  });
});

describe("modes and platforms", () => {
  it("suggests the reseller mode for resale marketplaces only", () => {
    for (const p of ["vinted", "leboncoin", "ebay", "vestiaire_collective"]) expect(suggestedBusinessModel(p)).toBe("reseller");
    for (const p of ["shopify", "woocommerce", "etsy", "amazon", "other"]) expect(suggestedBusinessModel(p)).toBe("ecommerce");
    expect(isResalePlatform("vinted")).toBe(true);
    expect(isReseller({ business_model: "reseller" })).toBe(true);
    expect(isReseller({ business_model: "ecommerce" })).toBe(false);
    expect(isReseller(null)).toBe(false);
  });

  it("offers every platform as a sales channel, resale marketplaces first", () => {
    expect([...SALES_CHANNELS].sort()).toEqual([...PLATFORMS].sort());
    expect(SALES_CHANNELS.slice(0, 4)).toEqual(["vinted", "leboncoin", "ebay", "vestiaire_collective"]);
  });

  it("preselects the last platform used, else the store's platform", () => {
    expect(defaultSalesChannel("leboncoin", "vinted")).toBe("leboncoin");
    expect(defaultSalesChannel(null, "vinted")).toBe("vinted");
    expect(defaultSalesChannel("not-a-platform", "shopify")).toBe("shopify");
    expect(defaultSalesChannel(undefined, "unknown")).toBe("other");
  });
});

describe("name matching", () => {
  it("ignores case, accents and punctuation", () => {
    expect(nameSimilarity("Veste en jean Levi's taille M", "veste jean levis")).toBeGreaterThanOrEqual(0.6);
    expect(nameSimilarity("Robe été Sézane", "robe ete sezane")).toBe(1);
    expect(nameSimilarity("Pull", "Chaussures")).toBe(0);
    expect(nameSimilarity("", "Pull")).toBe(0);
  });

  it("returns the best clear match or nothing", () => {
    const stock = [
      { id: "1", name: "Veste en jean Levi's" },
      { id: "2", name: "Robe fleurie Sézane" },
    ];
    expect(bestNameMatch("Votre article Robe fleurie Sezane a été vendu", stock)?.id).toBe("2");
    expect(bestNameMatch("Sac à main", stock)).toBeNull();
    expect(bestNameMatch(null, stock)).toBeNull();
  });
});

describe("item validation", () => {
  const ctx = { locale: "fr" as const, today: "2026-10-17" };
  const parse = (input: Record<string, string>) => parseItem(itemInput.parse(input), ctx);

  it("accepts a name alone (purchase price optional)", () => {
    expect(parse({ name: "  Veste   en jean " })).toEqual({ ok: true, value: { name: "Veste en jean", unitCostE4: null, acquiredOn: null } });
  });

  it("parses French and English decimals exactly into unit costs", () => {
    expect(parse({ name: "Veste", purchasePrice: "6,50", acquiredOn: "2026-10-01" })).toEqual({ ok: true, value: { name: "Veste", unitCostE4: 65_000, acquiredOn: "2026-10-01" } });
    expect(parse({ name: "Veste", purchasePrice: "6.5" })).toMatchObject({ ok: true, value: { unitCostE4: 65_000 } });
  });

  it("rejects a missing name, a negative price and a future purchase date, in the user's language", () => {
    const r = parse({ name: " ", purchasePrice: "-2", acquiredOn: "2026-10-18" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.name).toBe("Saisissez le nom de l'article.");
      expect(r.fieldErrors.purchasePrice).toBeTruthy();
      expect(r.fieldErrors.acquiredOn).toBe("Saisissez une date valide.");
    }
  });

  it("bounds the raw input sizes", () => {
    expect(itemInput.safeParse({ name: "x".repeat(401) }).success).toBe(false);
    expect(itemInput.safeParse({ name: "ok", purchasePrice: "1".repeat(41) }).success).toBe(false);
  });
});

describe("sale validation", () => {
  const ctx = { currency: "EUR", locale: "fr" as const, today: "2026-10-17" };
  const base = { price: "18,50", channel: "vinted", date: "2026-10-17" };
  const parse = (input: Record<string, string>) => parseSale(saleInput.parse({ ...base, ...input }), ctx);
  const productId = "7f9c2b3e-1d4a-4c5b-9e8f-0a1b2c3d4e5f";

  it("records a stock item sold with a comma price", () => {
    expect(parse({ productId })).toEqual({
      ok: true,
      value: { productId, newItem: null, priceMinor: 1850, channel: "vinted", date: "2026-10-17", shippingCostMinor: null, platformFeeMinor: null },
    });
  });

  it("accepts an item not in stock yet, with its purchase price", () => {
    expect(parse({ newItemName: "Robe", newItemCost: "4,20", shippingCost: "3,5", platformFee: "0" })).toMatchObject({
      ok: true,
      value: { productId: null, newItem: { name: "Robe", unitCostE4: 42_000 }, shippingCostMinor: 350, platformFeeMinor: 0 },
    });
  });

  it("requires an item and a price", () => {
    const r = parse({ price: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.productId).toBe("Choisissez un article ou saisissez son nom.");
      expect(r.fieldErrors.price).toBe("Saisissez le prix de vente.");
    }
  });

  it("rejects invalid ids, platforms, amounts and future dates", () => {
    expect(parse({ productId: "not-a-uuid" })).toMatchObject({ ok: false, fieldErrors: { productId: expect.any(String) } });
    expect(saleInput.safeParse({ ...base, channel: "tiktok" }).success).toBe(false);
    expect(parse({ productId, price: "1e3" })).toMatchObject({ ok: false, fieldErrors: { price: expect.any(String) } });
    expect(parse({ productId, shippingCost: "-1" })).toMatchObject({ ok: false, fieldErrors: { shippingCost: expect.any(String) } });
    expect(parse({ productId, date: "2026-10-18" })).toMatchObject({ ok: false, fieldErrors: { date: expect.any(String) } });
  });

  it("allows a zero price (an item given away still leaves its cost)", () => {
    expect(parse({ productId, price: "0" })).toMatchObject({ ok: true, value: { priceMinor: 0 } });
  });

  it("answers in English for English users", () => {
    const r = parseSale(saleInput.parse({ ...base, price: "" }), { ...ctx, locale: "en" });
    expect(r).toMatchObject({ ok: false, fieldErrors: { price: "Enter the sale price." } });
  });
});
