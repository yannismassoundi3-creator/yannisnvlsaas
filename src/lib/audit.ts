import "server-only";
import { after } from "next/server";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export type AuditAction =
  | "store.created"
  | "store.updated"
  | "store.deleted"
  | "demo_store.created"
  | "import.committed"
  | "import.rolled_back"
  | "import.deleted"
  | "data.exported"
  | "account.export_downloaded"
  | "account.deleted"
  | "billing.checkout_started"
  | "billing.portal_opened";

/**
 * Records a sensitive action in the organisation's audit trail. Metadata must
 * be descriptive (counts, ids, kinds), never financial records.
 */
export function audit(
  action: AuditAction,
  ctx: { organizationId: string | null; actorId: string | null },
  target?: { type: string; id: string },
  metadata: Record<string, string | number | boolean | null> = {},
) {
  after(async () => {
    if (!serverEnv().supabaseSecretKey) return;
    try {
      await createAdminClient().from("audit_events").insert({
        action,
        organization_id: ctx.organizationId,
        actor_id: ctx.actorId,
        target_type: target?.type ?? null,
        target_id: target?.id ?? null,
        metadata: metadata as Json,
      });
    } catch {
      // Never fail the user's action because the audit write failed; it is logged by the platform.
    }
  });
}
