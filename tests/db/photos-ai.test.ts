import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminQuery, asUser, cleanupUsers, createOrganization, createUser, DB_URL, expireTrial } from "./helpers";

/**
 * Item photos and AI listings in the database: the photo_path constraint, the
 * storage policies of the item-photos bucket, RLS on ai_usage, and the quota
 * functions (atomic reservation that never exceeds the cap, refund reserved to
 * the server).
 */

let alice: string;
let bob: string;
let carol: string;
let a: { orgId: string; storeId: string };
let b: { orgId: string; storeId: string };
let c: { orgId: string; storeId: string };
let aliceItem: string;
let bobItem: string;
let carolItem: string;

async function item(shop: { orgId: string; storeId: string }) {
  const { rows } = await adminQuery<{ id: string }>("insert into public.products (organization_id, store_id, name, sku) values ($1, $2, 'Veste', $3) returning id", [
    shop.orgId,
    shop.storeId,
    `R-${randomUUID().slice(0, 10)}`,
  ]);
  return rows[0].id;
}

const photoPath = (org: string, product: string) => `${org}/${product}/${randomUUID()}.jpg`;
const insertObject = "insert into storage.objects (bucket_id, name, metadata) values ('item-photos', $1, '{\"mimetype\":\"image/jpeg\",\"size\":1000}') returning name";

beforeAll(async () => {
  alice = await createUser();
  bob = await createUser();
  carol = await createUser();
  a = await createOrganization(alice);
  b = await createOrganization(bob);
  c = await createOrganization(carol);
  aliceItem = await item(a);
  bobItem = await item(b);
  carolItem = await item(c);
  await expireTrial(c.orgId);
});

afterAll(async () => {
  await adminQuery(
    "begin; set local storage.allow_delete_query = 'true'; delete from storage.objects where bucket_id = 'item-photos' and name like any(array['" +
      [a, b, c].map((s) => `${s.orgId}/%`).join("','") +
      "']); commit;",
  );
  await cleanupUsers([alice, bob, carol]);
});

describe("products.photo_path", () => {
  it("accepts only a path in the item's own organisation and item folder", async () => {
    await adminQuery("update public.products set photo_path = $1 where id = $2", [photoPath(a.orgId, aliceItem), aliceItem]);
    await expect(adminQuery("update public.products set photo_path = $1 where id = $2", [photoPath(b.orgId, aliceItem), aliceItem])).rejects.toMatchObject({ code: "23514" });
    await expect(adminQuery("update public.products set photo_path = $1 where id = $2", [photoPath(a.orgId, bobItem), aliceItem])).rejects.toMatchObject({ code: "23514" });
    await expect(adminQuery("update public.products set photo_path = $1 where id = $2", [`${a.orgId}/${aliceItem}/../x.jpg`, aliceItem])).rejects.toMatchObject({ code: "23514" });
    await adminQuery("update public.products set photo_path = null where id = $1", [aliceItem]);
  });

  it("is writable by members through the existing product policies", async () => {
    const path = photoPath(a.orgId, aliceItem);
    const { rowCount } = await asUser(alice, (q) => q("update public.products set photo_path = $1 where id = $2", [path, aliceItem]));
    expect(rowCount).toBe(1);
    const other = await asUser(bob, (q) => q("update public.products set photo_path = $1 where id = $2", [path, aliceItem]));
    expect(other.rowCount).toBe(0);
  });
});

describe("item-photos bucket", () => {
  it("is private, limited to 300 KB of JPEG or WebP", async () => {
    const { rows } = await adminQuery("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'item-photos'");
    expect(rows[0]).toEqual({ public: false, file_size_limit: 307200, allowed_mime_types: ["image/jpeg", "image/webp"] });
  });

  it("lets a member upload, read and delete in their organisation's folder only", async () => {
    const path = photoPath(a.orgId, aliceItem);
    await asUser(alice, (q) => q(insertObject, [path]), { commit: true });
    const own = await asUser(alice, (q) => q("select name from storage.objects where name = $1", [path]));
    expect(own.rowCount).toBe(1);

    // Another organisation's member cannot see, overwrite or delete it.
    const seen = await asUser(bob, (q) => q("select name from storage.objects where name = $1", [path]));
    expect(seen.rowCount).toBe(0);
    const deleted = await asUser(bob, async (q) => {
      await q("set local storage.allow_delete_query = 'true'");
      return q("delete from storage.objects where name = $1", [path]);
    });
    expect(deleted.rowCount).toBe(0);
    const updated = await asUser(bob, (q) => q("update storage.objects set name = name where name = $1", [path]));
    expect(updated.rowCount).toBe(0);

    // The owner can delete it.
    const removed = await asUser(
      alice,
      async (q) => {
        await q("set local storage.allow_delete_query = 'true'");
        return q("delete from storage.objects where name = $1", [path]);
      },
      { commit: true },
    );
    expect(removed.rowCount).toBe(1);
  });

  it("refuses uploads into another organisation, for another organisation's item, with a bad path or without access", async () => {
    await expect(asUser(bob, (q) => q(insertObject, [photoPath(a.orgId, aliceItem)]))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(alice, (q) => q(insertObject, [photoPath(a.orgId, bobItem)]))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(alice, (q) => q(insertObject, [`${a.orgId}/notes.txt`]))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(alice, (q) => q(insertObject, [`${a.orgId}/${aliceItem}/${randomUUID()}.svg`]))).rejects.toMatchObject({ code: "42501" });
    // Expired trial: read-only, like every other write.
    await expect(asUser(carol, (q) => q(insertObject, [photoPath(c.orgId, carolItem)]))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(null, (q) => q(insertObject, [photoPath(a.orgId, aliceItem)]))).rejects.toMatchObject({ code: "42501" });
  });
});

