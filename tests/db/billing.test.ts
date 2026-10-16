import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processStripeEvent, subscriptionRow } from "@/lib/billing/sync";
import type { Database } from "@/lib/supabase/database.types";
import { adminQuery, cleanupUsers, createOrganization, createUser, expireTrial, pool } from "./helpers";

/**
 * Billing state comes only from verified Stripe events. These tests drive the
 * event processor with recorded-shape payloads and an injected subscription
 * lookup (no network), then check what the database grants.
 */

const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SECRET) throw new Error("SUPABASE_SECRET_KEY is not set: copy the local key from `npx supabase status` into .env.local.");
const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

let user: string;
let org: { orgId: string; storeId: string };
const now = Math.floor(Date.now() / 1000);

beforeAll(async () => {
  user = await createUser();
  org = await createOrganization(user);
});

afterAll(async () => {
  await cleanupUsers([user]);
  await pool.end();
});

function subscription(overrides: Partial<Stripe.Subscription> & { id: string; status: Stripe.Subscription.Status }): Stripe.Subscription {
  return {
    object: "subscription",
    customer: "cus_test_narixia",
    metadata: { organization_id: org.orgId },
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    trial_end: null,
    items: { object: "list", data: [{ price: { id: "price_test_pro" }, current_period_start: now, current_period_end: now + 30 * 86400 }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function event(type: string, object: unknown, created = Math.floor(Date.now() / 1000)): Stripe.Event {
  return { id: `evt_${Math.random().toString(36).slice(2)}`, object: "event", type, created, data: { object } } as unknown as Stripe.Event;
}

const access = async () => (await adminQuery("select private.org_access($1) as a", [org.orgId])).rows[0].a as string;
const row = async (id: string) => (await adminQuery("select status, past_due_since, cancel_at_period_end, current_period_end from public.subscriptions where id = $1", [id])).rows[0];

describe("subscription sync", () => {
  let current: Stripe.Subscription;
  const deps = () => ({ admin, retrieveSubscription: async () => current });

  it("activates Pro only from a verified checkout event", async () => {
    expect(await access()).toBe("trial");
    current = subscription({ id: "sub_test_1", status: "active" });
    const outcome = await processStripeEvent(
      event("checkout.session.completed", { object: "checkout.session", mode: "subscription", client_reference_id: org.orgId, customer: "cus_test_narixia", subscription: "sub_test_1", metadata: {} }),
      deps(),
    );
    expect(outcome).toMatchObject({ status: "processed", organizationId: org.orgId });
    expect(await access()).toBe("pro");
    const customer = await adminQuery("select stripe_customer_id from public.billing_customers where organization_id = $1", [org.orgId]);
    expect(customer.rows[0].stripe_customer_id).toBe("cus_test_narixia");
  });

  it("starts a grace period on a failed renewal and keeps its start date", async () => {
    current = subscription({ id: "sub_test_1", status: "past_due" });
    await processStripeEvent(event("invoice.payment_failed", { object: "invoice", id: "in_1", status: "open", amount_paid: 0, currency: "eur", parent: { subscription_details: { subscription: "sub_test_1" } } }), deps());
    const first = await row("sub_test_1");
    expect(first.status).toBe("past_due");
    expect(first.past_due_since).not.toBeNull();
    expect(await access()).toBe("grace");

    await processStripeEvent(event("invoice.payment_failed", { object: "invoice", id: "in_1", status: "open", amount_paid: 0, currency: "eur", parent: { subscription_details: { subscription: "sub_test_1" } } }, now + 5), deps());
    expect((await row("sub_test_1")).past_due_since).toEqual(first.past_due_since);
  });

  it("ends access when the grace period runs out and the trial is over", async () => {
    await expireTrial(org.orgId);
    await adminQuery("update public.subscriptions set past_due_since = now() - interval '8 days' where id = 'sub_test_1'");
    expect(await access()).toBe("expired");
  });

  it("restores Pro when a retried payment succeeds", async () => {
    current = subscription({ id: "sub_test_1", status: "active" });
    await processStripeEvent(event("invoice.paid", { object: "invoice", id: "in_1", status: "paid", amount_paid: 1900, currency: "eur", parent: { subscription_details: { subscription: "sub_test_1" } } }, now + 10), deps());
    expect((await row("sub_test_1")).past_due_since).toBeNull();
    expect(await access()).toBe("pro");
  });

  it("ignores events older than the state already applied", async () => {
    current = subscription({ id: "sub_test_1", status: "canceled" });
    const outcome = await processStripeEvent(event("customer.subscription.updated", current, now - 3600), deps());
    expect(outcome.status).toBe("ignored");
    expect((await row("sub_test_1")).status).toBe("active");
  });

  it("pauses access after cancellation", async () => {
    current = subscription({ id: "sub_test_1", status: "canceled", ended_at: now + 20, canceled_at: now + 20 });
    await processStripeEvent(event("customer.subscription.deleted", current, now + 20), deps());
    expect((await row("sub_test_1")).status).toBe("canceled");
    expect(await access()).toBe("expired");
  });

  it("does not attach a subscription to an unknown organisation", async () => {
    current = subscription({ id: "sub_test_orphan", status: "active", customer: "cus_unknown", metadata: {} });
    const outcome = await processStripeEvent(event("customer.subscription.created", current), deps());
    expect(outcome).toMatchObject({ status: "ignored", summary: { reason: "unknown_organization" } });
    expect(await row("sub_test_orphan")).toBeUndefined();
  });

  it("maps billing periods from subscription items", () => {
    const mapped = subscriptionRow(subscription({ id: "sub_x", status: "trialing", trial_end: now + 86400 }), org.orgId, new Date(now * 1000), null);
    expect(mapped).toMatchObject({ status: "trialing", price_id: "price_test_pro", past_due_since: null });
    expect(mapped.current_period_end).toBe(new Date((now + 30 * 86400) * 1000).toISOString());
  });
});

describe("webhook endpoint", () => {
  const WEBHOOK_SECRET = "whsec_test_narixia_local";
  let POST: (request: Request) => Promise<Response>;
  const signer = new Stripe("sk_test_signing_only");

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_not_used_for_network";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    ({ POST } = await import("@/app/api/stripe/webhook/route"));
  });

  const send = (payload: string, signature: string) =>
    POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature, "content-type": "application/json" }, body: payload }));

  it("rejects unsigned and wrongly signed requests", async () => {
    const payload = JSON.stringify({ id: "evt_test_bad", object: "event", type: "customer.created", created: now, data: { object: {} } });
    expect((await send(payload, "t=1,v1=deadbeef")).status).toBe(400);
    const forged = signer.webhooks.generateTestHeaderString({ payload, secret: "whsec_someone_else" });
    expect((await send(payload, forged)).status).toBe(400);
    const stored = await adminQuery("select 1 from public.billing_events where id = 'evt_test_bad'");
    expect(stored.rowCount).toBe(0);
  });

  it("records a verified event once and acknowledges replays", async () => {
    const id = `evt_test_${Math.random().toString(36).slice(2)}`;
    const payload = JSON.stringify({ id, object: "event", type: "customer.created", created: now, data: { object: { id: "cus_x", object: "customer" } } });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const first = await send(payload, header);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true });
    const replay = await send(payload, header);
    expect(await replay.json()).toEqual({ received: true, duplicate: true });
    const stored = await adminQuery("select status, summary from public.billing_events where id = $1", [id]);
    expect(stored.rows[0]).toMatchObject({ status: "ignored", summary: { reason: "unhandled_type" } });
    await adminQuery("delete from public.billing_events where id = $1", [id]);
  });
});
