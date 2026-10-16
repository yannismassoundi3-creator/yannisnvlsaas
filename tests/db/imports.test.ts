import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeRows, type RawRow } from "@/lib/imports/normalize";
import { DEFAULT_OPTIONS, type ImportKind, type ImportOptions } from "@/lib/imports/schema";
import { adminQuery, asUser, cleanupUsers, createOrganization, createUser, expireTrial, pool } from "./helpers";

/**
 * The import pipeline end to end in the database: rows normalised by the same
 * TypeScript code the server uses, staged as the user, then finalised,
 * committed in batches and undone through the SQL functions.
 */

let user: string;
let org: { orgId: string; storeId: string };

beforeAll(async () => {
  user = await createUser();
  org = await createOrganization(user, { currency: "EUR", digits: 2, timezone: "Europe/Paris" });
});

afterAll(async () => {
  await cleanupUsers([user]);
  await pool.end();
});

type Stage = { kind: ImportKind; rows: Record<string, string>[]; options?: Partial<ImportOptions>; chunkSize?: number; asUserId?: string; target?: typeof org };

async function stage({ kind, rows, options = {}, chunkSize = 500, asUserId = user, target = org }: Stage): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const raw: RawRow[] = rows.map((values, i) => ({ rowNumber: i + 2, values }));
  return asUser(
    asUserId,
    async (q) => {
      const job = await q(
        "insert into public.import_jobs (organization_id, store_id, kind, file_name, total_rows, options, created_by) values ($1, $2, $3, 'test.csv', $4, $5, $6) returning id",
        [target.orgId, target.storeId, kind, rows.length, JSON.stringify(opts), asUserId],
      );
      const jobId = job.rows[0].id as string;
      for (let start = 0, chunk = 0; start < raw.length; start += chunkSize, chunk++) {
        const normalized = normalizeRows(kind, raw.slice(start, start + chunkSize), opts, { currency: "EUR", timezone: "Europe/Paris" });
        for (const r of normalized) {
          await q(
            "insert into public.import_rows (organization_id, import_job_id, row_number, status, data, raw, errors, warnings, dedupe_key, chunk) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
            [
              target.orgId,
              jobId,
              r.rowNumber,
              r.status,
              r.data ? JSON.stringify(r.data) : null,
              JSON.stringify(r.raw),
              JSON.stringify(r.errors),
              JSON.stringify(r.warnings),
              r.dedupeKey,
              chunk,
            ],
          );
        }
      }
      return jobId;
    },
    { commit: true },
  );
}

const finalize = (jobId: string, u = user) => asUser(u, async (q) => (await q("select public.import_finalize($1) as r", [jobId])).rows[0].r, { commit: true });

async function commitAll(jobId: string, limit = 500) {
  for (let i = 0; i < 100; i++) {
    const r = await asUser(user, async (q) => (await q("select public.import_commit_batch($1, $2) as r", [jobId, limit])).rows[0].r, { commit: true });
    if (r.done) return i + 1;
  }
  throw new Error("commit did not finish");
}

const rollback = (jobId: string) => asUser(user, async (q) => (await q("select public.import_rollback($1) as r", [jobId])).rows[0].r, { commit: true });
const job = async (jobId: string) => (await adminQuery("select * from public.import_jobs where id = $1", [jobId])).rows[0];
const orderLines = async (externalId: string) =>
  (
    await adminQuery(
      "select i.name, i.quantity, i.gross_minor, i.discount_minor, i.product_id is not null as linked from public.order_items i join public.orders o on o.id = i.order_id where o.store_id = $1 and o.external_id = $2 order by i.position",
      [org.storeId, externalId],
    )
  ).rows;

const ORDERS = [
  { order_number: "#1001", ordered_at: "2026-03-02 10:15:00 +0100", line_name: "Linen tote", line_sku: "TOTE-01", quantity: "2", unit_price: "24.00", shipping_charged: "4.90", taxes: "0", refunded_amount: "0" },
  { order_number: "#1001", ordered_at: "", line_name: "Cotton tee", line_sku: "TEE-01", quantity: "1", unit_price: "29.00", shipping_charged: "", taxes: "", refunded_amount: "" },
  { order_number: "#1002", ordered_at: "2026-03-03 09:00:00 +0100", line_name: "Linen tote", line_sku: "TOTE-01", quantity: "1", unit_price: "24.00", shipping_charged: "0", taxes: "0", refunded_amount: "24.00" },
];

