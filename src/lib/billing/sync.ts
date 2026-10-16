import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Stripe → database synchronisation, driven only by verified webhook events.
 * A redirect back from Checkout never grants access: the subscription row
 * written here is what private.org_access() reads.
 */

type Admin = SupabaseClient<Database>;
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Insert"];

const STATUSES = ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);

/**
 * Maps a Stripe subscription to our row. The grace period starts the first
 * time the subscription is seen past due and is kept while it stays so.
 * Billing periods live on subscription items in current API versions.
 */
export function subscriptionRow(
  sub: Pick<Stripe.Subscription, "id" | "status" | "cancel_at_period_end" | "cancel_at" | "canceled_at" | "ended_at" | "trial_end"> & {
    items?: { data?: { price?: { id?: string } | null; current_period_start?: number; current_period_end?: number }[] };
  },
  organizationId: string,
  eventAt: Date,
  previous: { past_due_since: string | null } | null,
): SubscriptionRow {
  const status = (STATUSES as readonly string[]).includes(sub.status) ? (sub.status as (typeof STATUSES)[number]) : "incomplete";
  const item = sub.items?.data?.[0];
  return {
    id: sub.id,
    organization_id: organizationId,
    status,
    price_id: item?.price?.id ?? null,
    current_period_start: iso(item?.current_period_start),
    current_period_end: iso(item?.current_period_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    cancel_at: iso(sub.cancel_at),
    canceled_at: iso(sub.canceled_at),
    ended_at: iso(sub.ended_at),
    trial_end: iso(sub.trial_end),
    past_due_since: status === "past_due" ? (previous?.past_due_since ?? eventAt.toISOString()) : null,
    stripe_event_at: eventAt.toISOString(),
  };
}

export type ProcessDeps = {
  admin: Admin;
  /** Latest state from Stripe, so out-of-order deliveries cannot regress a subscription. */
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
};

export type ProcessOutcome = { status: "processed" | "ignored"; organizationId: string | null; summary: Record<string, string | number | boolean | null> };

async function organizationExists(admin: Admin, id: string | null | undefined): Promise<string | null> {
  if (!id || !UUID_RE.test(id)) return null;
  const { data } = await admin.from("organizations").select("id").eq("id", id).maybeSingle();
  return data?.id ?? null;
}

async function organizationForCustomer(admin: Admin, customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await admin.from("billing_customers").select("organization_id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.organization_id ?? null;
}

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));

/** Writes the subscription unless a newer event has already been applied. */
export async function syncSubscription(deps: ProcessDeps, subscriptionId: string, eventAt: Date, hintOrganizationId: string | null): Promise<ProcessOutcome> {
  const sub = await deps.retrieveSubscription(subscriptionId);
  const customerId = idOf(sub.customer as string | { id: string });
  const organizationId =
    (await organizationExists(deps.admin, (sub.metadata?.organization_id as string | undefined) ?? null)) ??
    (await organizationExists(deps.admin, hintOrganizationId)) ??
    (await organizationForCustomer(deps.admin, customerId));
  if (!organizationId) return { status: "ignored", organizationId: null, summary: { reason: "unknown_organization", subscription: sub.id } };

  const { data: previous } = await deps.admin.from("subscriptions").select("past_due_since, stripe_event_at").eq("id", sub.id).maybeSingle();
  if (previous && new Date(previous.stripe_event_at).getTime() > eventAt.getTime()) {
    return { status: "ignored", organizationId, summary: { reason: "stale_event", subscription: sub.id } };
  }
  if (customerId) {
    await deps.admin.from("billing_customers").upsert({ organization_id: organizationId, stripe_customer_id: customerId }, { onConflict: "organization_id", ignoreDuplicates: true });
  }
  const row = subscriptionRow(sub, organizationId, eventAt, previous);
  const { error } = await deps.admin.from("subscriptions").upsert(row, { onConflict: "id" });
  if (error) throw new Error(`subscription upsert failed: ${error.code}`);
  return { status: "processed", organizationId, summary: { subscription: sub.id, status: row.status as string, cancel_at_period_end: row.cancel_at_period_end ?? false } };
}

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
]);
const INVOICE_EVENTS = new Set(["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "invoice.payment_action_required", "invoice.marked_uncollectible"]);

export async function processStripeEvent(event: Stripe.Event, deps: ProcessDeps): Promise<ProcessOutcome> {
  const eventAt = new Date(event.created * 1000);

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "subscription" || !session.subscription) {
      return { status: "ignored", organizationId: null, summary: { reason: "not_a_subscription_checkout" } };
    }
    const organizationId = (await organizationExists(deps.admin, session.client_reference_id)) ?? (await organizationExists(deps.admin, session.metadata?.organization_id));
    const customerId = idOf(session.customer as string | { id: string } | null);
    if (organizationId && customerId) {
      await deps.admin.from("billing_customers").upsert({ organization_id: organizationId, stripe_customer_id: customerId }, { onConflict: "organization_id", ignoreDuplicates: true });
    }
    return syncSubscription(deps, idOf(session.subscription as string | { id: string })!, eventAt, organizationId);
  }

  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const sub = event.data.object as Stripe.Subscription;
    return syncSubscription(deps, sub.id, eventAt, null);
  }

  if (INVOICE_EVENTS.has(event.type)) {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription as string | { id: string } | undefined);
    if (!subscriptionId) return { status: "ignored", organizationId: null, summary: { reason: "invoice_without_subscription", invoice: invoice.id ?? null } };
    const outcome = await syncSubscription(deps, subscriptionId, eventAt, null);
    return {
      ...outcome,
      summary: { ...outcome.summary, invoice: invoice.id ?? null, invoice_status: invoice.status ?? null, amount_paid: invoice.amount_paid, currency: invoice.currency },
    };
  }

  return { status: "ignored", organizationId: null, summary: { reason: "unhandled_type" } };
}

/** Records the outcome on the billing_events row for idempotency and support. */
export async function recordOutcome(admin: Admin, eventId: string, outcome: ProcessOutcome | { status: "failed"; error: string }) {
  if (outcome.status === "failed") {
    await admin.from("billing_events").update({ status: "failed", error: outcome.error.slice(0, 500) }).eq("id", eventId);
    return;
  }
  await admin
    .from("billing_events")
    .update({
      status: outcome.status,
      organization_id: outcome.organizationId,
      summary: outcome.summary as unknown as NonNullable<Json>,
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", eventId);
}
