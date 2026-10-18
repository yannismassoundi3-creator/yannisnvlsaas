import { cookies } from "next/headers";
import { listingMessages, type ListingErrorCode } from "@/i18n/messages/listing";
import { getRequestLocale } from "@/i18n/request";
import { getWorkspace } from "@/lib/auth/workspace";
import { serverEnv } from "@/lib/env";
import { generateListing, type ListingFailure } from "@/lib/listing/claude";
import { FAKE_OFF_COOKIE, listingAiConfig } from "@/lib/listing/config";
import { isMissingObject, remainingAnalyses, usagePeriod } from "@/lib/listing/quota";
import { checkImages, LISTING_LIMITS, listingRequest } from "@/lib/listing/schema";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Listings written with AI from item photos.
 *
 *   GET   whether the feature is available and how many analyses are left
 *         this month: { status: "unavailable" | "paused" | "ready", remaining?, limit? }
 *   POST  one analysis: { images: base64[], name?, price?, locale }
 *         → { ok: true, listing, remaining, limit, test } or { ok: false, code, message }
 *
 * Off unless ANTHROPIC_API_KEY is set (or LISTING_AI_FAKE=1 outside
 * production), and until the photos and AI migration is in the database. One
 * analysis is reserved atomically in the database before Claude is called and
 * given back when the call fails. Nothing from the request is stored or logged.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function config() {
  const c = listingAiConfig();
  // Test hook, fake mode only (never in production): make the feature look unconfigured.
  if (c.fake && (await cookies()).get(FAKE_OFF_COOKIE)?.value === "off") return { ...c, enabled: false };
  return c;
}

export async function GET() {
  const ws = await getWorkspace().catch(() => null);
  if (!ws?.organization) return json({ status: "unavailable" }, 401);
  const c = await config();
  if (!c.enabled) return json({ status: "unavailable" });
  if (!ws.entitlements.canWrite) return json({ status: "paused" });
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_usage").select("used").eq("organization_id", ws.organization.id).eq("period", usagePeriod()).maybeSingle();
  if (error) {
    if (!isMissingObject(error.code)) console.error("[listing-ai] usage read failed", { code: error.code });
    return json({ status: "unavailable" });
  }
  return json({ status: "ready", remaining: remainingAnalyses(c.monthlyLimit, data?.used), limit: c.monthlyLimit });
}

/** Reads the body as text, refusing anything larger than `max` bytes without reading it all. */
async function readLimited(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const FAILURE_STATUS: Record<ListingFailure, number> = {
  refusal: 422,
  truncated: 502,
  invalid_output: 502,
  rate_limited: 503,
  overloaded: 503,
  unavailable: 503,
  cancelled: 499,
};

/** Gives the reserved analysis back (server only: users cannot call the refund function). */
async function refund(organizationId: string, period: string) {
  if (!serverEnv().supabaseSecretKey) return;
  const { error } = await createAdminClient().rpc("release_listing_analysis", { p_organization_id: organizationId, p_period: period });
  if (error) console.error("[listing-ai] refund failed", { code: error.code });
}

export async function POST(request: Request) {
  const locale = await getRequestLocale();
  const t = listingMessages[locale].ai.errors;
  const fail = (code: ListingErrorCode, status: number) => json({ ok: false, code, message: t[code] }, status);

  const ws = await getWorkspace().catch(() => null);
  if (!ws?.organization) return fail("signIn", 401);
  const c = await config();
  if (!c.enabled) return fail("unavailable", 503);
  if (!ws.entitlements.canWrite) return fail("paused", 403);

  const raw = await readLimited(request, LISTING_LIMITS.maxBodyBytes);
  if (raw === null) return fail("too_large", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("invalid", 400);
  }
  const parsed = listingRequest.safeParse(body);
  if (!parsed.success) {
    const tooMany = Array.isArray((body as { images?: unknown })?.images) && (body as { images: unknown[] }).images.length > LISTING_LIMITS.maxImages;
    return fail(tooMany ? "too_many" : "invalid", 400);
  }
  const images = checkImages(parsed.data.images);
  if (!images.ok) return fail(images.reason, images.reason === "too_large" ? 413 : 400);

  if (!(await consumeRateLimit(`listing-ai:${ws.user.id}`, 10, 600))) return fail("rate_limited", 429);

  // Reserve one analysis before calling Claude (atomic, never above the cap).
  const supabase = await createClient();
  const { data: reserved, error } = await supabase
    .rpc("reserve_listing_analysis", { p_organization_id: ws.organization.id, p_limit: c.monthlyLimit })
    .maybeSingle();
  if (error || !reserved) {
    if (error?.message === "quota_exhausted") return fail("quota", 429);
    if (error?.code === "42501") return fail("paused", 403);
    if (!isMissingObject(error?.code)) console.error("[listing-ai] reservation failed", { code: error?.code });
    return fail("unavailable", 503);
  }

  const outcome = await generateListing(
    c,
    { images: images.images, name: parsed.data.name, price: parsed.data.price, locale: parsed.data.locale },
    request.signal,
  ).catch(() => ({ ok: false as const, reason: "unavailable" as const }));
  if (!outcome.ok) {
    await refund(ws.organization.id, reserved.period);
    if (outcome.reason === "cancelled") return fail("unavailable", FAILURE_STATUS.cancelled);
    return fail(outcome.reason, FAILURE_STATUS[outcome.reason]);
  }
  return json({ ok: true, listing: outcome.listing, remaining: reserved.remaining, limit: c.monthlyLimit, test: c.fake });
}
