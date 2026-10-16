"use server";

import type { Route } from "next";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
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

const workspaceSchema = z.object({
  storeName: z.string().trim().min(1, "Enter your store's name.").max(120, "Use 120 characters or fewer."),
  organizationName: z.string().trim().max(120, "Use 120 characters or fewer.").optional().default(""),
  platform: z.enum(PLATFORMS, { message: "Choose a platform." }),
  currency: z.string().refine(isValidCurrency, "Choose a valid currency."),
  timezone: z.string().refine(isValidTimezone, "Choose a valid time zone."),
  pricesIncludeTax: z.enum(["yes", "no"], { message: "Tell us whether your prices include tax." }),
});

export async function createWorkspace(input: z.input<typeof workspaceSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  if (!(await consumeRateLimit(`onboarding:${user.id}`, 10, 3600))) {
    return { ok: false, message: "Too many attempts. Please wait a few minutes." };
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
    if (error.message?.includes("time zone")) return { ok: false, message: "This time zone is not supported.", fieldErrors: { timezone: "This time zone is not supported." } };
    return { ok: false, message: "We could not create your workspace. Please try again." };
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
  if (!ws.entitlements.canWrite) return { ok: false, message: "Your trial has ended. Subscribe to create a sample store." };
  if (!(await consumeRateLimit(`demo:${ws.user.id}`, 5, 3600))) {
    return { ok: false, message: "Too many sample stores created recently. Please try again later." };
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
      name: "Sample store",
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
  if (error || !store) return { ok: false, message: "We could not create the sample store. Please try again." };

  try {
    // Records are written with the user's own session, so RLS checks every row.
    await insertDataset(await createClient(), { organizationId: ws.organization.id, storeId: store.id, source: "demo" }, dataset);
  } catch (insertError) {
    console.error("[demo-store] insert failed:", insertError instanceof Error ? insertError.message : "unknown error");
    await admin.from("stores").delete().eq("id", store.id);
    return { ok: false, message: "We could not finish creating the sample store. Please try again." };
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
