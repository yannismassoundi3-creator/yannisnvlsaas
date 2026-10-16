import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requirePublicSupabase } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Supabase client bound to the current user's session (cookies). Every query
 * runs with the user's identity, so Row Level Security applies.
 * Create one per request; never share it between requests.
 */
export async function createClient() {
  const { url, key } = requirePublicSupabase();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes sessions before rendering, so this is safe to ignore.
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
