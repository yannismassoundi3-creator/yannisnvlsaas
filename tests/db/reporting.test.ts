import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeCampaignBreakdown, computeDailyTotals, computeProductBreakdown } from "@/lib/analytics/reference";
import { totalsFromSql, type DailyTotalsSqlRow } from "@/lib/analytics/rows";
import { addDays, previousPeriod } from "@/lib/dates";
import { generateDemoDataset } from "@/lib/demo/generator";
import { insertDataset } from "@/lib/demo/persist";
import type { DateRange } from "@/lib/domain/types";
import type { Database } from "@/lib/supabase/database.types";
import { adminQuery, asUser, cleanupUsers, createOrganization, createUser, expireTrial, pool } from "./helpers";

/**
 * Parity: the SQL reporting functions must return exactly what the in-memory
 * reference implementation computes for the same dataset.
 */

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
// The local stack's secret key, printed by `npx supabase status`.
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SECRET) throw new Error("SUPABASE_SECRET_KEY is not set: copy the local key from `npx supabase status` into .env.local.");
const END = "2026-11-15"; // range includes the 25 October DST change in Paris
const TZ = "Europe/Paris";

const ds = generateDemoDataset({ endDate: END, timezone: TZ });
let user: string;
let storeId: string;
let productIdToRef: Map<string, string>;
let campaignIdToRef: Map<string, string>;

