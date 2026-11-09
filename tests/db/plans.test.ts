import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FREE_STOCK_ITEMS } from "@/config/plans";
import { processStripeEvent } from "@/lib/billing/sync";
import type { Database } from "@/lib/supabase/database.types";
import { adminQuery, asUser, cleanupUsers, createOrganization, createUser, expireTrial, pool, type AsUser } from "./helpers";

/**
 * The reseller plans (migration 20261109100000_reseller_plans.sql): the free
 * plan of reseller-only workspaces after the trial and its stock limit, the
 * Revendeur plan mapped from the Stripe price, and the paid-only features
 * (AI listings, sales received by email, e-commerce mode).
 */

const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SECRET) throw new Error("SUPABASE_SECRET_KEY is not set: copy the local key from `npx supabase status` into .env.local.");
const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

type Shop = { orgId: string; storeId: string };
const users: string[] = [];

async function newUser() {
  const id = await createUser();
  users.push(id);
  return id;
}

async function onboardReseller(userId: string): Promise<Shop> {
  return asUser(
    userId,
    async (q) => {
      const { rows } = await q<{ organization_id: string; store_id: string }>(
        "select * from public.create_organization_with_store($1, $2, $3, $4, $5::smallint, $6, $7, $8)",
        ["Org", "Shop", "vinted", "EUR", 2, "Europe/Paris", false, "reseller"],
      );
      return { orgId: rows[0].organization_id, storeId: rows[0].store_id };
    },
    { commit: true },
  );
}

const sku = () => `R-${Math.random().toString(36).slice(2, 12).toUpperCase()}`;

/** Adds an item as the user (RLS and triggers apply), like the app's addItem action. */
function addItem(q: AsUser, shop: Shop, pieces = 1) {
  return q<{ id: string }>("insert into public.products (organization_id, store_id, name, sku, unit_cost_e4, stock_quantity) values ($1, $2, 'Pull', $3, 50000, $4) returning id", [
    shop.orgId,
    shop.storeId,
    sku(),
    pieces > 1 ? pieces : null,
  ]);
}

/** Items added by the server (no limit check needed for setup: the trial is still running). */
async function seedItems(shop: Shop, count: number) {
  await adminQuery(
    "insert into public.products (organization_id, store_id, name, sku) select $1, $2, 'Article ' || g, 'S-' || substr(md5(random()::text), 1, 12) from generate_series(1, $3) g",
    [shop.orgId, shop.storeId, count],
  );
}

const access = async (orgId: string) => (await adminQuery("select private.org_access($1) as a", [orgId])).rows[0].a as string;
const stockPieces = async (q: AsUser, storeId: string) => (await q<{ items: number }>("select items from public.reseller_stock_summary($1, current_date)", [storeId])).rows[0].items;

afterAll(async () => {
  await cleanupUsers(users);
  await pool.end();
});

describe("constants", () => {
  it("keeps the free stock limit in sync with src/config/plans.ts", async () => {
    expect((await adminQuery("select private.free_stock_limit() as n")).rows[0].n).toBe(FREE_STOCK_ITEMS);
  });
});

