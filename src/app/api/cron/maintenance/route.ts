import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily housekeeping, called by a scheduler (e.g. Vercel Cron) with
 * `Authorization: Bearer <CRON_SECRET>`:
 * - removes expired rate-limit windows;
 * - cancels uploads abandoned for more than two days and deletes their staged rows;
 * - deletes forwarded sale emails: confirmed or dismissed after 30 days, pending after 90.
 */
function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const env = serverEnv();
  if (!env.cronSecret || !env.supabaseSecretKey) return new Response("Maintenance is not configured", { status: 503 });
  if (!authorized(request, env.cronSecret)) return new Response("Unauthorized", { status: 401 });

  const admin = createAdminClient();
  const [rateLimits, imports, inbound] = await Promise.all([admin.rpc("prune_rate_limits"), admin.rpc("prune_abandoned_imports"), admin.rpc("prune_inbound_emails")]);
  if (rateLimits.error || imports.error || inbound.error) {
    console.error("[maintenance] failed", { rateLimits: rateLimits.error?.code, imports: imports.error?.code, inbound: inbound.error?.code });
    return new Response("Maintenance failed", { status: 500 });
  }
  return Response.json({ ok: true, rateLimitRowsRemoved: rateLimits.data ?? 0, stagedImportRowsRemoved: imports.data ?? 0, inboundEmailsRemoved: inbound.data ?? 0 });
}
