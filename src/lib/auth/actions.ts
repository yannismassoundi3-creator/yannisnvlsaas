"use server";

import { redirect } from "next/navigation";
import { localizedPath } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/request";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(localizedPath("/", await getRequestLocale()));
}
