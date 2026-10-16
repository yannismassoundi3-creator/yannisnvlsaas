import { describe, expect, it } from "vitest";
import { delta, deriveMetrics, EMPTY_TOTALS, type PeriodTotals } from "@/lib/finance/metrics";
import { orderTotalCharged, removeIncludedTax } from "@/lib/finance/tax";

describe("removeIncludedTax", () => {
  it("returns the order unchanged when there is no tax", () => {
    const order = { lines: [{ gross: 1000, discount: 0 }], orderDiscount: 0, shippingCharged: 500, refunds: [], taxes: 0 };
    expect(removeIncludedTax(order)).toEqual({ ok: true, order });
  });

  it("removes 20% VAT proportionally and keeps the exact ex-tax total", () => {
    // €120 product + €6 shipping incl. 20% VAT = €126; VAT = €21
    const result = removeIncludedTax({
      lines: [{ gross: 12000, discount: 0 }],
      orderDiscount: 0,
      shippingCharged: 600,
      refunds: [2400],
      taxes: 2100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.lines[0]).toEqual({ gross: 10000, discount: 0 });
    expect(result.order.shippingCharged).toBe(500);
    expect(result.order.refunds).toEqual([2000]);
    expect(orderTotalCharged(result.order)).toBe(12600 - 2100);
  });

  it("assigns rounding residue to the largest line", () => {
    const input = {
      lines: [
        { gross: 333, discount: 0 },
        { gross: 667, discount: 33 },
        { gross: 1001, discount: 0 },
      ],
      orderDiscount: 17,
      shippingCharged: 299,
      refunds: [],
      taxes: 377,
    };
    const result = removeIncludedTax(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(orderTotalCharged(result.order)).toBe(orderTotalCharged(input) - input.taxes);
  });

  it("keeps totals exact across many random orders", () => {
    let seed = 42;
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % max;
    };
    for (let i = 0; i < 500; i++) {
      const lines = Array.from({ length: 1 + rand(5) }, () => {
        const gross = 1 + rand(50_000);
        return { gross, discount: rand(Math.floor(gross / 3) + 1) };
      });
      const shippingCharged = rand(2000);
      const base = { lines, orderDiscount: 0, shippingCharged, refunds: [rand(1000)] };
      const total = orderTotalCharged(base);
      const taxes = rand(Math.floor(total / 4) + 1);
      const result = removeIncludedTax({ ...base, taxes });
      expect(result.ok).toBe(true);
      if (result.ok) expect(orderTotalCharged(result.order)).toBe(total - taxes);
    }
  });

  it("rejects impossible tax amounts", () => {
    expect(
      removeIncludedTax({ lines: [{ gross: 100, discount: 0 }], orderDiscount: 0, shippingCharged: 0, refunds: [], taxes: 101 }),
    ).toEqual({ ok: false, error: "tax_exceeds_total" });
    expect(
      removeIncludedTax({ lines: [{ gross: 100, discount: 100 }], orderDiscount: 0, shippingCharged: 0, refunds: [], taxes: 5 }),
    ).toEqual({ ok: false, error: "non_positive_total" });
    expect(
      removeIncludedTax({ lines: [{ gross: -100, discount: 0 }], orderDiscount: 0, shippingCharged: 0, refunds: [], taxes: 5 }),
    ).toEqual({ ok: false, error: "negative_amount" });
  });
});

function totals(overrides: Partial<PeriodTotals>): PeriodTotals {
  return { ...EMPTY_TOTALS, ...overrides };
}

describe("deriveMetrics", () => {
  const typical = totals({
    orders: 100,
    units: 180,
    grossSales: 1_000_000,
    discounts: 50_000,
    refunds: 30_000,
    shippingCharged: 40_000,
    cogs: 350_000,
    productSalesAfterDiscounts: 950_000,
    shippingCosts: 60_000,
    transactionFees: 28_000,
    adSpend: 150_000,
    otherVariableCosts: 12_000,
    fixedCosts: 80_000,
  });

  it("derives the profit waterfall", () => {
    const m = deriveMetrics(typical);
    expect(m.netSales).toBe(920_000);
    expect(m.netRevenue).toBe(960_000);
    expect(m.grossProfit).toBe(610_000);
    expect(m.variableCosts).toBe(250_000);
    expect(m.contributionMargin).toBe(360_000);
    expect(m.operatingProfit).toBe(280_000);
    expect(m.contributionBeforeAds).toBe(510_000);
    expect(m.contributionMarginRate).toBeCloseTo(0.375, 10);
    expect(m.grossMarginRate).toBeCloseTo(610_000 / 960_000, 10);
    expect(m.averageOrderValue).toBe(9_500);
    expect(m.refundRate).toBeCloseTo(0.03, 10);
    expect(m.discountRate).toBeCloseTo(0.05, 10);
    expect(m.blendedRoas).toBeCloseTo(6.4, 10);
    expect(m.adSpendRate).toBeCloseTo(0.15625, 10);
    // break-even ROAS = 1 / (510k / 960k)
    expect(m.breakEvenRoas).toBeCloseTo(960_000 / 510_000, 10);
  });

  it("never labels a missing period with fake ratios", () => {
    const m = deriveMetrics(EMPTY_TOTALS);
    expect(m.netSales).toBe(0);
    expect(m.contributionMarginRate).toBeNull();
    expect(m.averageOrderValue).toBeNull();
    expect(m.refundRate).toBeNull();
    expect(m.blendedRoas).toBeNull();
    expect(m.breakEvenRoas).toBeNull();
    expect(m.costCoverage).toBeNull();
    expect(m.completeness).toEqual({ cogs: "not_applicable", shipping: "not_applicable", fees: "not_applicable" });
  });

  it("reports incomplete cost data", () => {
    const m = deriveMetrics(totals({ ...typical, salesWithoutCost: 190_000, linesWithoutCost: 12 }));
    expect(m.costCoverage).toBeCloseTo(0.8, 10);
    expect(m.completeness.cogs).toBe("partial");

    const none = deriveMetrics(totals({ ...typical, cogs: 0, salesWithoutCost: 950_000, linesWithoutCost: 40 }));
    expect(none.completeness.cogs).toBe("missing");
  });

  it("flags estimated and missing shipping and fee data", () => {
    const m = deriveMetrics(totals({ ...typical, shippingCostsEstimated: 10_000, ordersWithoutFees: 100 }));
    expect(m.completeness.shipping).toBe("estimated");
    expect(m.completeness.fees).toBe("missing");
  });

  it("handles negative contribution and refunds larger than sales", () => {
    const m = deriveMetrics(totals({ orders: 2, grossSales: 10_000, refunds: 12_000, productSalesAfterDiscounts: 10_000, cogs: 4_000 }));
    expect(m.netSales).toBe(-2_000);
    expect(m.contributionMargin).toBe(-6_000);
    expect(m.contributionMarginRate).toBeNull(); // no positive net revenue to divide by
  });

  it("has no break-even ROAS when there is no margin before advertising", () => {
    const m = deriveMetrics(totals({ orders: 1, grossSales: 1_000, cogs: 1_200, adSpend: 100, productSalesAfterDiscounts: 1_000 }));
    expect(m.breakEvenRoas).toBeNull();
  });
});

describe("delta", () => {
  it("computes absolute and relative change", () => {
    expect(delta(120, 100)).toEqual({ current: 120, previous: 100, absolute: 20, relative: 0.2 });
    expect(delta(-50, -100)).toEqual({ current: -50, previous: -100, absolute: 50, relative: 0.5 });
  });
  it("has no relative change from zero", () => {
    expect(delta(10, 0).relative).toBeNull();
    expect(delta(null, 5).absolute).toBeNull();
  });
});

describe("KPI deltas", () => {
  it("shows a change that rounds to zero as unchanged", async () => {
    const { buildPrimaryKpis } = await import("@/lib/finance/kpis");
    const { deriveMetrics, EMPTY_TOTALS } = await import("@/lib/finance/metrics");
    const base = { ...EMPTY_TOTALS, orders: 10, grossSales: 100_000, cogs: 50_000 };
    const current = deriveMetrics({ ...base, grossSales: 100_010, cogs: 50_010 });
    const previous = deriveMetrics(base);
    const rate = buildPrimaryKpis(current, previous, "EUR").find((k) => k.key === "contributionMarginRate")!;
    expect(rate.delta).toMatchObject({ value: 0, text: "0.0 pts" });
  });
});
