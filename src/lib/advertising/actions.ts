"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStore } from "@/lib/auth/workspace";
import { isValidDateString } from "@/lib/dates";
import { parseUserAmount, parseUserInteger } from "@/lib/finance/input";
import { normalizeText } from "@/lib/imports/normalize";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { advertisingMessages } from "@/i18n/messages/catalog-advertising";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { getRequestLocale } from "@/i18n/request";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string; fieldErrors?: Record<string, string> };

const uuid = z.string().uuid();
const PLATFORMS = ["meta", "google", "tiktok", "pinterest", "microsoft", "other"] as const;

/**
 * Links a campaign to the single product it promotes, so its spend counts in
 * that product's margin. Campaigns promoting several products stay unlinked:
 * their spend remains at store level rather than being split arbitrarily.
 */
export async function linkCampaignProduct(campaignId: string, productId: string | null): Promise<Result> {
  const ws = await requireStore();
  const locale = await getRequestLocale();
  const t = advertisingMessages[locale];
  const c = catalogCommon[locale];
  if (!ws.entitlements.canWrite) return { ok: false, message: c.paused };
  if (!uuid.safeParse(campaignId).success || (productId !== null && !uuid.safeParse(productId).success)) return { ok: false, message: c.invalidRequest };
  const supabase = await createClient();
  const { data, error } = await supabase.from("ad_campaigns").update({ product_id: productId }).eq("id", campaignId).eq("store_id", ws.activeStore.id).select("id");
  if (error) return { ok: false, message: error.code === "23503" ? t.productNotInStore : t.updateFailed };
  if (!data?.length) return { ok: false, message: t.campaignNotFound };
  refresh();
  return { ok: true };
}

const spendInput = z.object({
  campaignId: z.string().max(40),
  newPlatform: z.enum(PLATFORMS),
  newName: z.string().max(400),
  date: z.string().max(10),
  spend: z.string().max(40),
  clicks: z.string().max(20),
  impressions: z.string().max(20),
  conversions: z.string().max(20),
  conversionValue: z.string().max(40),
});

/** Records (or replaces) one day of spend for a campaign. */
export async function saveAdSpend(input: z.input<typeof spendInput>): Promise<Result<{ replaced: boolean }>> {
  const ws = await requireStore();
  const locale = await getRequestLocale();
  const t = advertisingMessages[locale];
  const c = catalogCommon[locale];
  if (!ws.entitlements.canWrite) return { ok: false, message: c.paused };
  const parsed = spendInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.checkForm };
  const v = parsed.data;
  const currency = ws.activeStore.currency;
  const fieldErrors: Record<string, string> = {};

  const isNew = v.campaignId === "new";
  if (!isNew && !uuid.safeParse(v.campaignId).success) fieldErrors.campaignId = t.chooseCampaign;
  const newName = normalizeText(v.newName);
  if (isNew && !newName) fieldErrors.newName = t.enterCampaignName;
  if (isNew && newName.length > 300) fieldErrors.newName = c.nameTooLong;
  if (!isValidDateString(v.date)) fieldErrors.date = c.validDate;
  const spend = parseUserAmount(v.spend, currency, { locale });
  if (!spend.ok) fieldErrors.spend = spend.message;
  const clicks = parseUserInteger(v.clicks, { optional: true, min: 0, locale });
  if (!clicks.ok) fieldErrors.clicks = clicks.message;
  const impressions = parseUserInteger(v.impressions, { optional: true, min: 0, locale });
  if (!impressions.ok) fieldErrors.impressions = impressions.message;
  const conversions = parseUserInteger(v.conversions, { optional: true, min: 0, locale });
  if (!conversions.ok) fieldErrors.conversions = conversions.message;
  const conversionValue = parseUserAmount(v.conversionValue, currency, { optional: true, locale });
  if (!conversionValue.ok) fieldErrors.conversionValue = conversionValue.message;
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: c.checkFields, fieldErrors };
  if (!(await consumeRateLimit(`ad-spend:${ws.user.id}`, 300, 3600))) return { ok: false, message: c.rateLimited };

  const supabase = await createClient();
  let campaignId = v.campaignId;
  if (isNew) {
    const { data: existing } = await supabase
      .from("ad_campaigns")
      .select("id")
      .eq("store_id", ws.activeStore.id)
      .eq("platform", v.newPlatform)
      .eq("match_key", `name:${newName}`.toLowerCase())
      .maybeSingle();
    if (existing) campaignId = existing.id;
    else {
      const { data, error } = await supabase
        .from("ad_campaigns")
        .insert({ organization_id: ws.organization.id, store_id: ws.activeStore.id, platform: v.newPlatform, name: newName })
        .select("id")
        .single();
      if (error || !data) return { ok: false, message: t.createFailed };
      campaignId = data.id;
    }
  }

  const row = {
    spend_minor: spend.ok ? (spend.value as number) : 0,
    clicks: clicks.ok ? (clicks.value ?? 0) : 0,
    impressions: impressions.ok ? (impressions.value ?? 0) : 0,
    conversions: conversions.ok ? (conversions.value ?? 0) : 0,
    conversion_value_minor: conversionValue.ok ? (conversionValue.value ?? 0) : 0,
    source: "manual",
  };
  const { data: existingDay } = await supabase.from("ad_spend_daily").select("id").eq("campaign_id", campaignId).eq("spend_date", v.date).maybeSingle();
  const { error } = existingDay
    ? await supabase.from("ad_spend_daily").update(row).eq("id", existingDay.id)
    : await supabase.from("ad_spend_daily").insert({ organization_id: ws.organization.id, store_id: ws.activeStore.id, campaign_id: campaignId, spend_date: v.date, ...row });
  if (error) return { ok: false, message: error.code === "23503" ? t.campaignNotInStore : t.saveFailed };
  refresh();
  return { ok: true, replaced: Boolean(existingDay) };
}
