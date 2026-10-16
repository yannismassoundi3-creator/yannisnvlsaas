import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminQuery, asUser, cleanupUsers, createOrganization, createUser, pool } from "./helpers";

/** The plan's store limit holds in the database, also for direct API calls. */

let user: string;
let org: { orgId: string; storeId: string };

beforeAll(async () => {
  user = await createUser();
  org = await createOrganization(user);
});

afterAll(async () => {
  await cleanupUsers([user]);
  await pool.end();
});

const addStore = (name: string) =>
  asUser(user, (q) => q("insert into public.stores (organization_id, name, currency, minor_digits, timezone) values ($1, $2, 'EUR', 2, 'UTC')", [org.orgId, name]), {
    commit: true,
  });

describe("store limits", () => {
  it("allows one real store during the trial", async () => {
    await expect(addStore("Second")).rejects.toThrow(/Store limit reached/);
  });

  it("does not count the sample store", async () => {
    await expect(
      adminQuery("insert into public.stores (organization_id, name, currency, minor_digits, timezone, is_demo) values ($1, 'Sample store', 'EUR', 2, 'UTC', true)", [org.orgId]),
    ).resolves.toBeDefined();
  });

  it("allows three real stores on Pro", async () => {
    await adminQuery("insert into public.subscriptions (id, organization_id, status, stripe_event_at) values ($1, $2, 'active', now())", [`sub_stores_${org.orgId.slice(0, 8)}`, org.orgId]);
    await addStore("Second");
    await addStore("Third");
    await expect(addStore("Fourth")).rejects.toThrow(/Store limit reached/);
    const count = await adminQuery("select count(*)::int as n from public.stores where organization_id = $1 and not is_demo", [org.orgId]);
    expect(count.rows[0].n).toBe(3);
  });
});
