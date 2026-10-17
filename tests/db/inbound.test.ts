import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminQuery, asUser, cleanupUsers, createOrganization, createUser, expireTrial, pool } from "./helpers";

/**
 * Sales received by email: the inbound token on stores, RLS on inbound_emails,
 * retention, and the webhook route handler (basic auth, token lookup,
 * idempotency, limits) against the local database.
 */

const SECRET = "db-test-inbound-secret-0123456789";
let alice: string;
let bob: string;
let aliceShop: { orgId: string; storeId: string };
let bobShop: { orgId: string; storeId: string };
let aliceToken: string;
let POST: (request: Request) => Promise<Response>;

const auth = (secret = SECRET) => `Basic ${Buffer.from(`narixia:${secret}`).toString("base64")}`;

function deliver(body: unknown, headers: Record<string, string> = { authorization: auth() }) {
  return POST(
    new Request("http://localhost/api/inbound/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const saleEmail = (token: string, messageId: string, extra: Record<string, unknown> = {}) => ({
  From: "seller@gmail.com",
  FromFull: { Email: "seller@gmail.com", Name: "Seller", MailboxHash: "" },
  To: `localtest+${token}@inbound.postmarkapp.com`,
  ToFull: [{ Email: `localtest+${token}@inbound.postmarkapp.com`, Name: "", MailboxHash: token }],
  OriginalRecipient: `localtest+${token}@inbound.postmarkapp.com`,
  MailboxHash: token,
  Subject: "Fwd: Votre article « Robe fleurie » a été vendu !",
  TextBody: "---------- Forwarded message ---------\nFrom: Vinted <no-reply@vinted.fr>\nSubject: Votre article « Robe fleurie » a été vendu !\n\nAcheteur : julie@example.com\nPrix : 18,50 €\nFrais de port : 2,99 €",
  HtmlBody: "",
  Date: "Sat, 17 Oct 2026 10:00:00 +0200",
  MessageID: messageId,
  ...extra,
});

async function rows(storeId: string) {
  return (await adminQuery("select * from public.inbound_emails where store_id = $1 order by received_at", [storeId])).rows;
}

beforeAll(async () => {
  process.env.INBOUND_WEBHOOK_SECRET = SECRET;
  process.env.INBOUND_EMAIL_ADDRESS_TEMPLATE = "localtest+{token}@inbound.postmarkapp.com";
  alice = await createUser();
  bob = await createUser();
  aliceShop = await createOrganization(alice);
  bobShop = await createOrganization(bob);
  aliceToken = (await adminQuery("select inbound_token from public.stores where id = $1", [aliceShop.storeId])).rows[0].inbound_token;
  ({ POST } = await import("@/app/api/inbound/email/route"));
});

afterAll(async () => {
  await cleanupUsers([alice, bob]);
  await pool.end();
});

describe("inbound token", () => {
  it("gives every store its own random token", async () => {
    const bobToken = (await adminQuery("select inbound_token from public.stores where id = $1", [bobShop.storeId])).rows[0].inbound_token;
    expect(aliceToken).toMatch(/^[a-f0-9]{32}$/);
    expect(bobToken).toMatch(/^[a-f0-9]{32}$/);
    expect(bobToken).not.toBe(aliceToken);
  });

  it("lets members read it but never write it directly", async () => {
    await asUser(alice, async (q) => {
      const { rows: own } = await q("select inbound_token from public.stores where id = $1", [aliceShop.storeId]);
      expect(own[0].inbound_token).toBe(aliceToken);
      await expect(q("update public.stores set inbound_token = 'aaaaaaaaaaaaaaaaaaaaaaaa' where id = $1", [aliceShop.storeId])).rejects.toThrow(/permission denied/);
    });
    await expect(asUser(bob, (q) => q("select inbound_token from public.stores where id = $1", [aliceShop.storeId]))).resolves.toMatchObject({ rows: [] });
  });

  it("is rotated by owners only, for their own stores", async () => {
    await expect(asUser(bob, (q) => q("select public.regenerate_inbound_token($1)", [aliceShop.storeId]))).rejects.toThrow(/Store not found/);
    const rotated = await asUser(alice, (q) => q<{ t: string }>("select public.regenerate_inbound_token($1) as t", [aliceShop.storeId]));
    expect(rotated.rows[0].t).toMatch(/^[a-f0-9]{32}$/);
    expect(rotated.rows[0].t).not.toBe(aliceToken);
    // Rolled back by asUser: the original token stays in place for the next tests.
  });
});

describe("webhook", () => {
  it("is unavailable until configured", async () => {
    const saved = process.env.INBOUND_WEBHOOK_SECRET;
    process.env.INBOUND_WEBHOOK_SECRET = "";
    try {
      expect((await deliver(saleEmail(aliceToken, "m-0"))).status).toBe(503);
    } finally {
      process.env.INBOUND_WEBHOOK_SECRET = saved;
    }
  });

  it("requires the basic-auth credentials", async () => {
    expect((await deliver(saleEmail(aliceToken, "m-1"), {})).status).toBe(401);
    expect((await deliver(saleEmail(aliceToken, "m-1"), { authorization: auth("wrong") })).status).toBe(401);
    expect((await deliver(saleEmail(aliceToken, "m-1"), { authorization: `Basic ${Buffer.from(`other:${SECRET}`).toString("base64")}` })).status).toBe(401);
    expect(await rows(aliceShop.storeId)).toEqual([]);
  });

  it("answers an unknown token exactly like a stored message, and stores nothing", async () => {
    const unknown = await deliver(saleEmail("ffffffffffffffffffffffffffffffff", "m-2"));
    const none = await deliver({ ...saleEmail(aliceToken, "m-3"), MailboxHash: "", ToFull: [], To: "someone@example.test", OriginalRecipient: "" });
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual({ ok: true });
    expect(none.status).toBe(200);
    expect(await rows(aliceShop.storeId)).toEqual([]);
  });

  it("stores a pending, parsed entry for the store, once per message id", async () => {
    const first = await deliver(saleEmail(aliceToken, "m-4"));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    const again = await deliver(saleEmail(aliceToken, "m-4"));
    expect(again.status).toBe(200);
    const stored = await rows(aliceShop.storeId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      organization_id: aliceShop.orgId,
      message_id: "m-4",
      kind: "sale",
      platform: "vinted",
      parsed_amount_minor: 1850,
      parsed_title: "Robe fleurie",
      status: "pending",
      from_address: "no-reply@vinted.fr",
      order_id: null,
    });
    // The buyer's address is not kept.
    expect(stored[0].text_excerpt).not.toContain("julie@example.com");
  });

  it("finds the token in the recipient address when MailboxHash is empty", async () => {
    const res = await deliver({ ...saleEmail(aliceToken, "m-5"), MailboxHash: "", ToFull: [{ Email: `localtest+${aliceToken}@inbound.postmarkapp.com` }] });
    expect(res.status).toBe(200);
    expect((await rows(aliceShop.storeId)).map((r) => r.message_id)).toContain("m-5");
  });

  it("rejects malformed and oversized payloads", async () => {
    expect((await deliver("{not json")).status).toBe(400);
    expect((await deliver({ ...saleEmail(aliceToken, "m-6"), TextBody: 42 })).status).toBe(400);
    expect((await deliver({ ...saleEmail(aliceToken, "m-7"), TextBody: "x".repeat(5 * 1024 * 1024 + 10) })).status).toBe(413);
  });

  it("records Gmail forwarding confirmations with their link and code", async () => {
    await deliver({
      ...saleEmail(aliceToken, "m-8"),
      From: "forwarding-noreply@google.com",
      FromFull: { Email: "forwarding-noreply@google.com" },
      Subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from seller@gmail.com",
      TextBody: "Confirmation code: 123456789\nhttps://mail-settings.google.com/mail/vf-abc",
    });
    const gmail = (await rows(aliceShop.storeId)).find((r) => r.message_id === "m-8");
    expect(gmail).toMatchObject({ kind: "gmail_verification", verification_code: "123456789", verification_url: "https://mail-settings.google.com/mail/vf-abc" });
  });
});

