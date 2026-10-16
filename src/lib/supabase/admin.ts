import "server-only";
import { createClient } from "@supabase/supabase-js";
import { MissingConfigurationError, requirePublicSupabase, serverEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Privileged client using the secret (service role) key. It bypasses Row
 * Level Security, so it is reserved for narrowly scoped server tasks:
 * verified billing webhooks, account deletion, audit logging, rate limiting
 * and creating demo stores. Callers must authorise the user first.
 */
export function createAdminClient() {
  const { url } = requirePublicSupabase();
  const key = serverEnv().supabaseSecretKey;
  if (!key) throw new MissingConfigurationError(["SUPABASE_SECRET_KEY"]);
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
