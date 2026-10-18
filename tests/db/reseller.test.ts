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

describe("quantities (several identical pieces per item)", () => {
  let erin: string;
  let shop: { orgId: string; storeId: string };

  beforeAll(async () => {
    erin = await createUser();
    shop = await onboard(erin, "reseller");
  });

  afterAll(async () => {
    await cleanupUsers([erin]);
  });

  async function addItem(q: AsUser, opts: { name: string; costE4: number | null; quantity: number | null; daysAgo?: number }) {
    const { rows } = await q<{ id: string }>(
      "insert into public.products (organization_id, store_id, name, sku, unit_cost_e4, stock_quantity, acquired_on) values ($1, $2, $3, $4, $5, $6, current_date - $7::int) returning id",
      [shop.orgId, shop.storeId, opts.name, `R-${Math.random().toString(36).slice(2, 12).toUpperCase()}`, opts.costE4, opts.quantity, opts.daysAgo ?? 1],
    );
    return rows[0].id;
  }

  /** What sellItem calls: one order with one line of `quantity` pieces for `grossMinor` in total. */
  async function sell(q: AsUser, productId: string, quantity: number, grossMinor: number, hoursAgo = 0) {
    const { rows } = await q<{ order_id: string }>(
      "select public.reseller_record_sale($1, $2, $3, $4, now() - make_interval(hours => $6), $5, null, null, 'vinted') as order_id",
      [shop.storeId, productId, quantity, `V-Q-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, grossMinor, hoursAgo],
    );
    return rows[0].order_id;
  }

  /** Expects `run` to fail, then rolls back to before it so the transaction goes on. */
  async function fails(q: AsUser, run: () => Promise<unknown>, pattern: RegExp) {
    await q("savepoint before_failure");
    await expect(run()).rejects.toThrow(pattern);
    await q("rollback to savepoint before_failure");
  }

  it("bounds the number of pieces", async () => {
    await asUser(erin, async (q) => {
      await fails(q, () => addItem(q, { name: "Zero", costE4: null, quantity: 0 }), /stock_quantity_check/);
      await fails(q, () => addItem(q, { name: "Huge", costE4: null, quantity: 100_001 }), /stock_quantity_check/);
    });
  });

  it("computes the remaining pieces and keeps a partly sold item in stock with its latest sale", async () => {
    await asUser(erin, async (q) => {
      // A lot of 3 polos for 24.00: 8.00 each.
      const polo = await addItem(q, { name: "Polo Ralph Lauren", costE4: 80_000, quantity: 3 });
      const legacy = await addItem(q, { name: "Veste", costE4: 50_000, quantity: null });
      const orderId = await sell(q, polo, 2, 3000, 1);

      const line = await q("select quantity, gross_minor, unit_cost_e4 from public.order_items where order_id = $1", [orderId]);
      expect(line.rows).toEqual([{ quantity: 2, gross_minor: 3000, unit_cost_e4: 80_000 }]);

      const items = await q(
        "select name, status, quantity, sold_units, remaining, sale_quantity, sale_price, item_cost, margin from public.reseller_items($1) order by name",
        [shop.storeId],
      );
      expect(items.rows).toEqual([
        { name: "Polo Ralph Lauren", status: "in_stock", quantity: 3, sold_units: 2, remaining: 1, sale_quantity: 2, sale_price: 3000, item_cost: 1600, margin: 1400 },
        { name: "Veste", status: "in_stock", quantity: 1, sold_units: 0, remaining: 1, sale_quantity: null, sale_price: null, item_cost: null, margin: null },
      ]);
      // Partly sold: listed in stock and among the items with a sale.
      const inStock = await q("select product_id from public.reseller_items($1, 'in_stock') order by name", [shop.storeId]);
      expect(inStock.rows.map((r) => r.product_id)).toEqual([polo, legacy]);
      const sold = await q("select product_id from public.reseller_items($1, 'sold')", [shop.storeId]);
      expect(sold.rows.map((r) => r.product_id)).toEqual([polo]);

      // The last piece: the item is sold, the latest sale is shown.
      await sell(q, polo, 1, 1200);
      const after = await q("select status, sold_units, remaining, sale_quantity, sale_price from public.reseller_items($1) where product_id = $2", [shop.storeId, polo]);
      expect(after.rows[0]).toEqual({ status: "sold", sold_units: 3, remaining: 0, sale_quantity: 1, sale_price: 1200 });
      const stockAfter = await q("select product_id from public.reseller_items($1, 'in_stock')", [shop.storeId]);
      expect(stockAfter.rows.map((r) => r.product_id)).toEqual([legacy]);

      // Units sold feed the reports like any order line.
      const totals = await q("select sum(units)::int as units, sum(gross_sales)::int as gross, sum(cogs)::int as cogs from public.report_daily_totals($1, current_date - 1, current_date)", [shop.storeId]);
      expect(totals.rows[0]).toEqual({ units: 3, gross: 4200, cogs: 2400 });
    });
  });

  it("cannot oversell: the sale is refused and nothing is written", async () => {
    await asUser(erin, async (q) => {
      const lot = await addItem(q, { name: "T-shirts", costE4: 20_000, quantity: 2 });
      await fails(q, () => sell(q, lot, 3, 900), /insufficient_stock/);
      await sell(q, lot, 2, 900);
      await fails(q, () => sell(q, lot, 1, 450), /insufficient_stock/);
      // A single piece (no quantity, as before) sells once.
      const single = await addItem(q, { name: "Sac", costE4: null, quantity: null });
      await sell(q, single, 1, 2000);
      await fails(q, () => sell(q, single, 1, 2000), /insufficient_stock/);
      const { rows } = await q("select count(*)::int as n from public.orders where store_id = $1", [shop.storeId]);
      expect(rows[0].n).toBe(2);
      await fails(q, () => sell(q, lot, 0, 0), /invalid_quantity/);
    });
  });

  it("serialises two quick sales of the last piece: only one succeeds", async () => {
    const productId = await asUser(erin, (q) => addItem(q, { name: "Dernier polo", costE4: 80_000, quantity: 2 }), { commit: true });
    await asUser(erin, (q) => sell(q, productId, 1, 1500), { commit: true });

    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let firstSold!: () => void;
    const sold = new Promise<void>((r) => (firstSold = r));
    const first = asUser(
      erin,
      async (q) => {
        await sell(q, productId, 1, 1500);
        firstSold();
        await held; // keep the transaction (and the item's row lock) open
      },
      { commit: true },
    );
    await sold;
    const second = asUser(erin, (q) => sell(q, productId, 1, 1500), { commit: true });
    const secondResult = second.then(
      () => "sold",
      (e: Error) => e.message,
    );
    await new Promise((r) => setTimeout(r, 300));
    release();
    await first;
    expect(await secondResult).toMatch(/insufficient_stock/);
    const { rows } = await adminQuery("select sum(quantity)::int as units from public.order_items where product_id = $1", [productId]);
    expect(rows[0].units).toBe(2);
  });

  it("counts the stock summary in pieces, with lot costs", async () => {
    await asUser(erin, async (q) => {
      await q("delete from public.products where store_id = $1 and not exists (select 1 from public.order_items i where i.product_id = products.id)", [shop.storeId]);
      // A lot of 10 t-shirts for 20.00 (2.00 each), 4 sold; 3 lingering pieces without a price; one archived lot.
      const tees = await addItem(q, { name: "Lot t-shirts", costE4: 20_000, quantity: 10 });
      await sell(q, tees, 4, 2000);
      await addItem(q, { name: "Chaussettes", costE4: null, quantity: 3, daysAgo: 90 });
      const archived = await addItem(q, { name: "Archivé", costE4: 10_000, quantity: 5 });
      await q("update public.products set archived_at = now() where id = $1", [archived]);
      // A third of 10.00: 3.3333 each, 3 pieces → 9.9999 → 10.00 tied up.
      await addItem(q, { name: "Lot pulls", costE4: 33_333, quantity: 3 });

      const { rows } = await q("select * from public.reseller_stock_summary($1, current_date - 60)", [shop.storeId]);
      expect(rows[0]).toEqual({ items: 6 + 3 + 3, cost_minor: 1200 + 1000, items_without_cost: 3, stale_items: 3 });
    });
  });

  it("never lets the quantity go below the pieces sold", async () => {
    await asUser(erin, async (q) => {
      const lot = await addItem(q, { name: "Jeans", costE4: 50_000, quantity: 4 });
      await sell(q, lot, 3, 6000);
      await fails(q, () => q("update public.products set stock_quantity = 2 where id = $1", [lot]), /stock_quantity_below_sold/);
      await q("update public.products set stock_quantity = 3 where id = $1", [lot]);
      await q("update public.products set stock_quantity = 6 where id = $1", [lot]);
      const { rows } = await q("select remaining from public.reseller_items($1) where product_id = $2", [shop.storeId, lot]);
      expect(rows[0].remaining).toBe(3);
      // Edits that keep the quantity never trip the guard, even on old data with more units sold than pieces.
      const old = await addItem(q, { name: "Ancien", costE4: null, quantity: null });
      const order = await q<{ id: string }>("insert into public.orders (organization_id, store_id, external_id, ordered_at) values ($1, $2, 'OLD-1', now()) returning id", [shop.orgId, shop.storeId]);
      await q("insert into public.order_items (organization_id, order_id, position, product_id, name, quantity, gross_minor) values ($1, $2, 0, $3, 'Ancien', 5, 100)", [shop.orgId, order.rows[0].id, old]);
      await q("update public.products set name = 'Ancien modèle', stock_quantity = null where id = $1", [old]);
      const status = await q("select status, remaining from public.reseller_items($1) where product_id = $2", [shop.storeId, old]);
      expect(status.rows[0]).toEqual({ status: "sold", remaining: 0 });
    });
  });

  it("does not sell another organisation's items", async () => {
    const productId = await asUser(erin, (q) => addItem(q, { name: "Privé", costE4: null, quantity: 2 }), { commit: true });
    await expect(
      asUser(bob, (q) =>
        q("select public.reseller_record_sale($1, $2, 1, 'V-X', now(), 100)", [shop.storeId, productId]),
      ),
    ).rejects.toThrow(/item_not_found/);
    await expect(asUser(null, (q) => q("select public.reseller_record_sale($1, $2, 1, 'V-X', now(), 100)", [shop.storeId, productId]))).rejects.toThrow(/permission denied/);
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
