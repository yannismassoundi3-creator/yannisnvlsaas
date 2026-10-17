import { describe, expect, it } from "vitest";
import { calculateProfitability, type CalculatorInput, validateCalculatorInput } from "@/lib/finance/calculator";
import { applyBasisPoints, lineCostMinor } from "@/lib/finance/money";

const base: CalculatorInput = {
  currency: "EUR",
  sellingPrice: 4_000, // €40.00
  quantity: 100,
  unitCostE4: 140_000, // €14.00
  discount: { kind: "percent", basisPoints: 1_000 }, // 10%
  refunds: { kind: "percent", basisPoints: 300 }, // 3%
  paymentFeeBasisPoints: 150, // 1.5%
  paymentFeeFixedPerOrder: 25,
  orders: 80,
  shippingCosts: 40_000,
  advertising: 60_000,
  otherVariableCosts: 5_000,
};

describe("calculateProfitability", () => {
  it("computes every line of the result", () => {
    const r = calculateProfitability(base);
    expect(r.grossSales).toBe(400_000);
    expect(r.discounts).toBe(40_000);
    expect(r.refunds).toBe(12_000);
    expect(r.netSales).toBe(348_000);
    expect(r.cogs).toBe(140_000);
    // 1.5% of €3,600 + €0.25 x 80
    expect(r.paymentFees).toBe(5_400 + 2_000);
    expect(r.contributionMargin).toBe(348_000 - 140_000 - 7_400 - 40_000 - 60_000 - 5_000);
    expect(r.contributionMarginRate).toBeCloseTo(95_600 / 348_000, 10);
    expect(r.contributionPerUnit).toBe(956);
    expect(r.warnings).toEqual([]);
  });

  it("finds the lowest break-even price", () => {
    const r = calculateProfitability(base);
    expect(r.breakEvenPrice.ok).toBe(true);
    if (!r.breakEvenPrice.ok) return;
    const price = r.breakEvenPrice.price;
    const at = calculateProfitability({ ...base, sellingPrice: price });
    const below = calculateProfitability({ ...base, sellingPrice: price - 1 });
    expect(at.contributionMargin).toBeGreaterThanOrEqual(0);
    expect(below.contributionMargin).toBeLessThan(0);
  });

  it("break-even is consistent across many inputs", () => {
    let seed = 7;
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % max;
    };
    for (let i = 0; i < 300; i++) {
      const input: CalculatorInput = {
        ...base,
        quantity: 1 + rand(5_000),
        unitCostE4: rand(500_000),
        discount: rand(2) ? { kind: "percent", basisPoints: rand(3_000) } : { kind: "amount", minor: rand(50_000) },
        refunds: rand(2) ? { kind: "percent", basisPoints: rand(1_500) } : { kind: "amount", minor: rand(20_000) },
        paymentFeeBasisPoints: rand(400),
        paymentFeeFixedPerOrder: rand(50),
        orders: rand(2) ? null : 1 + rand(3_000),
        shippingCosts: rand(100_000),
        advertising: rand(200_000),
        otherVariableCosts: rand(20_000),
      };
      const r = calculateProfitability(input);
      if (!r.breakEvenPrice.ok) continue;
      const p = r.breakEvenPrice.price;
      expect(calculateProfitability({ ...input, sellingPrice: p }).contributionMargin!).toBeGreaterThanOrEqual(0);
      if (p > 0) {
        expect(calculateProfitability({ ...input, sellingPrice: p - 1 }).contributionMargin!).toBeLessThan(0);
      }
    }
  });

  it("handles all-zero input", () => {
    const r = calculateProfitability({
      ...base,
      sellingPrice: 0,
      quantity: 0,
      unitCostE4: 0,
      discount: { kind: "amount", minor: 0 },
      refunds: { kind: "amount", minor: 0 },
      paymentFeeBasisPoints: 0,
      paymentFeeFixedPerOrder: 0,
      orders: null,
      shippingCosts: 0,
      advertising: 0,
      otherVariableCosts: 0,
    });
    expect(r.grossSales).toBe(0);
    expect(r.contributionMargin).toBe(0);
    expect(r.contributionMarginRate).toBeNull();
    expect(r.contributionPerUnit).toBeNull();
    expect(r.breakEvenPrice).toEqual({ ok: false, reason: "no_quantity" });
  });

  it("explains missing unit cost instead of guessing", () => {
    const r = calculateProfitability({ ...base, unitCostE4: null });
    expect(r.cogs).toBeNull();
    expect(r.contributionMargin).toBeNull();
    expect(r.breakEvenPrice).toEqual({ ok: false, reason: "missing_unit_cost" });
    expect(r.warnings).toContain("Add a unit cost to calculate contribution margin.");
  });

  it("reports when deductions consume the whole price", () => {
    const r = calculateProfitability({ ...base, discount: { kind: "percent", basisPoints: 9_000 }, refunds: { kind: "percent", basisPoints: 1_000 } });
    expect(r.breakEvenPrice).toEqual({ ok: false, reason: "deductions_exceed_price" });
  });

  it("handles refunds larger than net sales", () => {
    const r = calculateProfitability({ ...base, refunds: { kind: "amount", minor: 500_000 } });
    expect(r.netSales).toBe(400_000 - 40_000 - 500_000);
    expect(r.contributionMarginRate).toBeNull();
    expect(r.warnings).toContain("Refunds are larger than the amount paid after discounts.");
  });

  it("uses fixed amounts as given", () => {
    const r = calculateProfitability({ ...base, discount: { kind: "amount", minor: 12_345 }, refunds: { kind: "amount", minor: 0 } });
    expect(r.discounts).toBe(12_345);
    expect(r.paymentFees).toBe(applyBasisPoints(400_000 - 12_345, 150) + 25 * 80);
  });

  it("defaults orders to quantity for fixed fees", () => {
    const r = calculateProfitability({ ...base, orders: null });
    expect(r.paymentFees).toBe(applyBasisPoints(360_000, 150) + 25 * 100);
  });

  it("works with zero-decimal and three-decimal currencies", () => {
    const yen = calculateProfitability({
      ...base,
      currency: "JPY",
      sellingPrice: 3_980,
      unitCostE4: 12_345_000, // ¥1,234.5
      paymentFeeFixedPerOrder: 0,
      shippingCosts: 50_000,
      advertising: 80_000,
      otherVariableCosts: 0,
    });
    expect(yen.cogs).toBe(lineCostMinor(12_345_000, 100, "JPY"));
    expect(yen.cogs).toBe(123_450);
    expect(Number.isInteger(yen.contributionMargin)).toBe(true);

    const dinar = calculateProfitability({ ...base, currency: "KWD", sellingPrice: 12_500, unitCostE4: 45_000 });
    expect(dinar.grossSales).toBe(1_250_000);
    expect(dinar.cogs).toBe(450_000); // 4.5 KWD x 100 = 450.000
  });

  it("validates inputs", () => {
    const errors = validateCalculatorInput({
      ...base,
      sellingPrice: -1,
      quantity: 1.5,
      discount: { kind: "percent", basisPoints: 12_000 },
      paymentFeeBasisPoints: -5,
      currency: "XXQ",
    });
    expect(errors.map((e) => e.field).sort()).toEqual(["currency", "discount.value", "paymentFeeBasisPoints", "quantity", "sellingPrice"]);
    expect(() => calculateProfitability({ ...base, sellingPrice: -1 })).toThrow(RangeError);
  });

  it("returns validation messages and warnings in French", () => {
    const errors = validateCalculatorInput({ ...base, sellingPrice: -1, quantity: -2, paymentFeeBasisPoints: 20_000 }, "fr");
    expect(errors.find((e) => e.field === "sellingPrice")?.message).toBe("Le prix de vente doit être supérieur ou égal à zéro.");
    expect(errors.find((e) => e.field === "quantity")?.message).toMatch(/^La quantité doit être un nombre entier compris entre 0 et 10\s000\s000\.$/);
    expect(errors.find((e) => e.field === "paymentFeeBasisPoints")?.message).toBe("Les frais de paiement doivent être compris entre 0 % et 100 %.");
    const r = calculateProfitability({ ...base, unitCostE4: null }, "fr");
    expect(r.warnings).toContain("Ajoutez un coût unitaire pour calculer ce qui vous reste.");
    expect(validateCalculatorInput({ ...base, quantity: -2 })[0].message).toBe("Quantity must be a whole number between 0 and 10,000,000.");
  });
});
