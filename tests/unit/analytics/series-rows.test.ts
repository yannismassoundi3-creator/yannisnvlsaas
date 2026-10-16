import { describe, expect, it } from "vitest";
import { campaignRowFromSql, dailyTotalsFromSql, productRowFromSql, totalsFromSql, unallocatedFromSql } from "@/lib/analytics/rows";
import { buildTimeSeries, granularityFor } from "@/lib/analytics/series";
import { eachDay } from "@/lib/dates";
import { EMPTY_TOTALS, type PeriodTotals } from "@/lib/finance/metrics";

const day = (overrides: Partial<PeriodTotals> = {}): PeriodTotals => ({ ...EMPTY_TOTALS, ...overrides });

describe("buildTimeSeries", () => {
  it("uses daily buckets for short ranges and never marks them partial", () => {
    const range = { from: "2026-10-01", to: "2026-10-07" };
    const series = buildTimeSeries(eachDay(range).map((d) => [d, day({ grossSales: 100, orders: 1 })]), range);
    expect(series.granularity).toBe("day");
    expect(series.points).toHaveLength(7);
    expect(series.points.every((p) => !p.partial && p.from === p.key && p.to === p.key)).toBe(true);
  });

  it("clips weekly buckets to the range and flags the partial edges", () => {
    // 19 Jul 2026 is a Sunday; 16 Oct 2026 is a Friday.
    const range = { from: "2026-07-19", to: "2026-10-16" };
    expect(granularityFor(range)).toBe("week");
    const series = buildTimeSeries(eachDay(range).map((d) => [d, day({ grossSales: 1000, orders: 1 })]), range);
    const first = series.points[0];
    const last = series.points.at(-1)!;
    expect(first).toMatchObject({ key: "2026-07-13", from: "2026-07-19", to: "2026-07-19", partial: true, netSales: 1000 });
    expect(last).toMatchObject({ key: "2026-10-12", from: "2026-10-12", to: "2026-10-16", partial: true, netSales: 5000 });
    expect(series.points.slice(1, -1).every((p) => !p.partial && p.netSales === 7000)).toBe(true);
  });

  it("never borrows days from outside the range", () => {
    const range = { from: "2026-10-05", to: "2026-10-06" };
    const series = buildTimeSeries(
      [
        ["2026-10-04", day({ grossSales: 999 })],
        ["2026-10-05", day({ grossSales: 10 })],
        ["2026-10-06", day({ grossSales: 20 })],
        ["2026-10-07", day({ grossSales: 999 })],
      ],
      range,
    );
    expect(series.points.map((p) => p.netSales)).toEqual([10, 20]);
  });

  it("derives contribution margin per bucket with the shared formulas", () => {
    const range = { from: "2026-10-05", to: "2026-10-05" };
    const series = buildTimeSeries(
      [["2026-10-05", day({ grossSales: 10_000, discounts: 500, refunds: 1_000, shippingCharged: 600, cogs: 3_000, shippingCosts: 700, transactionFees: 300, adSpend: 1_200, otherVariableCosts: 100 })]],
      range,
    );
    // Net sales 8,500; net revenue 9,100; CM = 9,100 − 3,000 − 700 − 300 − 1,200 − 100 = 3,800
    expect(series.points[0]).toMatchObject({ netSales: 8_500, netRevenue: 9_100, contributionMargin: 3_800, adSpendRate: 1_200 / 9_100 });
  });
});

describe("SQL row mapping", () => {
  const sqlDay = {
    day: "2026-10-05",
    orders: 3,
    units: 5,
    gross_sales: 12_000,
    discounts: 1_000,
    refunds: 0,
    shipping_charged: 900,
    cogs: 4_000,
    product_sales_after_discounts: 11_000,
    sales_without_cost: 2_000,
    lines_without_cost: 1,
    shipping_costs: 1_500,
    shipping_costs_estimated: 550,
    orders_without_shipping_cost: 0,
    transaction_fees: 420,
    transaction_fees_estimated: 420,
    orders_without_fees: 0,
    ad_spend: 800,
    other_variable_costs: 0,
    fixed_costs: 2_900,
  };

  it("maps daily totals field by field", () => {
    expect(totalsFromSql(sqlDay)).toEqual({
      orders: 3,
      units: 5,
      grossSales: 12_000,
      discounts: 1_000,
      refunds: 0,
      shippingCharged: 900,
      cogs: 4_000,
      productSalesAfterDiscounts: 11_000,
      salesWithoutCost: 2_000,
      linesWithoutCost: 1,
      shippingCosts: 1_500,
      shippingCostsEstimated: 550,
      ordersWithoutShippingCost: 0,
      transactionFees: 420,
      transactionFeesEstimated: 420,
      ordersWithoutFees: 0,
      adSpend: 800,
      otherVariableCosts: 0,
      fixedCosts: 2_900,
    });
    expect([...dailyTotalsFromSql([sqlDay]).keys()]).toEqual(["2026-10-05"]);
  });

  it("accepts numbers serialised as strings", () => {
    const asStrings = Object.fromEntries(Object.entries(sqlDay).map(([k, v]) => [k, String(v)])) as unknown as typeof sqlDay;
    expect(totalsFromSql(asStrings).grossSales).toBe(12_000);
  });

  it("keeps product COGS and margin unknown when a sold line has no cost", () => {
    const base = {
      product_id: "p1",
      sku: "MUG",
      name: "Mug",
      unit_cost_e4: null as unknown as number,
      archived: false,
      units: 2,
      gross_sales: 3_000,
      discounts: 0,
      refunds: 0,
      shipping_charged: 0,
      cogs: null as unknown as number,
      lines_without_cost: 1,
      shipping_costs: 200,
      transaction_fees: 100,
      ad_spend: 0,
    };
    const unknownCost = productRowFromSql(base);
    expect(unknownCost.cogs).toBeNull();
    expect(unknownCost.contributionMargin).toBeNull();
    expect(unknownCost.netRevenue).toBe(3_000);

    const known = productRowFromSql({ ...base, unit_cost_e4: 5_000_000, cogs: 1_000, lines_without_cost: 0 });
    expect(known.contributionMargin).toBe(3_000 - 1_000 - 200 - 100);
    expect(known.contributionMarginRate).toBeCloseTo(1_700 / 3_000);
  });

  it("computes platform ROAS only when there is spend", () => {
    const row = { campaign_id: "c1", platform: "meta", name: "Prospecting", product_id: null as unknown as string, spend: 0, impressions: 10, clicks: 1, conversions: 0, conversion_value: 500 };
    expect(campaignRowFromSql(row).platformRoas).toBeNull();
    expect(campaignRowFromSql({ ...row, spend: 250 }).platformRoas).toBe(2);
    expect(campaignRowFromSql(row).productId).toBeNull();
  });

  it("treats a missing unallocated row as zero", () => {
    expect(unallocatedFromSql(undefined)).toEqual({ adSpend: 0, refunds: 0, variableExpenses: 0 });
  });
});

describe("bucketDailyValues", () => {
  it("fills empty days with zero and sums keys per bucket", async () => {
    const { bucketDailyValues } = await import("@/lib/analytics/series");
    const range = { from: "2026-10-01", to: "2026-10-03" };
    const out = bucketDailyValues([{ day: "2026-10-02", values: { meta: 500, google: 100 } }, { day: "2026-10-09", values: { meta: 999 } }], ["meta", "google"] as const, range);
    expect(out.granularity).toBe("day");
    expect(out.points.map((p) => p.values)).toEqual([
      { meta: 0, google: 0 },
      { meta: 500, google: 100 },
      { meta: 0, google: 0 },
    ]);
  });
});
