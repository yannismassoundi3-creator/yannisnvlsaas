"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { settingsActions } from "@/i18n/messages/account-settings";
import { getRequestLocale } from "@/i18n/request";
import { audit } from "@/lib/audit";
import { ACTIVE_STORE_COOKIE, requireStore, requireWorkspace } from "@/lib/auth/workspace";
import { authErrorMessage, isEmailValid, PASSWORD_MIN_LENGTH, passwordChecks } from "@/lib/auth/validation";
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

/** Messages in the language of the page the action was called from. */
async function messages() {
  const locale = await getRequestLocale();
  return { locale, t: settingsActions[locale] };
}

// -----------------------------------------------------------------------------
// Profile and sign-in
// -----------------------------------------------------------------------------
export async function updateProfile(input: { fullName: string }): Promise<Result> {
  const ws = await requireWorkspace();
  const { t } = await messages();
  const fullName = normalizeText(typeof input?.fullName === "string" ? input.fullName : "");
  if (fullName.length > 120) return { ok: false, message: t.checkForm, fieldErrors: { fullName: t.nameTooLong } };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName || null }).eq("id", ws.user.id);
  if (error) return { ok: false, message: t.profileFailed };
  refresh();
  return { ok: true };
}

/**
 * Interface language. Stored in the nx_locale cookie (read by the proxy on
 * every page) and in the auth user's metadata, so authentication emails
 * (confirmation, password reset, email change) use the same language.
 */
export async function updateLanguage(input: { locale: Locale }): Promise<Result> {
  await requireWorkspace();
  const locale = input?.locale;
  if (!isLocale(locale)) return { ok: false, message: (await messages()).t.languageInvalid };
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { locale } });
  // The cookie already switches the interface; emails fall back to the default language.
  if (error) console.error("[settings] could not store the language in the user metadata", { code: error.code });
  refresh();
  return { ok: true };
}

export async function changePassword(input: { password: string }): Promise<Result> {
  const ws = await requireWorkspace();
  const { locale, t } = await messages();
  const password = typeof input?.password === "string" ? input.password : "";
  const checks = passwordChecks(password, locale);
  if (!checks.every((c) => c.ok)) return { ok: false, message: t.checkForm, fieldErrors: { password: t.passwordRule(PASSWORD_MIN_LENGTH) } };
  if (!(await consumeRateLimit(`password-change:${ws.user.id}`, 5, 3600))) return { ok: false, message: t.tooMany };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      ok: false,
      message: error.code === "same_password" || error.code === "weak_password" ? authErrorMessage(error, locale) : t.passwordFailed,
    };
  }
  return { ok: true };
}

