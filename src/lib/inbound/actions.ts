"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { inboundMessages } from "@/i18n/messages/inbound";
import { getRequestLocale } from "@/i18n/request";
import { audit } from "@/lib/audit";
import { requireStore } from "@/lib/auth/workspace";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; message: string };

/** Ignores a forwarded email (not a sale, or already recorded). Through the user's session: RLS applies. */
export async function dismissInboundEmail(id: string): Promise<Result> {
  const ws = await requireStore();
  const locale = await getRequestLocale();
  const c = catalogCommon[locale];
  if (!ws.entitlements.canWrite) return { ok: false, message: c.paused };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: c.invalidRequest };
  if (!(await consumeRateLimit(`inbound-review:${ws.user.id}`, 300, 3600))) return { ok: false, message: c.rateLimited };
  const supabase = await createClient();
  const { data, error } = await supabase.from("inbound_emails").update({ status: "dismissed" }).eq("id", id).eq("store_id", ws.activeStore.id).select("id");
  if (error || !data?.length) return { ok: false, message: inboundMessages[locale].inbox.dismissFailed };
  refresh();
  return { ok: true };
}

/** Replaces the store's inbound address (owners and admins); the old one stops working at once. */
export async function regenerateInboundAddress(): Promise<Result> {
  const ws = await requireStore();
  const locale = await getRequestLocale();
  const t = inboundMessages[locale].guide;
  const c = catalogCommon[locale];
  if (!ws.entitlements.canWrite) return { ok: false, message: c.paused };
  if (ws.role === "member") return { ok: false, message: t.regenerateForbidden };
  if (!(await consumeRateLimit(`inbound-token:${ws.user.id}`, 10, 3600))) return { ok: false, message: c.rateLimited };
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_inbound_token", { p_store_id: ws.activeStore.id });
  if (error) return { ok: false, message: t.regenerateFailed };
  audit("store.updated", { organizationId: ws.organization.id, actorId: ws.user.id }, { type: "store", id: ws.activeStore.id }, { inbound_address: "regenerated" });
  refresh();
  return { ok: true };
}
