import type Stripe from "stripe";
import { track } from "@/lib/analytics/track";
import { getStripe } from "@/lib/billing/stripe";
import { processStripeEvent, recordOutcome } from "@/lib/billing/sync";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook endpoint (POST /api/stripe/webhook).
 *
 * - The signature is verified against the raw body before anything else.
 * - Each event id is stored once (billing_events); events already processed
 *   are acknowledged without work, so Stripe's retries are harmless.
 * - Subscription state is re-read from Stripe and only applied if no newer
 *   event was applied first.
 * - Failures return 500 so Stripe retries with backoff.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (!env.stripeSecretKey || !env.stripeWebhookSecret || !env.supabaseSecretKey) {
    return new Response("Billing is not configured on this deployment.", { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("billing_events").select("status").eq("id", event.id).maybeSingle();
  if (existing && (existing.status === "processed" || existing.status === "ignored")) {
    return Response.json({ received: true, duplicate: true });
  }
  if (!existing) {
    const { error } = await admin.from("billing_events").insert({
      id: event.id,
      type: event.type.slice(0, 100),
      stripe_created_at: new Date(event.created * 1000).toISOString(),
      status: "received",
    });
    // A concurrent delivery of the same event may have inserted it first; processing is idempotent.
    if (error && error.code !== "23505") return new Response("Could not record event", { status: 500 });
  }

  try {
    const outcome = await processStripeEvent(event, {
      admin,
      retrieveSubscription: (id) => getStripe().subscriptions.retrieve(id),
    });
    await recordOutcome(admin, event.id, outcome);
    if (outcome.status === "processed" && outcome.organizationId) {
      const status = outcome.summary.status;
      if (event.type === "checkout.session.completed" && (status === "active" || status === "trialing")) {
        track("subscription_activated", { organizationId: outcome.organizationId });
      }
      if (event.type === "customer.subscription.deleted") track("subscription_canceled", { organizationId: outcome.organizationId });
    }
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[stripe-webhook] processing failed", { type: event.type, id: event.id, message });
    await recordOutcome(admin, event.id, { status: "failed", error: message });
    return new Response("Webhook processing failed", { status: 500 });
  }
}
