import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminQuery, asUser, cleanupUsers, createOrganization, createUser, pool } from "./helpers";

/**
 * Integrity rules that hold even for direct API writes: records can only link
 * to records of the same store, and amounts keep their invariants.
 */

let user: string;
let org: { orgId: string; storeId: string };
let secondStore: string;

beforeAll(async () => {
  user = await createUser();
  org = await createOrganization(user);
  const { rows } = await adminQuery(
    "insert into public.stores (organization_id, name, currency, minor_digits, timezone) values ($1, 'Second', 'EUR', 2, 'UTC') returning id",
    [org.orgId],
  );
  secondStore = rows[0].id;
});

afterAll(async () => {
  await cleanupUsers([user]);
  await pool.end();
});

async function seed(storeId: string) {
  return asUser(
    user,
    async (q) => {
      const product = await q("insert into public.products (organization_id, store_id, sku, name) values ($1, $2, $3, 'Mug') returning id", [
        org.orgId,
        storeId,
        `MUG-${storeId.slice(0, 6)}`,
      ]);
      const order = await q(
        "insert into public.orders (organization_id, store_id, external_id, ordered_at) values ($1, $2, $3, now()) returning id",
        [org.orgId, storeId, `#${storeId.slice(0, 6)}`],
      );
      return { productId: product.rows[0].id as string, orderId: order.rows[0].id as string };
    },
    { commit: true },
  );
}

describe("same-store links", () => {
  let a: { productId: string; orderId: string };
  let b: { productId: string; orderId: string };

  beforeAll(async () => {
    a = await seed(org.storeId);
    b = await seed(secondStore);
  });

  it("accepts links within one store", async () => {
    await expect(
      asUser(user, async (q) => {
        await q(
          "insert into public.order_items (organization_id, order_id, position, product_id, name, quantity, gross_minor) values ($1, $2, 0, $3, 'Mug', 1, 1200)",
          [org.orgId, a.orderId, a.productId],
        );
        await q("insert into public.refunds (organization_id, store_id, order_id, refunded_at, amount_minor) values ($1, $2, $3, now(), 500)", [
          org.orgId,
          org.storeId,
          a.orderId,
        ]);
        await q("insert into public.ad_campaigns (organization_id, store_id, platform, name, product_id) values ($1, $2, 'meta', 'Mug ads', $3)", [
          org.orgId,
          org.storeId,
          a.productId,
        ]);
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects an order line pointing at another store's product", async () => {
    await expect(
      asUser(user, (q) =>
        q(
          "insert into public.order_items (organization_id, order_id, position, product_id, name, quantity, gross_minor) values ($1, $2, 0, $3, 'Mug', 1, 1200)",
          [org.orgId, a.orderId, b.productId],
        ),
      ),
    ).rejects.toThrow(/different stores/);
  });

  it("rejects a refund pointing at another store's order", async () => {
    await expect(
      asUser(user, (q) =>
        q("insert into public.refunds (organization_id, store_id, order_id, refunded_at, amount_minor) values ($1, $2, $3, now(), 500)", [
          org.orgId,
          org.storeId,
          b.orderId,
        ]),
      ),
    ).rejects.toThrow(/different stores/);
  });

  it("rejects a campaign linked to another store's product", async () => {
    await expect(
      asUser(user, (q) =>
        q("insert into public.ad_campaigns (organization_id, store_id, platform, name, product_id) values ($1, $2, 'google', 'X', $3)", [
          org.orgId,
          org.storeId,
          b.productId,
        ]),
      ),
    ).rejects.toThrow(/different stores/);
  });

  it("rejects ad spend for another store's campaign", async () => {
    await expect(
      asUser(user, async (q) => {
        const c = await q("insert into public.ad_campaigns (organization_id, store_id, platform, name) values ($1, $2, 'meta', 'Other store') returning id", [
          org.orgId,
          secondStore,
        ]);
        await q("insert into public.ad_spend_daily (organization_id, store_id, campaign_id, spend_date, spend_minor) values ($1, $2, $3, current_date, 100)", [
          org.orgId,
          org.storeId,
          c.rows[0].id,
        ]);
      }),
    ).rejects.toThrow(/does not belong to this store/);
  });
});

describe("amount invariants", () => {
  it("never lets a discount exceed the line amount", async () => {
    const { orderId } = await seed(org.storeId).catch(() => ({ orderId: "" }));
    void orderId;
    const order = await asUser(
      user,
      async (q) =>
        (await q("insert into public.orders (organization_id, store_id, external_id, ordered_at) values ($1, $2, '#inv-1', now()) returning id", [org.orgId, org.storeId]))
          .rows[0].id,
      { commit: true },
    );
    await expect(
      asUser(user, (q) =>
        q("insert into public.order_items (organization_id, order_id, position, name, quantity, gross_minor, discount_minor) values ($1, $2, 0, 'x', 1, 1000, 1001)", [
          org.orgId,
          order,
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("prevents duplicate order numbers in a store (no double counting)", async () => {
    await expect(
      asUser(user, (q) =>
        q("insert into public.orders (organization_id, store_id, external_id, ordered_at) values ($1, $2, '#inv-1', now())", [org.orgId, org.storeId]),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("matches products case-insensitively by SKU, else by name", async () => {
    const keys = await asUser(user, async (q) => {
      const r1 = await q("insert into public.products (organization_id, store_id, sku, name) values ($1, $2, ' Tote-01 ', 'Tote') returning match_key", [org.orgId, org.storeId]);
      const r2 = await q("insert into public.products (organization_id, store_id, sku, name) values ($1, $2, null, 'Linen Napkins') returning match_key", [org.orgId, org.storeId]);
      return [r1.rows[0].match_key, r2.rows[0].match_key];
    });
    expect(keys).toEqual(["tote-01", "name:linen napkins"]);
  });
});
