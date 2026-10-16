"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { ACTIVE_STORE_COOKIE, requireStore, requireWorkspace } from "@/lib/auth/workspace";
import { isEmailValid, PASSWORD_MIN_LENGTH, passwordChecks } from "@/lib/auth/validation";
import { getStripe } from "@/lib/billing/stripe";
import { isValidTimezone } from "@/lib/dates";
import { isStripeConfigured, publicEnv, serverEnv } from "@/lib/env";
import { currencyDigits, isValidCurrency } from "@/lib/finance/currency";
import { parseUserAmount, parseUserPercentToBps } from "@/lib/finance/input";
import { normalizeText } from "@/lib/imports/normalize";
import { PLATFORMS } from "@/lib/onboarding/constants";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string; fieldErrors?: Record<string, string> };

const PAUSED = "Changes are paused because your trial or subscription has ended. You can still export or delete your data.";

// -----------------------------------------------------------------------------
// Profile and sign-in
// -----------------------------------------------------------------------------
export async function updateProfile(input: { fullName: string }): Promise<Result> {
  const ws = await requireWorkspace();
  const fullName = normalizeText(typeof input?.fullName === "string" ? input.fullName : "");
  if (fullName.length > 120) return { ok: false, message: "Check the form.", fieldErrors: { fullName: "Keep it under 120 characters." } };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName || null }).eq("id", ws.user.id);
  if (error) return { ok: false, message: "We could not save your profile." };
  refresh();
  return { ok: true };
}

export async function changePassword(input: { password: string }): Promise<Result> {
  const ws = await requireWorkspace();
  const password = typeof input?.password === "string" ? input.password : "";
  const checks = passwordChecks(password);
  if (!checks.every((c) => c.ok)) return { ok: false, message: "Check the form.", fieldErrors: { password: `Use at least ${PASSWORD_MIN_LENGTH} characters with letters and digits.` } };
  if (!(await consumeRateLimit(`password-change:${ws.user.id}`, 5, 3600))) return { ok: false, message: "Too many attempts. Please try again later." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      ok: false,
      message: error.code === "same_password" ? "Choose a password different from your current one." : error.code === "weak_password" ? "This password is too weak." : "We could not change your password.",
    };
  }
  return { ok: true };
}