describe("orders import", () => {
  let first: string;

  it("stages, finalises and commits in batches", async () => {
    first = await stage({ kind: "orders", rows: ORDERS });
    expect(await finalize(first)).toEqual({ total: 3, valid: 3, invalid: 0, duplicate: 0 });
    // A batch limit of 1 row still processes whole orders: two orders -> two batches.
    expect(await commitAll(first, 1)).toBe(2);
    expect(await job(first)).toMatchObject({ status: "committed", inserted_count: 3, updated_count: 0, skipped_count: 0 });
    expect(await orderLines("#1001")).toEqual([
      { name: "Linen tote", quantity: 2, gross_minor: 4800, discount_minor: 0, linked: true },
      { name: "Cotton tee", quantity: 1, gross_minor: 2900, discount_minor: 0, linked: true },
    ]);
    const products = await adminQuery("select sku, source, unit_cost_e4 from public.products where store_id = $1 order by sku", [org.storeId]);
    expect(products.rows).toEqual([
      { sku: "TEE-01", source: "csv", unit_cost_e4: null },
      { sku: "TOTE-01", source: "csv", unit_cost_e4: null },
    ]);
    const refunds = await adminQuery(
      "select rf.amount_minor, rf.date_estimated from public.refunds rf join public.orders o on o.id = rf.order_id where o.external_id = '#1002' and o.store_id = $1",
      [org.storeId],
    );
    expect(refunds.rows).toEqual([{ amount_minor: 2400, date_estimated: true }]);
  });

  it("re-importing the same file adds nothing (safe re-import)", async () => {
    const again = await stage({ kind: "orders", rows: ORDERS });
    expect(await finalize(again)).toMatchObject({ valid: 0, duplicate: 3 });
    await commitAll(again);
    expect(await job(again)).toMatchObject({ status: "committed", inserted_count: 0, skipped_count: 3 });
    const count = await adminQuery("select count(*)::int as n from public.orders where store_id = $1", [org.storeId]);
    expect(count.rows[0].n).toBe(2);
    // The skipped re-import is now the latest import, so the first cannot be undone before it.
    await expect(rollback(first)).rejects.toThrow(/more recent imports/);
    await rollback(again);
  });

  it("replaces existing orders on request and undo restores them exactly", async () => {
    const changed = ORDERS.map((r, i) => (i === 0 ? { ...r, quantity: "5" } : r));
    const update = await stage({ kind: "orders", rows: changed, options: { duplicates: "update" } });
    expect(await finalize(update)).toMatchObject({ valid: 3, duplicate: 0 });
    await commitAll(update);
    expect(await job(update)).toMatchObject({ status: "committed", updated_count: 3 });
    expect((await orderLines("#1001"))[0]).toMatchObject({ quantity: 5, gross_minor: 12000 });

    expect(await rollback(update)).toMatchObject({ restored: 2, removed: 0 });
    expect((await orderLines("#1001"))[0]).toMatchObject({ quantity: 2, gross_minor: 4800 });
    const refunds = await adminQuery("select count(*)::int as n from public.refunds where store_id = $1", [org.storeId]);
    expect(refunds.rows[0].n).toBe(1);
  });

  it("undoing the original import removes its orders, refunds and the products it created", async () => {
    expect(await rollback(first)).toMatchObject({ removed: 2 });
    const left = await adminQuery(
      "select (select count(*) from public.orders where store_id = $1)::int as orders, (select count(*) from public.refunds where store_id = $1)::int as refunds, (select count(*) from public.products where store_id = $1)::int as products",
      [org.storeId],
    );
    expect(left.rows[0]).toEqual({ orders: 0, refunds: 0, products: 0 });
    expect((await job(first)).status).toBe("rolled_back");
  });

  it("never imports part of an order split across upload chunks", async () => {
    const split = await stage({ kind: "orders", rows: ORDERS.slice(0, 2), chunkSize: 1 });
    expect(await finalize(split)).toMatchObject({ valid: 0, invalid: 2 });
    const errors = await adminQuery("select errors from public.import_rows where import_job_id = $1 order by row_number", [split]);
    expect(JSON.stringify(errors.rows[0].errors)).toMatch(/split across the upload/);
  });
});

