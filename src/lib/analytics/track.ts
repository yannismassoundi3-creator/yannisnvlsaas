import "server-only";
import { after } from "next/server";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

/**
 * First-party product analytics.
 *
 * Events are stored in Narixia's own database (no third-party trackers, no
 * cookies). They describe product milestones only: properties must never
 * contain financial amounts, product names, file contents or personal data.
 */
export type ProductEvent =
  | "registration_completed"
  | "onboarding_completed"
  | "demo_store_created"
  | "first_import_succeeded"
  | "import_committed"
  | "first_dashboard_result"
  | "trial_started"
  | "checkout_initiated"
  | "subscription_activated"
  | "subscription_canceled"
  | "report_exported";

type Context = { organizationId?: string | null; userId?: string | null };
type Properties = Record<string, string | number | boolean | null>;

const FORBIDDEN_KEYS = /amount|revenue|sales|cost|price|margin|email|name/i;

function sanitize(properties: Properties): Properties {
  const clean: Properties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN_KEYS.test(key)) continue;
    clean[key] = typeof value === "string" ? value.slice(0, 80) : value;
  }
  return clean;
}

async function insert(event: ProductEvent, ctx: Context, properties: Properties, onlyOnce: boolean) {
  if (!serverEnv().supabaseSecretKey) return;
  try {
    const admin = createAdminClient();
    if (onlyOnce && ctx.organizationId) {
      const { count } = await admin
        .from("product_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId)
        .eq("event", event);
      if ((count ?? 0) > 0) return;
    }
    await admin.from("product_events").insert({
      event,
      organization_id: ctx.organizationId ?? null,
      user_id: ctx.userId ?? null,
      properties: sanitize(properties) as NonNullable<Json>,
    });
  } catch {
    // Analytics must never break the product.
  }
}

/** Records an event after the response is sent. */
export function track(event: ProductEvent, ctx: Context, properties: Properties = {}) {
  after(() => insert(event, ctx, properties, false));
}

/** Records an event only the first time it happens for an organisation. */
export function trackFirst(event: ProductEvent, ctx: Context, properties: Properties = {}) {
  after(() => insert(event, ctx, properties, true));
}
