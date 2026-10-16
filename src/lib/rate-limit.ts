import "server-only";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limiting backed by Postgres, so limits hold across all
 * server instances. Returns true when the action may proceed.
 *
 * If the limiter itself is unavailable (no secret key configured in local
 * development), it fails open rather than blocking users; production
 * deployments must set SUPABASE_SECRET_KEY.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (!serverEnv().supabaseSecretKey) return true;
  try {
    const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
      p_key: key.slice(0, 200),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data === true;
  } catch {
    return true;
  }
}
