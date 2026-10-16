import { describe, expect, it } from "vitest";
import {
  computeCampaignBreakdown,
  computeDailyTotals,
  computeProductBreakdown,
  computeTotals,
} from "@/lib/analytics/reference";
import { addDays, previousPeriod } from "@/lib/dates";
import { generateDemoDataset } from "@/lib/demo/generator";
import type { Dataset } from "@/lib/domain/types";
import { buildInsights } from "@/lib/finance/insights";
import { deriveMetrics, EMPTY_TOTALS } from "@/lib/finance/metrics";

const END = "2026-09-30";
const ds = generateDemoDataset({ endDate: END });
const last30 = { from: addDays(END, -29), to: END };

describe("demo generator", () => {
  it("is deterministic", () => {
    expect(generateDemoDataset({ endDate: END })).toEqual(ds);
    expect(generateDemoDataset({ endDate: END, seed: 1 })).not.toEqual(ds);
  });

  it("produces a plausible store", () => {
    const m = deriveMetrics(computeTotals(ds, last30));
    expect(m.orders).toBeGreaterThan(300);
    expect(m.netRevenue).toBeGreaterThan(1_500_000);
    expect(m.contributionMarginRate).toBeGreaterThan(0.05);
    expect(m.contributionMarginRate).toBeLessThan(0.45);
    expect(ds.products.some((p) => p.unitCostE4 === null)).toBe(true);
  });

  it("keeps every line amount consistent", () => {
    for (const order of ds.orders) {
      for (const line of order.lines) {
        expect(line.discountMinor).toBeGreaterThanOrEqual(0);
        expect(line.discountMinor).toBeLessThanOrEqual(line.grossMinor);
        expect(Number.isSafeInteger(line.grossMinor)).toBe(true);
      }
    }
  });
});

describe("reference aggregation", () => {
  it("period totals equal the sum of daily totals", () => {
    const daily = computeDailyTotals(ds, last30);
    expect(daily.size).toBe(30);
    const summed = [...daily.values()].reduce((acc, t) => {
      const out = { ...acc };
      for (const k of Object.keys(t) as (keyof typeof t)[]) out[k] += t[k];
      return out;
    }, { ...EMPTY_TOTALS });
    expect(summed).toEqual(computeTotals(ds, last30));
  });

  it("product breakdown reconciles with store totals", () => {
    const totals = computeTotals(ds, last30);
    const { rows, unallocated } = computeProductBreakdown(ds, last30);
    const sum = (key: "units" | "grossSales" | "discounts" | "refunds" | "shippingCharged" | "adSpend") =>
      rows.reduce((a, r) => a + r[key], 0);
    expect(sum("units")).toBe(totals.units);
    expect(sum("grossSales")).toBe(totals.grossSales);
    expect(sum("discounts")).toBe(totals.discounts);
    expect(sum("shippingCharged")).toBe(totals.shippingCharged);
    expect(sum("refunds") + unallocated.refunds).toBe(totals.refunds);
    expect(sum("adSpend") + unallocated.adSpend).toBe(totals.adSpend);
    // Order-level shipping and fees are fully allocated (no expenses of those categories in the demo).
    expect(rows.reduce((a, r) => a + r.shippingCosts, 0)).toBe(totals.shippingCosts);
    expect(rows.reduce((a, r) => a + r.transactionFees, 0)).toBe(totals.transactionFees);
  });

  it("never invents COGS for products without a cost", () => {
    const { rows } = computeProductBreakdown(ds, last30);
    const napkins = rows.find((r) => r.sku === "NAPK-LIN-4PK");
    expect(napkins).toBeDefined();
    expect(napkins!.cogs).toBeNull();
    expect(napkins!.contributionMargin).toBeNull();
    expect(napkins!.linesWithoutCost).toBeGreaterThan(0);
  });

  it("attributes ad spend only through linked campaigns", () => {
    const { rows } = computeProductBreakdown(ds, last30);
    const linked = rows.filter((r) => r.adSpend > 0);
    expect(linked.map((r) => r.sku)).toEqual(["BEAN-MER-CHR"]);
  });

  it("computes campaign ROAS from platform values", () => {
    const campaigns = computeCampaignBreakdown(ds, last30);
    expect(campaigns).toHaveLength(5);
    for (const c of campaigns) expect(c.platformRoas).toBeCloseTo(c.conversionValue / c.spend, 10);
  });

  it("uses the store time zone for order dates", () => {
    // An order at 23:30 UTC on the 30th is the 31st in Paris (UTC+2 in summer).
    const tiny: Dataset = {
      ...ds,
      orders: [
        {
          id: "x",
          externalId: "#1",
          orderedAt: "2026-08-30T23:30:00.000Z",
          shippingChargedMinor: 0,
          shippingCostMinor: 0,
          transactionFeesMinor: 0,
          taxesMinor: 0,
          lines: [{ id: "l", position: 0, productId: "p01", sku: "TOTE-LIN-NAT", name: "Tote", quantity: 1, grossMinor: 1000, discountMinor: 0, unitCostE4: null }],
        },
      ],
      refunds: [],
      adSpend: [],
      expenses: [],
    };
    expect(computeTotals(tiny, { from: "2026-08-30", to: "2026-08-30" }).orders).toBe(0);
    expect(computeTotals(tiny, { from: "2026-08-31", to: "2026-08-31" }).orders).toBe(1);
  });
});

describe("insights on the demo store", () => {
  const prev = previousPeriod(last30);
  const current = deriveMetrics(computeTotals(ds, last30));
  const previous = deriveMetrics(computeTotals(ds, prev));
  const insights = buildInsights({
    currency: "EUR",
    current,
    previous,
    products: { current: computeProductBreakdown(ds, last30).rows, previous: computeProductBreakdown(ds, prev).rows },
    campaigns: computeCampaignBreakdown(ds, last30),
    feeRule: { basisPoints: ds.settings.feeRuleBasisPoints, fixedMinor: ds.settings.feeRuleFixedMinor },
  });
  const ids = insights.map((i) => i.id.split(":")[0]);

  it("surfaces the patterns built into the sample store", () => {
    expect(ids).toContain("ad_spend_outpacing_revenue");
    expect(ids).toContain("missing_costs");
    expect(ids).toContain("campaigns_below_break_even");
    expect(ids).toContain("estimated_values");
    expect(ids).toContain("refund_rate_up");
  });

  it("puts attention items first and always shows evidence", () => {
    const firstInfo = insights.findIndex((i) => i.severity === "info");
    if (firstInfo >= 0) expect(insights.slice(firstInfo).every((i) => i.severity === "info")).toBe(true);
    for (const i of insights) expect(i.evidence.length).toBeGreaterThan(0);
  });

  it("never claims causation", () => {
    for (const i of insights) expect(`${i.title} ${i.body}`).not.toMatch(/\b(caused|because of|due to)\b/i);
  });

  it("is silent when nothing notable happened", () => {
    const same = buildInsights({ currency: "EUR", current: previous, previous });
    expect(same.map((i) => i.id)).not.toContain("ad_spend_outpacing_revenue");
    expect(same.map((i) => i.id)).not.toContain("refund_rate_up");
  });
});