describe("row level security on inbound_emails", () => {
  let emailId: string;

  beforeAll(async () => {
    emailId = (await rows(aliceShop.storeId)).find((r) => r.message_id === "m-4")!.id;
  });

  it("lets members read their store's emails and hides them from other tenants and visitors", async () => {
    const own = await asUser(alice, (q) => q("select id from public.inbound_emails where id = $1", [emailId]));
    expect(own.rows).toHaveLength(1);
    const other = await asUser(bob, (q) => q("select id from public.inbound_emails where id = $1", [emailId]));
    expect(other.rows).toEqual([]);
    await expect(asUser(null, (q) => q("select id from public.inbound_emails"))).rejects.toThrow(/permission denied/);
  });

  it("lets members confirm or dismiss, but not rewrite what was received", async () => {
    const done = await asUser(alice, (q) => q("update public.inbound_emails set status = 'dismissed' where id = $1 returning status", [emailId]));
    expect(done.rows).toEqual([{ status: "dismissed" }]);
    await expect(asUser(alice, (q) => q("update public.inbound_emails set parsed_amount_minor = 1 where id = $1", [emailId]))).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, (q) => q("update public.inbound_emails set status = 'archived' where id = $1", [emailId]))).rejects.toThrow(/status_check/);
    const other = await asUser(bob, (q) => q("update public.inbound_emails set status = 'dismissed' where id = $1 returning id", [emailId]));
    expect(other.rows).toEqual([]);
  });

  it("never lets users insert or delete emails", async () => {
    await expect(
      asUser(alice, (q) =>
        q("insert into public.inbound_emails (organization_id, store_id, message_id, kind) values ($1, $2, 'forged', 'sale')", [aliceShop.orgId, aliceShop.storeId]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, (q) => q("delete from public.inbound_emails where id = $1", [emailId]))).rejects.toThrow(/permission denied/);
  });

  it("only links a confirmed email to an order of the same store", async () => {
    const bobOrder = await adminQuery("insert into public.orders (organization_id, store_id, external_id, ordered_at) values ($1, $2, 'B-1', now()) returning id", [bobShop.orgId, bobShop.storeId]);
    await expect(
      adminQuery("update public.inbound_emails set order_id = $1 where id = $2", [bobOrder.rows[0].id, emailId]),
    ).rejects.toThrow(/violates foreign key|different stores/);
    const ownOrder = await asUser(
      alice,
      (q) => q<{ id: string }>("insert into public.orders (organization_id, store_id, external_id, ordered_at) values ($1, $2, 'A-1', now()) returning id", [aliceShop.orgId, aliceShop.storeId]),
      { commit: true },
    );
    await asUser(alice, async (q) => {
      const linked = await q("update public.inbound_emails set status = 'confirmed', order_id = $1 where id = $2 returning order_id", [ownOrder.rows[0].id, emailId]);
      expect(linked.rows[0].order_id).toBe(ownOrder.rows[0].id);
    });
  });

  it("is read-only once the trial has expired", async () => {
    await expireTrial(aliceShop.orgId);
    try {
      await expect(asUser(alice, (q) => q("update public.inbound_emails set status = 'dismissed' where id = $1", [emailId]))).rejects.toThrow(/row-level security/);
      await expect(asUser(alice, (q) => q("select public.regenerate_inbound_token($1)", [aliceShop.storeId]))).rejects.toThrow(/paused/);
    } finally {
      await adminQuery("update public.organizations set trial_ends_at = now() + interval '14 days' where id = $1", [aliceShop.orgId]);
    }
  });
});

describe("retention", () => {
  it("deletes handled emails after 30 days and pending ones after 90, for the service role only", async () => {
    const insert = (id: string, status: string, days: number) =>
      adminQuery(
        "insert into public.inbound_emails (organization_id, store_id, message_id, kind, status, received_at) values ($1, $2, $3, 'sale', $4, now() - make_interval(days => $5))",
        [bobShop.orgId, bobShop.storeId, id, status, days],
      );
    await insert("old-confirmed", "confirmed", 31);
    await insert("recent-dismissed", "dismissed", 29);
    await insert("old-pending", "pending", 91);
    await insert("pending-60", "pending", 60);
    await expect(asUser(bob, (q) => q("select public.prune_inbound_emails()"))).rejects.toThrow(/permission denied/);
    await adminQuery("select public.prune_inbound_emails()");
    expect((await rows(bobShop.storeId)).map((r) => r.message_id).sort()).toEqual(["pending-60", "recent-dismissed"]);
  });
});