export async function changeEmail(input: { email: string }): Promise<Result> {
  const ws = await requireWorkspace();
  const email = (typeof input?.email === "string" ? input.email : "").trim().toLowerCase();
  if (!isEmailValid(email)) return { ok: false, message: "Check the form.", fieldErrors: { email: "Enter a valid email address." } };
  if (email === ws.user.email) return { ok: false, message: "Check the form.", fieldErrors: { email: "This is already your email address." } };
  if (!(await consumeRateLimit(`email-change:${ws.user.id}`, 5, 3600))) return { ok: false, message: "Too many attempts. Please try again later." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/app/settings` });
  if (error) return { ok: false, message: error.code === "email_exists" ? "This email address is already used by another account." : "We could not start the email change." };
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Store settings
// -----------------------------------------------------------------------------
const storeInput = z.object({
  name: z.string().max(200),
  timezone: z.string().max(80),
  pricesIncludeTax: z.boolean(),
  feePercent: z.string().max(20),
  feeFixed: z.string().max(40),
  defaultShipping: z.string().max(40),
});

export async function updateStoreSettings(input: z.input<typeof storeInput>): Promise<Result> {
  const ws = await requireStore();
  if (!ws.entitlements.canWrite) return { ok: false, message: PAUSED };
  const parsed = storeInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the form." };
  const v = parsed.data;
  const fieldErrors: Record<string, string> = {};
  const name = normalizeText(v.name);
  if (!name) fieldErrors.name = "Enter a store name.";
  else if (name.length > 80) fieldErrors.name = "Keep it under 80 characters.";
  if (!isValidTimezone(v.timezone)) fieldErrors.timezone = "Choose a time zone.";
  const fee = parseUserPercentToBps(v.feePercent, { optional: true });
  if (!fee.ok) fieldErrors.feePercent = fee.message;
  const currency = ws.activeStore.currency;
  const fixed = parseUserAmount(v.feeFixed, currency, { optional: true });
  if (!fixed.ok) fieldErrors.feeFixed = fixed.message;
  const shipping = parseUserAmount(v.defaultShipping, currency, { optional: true });
  if (!shipping.ok) fieldErrors.defaultShipping = shipping.message;
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Check the highlighted fields.", fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({
      name,
      timezone: v.timezone,
      prices_include_tax: v.pricesIncludeTax,
      fee_rule_bps: fee.ok ? fee.value : null,
      fee_rule_fixed_minor: fixed.ok ? fixed.value : null,
      default_shipping_cost_minor: shipping.ok ? shipping.value : null,
    })
    .eq("id", ws.activeStore.id);
  if (error) return { ok: false, message: error.code === "42501" ? PAUSED : "We could not save the store settings." };
  audit("store.updated", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "store", id: ws.activeStore.id });
  refresh();
  return { ok: true };
}

const newStoreInput = z.object({
  name: z.string().max(200),
  platform: z.enum(PLATFORMS),
  currency: z.string().max(3),
  timezone: z.string().max(80),
  pricesIncludeTax: z.boolean(),
});

export async function createStore(input: z.input<typeof newStoreInput>): Promise<Result> {
  const ws = await requireWorkspace();
  if (!ws.entitlements.canWrite) return { ok: false, message: PAUSED };
  if (ws.role === "member") return { ok: false, message: "Only owners and admins can add stores." };
  const parsed = newStoreInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the form." };
  const v = parsed.data;
  const fieldErrors: Record<string, string> = {};
  const name = normalizeText(v.name);
  if (!name) fieldErrors.name = "Enter a store name.";
  else if (name.length > 80) fieldErrors.name = "Keep it under 80 characters.";
  const currency = v.currency.toUpperCase();
  if (!isValidCurrency(currency)) fieldErrors.currency = "Choose a currency.";
  if (!isValidTimezone(v.timezone)) fieldErrors.timezone = "Choose a time zone.";
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  const realStores = ws.stores.filter((s) => !s.is_demo).length;
  if (realStores >= ws.entitlements.limits.stores) {
    return { ok: false, message: ws.entitlements.plan === "pro" ? "You have reached the maximum number of stores." : "The trial includes one store. Upgrade to Pro for up to three." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .insert({ organization_id: ws.organization.id, name, platform: v.platform, currency, minor_digits: currencyDigits(currency), timezone: v.timezone, prices_include_tax: v.pricesIncludeTax })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.hint === "store_limit" ? "Your plan's store limit is reached." : "We could not create the store." };
  (await cookies()).set(ACTIVE_STORE_COOKIE, data.id, { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  audit("store.created", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "store", id: data.id });
  refresh();
  return { ok: true };
}

/** Deletes a store and all its data. The confirmation must repeat the store name. */
export async function deleteStore(storeId: string, confirmName: string): Promise<Result> {
  const ws = await requireWorkspace();
  if (ws.role === "member") return { ok: false, message: "Only owners and admins can delete stores." };
  const store = ws.stores.find((s) => s.id === storeId);
  if (!store) return { ok: false, message: "Store not found." };
  if (!store.is_demo && normalizeText(confirmName) !== store.name) return { ok: false, message: "Type the store name exactly to confirm." };
  if (!store.is_demo && ws.stores.filter((s) => !s.is_demo).length === 1) {
    return { ok: false, message: "This is your only store. To remove everything, delete your account instead." };
  }
  if (!(await consumeRateLimit(`store-delete:${ws.user.id}`, 10, 3600))) return { ok: false, message: "Too many attempts. Please try again later." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("stores").delete().eq("id", storeId).eq("organization_id", ws.organization.id).select("id");
  if (error || !data?.length) return { ok: false, message: "We could not delete the store." };
  const jar = await cookies();
  if (jar.get(ACTIVE_STORE_COOKIE)?.value === storeId) jar.delete(ACTIVE_STORE_COOKIE);
  audit("store.deleted", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "store", id: storeId }, { demo: store.is_demo });
  refresh();
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Account deletion
// -----------------------------------------------------------------------------
/**
 * Permanently deletes the account. For the owner, this cancels any Stripe
 * subscription immediately and deletes the organisation with all its stores
 * and records. Requires typing DELETE.
 */
export async function deleteAccount(input: { confirm: string }): Promise<Result> {
  const ws = await requireWorkspace();
  if ((typeof input?.confirm === "string" ? input.confirm.trim() : "") !== "DELETE") return { ok: false, message: "Type DELETE in capital letters to confirm." };
  if (!serverEnv().supabaseSecretKey) return { ok: false, message: "Account deletion is not available on this deployment yet. Contact support." };
  if (!(await consumeRateLimit(`account-delete:${ws.user.id}`, 5, 3600))) return { ok: false, message: "Too many attempts. Please try again later." };
  const admin = createAdminClient();

  if (ws.role === "owner") {
    // Stop billing first: a deleted account must never be charged again.
    const { data: customer } = await admin.from("billing_customers").select("stripe_customer_id").eq("organization_id", ws.organization.id).maybeSingle();
    if (customer) {
      if (!isStripeConfigured()) return { ok: false, message: "Billing cannot be reached to cancel your subscription. Contact support to delete the account." };
      try {
        const stripe = getStripe();
        const subs = await stripe.subscriptions.list({ customer: customer.stripe_customer_id, status: "all", limit: 20 });
        for (const sub of subs.data) {
          if (!["canceled", "incomplete_expired"].includes(sub.status)) await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
        }
      } catch (error) {
        console.error("[account] subscription cancellation failed", { message: error instanceof Error ? error.message : "unknown" });
        return { ok: false, message: "We could not cancel your subscription with Stripe, so nothing was deleted. Please try again or contact support." };
      }
    }
    const { error } = await admin.from("organizations").delete().eq("id", ws.organization.id);
    if (error) return { ok: false, message: "We could not delete your data. Nothing was removed; please try again." };
  }

  const { error: userError } = await admin.auth.admin.deleteUser(ws.user.id);
  if (userError) {
    console.error("[account] user deletion failed", { code: userError.code });
    return { ok: false, message: "Your data was deleted, but the login could not be removed. Contact support to finish." };
  }
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  (await cookies()).delete(ACTIVE_STORE_COOKIE);
  redirect("/?account=deleted");
}