describe("access levels after the trial", () => {
  let reseller: string;
  let shop: Shop;
  let merchant: string;
  let ecommerce: Shop;

  beforeAll(async () => {
    reseller = await newUser();
    shop = await onboardReseller(reseller);
    merchant = await newUser();
    ecommerce = await createOrganization(merchant);
  });

  it("gives the trial while it runs, whatever the mode", async () => {
    expect(await access(shop.orgId)).toBe("trial");
    expect(await access(ecommerce.orgId)).toBe("trial");
  });

  it("moves a reseller-only workspace to 'free' and shows it in the entitlements view", async () => {
    await expireTrial(shop.orgId);
    const { rows } = await asUser(reseller, (q) => q("select access, paid_plan, stock_limit from public.organization_entitlements"));
    expect(rows).toEqual([{ access: "free", paid_plan: null, stock_limit: FREE_STOCK_ITEMS }]);
  });

  it("ignores the sample store but not a real e-commerce store", async () => {
    const demo = await adminQuery<{ id: string }>(
      "insert into public.stores (organization_id, name, currency, minor_digits, timezone, is_demo) values ($1, 'Boutique exemple', 'EUR', 2, 'Europe/Paris', true) returning id",
      [shop.orgId],
    );
    expect(await access(shop.orgId)).toBe("free");
    await adminQuery("delete from public.stores where id = $1", [demo.rows[0].id]);
  });

  it("keeps e-commerce workspaces read-only after the trial (unchanged)", async () => {
    await expireTrial(ecommerce.orgId);
    expect(await access(ecommerce.orgId)).toBe("expired");
    const { rows } = await asUser(merchant, (q) => q("select access, paid_plan, stock_limit from public.organization_entitlements"));
    expect(rows).toEqual([{ access: "expired", paid_plan: null, stock_limit: null }]);
    await expect(
      asUser(merchant, (q) => q("insert into public.products (organization_id, store_id, name, sku) values ($1, $2, 'Mug', 'MUG-1')", [ecommerce.orgId, ecommerce.storeId])),
    ).rejects.toThrow(/row-level security/);
    await expect(asUser(merchant, (q) => q("select * from public.report_daily_totals($1, current_date - 7, current_date)", [ecommerce.storeId]))).rejects.toThrow(/paused/);
  });

  it("does not give the free plan to a workspace with any real e-commerce store", async () => {
    const other = await newUser();
    const mixed = await onboardReseller(other);
    // A second store needs Pro (store limit); the subscription then ends.
    await adminQuery("insert into public.subscriptions (id, organization_id, status, plan, stripe_event_at) values ($1, $2, 'active', 'pro', now())", [`sub_mixed_${sku()}`, mixed.orgId]);
    await adminQuery(
      "insert into public.stores (organization_id, name, currency, minor_digits, timezone, business_model) values ($1, 'E-shop', 'EUR', 2, 'Europe/Paris', 'ecommerce')",
      [mixed.orgId],
    );
    await adminQuery("update public.subscriptions set status = 'canceled' where organization_id = $1", [mixed.orgId]);
    await expireTrial(mixed.orgId);
    expect(await access(mixed.orgId)).toBe("expired");
  });
});