export async function changeEmail(input: { email: string }): Promise<Result> {
  const ws = await requireWorkspace();
  const { t } = await messages();
  const email = (typeof input?.email === "string" ? input.email : "").trim().toLowerCase();
  if (!isEmailValid(email)) return { ok: false, message: t.checkForm, fieldErrors: { email: t.emailInvalid } };
  if (email === ws.user.email) return { ok: false, message: t.checkForm, fieldErrors: { email: t.emailSame } };
  if (!(await consumeRateLimit(`email-change:${ws.user.id}`, 5, 3600))) return { ok: false, message: t.tooMany };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/app/settings` });
  if (error) return { ok: false, message: error.code === "email_exists" ? t.emailExists : t.emailFailed };
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
  const { locale, t } = await messages();
  if (!ws.entitlements.canWrite) return { ok: false, message: t.paused };
  const parsed = storeInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.checkForm };
  const v = parsed.data;
  const fieldErrors: Record<string, string> = {};
  const name = normalizeText(v.name);
  if (!name) fieldErrors.name = t.storeNameRequired;
  else if (name.length > 80) fieldErrors.name = t.storeNameTooLong;
  if (!isValidTimezone(v.timezone)) fieldErrors.timezone = t.timezoneRequired;
  const fee = parseUserPercentToBps(v.feePercent, { optional: true, locale });
  if (!fee.ok) fieldErrors.feePercent = fee.message;
  const currency = ws.activeStore.currency;
  const fixed = parseUserAmount(v.feeFixed, currency, { optional: true, locale });
  if (!fixed.ok) fieldErrors.feeFixed = fixed.message;
  const shipping = parseUserAmount(v.defaultShipping, currency, { optional: true, locale });
  if (!shipping.ok) fieldErrors.defaultShipping = shipping.message;
  if (Object.keys(fieldErrors).length) return { ok: false, message: t.checkFields, fieldErrors };

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
  if (error) return { ok: false, message: error.code === "42501" ? t.paused : t.storeSaveFailed };
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
  const { t } = await messages();
  if (!ws.entitlements.canWrite) return { ok: false, message: t.paused };
  if (ws.role === "member") return { ok: false, message: t.addStoreForbidden };
  const parsed = newStoreInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.checkForm };
  const v = parsed.data;
  const fieldErrors: Record<string, string> = {};
  const name = normalizeText(v.name);
  if (!name) fieldErrors.name = t.storeNameRequired;
  else if (name.length > 80) fieldErrors.name = t.storeNameTooLong;
  const currency = v.currency.toUpperCase();
  if (!isValidCurrency(currency)) fieldErrors.currency = t.currencyRequired;
  if (!isValidTimezone(v.timezone)) fieldErrors.timezone = t.timezoneRequired;
  if (Object.keys(fieldErrors).length) return { ok: false, message: t.checkFields, fieldErrors };
  const realStores = ws.stores.filter((s) => !s.is_demo).length;
  if (realStores >= ws.entitlements.limits.stores) {
    return { ok: false, message: ws.entitlements.plan === "pro" ? t.maxStores : t.trialStores };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .insert({ organization_id: ws.organization.id, name, platform: v.platform, currency, minor_digits: currencyDigits(currency), timezone: v.timezone, prices_include_tax: v.pricesIncludeTax })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.hint === "store_limit" ? t.storeLimit : t.createFailed };
  (await cookies()).set(ACTIVE_STORE_COOKIE, data.id, { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  audit("store.created", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "store", id: data.id });
  refresh();
  return { ok: true };
}

/** Deletes a store and all its data. The confirmation must repeat the store name. */
export async function deleteStore(storeId: string, confirmName: string): Promise<Result> {
  const ws = await requireWorkspace();
  const { t } = await messages();
  if (ws.role === "member") return { ok: false, message: t.deleteStoreForbidden };
  const store = ws.stores.find((s) => s.id === storeId);
  if (!store) return { ok: false, message: t.storeNotFound };
  if (!store.is_demo && normalizeText(confirmName) !== store.name) return { ok: false, message: t.typeStoreName };
  if (!store.is_demo && ws.stores.filter((s) => !s.is_demo).length === 1) {
    return { ok: false, message: t.onlyStore };
  }
  if (!(await consumeRateLimit(`store-delete:${ws.user.id}`, 10, 3600))) return { ok: false, message: t.tooMany };
  const supabase = await createClient();
  const { data, error } = await supabase.from("stores").delete().eq("id", storeId).eq("organization_id", ws.organization.id).select("id");
  if (error || !data?.length) return { ok: false, message: t.deleteStoreFailed };
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
  const { t } = await messages();
  // The confirmation word is DELETE in every language.
  if ((typeof input?.confirm === "string" ? input.confirm.trim() : "") !== "DELETE") return { ok: false, message: t.typeDelete };
  if (!serverEnv().supabaseSecretKey) return { ok: false, message: t.deletionUnavailable };
  if (!(await consumeRateLimit(`account-delete:${ws.user.id}`, 5, 3600))) return { ok: false, message: t.tooMany };
  const admin = createAdminClient();

  if (ws.role === "owner") {
    // Stop billing first: a deleted account must never be charged again.
    const { data: customer } = await admin.from("billing_customers").select("stripe_customer_id").eq("organization_id", ws.organization.id).maybeSingle();
    if (customer) {
      if (!isStripeConfigured()) return { ok: false, message: t.billingUnreachable };
      try {
        const stripe = getStripe();
        const subs = await stripe.subscriptions.list({ customer: customer.stripe_customer_id, status: "all", limit: 20 });
        for (const sub of subs.data) {
          if (!["canceled", "incomplete_expired"].includes(sub.status)) await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
        }
      } catch (error) {
        console.error("[account] subscription cancellation failed", { message: error instanceof Error ? error.message : "unknown" });
        return { ok: false, message: t.cancelFailed };
      }
    }
    const { error } = await admin.from("organizations").delete().eq("id", ws.organization.id);
    if (error) return { ok: false, message: t.dataDeleteFailed };
  }

  const { error: userError } = await admin.auth.admin.deleteUser(ws.user.id);
  if (userError) {
    console.error("[account] user deletion failed", { code: userError.code });
    return { ok: false, message: t.loginDeleteFailed };
  }
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  (await cookies()).delete(ACTIVE_STORE_COOKIE);
  redirect("/?account=deleted");
}