describe("products import", () => {
  it("updates costs of existing products, keeps unmapped values, and undo restores them", async () => {
    const create = await stage({ kind: "products", rows: [{ name: "Mug", sku: "MUG-01", unit_cost: "3.10", price: "12" }] });
    await finalize(create);
    await commitAll(create);

    const update = await stage({
      kind: "products",
      rows: [
        { name: "Mug", sku: "mug-01 ", unit_cost: "3.45" },
        { name: "Mug again", sku: "MUG-01", unit_cost: "9.99" },
        { name: "Bowl", sku: "BOWL-01", unit_cost: "" },
      ],
      options: { duplicates: "update" },
    });
    expect(await finalize(update)).toMatchObject({ valid: 2, duplicate: 1 });
    await commitAll(update);
    const after = await adminQuery("select sku, unit_cost_e4, price_minor from public.products where store_id = $1 order by sku", [org.storeId]);
    expect(after.rows).toEqual([
      { sku: "BOWL-01", unit_cost_e4: null, price_minor: null },
      { sku: "mug-01", unit_cost_e4: 34500, price_minor: 1200 },
    ]);

    await rollback(update);
    const restored = await adminQuery("select sku, unit_cost_e4 from public.products where store_id = $1 order by sku", [org.storeId]);
    expect(restored.rows).toEqual([{ sku: "MUG-01", unit_cost_e4: 31000 }]);
    await rollback(create);
  });

  it("marks a row the database rejects as invalid and commits the rest", async () => {
    await adminQuery("insert into public.products (organization_id, store_id, sku, name) values ($1, $2, 'TAKEN', 'Taken')", [org.orgId, org.storeId]);
    await adminQuery("insert into public.products (organization_id, store_id, name) values ($1, $2, 'Renamed later')", [org.orgId, org.storeId]);
    // Matches "Renamed later" by name and tries to give it a SKU another product uses.
    const conflict = await stage({
      kind: "products",
      rows: [
        { name: "Renamed later", sku: "", unit_cost: "1" },
        { name: "Fine", sku: "FINE-1", unit_cost: "2" },
      ],
      options: { duplicates: "update" },
    });
    await finalize(conflict);
    await adminQuery("update public.import_rows set data = jsonb_set(data, '{sku}', '\"TAKEN\"') where import_job_id = $1 and row_number = 2", [conflict]);
    await commitAll(conflict);
    const rows = await adminQuery("select row_number, status from public.import_rows where import_job_id = $1 order by row_number", [conflict]);
    expect(rows.rows).toEqual([
      { row_number: 2, status: "invalid" },
      { row_number: 3, status: "imported" },
    ]);
    await rollback(conflict);
    await adminQuery("delete from public.products where store_id = $1", [org.storeId]);
  });
});

describe("ad spend and expenses imports", () => {
  it("creates campaigns, flags in-file duplicates and skips existing days", async () => {
    const rows: Record<string, string>[] = [
      { date: "2026-03-01", campaign: "Prospecting", platform: "Meta", spend: "40.00", clicks: "100" },
      { date: "2026-03-01", campaign: "Prospecting", platform: "Facebook", spend: "41.00", clicks: "100" },
      { date: "2026-03-02", campaign: "Search", platform: "Google", spend: "12.00" },
    ];
    const first = await stage({ kind: "ad_spend", rows });
    expect(await finalize(first)).toMatchObject({ valid: 2, duplicate: 1 });
    await commitAll(first);
    const spend = await adminQuery(
      "select c.platform, c.name, a.spend_minor from public.ad_spend_daily a join public.ad_campaigns c on c.id = a.campaign_id where a.store_id = $1 order by a.spend_date",
      [org.storeId],
    );
    expect(spend.rows).toEqual([
      { platform: "meta", name: "Prospecting", spend_minor: 4000 },
      { platform: "google", name: "Search", spend_minor: 1200 },
    ]);
    const again = await stage({ kind: "ad_spend", rows: rows.slice(2) });
    expect(await finalize(again)).toMatchObject({ valid: 0, duplicate: 1 });
    await commitAll(again);
    await rollback(again);
    await rollback(first);
    const left = await adminQuery("select (select count(*) from public.ad_campaigns where store_id = $1)::int as c", [org.storeId]);
    expect(left.rows[0].c).toBe(0);
  });

  it("skips an expense that is already recorded", async () => {
    const rows = [{ date: "2026-03-01", amount: "29.00", category: "software", description: "Email tool" }];
    const first = await stage({ kind: "expenses", rows });
    await finalize(first);
    await commitAll(first);
    const again = await stage({ kind: "expenses", rows });
    expect(await finalize(again)).toMatchObject({ valid: 0, duplicate: 1 });
    await commitAll(again);
    const count = await adminQuery("select count(*)::int as n, min(kind) as kind from public.expenses where store_id = $1", [org.storeId]);
    expect(count.rows[0]).toEqual({ n: 1, kind: "fixed" });
    await rollback(again);
    await rollback(first);
  });
});

describe("import access control", () => {
  it("hides one organisation's imports from another", async () => {
    const jobId = await stage({ kind: "expenses", rows: [{ date: "2026-03-01", amount: "5" }] });
    const stranger = await createUser();
    await createOrganization(stranger);
    await expect(finalize(jobId, stranger)).rejects.toThrow(/Import not found/);
    await cleanupUsers([stranger]);
  });

  it("pauses imports once access has expired", async () => {
    const lapsed = await createUser();
    const lapsedOrg = await createOrganization(lapsed);
    const jobId = await stage({ kind: "expenses", rows: [{ date: "2026-03-01", amount: "5" }], asUserId: lapsed, target: lapsedOrg });
    await expireTrial(lapsedOrg.orgId);
    await expect(finalize(jobId, lapsed)).rejects.toThrow(/Imports are paused/);
    await cleanupUsers([lapsed]);
  });
});
