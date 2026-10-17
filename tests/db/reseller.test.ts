import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminQuery, asUser, cleanupUsers, createUser, expireTrial, pool, type AsUser } from "./helpers";

/**
 * Reseller mode in the database: the onboarding parameter, the new columns and
 * their constraints, RLS on the new paths, and the fact that a quick sale
 * (an order with one line, written exactly like the app's sellItem action)
 * feeds the existing SQL reports.
 */

let alice: string;
let bob: string;
let carol: string;
let aliceShop: { orgId: string; storeId: string };
let bobShop: { orgId: string; storeId: string };

async function onboard(userId: string, model: "reseller" | "ecommerce" | null, platform = "vinted") {
  return asUser(
    userId,
    async (q) => {
      const args = ["Org", "Shop", platform, "EUR", 2, "Europe/Paris", false];
      const { rows } = await q<{ organization_id: string; store_id: string }>(
        model === null
          ? "select * from public.create_organization_with_store($1, $2, $3, $4, $5::smallint, $6, $7)"
          : "select * from public.create_organization_with_store($1, $2, $3, $4, $5::smallint, $6, $7, $8)",
        model === null ? args : [...args, model],
      );
      return { orgId: rows[0].organization_id, storeId: rows[0].store_id };
    },
    { commit: true },
  );
}

