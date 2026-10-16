"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { track } from "@/lib/analytics/track";
import { audit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/auth/workspace";
import { isStripeConfigured, publicEnv, serverEnv } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isLiveCheckoutBlocked } from "./stripe";

type Failure = { ok: false; message: string };

const NOT_CONFIGURED = "Payments are not set up on this deployment yet. No payment can be taken.";
/** Stripe only accepts a trial end at least 48 hours ahead. */
const MIN_TRIAL_END_MS = 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000;

async function ensureCustomer(organizationId: string, organizationName: string, email: string | null): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_customers").select("stripe_customer_id").eq("organization_id", organizationId).maybeSingle();
  if (data) return data.stripe_customer_id;
  const customer = await getStripe().customers.create(
    { name: organizationName, email: email ?? undefined, metadata: { organization_id: organizationId } },
    { idempotencyKey: `customer-${organizationId}` },
  );
  const { error } = await admin.from("billing_customers").upsert({ organization_id: organizationId, stripe_customer_id: customer.id }, { onConflict: "organization_id", ignoreDuplicates: true });
  if (error) throw new Error("Could not store the billing customer");
  const { data: stored } = await admin.from("billing_customers").select("stripe_customer_id").eq("organization_id", organizationId).single();
  return stored?.stripe_customer_id ?? customer.id;
}

/**
 * Sends the owner to Stripe Checkout for Pro. While the free trial has more
 * than two days left, the subscription starts with a trial ending when the
 * Narixia trial ends, so the first charge happens then. Access is granted
 * only when Stripe's webhook confirms the subscription.
 */
export async function startCheckout(): Promise<Failure> {
  const ws = await requireWorkspace();
  if (ws.role !== "owner") return { ok: false, message: "Only the account owner can manage billing." };
  if (!isStripeConfigured() || isLiveCheckoutBlocked()) return { ok: false, message: NOT_CONFIGURED };
  if (ws.entitlements.access === "pro") return { ok: false, message: "Your Pro subscription is already active." };
  if (ws.entitlements.access === "grace") return { ok: false, message: "Update your payment method in the billing portal to keep Pro." };
  if (!(await consumeRateLimit(`checkout:${ws.user.id}`, 10, 3600))) return { ok: false, message: "Too many attempts. Please try again later." };

  const env = serverEnv();
  let url: string | null = null;
  try {
    const customer = await ensureCustomer(ws.organization.id, ws.organization.name, ws.user.email);
    const trialEndsAt = ws.entitlements.access === "trial" && ws.entitlements.trialEndsAt ? new Date(ws.entitlements.trialEndsAt).getTime() : 0;
    const trialEnd = trialEndsAt - Date.now() > MIN_TRIAL_END_MS ? Math.floor(trialEndsAt / 1000) : undefined;
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        client_reference_id: ws.organization.id,
        line_items: [{ price: env.stripePriceProMonthly, quantity: 1 }],
        subscription_data: { metadata: { organization_id: ws.organization.id }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
        metadata: { organization_id: ws.organization.id },
        payment_method_collection: "always",
        billing_address_collection: env.stripeAutomaticTax ? "required" : "auto",
        automatic_tax: { enabled: env.stripeAutomaticTax },
        ...(env.stripeAutomaticTax ? { customer_update: { address: "auto" as const, name: "auto" as const }, tax_id_collection: { enabled: true } } : {}),
        success_url: `${publicEnv.siteUrl}/app/billing?checkout=success`,
        cancel_url: `${publicEnv.siteUrl}/app/billing?checkout=cancelled`,
      },
      { idempotencyKey: `checkout-${ws.organization.id}-${Math.floor(Date.now() / 60_000)}` },
    );
    url = session.url;
  } catch (error) {
    console.error("[billing] checkout failed", { message: error instanceof Error ? error.message : "unknown" });
    return { ok: false, message: "We could not open the payment page. Please try again in a moment." };
  }
  if (!url) return { ok: false, message: "We could not open the payment page. Please try again in a moment." };

  audit("billing.checkout_started", { organizationId: ws.organization.id, actorId: ws.user.id });
  track("checkout_initiated", { organizationId: ws.organization.id, userId: ws.user.id });
  redirect(url as Route);
}

/** Stripe's customer portal: payment method, invoices, cancellation. */
export async function openBillingPortal(): Promise<Failure> {
  const ws = await requireWorkspace();
  if (ws.role !== "owner") return { ok: false, message: "Only the account owner can manage billing." };
  if (!isStripeConfigured()) return { ok: false, message: NOT_CONFIGURED };
  if (!(await consumeRateLimit(`portal:${ws.user.id}`, 20, 3600))) return { ok: false, message: "Too many attempts. Please try again later." };

  const { data } = await createAdminClient().from("billing_customers").select("stripe_customer_id").eq("organization_id", ws.organization.id).maybeSingle();
  if (!data) return { ok: false, message: "There is no billing account yet. Subscribe first." };
  let url: string;
  try {
    const session = await getStripe().billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: `${publicEnv.siteUrl}/app/billing` });
    url = session.url;
  } catch (error) {
    console.error("[billing] portal failed", { message: error instanceof Error ? error.message : "unknown" });
    return { ok: false, message: "We could not open the billing portal. Please try again in a moment." };
  }
  audit("billing.portal_opened", { organizationId: ws.organization.id, actorId: ws.user.id });
  redirect(url as Route);
}