describe("free plan stock limit", () => {
  let user: string;
  let shop: Shop;

  beforeAll(async () => {
    user = await newUser();
    shop = await onboardReseller(user);
    await seedItems(shop, FREE_STOCK_ITEMS - 2);
    await expireTrial(shop.orgId);
  });

  it("accepts items up to 30 pieces in stock and refuses the 31st with a clear code", async () => {
    expect(await access(shop.orgId)).toBe("free");
    await asUser(user, (q) => addItem(q, shop), { commit: true });
    await asUser(user, (q) => addItem(q, shop), { commit: true });
    expect(await asUser(user, (q) => stockPieces(q, shop.storeId))).toBe(FREE_STOCK_ITEMS);
    const refused = asUser(user, (q) => addItem(q, shop));
    await expect(refused).rejects.toMatchObject({ code: "P0001", message: "free_stock_limit", hint: "free_stock_limit", detail: String(FREE_STOCK_ITEMS) });
  });

  it("counts pieces, not items: a lot that would go past the limit is refused", async () => {
    const id = (await adminQuery<{ id: string }>("select id from public.products where store_id = $1 order by created_at desc limit 1", [shop.storeId])).rows[0].id;
    await asUser(user, (q) => q("delete from public.products where id = $1", [id]), { commit: true });
    await expect(asUser(user, (q) => addItem(q, shop, 2))).rejects.toThrow(/free_stock_limit/);
    await asUser(user, (q) => addItem(q, shop, 1), { commit: true });
  });

  it("keeps sales, edits and deletions working at the limit, and a sale frees a place", async () => {
    const [first, second] = (await adminQuery<{ id: string }>("select id from public.products where store_id = $1 order by created_at limit 2", [shop.storeId])).rows;
    await asUser(
      user,
      async (q) => {
        await q("select public.reseller_record_sale($1, $2, 1, $3, now(), 2500)", [shop.storeId, first.id, `V-FREE-${sku()}`]);
        const renamed = await q("update public.products set name = 'Pull marin', unit_cost_e4 = 60000 where id = $1 returning id", [second.id]);
        expect(renamed.rowCount).toBe(1);
      },
      { commit: true },
    );
    expect(await asUser(user, (q) => stockPieces(q, shop.storeId))).toBe(FREE_STOCK_ITEMS - 1);
    // The sold piece freed one place: one item more, then the limit again.
    await asUser(user, (q) => addItem(q, shop), { commit: true });
    await expect(asUser(user, (q) => addItem(q, shop))).rejects.toThrow(/free_stock_limit/);
    // Sold history stays readable.
    const sold = await asUser(user, (q) => q("select count(*)::int as n from public.reseller_items($1, 'sold')", [shop.storeId]));
    expect(sold.rows[0].n).toBe(1);
  });

  it("refuses edits that add pieces at the limit but accepts fewer pieces", async () => {
    const id = (await adminQuery<{ id: string }>("select p.id from public.products p where p.store_id = $1 and not exists (select 1 from public.order_items i where i.product_id = p.id) limit 1", [shop.storeId])).rows[0].id;
    await expect(asUser(user, (q) => q("update public.products set stock_quantity = 3 where id = $1", [id]))).rejects.toThrow(/free_stock_limit/);
    // Archiving takes it out of stock; bringing it back needs a free place.
    await asUser(user, (q) => q("update public.products set archived_at = now() where id = $1", [id]), { commit: true });
    await asUser(user, (q) => addItem(q, shop), { commit: true });
    await expect(asUser(user, (q) => q("update public.products set archived_at = null where id = $1", [id]))).rejects.toThrow(/free_stock_limit/);
  });

  it("lets a workspace above the limit after its trial sell and edit, but not add", async () => {
    const other = await newUser();
    const big = await onboardReseller(other);
    await seedItems(big, FREE_STOCK_ITEMS + 5);
    await expireTrial(big.orgId);
    const item = (await adminQuery<{ id: string }>("select id from public.products where store_id = $1 limit 1", [big.storeId])).rows[0].id;
    await asUser(other, async (q) => {
      await q("select public.reseller_record_sale($1, $2, 1, $3, now(), 1000)", [big.storeId, item, `V-BIG-${sku()}`]);
      await q("update public.products set name = 'Renommé' where id = $1", [item]);
    });
    await expect(asUser(other, (q) => addItem(q, big))).rejects.toThrow(/free_stock_limit/);
  });

  it("serialises concurrent additions so the limit holds", async () => {
    const other = await newUser();
    const race = await onboardReseller(other);
    await seedItems(race, FREE_STOCK_ITEMS - 1);
    await expireTrial(race.orgId);
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => asUser(other, (q) => addItem(q, race), { commit: true })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await asUser(other, (q) => stockPieces(q, race.storeId))).toBe(FREE_STOCK_ITEMS);
  });

  it("does not limit the trial or a paid plan", async () => {
    const other = await newUser();
    const trial = await onboardReseller(other);
    await seedItems(trial, FREE_STOCK_ITEMS);
    await asUser(other, (q) => addItem(q, trial, 5), { commit: true });
    await expireTrial(trial.orgId);
    await adminQuery(
      "insert into public.subscriptions (id, organization_id, status, plan, stripe_event_at) values ($1, $2, 'active', 'reseller', now())",
      [`sub_plan_${sku()}`, trial.orgId],
    );
    expect(await access(trial.orgId)).toBe("pro");
    await asUser(other, (q) => addItem(q, trial, 10), { commit: true });
  });
});

