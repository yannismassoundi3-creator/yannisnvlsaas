"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicSupabase } from "@/lib/env";
import type { Database } from "./database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser client used for authentication forms. Sessions are stored in cookies. */
export function getBrowserClient() {
  if (!client) {
    const { url, key } = requirePublicSupabase();
    client = createBrowserClient<Database>(url, key);
  }
  return client;
}
