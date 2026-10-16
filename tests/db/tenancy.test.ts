import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PAYMENT_GRACE_DAYS, TRIAL_DAYS } from "@/config/plans";
import { adminQuery, asUser, cleanupUsers, createOrganization, createUser, expireTrial, pool } from "./helpers";

/**
 * Tenant isolation and access control, tested through the real RLS policies
 * and column grants of the local Supabase database.
 */

let alice: string;
let bob: string;
let aliceOrg: { orgId: string; storeId: string };
let bobOrg: { orgId: string; storeId: string };

beforeAll(async () => {
  alice = await createUser();
  bob = await createUser();
  aliceOrg = await createOrganization(alice);
  bobOrg = await createOrganization(bob);
});

afterAll(async () => {
  await cleanupUsers([alice, bob]);
  await pool.end();
});

const insertProduct = (orgId: string, storeId: string, name = "Tote bag") =>
  [
    "insert into public.products (organization_id, store_id, sku, name, unit_cost_e4) values ($1, $2, $3, $4, 100000) returning id",
    [orgId, storeId, `SKU-${Math.random().toString(36).slice(2, 8)}`, name],
  ] as const;

describe("onboarding RPC", () => {
  it("creates the organisation, owner membership, store and profile", async () => {
    const result = await asUser(alice, async (q) => {
      const org = await q("select id, trial_ends_at - trial_started_at as trial from public.organizations");
      const member = await q("select role from public.organization_members where user_id = $1", [alice]);
      const store = await q("select currency, minor_digits, is_demo from public.stores");
      const profile = await q("select full_name from public.profiles where id = $1", [alice]);
      return { org: org.rows, member: member.rows, store: store.rows, profile: profile.rows };
    });
    expect(result.org).toHaveLength(1);
    expect(result.member).toEqual([{ role: "owner" }]);
    expect(result.store).toEqual([{ currency: "EUR", minor_digits: 2, is_demo: false }]);
    expect(result.profile).toEqual([{ full_name: "Test User" }]);
  });

  it("refuses a second organisation for the same user", async () => {
    await expect(createOrganization(alice)).rejects.toThrow(/already belong/);
  });

  it("refuses anonymous callers", async () => {
    await expect(
      asUser(null, (q) => q("select * from public.create_organization_with_store('a','b','other','EUR',2::smallint,'UTC',false)")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("tenant isolation", () => {
  it("hides other organisations' rows", async () => {
    const counts = await asUser(alice, async (q) => {
      const orgs = await q("select id from public.organizations");
      const stores = await q("select id from public.stores");
      const members = await q("select user_id from public.organization_members");
      return { orgs: orgs.rows.map((r) => r.id), stores: stores.rows.map((r) => r.id), members: members.rows.map((r) => r.user_id) };
    });
    expect(counts.orgs).toEqual([aliceOrg.orgId]);
    expect(counts.stores).toEqual([aliceOrg.storeId]);
    expect(counts.members).toEqual([alice]);
  });

  it("blocks writes into another organisation", async () => {
    await expect(asUser(alice, (q) => q(...insertProduct(bobOrg.orgId, bobOrg.storeId)))).rejects.toThrow(/row-level security/);
  });

  it("blocks cross-tenant references even with a valid own organisation id", async () => {
    // Composite foreign key (store_id, organization_id) prevents pointing at Bob's store.
    await expect(asUser(alice, (q) => q(...insertProduct(aliceOrg.orgId, bobOrg.storeId)))).rejects.toThrow(/foreign key|row-level security/);
  });

  it("does not leak other tenants' data through updates or deletes", async () => {
    const productId = await asUser(bob, async (q) => (await q(...insertProduct(bobOrg.orgId, bobOrg.storeId))).rows[0].id, { commit: true });
    const result = await asUser(alice, async (q) => {
      const upd = await q("update public.products set name = 'Hacked' where id = $1", [productId]);
      const del = await q("delete from public.products where id = $1", [productId]);
      return { updated: upd.rowCount, deleted: del.rowCount };
    });
    expect(result).toEqual({ updated: 0, deleted: 0 });
    const { rows } = await adminQuery("select name from public.products where id = $1", [productId]);
    expect(rows[0].name).toBe("Tote bag");
  });

  it("prevents joining another organisation", async () => {
    await expect(
      asUser(alice, (q) => q("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [bobOrg.orgId, alice])),
    ).rejects.toThrow(/permission denied/);
  });

  it("prevents moving a store to another organisation", async () => {
    await expect(
      asUser(alice, (q) => q("update public.stores set organization_id = $1 where id = $2", [bobOrg.orgId, aliceOrg.storeId])),
    ).rejects.toThrow(/permission denied/);
  });

  it("gives anonymous visitors no access", async () => {
    await expect(asUser(null, (q) => q("select * from public.products"))).rejects.toThrow(/permission denied/);
    await expect(asUser(null, (q) => q("select * from public.organizations"))).rejects.toThrow(/permission denied/);
  });
});

describe("protected columns and billing data", () => {
  it("lets owners rename their organisation but never change the trial", async () => {
    const renamed = await asUser(alice, (q) => q("update public.organizations set name = 'Renamed' where id = $1", [aliceOrg.orgId]));
    expect(renamed.rowCount).toBe(1);
    await expect(
      asUser(alice, (q) => q("update public.organizations set trial_ends_at = now() + interval '1 year' where id = $1", [aliceOrg.orgId])),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps billing tables server-only", async () => {
    await expect(
      asUser(alice, (q) =>
        q("insert into public.subscriptions (id, organization_id, status, stripe_event_at) values ('sub_fake', $1, 'active', now())", [aliceOrg.orgId]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, (q) => q("select * from public.billing_events"))).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, (q) => q("select * from public.billing_customers"))).rejects.toThrow(/permission denied/);
  });

  it("prevents users from creating demo stores or changing a store's currency", async () => {
    await expect(
      asUser(alice, (q) =>
        q("insert into public.stores (organization_id, name, currency, minor_digits, timezone, is_demo) values ($1, 'x', 'EUR', 2, 'UTC', true)", [aliceOrg.orgId]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, (q) => q("update public.stores set currency = 'USD' where id = $1", [aliceOrg.storeId]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("rejects unknown time zones", async () => {
    await expect(
      asUser(alice, (q) => q("update public.stores set timezone = 'Mars/Olympus' where id = $1", [aliceOrg.storeId])),
    ).rejects.toThrow(/Unknown time zone/);
  });

  it("never stores more than the allowed shape of data", async () => {
    await expect(
      asUser(alice, (q) =>
        q(
          "insert into public.orders (organization_id, store_id, external_id, ordered_at, shipping_charged_minor) values ($1, $2, '#1', now(), -5)",
          [aliceOrg.orgId, aliceOrg.storeId],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("access after the trial", () => {
  let carol: string;
  let carolOrg: { orgId: string; storeId: string };

  beforeAll(async () => {
    carol = await createUser();
    carolOrg = await createOrganization(carol);
  });
  afterAll(async () => cleanupUsers([carol]));

  it("allows writes during the trial", async () => {
    await expect(asUser(carol, (q) => q(...insertProduct(carolOrg.orgId, carolOrg.storeId)))).resolves.toBeDefined();
  });

  it("makes data read-only but deletable when the trial has expired", async () => {
    const productId = await asUser(carol, async (q) => (await q(...insertProduct(carolOrg.orgId, carolOrg.storeId, "Keep"))).rows[0].id, {
      commit: true,
    });
    await expireTrial(carolOrg.orgId);

    const access = await asUser(carol, async (q) => (await q("select access from public.organization_entitlements")).rows[0].access);
    expect(access).toBe("expired");

    await expect(asUser(carol, (q) => q(...insertProduct(carolOrg.orgId, carolOrg.storeId)))).rejects.toThrow(/row-level security/);
    await expect(asUser(carol, (q) => q("update public.products set name = 'x' where id = $1", [productId]))).rejects.toThrow(/row-level security/);

    const readable = await asUser(carol, async (q) => (await q("select count(*)::int as n from public.products")).rows[0].n);
    expect(readable).toBeGreaterThan(0);

    const deleted = await asUser(carol, async (q) => (await q("delete from public.products where id = $1", [productId])).rowCount);
    expect(deleted).toBe(1);
  });

  it("restores write access with an active subscription", async () => {
    await adminQuery(
      "insert into public.subscriptions (id, organization_id, status, stripe_event_at) values ($1, $2, 'active', now())",
      [`sub_${carol.slice(0, 8)}`, carolOrg.orgId],
    );
    const access = await asUser(carol, async (q) => (await q("select access from public.organization_entitlements")).rows[0].access);
    expect(access).toBe("pro");
    await expect(asUser(carol, (q) => q(...insertProduct(carolOrg.orgId, carolOrg.storeId)))).resolves.toBeDefined();
  });

  it("keeps access during the payment grace period only", async () => {
    await adminQuery("update public.subscriptions set status = 'past_due', past_due_since = now() - interval '2 days' where organization_id = $1", [
      carolOrg.orgId,
    ]);
    expect(await asUser(carol, async (q) => (await q("select access from public.organization_entitlements")).rows[0].access)).toBe("grace");
    await expect(asUser(carol, (q) => q(...insertProduct(carolOrg.orgId, carolOrg.storeId)))).resolves.toBeDefined();

    await adminQuery(
      `update public.subscriptions set past_due_since = now() - interval '${PAYMENT_GRACE_DAYS + 1} days' where organization_id = $1`,
      [carolOrg.orgId],
    );
    expect(await asUser(carol, async (q) => (await q("select access from public.organization_entitlements")).rows[0].access)).toBe("expired");
    await expect(asUser(carol, (q) => q(...insertProduct(carolOrg.orgId, carolOrg.storeId)))).rejects.toThrow(/row-level security/);
  });
});

describe("configuration parity", () => {
  it("database trial and grace periods match the application config", async () => {
    const { rows } = await adminQuery(
      "select extract(day from private.trial_period())::int as trial, extract(day from private.payment_grace_period())::int as grace",
    );
    expect(rows[0]).toEqual({ trial: TRIAL_DAYS, grace: PAYMENT_GRACE_DAYS });
  });
});