describe("paid-only features", () => {
  let user: string;
  let shop: Shop;
  let trialUser: string;
  let trialShop: Shop;

  beforeAll(async () => {
    user = await newUser();
    shop = await onboardReseller(user);
    await expireTrial(shop.orgId);
    trialUser = await newUser();
    trialShop = await onboardReseller(trialUser);
  });

  it("refuses AI listings on the free plan, and still allows them during the trial", async () => {
    await expect(asUser(user, (q) => q("select * from public.reserve_listing_analysis($1, 50)", [shop.orgId]))).rejects.toMatchObject({ code: "42501", message: "plan_required" });
    const { rows } = await asUser(trialUser, (q) => q("select * from public.reserve_listing_analysis($1, 50)", [trialShop.orgId]));
    expect(rows[0].remaining).toBe(49);
  });

  it("refuses sales received by email on the free plan, even for the service role", async () => {
    await expect(
      adminQuery("insert into public.inbound_emails (organization_id, store_id, message_id, kind) values ($1, $2, 'free-1', 'sale')", [shop.orgId, shop.storeId]),
    ).rejects.toThrow(/plan_required/);
    await adminQuery("insert into public.inbound_emails (organization_id, store_id, message_id, kind) values ($1, $2, 'trial-1', 'sale')", [trialShop.orgId, trialShop.storeId]);
  });

  it("answers 403 from the inbound webhook for a free workspace and stores nothing", async () => {
    process.env.INBOUND_WEBHOOK_SECRET = "db-test-plans-secret-0123456789";
    process.env.INBOUND_EMAIL_ADDRESS_TEMPLATE = "localtest+{token}@inbound.postmarkapp.com";
    const { POST } = await import("@/app/api/inbound/email/route");
    const token = (await adminQuery("select inbound_token from public.stores where id = $1", [shop.storeId])).rows[0].inbound_token as string;
    const response = await POST(
      new Request("http://localhost/api/inbound/email", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from("narixia:db-test-plans-secret-0123456789").toString("base64")}` },
        body: JSON.stringify({ From: "seller@gmail.com", To: `localtest+${token}@inbound.postmarkapp.com`, MailboxHash: token, Subject: "Vendu !", TextBody: "Prix : 10 €", MessageID: "free-webhook-1" }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await adminQuery("select count(*)::int as n from public.inbound_emails where store_id = $1", [shop.storeId])).rows[0].n).toBe(0);
  });

  it("keeps free and Revendeur workspaces in reseller mode; Pro and the trial may switch", async () => {
    await expect(asUser(user, (q) => q("update public.stores set business_model = 'ecommerce' where id = $1", [shop.storeId]))).rejects.toMatchObject({ message: "ecommerce_requires_pro" });
    const subscriptionId = `sub_mode_${sku()}`;
    await adminQuery("insert into public.subscriptions (id, organization_id, status, plan, stripe_event_at) values ($1, $2, 'active', 'reseller', now())", [subscriptionId, shop.orgId]);
    await expect(asUser(user, (q) => q("update public.stores set business_model = 'ecommerce' where id = $1", [shop.storeId]))).rejects.toThrow(/ecommerce_requires_pro/);
    await adminQuery("update public.subscriptions set plan = 'pro' where id = $1", [subscriptionId]);
    await asUser(user, (q) => q("update public.stores set business_model = 'ecommerce' where id = $1", [shop.storeId]));
    await asUser(trialUser, (q) => q("update public.stores set business_model = 'ecommerce' where id = $1", [trialShop.storeId]));
    await adminQuery("delete from public.subscriptions where id = $1", [subscriptionId]);
  });
});

describe("subscription plans", () => {
  let user: string;
  let shop: Shop;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(async () => {
    user = await newUser();
    shop = await onboardReseller(user);
  });

  function subscription(id: string, price: string): Stripe.Subscription {
    return {
      id,
      object: "subscription",
      status: "active",
      customer: `cus_plan_${shop.orgId.slice(0, 8)}`,
      metadata: { organization_id: shop.orgId },
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_end: null,
      items: { object: "list", data: [{ price: { id: price }, current_period_start: now, current_period_end: now + 30 * 86400 }] },
    } as unknown as Stripe.Subscription;
  }

  const event = (type: string, object: unknown): Stripe.Event =>
    ({ id: `evt_${Math.random().toString(36).slice(2)}`, object: "event", type, created: Math.floor(Date.now() / 1000), data: { object } }) as unknown as Stripe.Event;

  it("accepts only the pro and reseller plans", async () => {
    await expect(
      adminQuery("insert into public.subscriptions (id, organization_id, status, plan, stripe_event_at) values ('sub_bad_plan', $1, 'active', 'gold', now())", [shop.orgId]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("stores the plan mapped from the Stripe price by the webhook and shows it in the view", async () => {
    let current = subscription("sub_plan_reseller", "price_test_reseller");
    const deps = { admin, retrieveSubscription: async () => current, resellerPriceId: "price_test_reseller" };
    const outcome = await processStripeEvent(event("customer.subscription.created", current), deps);
    expect(outcome).toMatchObject({ status: "processed", summary: { plan: "reseller" } });
    expect((await adminQuery("select plan from public.subscriptions where id = 'sub_plan_reseller'")).rows[0].plan).toBe("reseller");
    const view = async () => (await asUser(user, (q) => q("select access, paid_plan, stock_limit from public.organization_entitlements"))).rows[0];
    expect(await view()).toEqual({ access: "pro", paid_plan: "reseller", stock_limit: null });

    // Switching price in the billing portal sends customer.subscription.updated: the plan follows.
    current = subscription("sub_plan_reseller", "price_test_pro");
    await processStripeEvent(event("customer.subscription.updated", current), deps);
    expect(await view()).toEqual({ access: "pro", paid_plan: "pro", stock_limit: null });
  });
});
