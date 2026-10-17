"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { billingMessages } from "@/i18n/messages/account-billing";
import { getRequestLocale } from "@/i18n/request";
import { track } from "@/lib/analytics/track";
import { audit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/auth/workspace";
import { isStripeConfigured, publicEnv, serverEnv } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isLiveCheckoutBlocked } from "./stripe";

type Failure = { ok: false; message: string };

/** Stripe Checkout and the billing portal follow the interface language. */
const STRIPE_LOCALE: Record<Locale, "en" | "fr"> = { en: "en", fr: "fr" };
/** Stripe only accepts a trial end at least 48 hours ahead. */
const MIN_TRIAL_END_MS = 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000;

/** The stored Stripe customer, or null when there is none or it was deleted in the Stripe dashboard. */
async function storedCustomer(organizationId: string): Promise<{ id: string | null; deleted: string | null }> {
  const { data } = await createAdminClient().from("billing_customers").select("stripe_customer_id").eq("organization_id", organizationId).maybeSingle();
  if (!data) return { id: null, deleted: null };
  const customer = await getStripe().customers.retrieve(data.stripe_customer_id);
  return customer.deleted ? { id: null, deleted: data.stripe_customer_id } : { id: customer.id, deleted: null };
}

async function ensureCustomer(organizationId: string, organizationName: string, email: string | null): Promise<string> {
  const admin = createAdminClient();
  const stored = await storedCustomer(organizationId);
  if (stored.id) return stored.id;
  const customer = await getStripe().customers.create(
    { name: organizationName, email: email ?? undefined, metadata: { organization_id: organizationId } },
    // A replacement for a deleted customer needs its own key, or Stripe replays the deleted one.
    { idempotencyKey: stored.deleted ? `customer-${organizationId}-after-${stored.deleted}` : `customer-${organizationId}` },
  );
  const { error } = stored.deleted
    ? await admin.from("billing_customers").update({ stripe_customer_id: customer.id }).eq("organization_id", organizationId).eq("stripe_customer_id", stored.deleted)
    : await admin.from("billing_customers").upsert({ organization_id: organizationId, stripe_customer_id: customer.id }, { onConflict: "organization_id", ignoreDuplicates: true });
  if (error) throw new Error("Could not store the billing customer");
  const { data: saved } = await admin.from("billing_customers").select("stripe_customer_id").eq("organization_id", organizationId).single();
  return saved?.stripe_customer_id ?? customer.id;
}

/**
 * Sends the owner to Stripe Checkout for Pro. While the free trial has more
 * than two days left, the subscription starts with a trial ending when the
 * Narixia trial ends, so the first charge happens then. Access is granted
 * only when Stripe's webhook confirms the subscription.
 */
export async function startCheckout(): Promise<Failure> {
  const ws = await requireWorkspace();
  const locale = await getRequestLocale();
  const t = billingMessages[locale].actions;
  if (ws.role !== "owner") return { ok: false, message: t.ownerOnly };
  if (!isStripeConfigured() || isLiveCheckoutBlocked()) return { ok: false, message: t.notConfigured };
  if (ws.entitlements.access === "pro") return { ok: false, message: t.alreadyPro };
  if (ws.entitlements.access === "grace") return { ok: false, message: t.grace };
  if (!(await consumeRateLimit(`checkout:${ws.user.id}`, 10, 3600))) return { ok: false, message: t.tooMany };

  const env = serverEnv();
  let url: string | null = null;
  try {
    const customer = await ensureCustomer(ws.organization.id, ws.organization.name, ws.user.email);
    const trialEndsAt = ws.entitlements.access === "trial" && ws.entitlements.trialEndsAt ? new Date(ws.entitlements.trialEndsAt).getTime() : 0;
    const trialEnd = trialEndsAt - Date.now() > MIN_TRIAL_END_MS ? Math.floor(trialEndsAt / 1000) : undefined;
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "subscription",
        locale: STRIPE_LOCALE[locale],
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
    return { ok: false, message: t.checkoutFailed };
  }
  if (!url) return { ok: false, message: t.checkoutFailed };

  audit("billing.checkout_started", { organizationId: ws.organization.id, actorId: ws.user.id });
  track("checkout_initiated", { organizationId: ws.organization.id, userId: ws.user.id });
  redirect(url as Route);
}

/** Stripe's customer portal: payment method, invoices, cancellation. */
export async function openBillingPortal(): Promise<Failure> {
  const ws = await requireWorkspace();
  const locale = await getRequestLocale();
  const t = billingMessages[locale].actions;
  if (ws.role !== "owner") return { ok: false, message: t.ownerOnly };
  if (!isStripeConfigured()) return { ok: false, message: t.notConfigured };
  if (!(await consumeRateLimit(`portal:${ws.user.id}`, 20, 3600))) return { ok: false, message: t.tooMany };

  let url: string;
  try {
    const customer = await storedCustomer(ws.organization.id);
    if (!customer.id) return { ok: false, message: t.noCustomer };
    const session = await getStripe().billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${publicEnv.siteUrl}/app/billing`,
      locale: STRIPE_LOCALE[locale],
    });
    url = session.url;
  } catch (error) {
    console.error("[billing] portal failed", { message: error instanceof Error ? error.message : "unknown" });
    return { ok: false, message: t.portalFailed };
  }
  audit("billing.portal_opened", { organizationId: ws.organization.id, actorId: ws.user.id });
  redirect(url as Route);
}