/** What sellItem writes: an item, then an order with one line (quantity 1, cost snapshot) and its platform. */
async function quickSale(q: AsUser, shop: { orgId: string; storeId: string }, opts: { name: string; costE4: number | null; priceMinor: number; channel: string; feesMinor?: number | null; daysAgo?: number }) {
  const product = await q<{ id: string }>(
    "insert into public.products (organization_id, store_id, name, sku, unit_cost_e4, acquired_on) values ($1, $2, $3, $4, $5, current_date - 10) returning id",
    [shop.orgId, shop.storeId, opts.name, `R-${Math.random().toString(36).slice(2, 12).toUpperCase()}`, opts.costE4],
  );
  const order = await q<{ id: string }>(
    `insert into public.orders (organization_id, store_id, external_id, ordered_at, sales_channel, transaction_fees_minor)
     values ($1, $2, $3, now() - make_interval(days => $4), $5, $6) returning id`,
    [shop.orgId, shop.storeId, `V-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, opts.daysAgo ?? 0, opts.channel, opts.feesMinor ?? null],
  );
  await q(
    "insert into public.order_items (organization_id, order_id, position, product_id, name, quantity, gross_minor, unit_cost_e4) values ($1, $2, 0, $3, $4, 1, $5, $6)",
    [shop.orgId, order.rows[0].id, product.rows[0].id, opts.name, opts.priceMinor, opts.costE4],
  );
  return { productId: product.rows[0].id, orderId: order.rows[0].id };
}

beforeAll(async () => {
  alice = await createUser();
  bob = await createUser();
  carol = await createUser();
  aliceShop = await onboard(alice, "reseller");
  bobShop = await onboard(bob, "reseller");
});

afterAll(async () => {
  await cleanupUsers([alice, bob, carol]);
  await pool.end();
});

describe("onboarding", () => {
  it("creates reseller stores with zero fee and shipping rules", async () => {
    const { rows } = await asUser(alice, (q) => q("select business_model, fee_rule_bps, fee_rule_fixed_minor, default_shipping_cost_minor from public.stores"));
    expect(rows).toEqual([{ business_model: "reseller", fee_rule_bps: 0, fee_rule_fixed_minor: 0, default_shipping_cost_minor: 0 }]);
  });

  it("keeps the old seven-argument call working, as an e-commerce store without rules", async () => {
    await onboard(carol, null, "shopify");
    const { rows } = await asUser(carol, (q) => q("select business_model, fee_rule_bps, default_shipping_cost_minor from public.stores"));
    expect(rows).toEqual([{ business_model: "ecommerce", fee_rule_bps: null, default_shipping_cost_minor: null }]);
  });

  it("rejects an unknown business model", async () => {
    const dave = await createUser();
    try {
      await expect(onboard(dave, "wholesale" as "reseller")).rejects.toThrow(/Unknown business model/);
    } finally {
      await cleanupUsers([dave]);
    }
  });
});

describe("columns and constraints", () => {
  it("lets members switch the store mode, but only to known values", async () => {
    await asUser(alice, async (q) => {
      await q("update public.stores set business_model = 'ecommerce' where id = $1", [aliceShop.storeId]);
      const { rows } = await q("select business_model from public.stores where id = $1", [aliceShop.storeId]);
      expect(rows[0].business_model).toBe("ecommerce");
      await expect(q("update public.stores set business_model = 'shop' where id = $1", [aliceShop.storeId])).rejects.toThrow(/business_model_check/);
    });
  });

  it("accepts the selling platforms of the onboarding list as sales channels, and nothing else", async () => {
    await asUser(alice, async (q) => {
      for (const channel of ["vinted", "leboncoin", "ebay", "vestiaire_collective", "other"]) {
        await q("insert into public.orders (organization_id, store_id, external_id, ordered_at, sales_channel) values ($1, $2, $3, now(), $4)", [aliceShop.orgId, aliceShop.storeId, `C-${channel}`, channel]);
      }
      await expect(
        q("insert into public.orders (organization_id, store_id, external_id, ordered_at, sales_channel) values ($1, $2, 'C-x', now(), 'tiktok')", [aliceShop.orgId, aliceShop.storeId]),
      ).rejects.toThrow(/sales_channel_check/);
    });
  });

  it("bounds purchase dates", async () => {
    await asUser(alice, async (q) => {
      await expect(
        q("insert into public.products (organization_id, store_id, name, acquired_on) values ($1, $2, 'Old', '1999-12-31')", [aliceShop.orgId, aliceShop.storeId]),
      ).rejects.toThrow(/acquired_on_check/);
    });
  });

  it("keeps order numbers unique per store, so generated sale numbers never double count", async () => {
    await asUser(alice, async (q) => {
      await q("insert into public.orders (organization_id, store_id, external_id, ordered_at) values ($1, $2, 'V-20261017-AAAAAA', now())", [aliceShop.orgId, aliceShop.storeId]);
      await expect(
        q("insert into public.orders (organization_id, store_id, external_id, ordered_at) values ($1, $2, 'V-20261017-AAAAAA', now())", [aliceShop.orgId, aliceShop.storeId]),
      ).rejects.toThrow(/duplicate key/);
    });
  });
});

describe("a quick sale feeds the existing reports", () => {
  it("counts in the contribution margin, per platform and in the items list", async () => {
    await asUser(alice, async (q) => {
      const sold = await quickSale(q, aliceShop, { name: "Veste en jean", costE4: 65_000, priceMinor: 1850, channel: "vinted", feesMinor: 100 });
      await quickSale(q, aliceShop, { name: "Robe", costE4: null, priceMinor: 2000, channel: "leboncoin" });
      const inStock = await q<{ id: string }>(
        "insert into public.products (organization_id, store_id, name, sku, unit_cost_e4, acquired_on) values ($1, $2, 'Sac', 'R-SAC', 120000, current_date - 90) returning id",
        [aliceShop.orgId, aliceShop.storeId],
      );

      const totals = await q(
        `select sum(orders)::int as orders, sum(gross_sales)::int as gross, sum(cogs)::int as cogs, sum(transaction_fees)::int as fees,
                sum(transaction_fees_estimated)::int as fees_estimated, sum(lines_without_cost)::int as lwc
         from public.report_daily_totals($1, current_date - 30, current_date)`,
        [aliceShop.storeId],
      );
      // 18.50 + 20.00 sold; known cost 6.50; recorded fee 1.00 and an estimated 0 (reseller fee rule).
      expect(totals.rows[0]).toEqual({ orders: 2, gross: 3850, cogs: 650, fees: 100, fees_estimated: 0, lwc: 1 });

      const channels = await q("select sales_channel, orders, net_revenue, cogs, transaction_fees, margin from public.report_channel_breakdown($1, current_date - 30, current_date) order by sales_channel", [aliceShop.storeId]);
      expect(channels.rows).toEqual([
        { sales_channel: "leboncoin", orders: 1, net_revenue: 2000, cogs: 0, transaction_fees: 0, margin: null },
        { sales_channel: "vinted", orders: 1, net_revenue: 1850, cogs: 650, transaction_fees: 100, margin: 1100 },
      ]);

      const items = await q("select name, status, sale_price, item_cost, fees, margin, sales_channel from public.reseller_items($1) order by name", [aliceShop.storeId]);
      expect(items.rows).toEqual([
        { name: "Robe", status: "sold", sale_price: 2000, item_cost: null, fees: 0, margin: null, sales_channel: "leboncoin" },
        { name: "Sac", status: "in_stock", sale_price: null, item_cost: null, fees: null, margin: null, sales_channel: null },
        { name: "Veste en jean", status: "sold", sale_price: 1850, item_cost: 650, fees: 100, margin: 1100, sales_channel: "vinted" },
      ]);
      const stock = await q("select * from public.reseller_items($1, 'in_stock')", [aliceShop.storeId]);
      expect(stock.rows.map((r) => r.product_id)).toEqual([inStock.rows[0].id]);

      const summary = await q("select * from public.reseller_stock_summary($1, current_date - 60)", [aliceShop.storeId]);
      expect(summary.rows[0]).toEqual({ items: 1, cost_minor: 1200, items_without_cost: 0, stale_items: 1 });

      // The product report (best sales) sees the same margin for the sold item.
      const product = await q("select contribution_margin from public.report_product_catalog($1, current_date - 30, current_date, null, 'all') where product_id = $2", [aliceShop.storeId, sold.productId]);
      expect(product.rows[0].contribution_margin).toBe(1100);

      // Undoing the sale (deleting its order) puts the item back in stock.
      await q("delete from public.orders where id = $1", [sold.orderId]);
      const back = await q("select status from public.reseller_items($1) where product_id = $2", [aliceShop.storeId, sold.productId]);
      expect(back.rows[0].status).toBe("in_stock");
    });
  });

  it("refunds count on their own date under the platform of their order", async () => {
    await asUser(alice, async (q) => {
      const sale = await quickSale(q, aliceShop, { name: "Pull", costE4: 20_000, priceMinor: 1500, channel: "ebay", daysAgo: 40 });
      await q("insert into public.refunds (organization_id, store_id, order_id, refunded_at, amount_minor) values ($1, $2, $3, now(), 500)", [aliceShop.orgId, aliceShop.storeId, sale.orderId]);
      const { rows } = await q("select sales_channel, orders, net_revenue, margin from public.report_channel_breakdown($1, current_date - 7, current_date)", [aliceShop.storeId]);
      expect(rows).toEqual([{ sales_channel: "ebay", orders: 0, net_revenue: -500, margin: -500 }]);
    });
  });
});

describe("access control on the new paths", () => {
  it("returns nothing from another organisation's store", async () => {
    await asUser(alice, async (q) => {
      await quickSale(q, aliceShop, { name: "Secret", costE4: 10_000, priceMinor: 900, channel: "vinted" });
      await expect(asUser(bob, (qb) => qb("select * from public.reseller_items($1)", [aliceShop.storeId]))).resolves.toMatchObject({ rows: [] });
      await expect(asUser(bob, (qb) => qb("select * from public.report_channel_breakdown($1, current_date - 30, current_date)", [aliceShop.storeId]))).resolves.toMatchObject({ rows: [] });
      const summary = await asUser(bob, (qb) => qb("select * from public.reseller_stock_summary($1, current_date)", [aliceShop.storeId]));
      expect(summary.rows[0]).toMatchObject({ items: 0, cost_minor: 0 });
    });
  });

  it("does not let another tenant change a store's mode", async () => {
    const result = await asUser(bob, (q) => q("update public.stores set business_model = 'ecommerce' where id = $1 returning id", [aliceShop.storeId]));
    expect(result.rows).toEqual([]);
  });

  it("gives anonymous visitors no access", async () => {
    await expect(asUser(null, (q) => q("select * from public.reseller_items($1)", [aliceShop.storeId]))).rejects.toThrow(/permission denied/);
  });

  it("makes the mode read-only and pauses the item lists once the trial has expired", async () => {
    await expireTrial(bobShop.orgId);
    await expect(asUser(bob, (q) => q("update public.stores set business_model = 'ecommerce' where id = $1", [bobShop.storeId]))).rejects.toThrow(/row-level security/);
    await expect(asUser(bob, (q) => q("select * from public.reseller_items($1)", [bobShop.storeId]))).rejects.toThrow(/paused/);
    // Data stays readable for export.
    const { rows } = await asUser(bob, (q) => q("select count(*)::int as n from public.stores where id = $1", [bobShop.storeId]));
    expect(rows[0].n).toBe(1);
    await adminQuery("update public.organizations set trial_ends_at = now() + interval '14 days' where id = $1", [bobShop.orgId]);
  });
});