beforeAll(async () => {
  user = await createUser();
  const org = await createOrganization(user, { timezone: TZ });
  storeId = org.storeId;
  await adminQuery("update public.stores set fee_rule_bps = $2, fee_rule_fixed_minor = $3, default_shipping_cost_minor = $4 where id = $1", [
    storeId,
    ds.settings.feeRuleBasisPoints,
    ds.settings.feeRuleFixedMinor,
    ds.settings.defaultShippingCostMinor,
  ]);
  const admin = createClient<Database>(API_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  const maps = await insertDataset(admin, { organizationId: org.orgId, storeId, source: "demo" }, ds);
  productIdToRef = new Map([...maps.productIds].map(([ref, id]) => [id, ref]));
  campaignIdToRef = new Map([...maps.campaignIds].map(([ref, id]) => [id, ref]));
}, 120_000);

afterAll(async () => {
  await cleanupUsers([user]);
  await pool.end();
});

const last30 = { from: addDays(END, -29), to: END };
const ranges: [string, DateRange][] = [
  ["last 30 days", last30],
  ["previous 30 days", previousPeriod(last30)],
  ["90 days", { from: addDays(END, -89), to: END }],
  ["DST change day", { from: "2026-10-25", to: "2026-10-25" }],
  ["whole dataset", { from: addDays(END, -179), to: END }],
];

describe.each(ranges)("SQL matches the reference for %s", (_label, range) => {
  it("daily totals", async () => {
    const rows = await asUser(user, async (q) => (await q("select * from public.report_daily_totals($1, $2, $3)", [storeId, range.from, range.to])).rows);
    const expected = computeDailyTotals(ds, range);
    expect(rows).toHaveLength(expected.size);
    for (const row of rows) {
      const day = (row.day as Date).toISOString().slice(0, 10);
      expect({ day, ...totalsFromSql(row as DailyTotalsSqlRow) }).toEqual({ day, ...expected.get(day) });
    }
  });

  it("product breakdown and unallocated amounts", async () => {
    const { rows, unallocated } = await asUser(user, async (q) => ({
      rows: (await q("select * from public.report_product_breakdown($1, $2, $3)", [storeId, range.from, range.to])).rows,
      unallocated: (await q("select * from public.report_unallocated($1, $2, $3)", [storeId, range.from, range.to])).rows[0],
    }));
    const reference = computeProductBreakdown(ds, range);
    const byRef = new Map(reference.rows.map((r) => [r.productId, r]));
    expect(rows).toHaveLength(reference.rows.length);
    for (const row of rows) {
      const ref = byRef.get(productIdToRef.get(row.product_id)!);
      expect(ref, `product ${row.name}`).toBeDefined();
      expect({
        units: row.units,
        grossSales: row.gross_sales,
        discounts: row.discounts,
        refunds: row.refunds,
        shippingCharged: row.shipping_charged,
        cogs: row.cogs,
        linesWithoutCost: row.lines_without_cost,
        shippingCosts: row.shipping_costs,
        transactionFees: row.transaction_fees,
        adSpend: row.ad_spend,
      }).toEqual({
        units: ref!.units,
        grossSales: ref!.grossSales,
        discounts: ref!.discounts,
        refunds: ref!.refunds,
        shippingCharged: ref!.shippingCharged,
        cogs: ref!.cogs,
        linesWithoutCost: ref!.linesWithoutCost,
        shippingCosts: ref!.shippingCosts,
        transactionFees: ref!.transactionFees,
        adSpend: ref!.adSpend,
      });
    }
    expect({ ad_spend: unallocated.ad_spend, refunds: unallocated.refunds, variable_expenses: unallocated.variable_expenses }).toEqual({
      ad_spend: reference.unallocated.adSpend,
      refunds: reference.unallocated.refunds,
      variable_expenses: reference.unallocated.variableExpenses,
    });
  });

  it("campaign breakdown", async () => {
    const rows = await asUser(user, async (q) => (await q("select * from public.report_campaign_breakdown($1, $2, $3)", [storeId, range.from, range.to])).rows);
    const reference = computeCampaignBreakdown(ds, range);
    expect(rows.map((r) => campaignIdToRef.get(r.campaign_id))).toEqual(reference.map((r) => r.campaignId));
    rows.forEach((row, i) => {
      expect([row.spend, row.impressions, row.clicks, Number(row.conversions), row.conversion_value]).toEqual([
        reference[i].spend,
        reference[i].impressions,
        reference[i].clicks,
        reference[i].conversions,
        reference[i].conversionValue,
      ]);
    });
  });
});

describe("report access control", () => {
  it("returns nothing for another organisation's store", async () => {
    const stranger = await createUser();
    await createOrganization(stranger);
    const rows = await asUser(stranger, async (q) => (await q("select * from public.report_product_breakdown($1, $2, $3)", [storeId, last30.from, last30.to])).rows);
    const daily = await asUser(stranger, async (q) => (await q("select * from public.report_daily_totals($1, $2, $3)", [storeId, last30.from, last30.to])).rows);
    expect(rows).toHaveLength(0);
    expect(daily).toHaveLength(0);
    await cleanupUsers([stranger]);
  });

  it("pauses reports once access has expired, while the data stays readable for export", async () => {
    const lapsed = await createUser();
    const lapsedOrg = await createOrganization(lapsed);
    await expireTrial(lapsedOrg.orgId);
    await expect(
      asUser(lapsed, (q) => q("select * from public.report_daily_totals($1, $2, $3)", [lapsedOrg.storeId, last30.from, last30.to])),
    ).rejects.toThrow(/Reports are paused/);
    const stores = await asUser(lapsed, async (q) => (await q("select id from public.stores where id = $1", [lapsedOrg.storeId])).rows);
    expect(stores).toHaveLength(1);
    await cleanupUsers([lapsed]);
  });

  it("rejects invalid or unbounded ranges", async () => {
    await expect(asUser(user, (q) => q("select * from public.report_daily_totals($1, '2026-02-01', '2026-01-01')", [storeId]))).rejects.toThrow(/Invalid date range/);
    await expect(asUser(user, (q) => q("select * from public.report_daily_totals($1, '2000-01-01', '2026-01-01')", [storeId]))).rejects.toThrow(/too long/);
  });

  it("allocation matches the TypeScript implementation, including ties", async () => {
    const { rows } = await adminQuery(
      "select private.allocate_proportionally(100, array[1,1,1]::bigint[]) a, private.allocate_proportionally(10, array[1,2]::bigint[]) b, private.allocate_proportionally(1, array[1,1]::bigint[]) c, private.allocate_proportionally(10, array[0,0]::bigint[]) d, private.allocate_proportionally(-100, array[1,1,1]::bigint[]) e",
    );
    const asNumbers = Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, (v as string[]).map(Number)]));
    expect(asNumbers).toEqual({ a: [34, 33, 33], b: [3, 7], c: [1, 0], d: [5, 5], e: [-34, -33, -33] });
  });
});
