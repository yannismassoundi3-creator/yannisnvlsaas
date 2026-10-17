import "server-only";
import { cache } from "react";
import type { Store } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

/** Forwarded sale emails of a store (read with the user's session: RLS applies). */

export type InboundEntry = {
  id: string;
  receivedAt: string;
  kind: "sale" | "gmail_verification" | "other";
  platform: string | null;
  subject: string | null;
  fromAddress: string | null;
  title: string | null;
  amountMinor: number | null;
  verificationCode: string | null;
  verificationUrl: string | null;
  excerpt: string | null;
};

/** Number of emails waiting for the seller (sales to confirm and Gmail confirmations). */
export const countPendingInbound = cache(async (store: Pick<Store, "id">): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase.from("inbound_emails").select("id", { count: "exact", head: true }).eq("store_id", store.id).eq("status", "pending");
  if (error) {
    console.error("[inbound] count failed", { code: error.code });
    return 0;
  }
  return count ?? 0;
});

export async function listPendingInbound(store: Pick<Store, "id">, limit = 100): Promise<InboundEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbound_emails")
    .select("id, received_at, kind, platform, subject, from_address, parsed_title, parsed_amount_minor, verification_code, verification_url, text_excerpt")
    .eq("store_id", store.id)
    .eq("status", "pending")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[inbound] list failed", { code: error.code });
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    receivedAt: r.received_at,
    kind: r.kind === "gmail_verification" || r.kind === "other" ? r.kind : "sale",
    platform: r.platform,
    subject: r.subject,
    fromAddress: r.from_address,
    title: r.parsed_title,
    amountMinor: r.parsed_amount_minor === null ? null : Number(r.parsed_amount_minor),
    verificationCode: r.verification_code,
    verificationUrl: r.verification_url,
    excerpt: r.text_excerpt,
  }));
}