describe("ai_usage", () => {
  it("is readable by members of the organisation only and not writable through the API", async () => {
    await adminQuery("insert into public.ai_usage (organization_id, period, used) values ($1, date_trunc('month', now())::date - interval '1 month', 7)", [a.orgId]);
    const own = await asUser(alice, (q) => q("select used from public.ai_usage where organization_id = $1", [a.orgId]));
    expect(own.rows).toEqual([{ used: 7 }]);
    const other = await asUser(bob, (q) => q("select used from public.ai_usage where organization_id = $1", [a.orgId]));
    expect(other.rowCount).toBe(0);
    await expect(asUser(alice, (q) => q("update public.ai_usage set used = 0 where organization_id = $1", [a.orgId]))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(alice, (q) => q("insert into public.ai_usage (organization_id, period, used) values ($1, '2030-01-01', 0)", [a.orgId]))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(alice, (q) => q("delete from public.ai_usage where organization_id = $1", [a.orgId]))).rejects.toMatchObject({ code: "42501" });
  });
});

describe("reserve_listing_analysis / release_listing_analysis", () => {
  const reserve = (user: string, org: string, limit: number) =>
    asUser(user, (q) => q<{ remaining: number; period: string }>("select * from public.reserve_listing_analysis($1, $2)", [org, limit]), { commit: true });

  it("counts down and stops at the cap", async () => {
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await reserve(alice, a.orgId, 3)).rows[0].remaining);
    expect(results).toEqual([2, 1, 0]);
    await expect(reserve(alice, a.orgId, 3)).rejects.toMatchObject({ message: "quota_exhausted" });
    const { rows } = await adminQuery("select used, period = date_trunc('month', now() at time zone 'utc')::date as current from public.ai_usage where organization_id = $1 and used = 3", [a.orgId]);
    expect(rows).toEqual([{ used: 3, current: true }]);
  });

  it("refuses non-members, expired organisations and anonymous callers", async () => {
    await expect(reserve(bob, a.orgId, 50)).rejects.toMatchObject({ code: "42501" });
    await expect(reserve(carol, c.orgId, 50)).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(null, (q) => q("select * from public.reserve_listing_analysis($1, 50)", [a.orgId]))).rejects.toMatchObject({ code: "42501" });
  });

  it("lets only the server refund, never below zero", async () => {
    const period = (await adminQuery<{ p: string }>("select to_char(date_trunc('month', now() at time zone 'utc'), 'YYYY-MM-DD') as p")).rows[0].p;
    await expect(asUser(alice, (q) => q("select public.release_listing_analysis($1, $2)", [a.orgId, period]))).rejects.toMatchObject({ code: "42501" });
    const asService = async () => {
      const client = new pg.Client({ connectionString: DB_URL });
      await client.connect();
      try {
        await client.query("begin; set local role service_role;");
        await client.query("select public.release_listing_analysis($1, $2)", [b.orgId, period]);
        await client.query("select public.release_listing_analysis($1, $2)", [a.orgId, period]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    };
    await asService();
    const { rows } = await adminQuery("select used from public.ai_usage where organization_id = $1 and period = $2", [a.orgId, period]);
    expect(rows).toEqual([{ used: 2 }]);
    await adminQuery("update public.ai_usage set used = 0 where organization_id = $1 and period = $2", [a.orgId, period]);
    await asService();
    const after = await adminQuery("select used from public.ai_usage where organization_id = $1 and period = $2", [a.orgId, period]);
    expect(after.rows).toEqual([{ used: 0 }]);
  });

  it("never exceeds the cap under concurrent reservations", async () => {
    const concurrent = new pg.Pool({ connectionString: DB_URL, max: 12 });
    try {
      const attempt = async () => {
        const client = await concurrent.connect();
        try {
          await client.query("begin");
          await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
          await client.query("set local role authenticated");
          await client.query("select * from public.reserve_listing_analysis($1, 5)", [b.orgId]);
          // Hold the transaction a moment so the others pile up on the row.
          await client.query("select pg_sleep(0.02)");
          await client.query("commit");
          return true;
        } catch {
          await client.query("rollback").catch(() => undefined);
          return false;
        } finally {
          client.release();
        }
      };
      const results = await Promise.all(Array.from({ length: 24 }, attempt));
      expect(results.filter(Boolean)).toHaveLength(5);
      const { rows } = await adminQuery("select sum(used)::int as used from public.ai_usage where organization_id = $1", [b.orgId]);
      expect(rows[0].used).toBe(5);
    } finally {
      await concurrent.end();
    }
  });
});
