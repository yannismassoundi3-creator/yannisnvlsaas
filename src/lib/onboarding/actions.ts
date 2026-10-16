"use server";

import type { Route } from "next";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { onboardingMessages } from "@/i18n/messages/auth-onboarding";
import { getRequestLocale } from "@/i18n/request";
import { track, trackFirst } from "@/lib/analytics/track";
import { audit } from "@/lib/audit";
import { ACTIVE_STORE_COOKIE, getWorkspace, requireUser, requireWorkspace } from "@/lib/auth/workspace";
import { isValidTimezone, todayIn, addDays } from "@/lib/dates";
import { generateDemoDataset } from "@/lib/demo/generator";
import { insertDataset } from "@/lib/demo/persist";
import { currencyDigits, isValidCurrency } from "@/lib/finance/currency";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PLATFORMS } from "./constants";

export type ActionResult = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> };

type Messages = (typeof onboardingMessages)["en"];

function workspaceSchema(v: Messages["validation"]) {
  return z.object({
    storeName: z.string().trim().min(1, v.storeName).max(120, v.tooLong),
    organizationName: z.string().trim().max(120, v.tooLong).optional().default(""),
    platform: z.enum(PLATFORMS, { message: v.platform }),
    currency: z.string().refine(isValidCurrency, v.currency),
    timezone: z.string().refine(isValidTimezone, v.timezone),
    pricesIncludeTax: z.enum(["yes", "no"], { message: v.pricesIncludeTax }),
  });
}

export type WorkspaceInput = z.input<ReturnType<typeof workspaceSchema>>;

export async function createWorkspace(input: WorkspaceInput): Promise<ActionResult> {
  const user = await requireUser();
  const m = onboardingMessages[await getRequestLocale()];
  const t = m.actions;
  const parsed = workspaceSchema(m.validation).safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: t.checkFields, fieldErrors };
  }
  const v = parsed.data;
  if (!(await consumeRateLimit(`onboarding:${user.id}`, 10, 3600))) {
    return { ok: false, message: t.rateLimited };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization_with_store", {
    p_organization_name: v.organizationName || v.storeName,
    p_store_name: v.storeName,
    p_platform: v.platform,
    p_currency: v.currency,
    p_minor_digits: currencyDigits(v.currency),
    p_timezone: v.timezone,
    p_prices_include_tax: v.pricesIncludeTax === "yes",
  });

  if (error) {
    if (error.code === "23505") return { ok: true }; // already created (double submit): continue
    if (error.message?.includes("time zone")) return { ok: false, message: t.timezoneUnsupported, fieldErrors: { timezone: t.timezoneUnsupported } };
    return { ok: false, message: t.workspaceFailed };
  }

  const created = Array.isArray(data) ? data[0] : data;
  if (created?.organization_id) {
    track("trial_started", { organizationId: created.organization_id, userId: user.id });
    audit("store.created", { organizationId: created.organization_id, actorId: user.id }, { type: "store", id: created.store_id });
  }
  return { ok: true };
}

/** Creates (or recreates) the clearly labelled sample store with generated demo data. */
export async function createDemoStore(): Promise<ActionResult> {
  const ws = await requireWorkspace();
  const t = onboardingMessages[await getRequestLocale()].actions;
  if (!ws.entitlements.canWrite) return { ok: false, message: t.trialEnded };
  if (!(await consumeRateLimit(`demo:${ws.user.id}`, 5, 3600))) {
    return { ok: false, message: t.sampleRateLimited };
  }

  const timezone = ws.stores.find((s) => !s.is_demo)?.timezone ?? "Europe/Paris";
  const admin = createAdminClient();

  // Replace any previous sample store so there is only ever one.
  const existing = ws.stores.filter((s) => s.is_demo).map((s) => s.id);
  if (existing.length) await admin.from("stores").delete().in("id", existing).eq("organization_id", ws.organization.id);

  const dataset = generateDemoDataset({ endDate: addDays(todayIn(timezone), -1), timezone });
  const { data: store, error } = await admin
    .from("stores")
    .insert({
      organization_id: ws.organization.id,
      name: t.sampleStoreName,
      platform: "other",
      currency: dataset.settings.currency,
      minor_digits: currencyDigits(dataset.settings.currency),
      timezone,
      prices_include_tax: false,
      fee_rule_bps: dataset.settings.feeRuleBasisPoints,
      fee_rule_fixed_minor: dataset.settings.feeRuleFixedMinor,
      default_shipping_cost_minor: dataset.settings.defaultShippingCostMinor,
      is_demo: true,
    })
    .select("id")
    .single();
  if (error || !store) return { ok: false, message: t.sampleFailed };

  try {
    // Records are written with the user's own session, so RLS checks every row.
    await insertDataset(await createClient(), { organizationId: ws.organization.id, storeId: store.id, source: "demo" }, dataset);
  } catch (insertError) {
    console.error("[demo-store] insert failed:", insertError instanceof Error ? insertError.message : "unknown error");
    await admin.from("stores").delete().eq("id", store.id);
    return { ok: false, message: t.sampleIncomplete };
  }

  (await cookies()).set(ACTIVE_STORE_COOKIE, store.id, { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  track("demo_store_created", { organizationId: ws.organization.id, userId: ws.user.id });
  audit("demo_store.created", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "store", id: store.id });
  refresh();
  return { ok: true };
}

export async function completeOnboarding(destination: "dashboard" | "import" | "products") {
  const ws = await getWorkspace();
  if (ws.organization) trackFirst("onboarding_completed", { organizationId: ws.organization.id, userId: ws.user.id }, { destination });
  redirect((destination === "import" ? "/app/imports/new" : destination === "products" ? "/app/products?new=1" : "/app") as Route);
}
