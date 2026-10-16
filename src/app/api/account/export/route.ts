import { accountExportErrors } from "@/i18n/messages/account-settings";
import { getRequestLocale } from "@/i18n/request";
import { audit } from "@/lib/audit";
import { getWorkspace } from "@/lib/auth/workspace";
import { fileSlug } from "@/lib/csv";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type TableName = keyof Database["public"]["Tables"];

/**
 * Data portability export: everything stored for the organisation, as one
 * JSON document streamed table by table. Read with the user's own session,
 * so Row Level Security scopes every query. Available on every plan,
 * including after a trial or subscription has ended.
 */
// Paged by primary key so pagination is stable while rows are read.
const TABLES: { name: TableName; key: string; columns: string; order: string }[] = [
  { name: "stores", key: "stores", columns: "*", order: "id" },
  { name: "products", key: "products", columns: "*", order: "id" },
  { name: "orders", key: "orders", columns: "*", order: "id" },
  { name: "order_items", key: "order_items", columns: "*", order: "id" },
  { name: "refunds", key: "refunds", columns: "*", order: "id" },
  { name: "expenses", key: "expenses", columns: "*", order: "id" },
  { name: "ad_campaigns", key: "ad_campaigns", columns: "*", order: "id" },
  { name: "ad_spend_daily", key: "ad_spend_daily", columns: "*", order: "id" },
  {
    name: "import_jobs",
    key: "imports",
    columns: "id, store_id, kind, status, file_name, file_size_bytes, total_rows, valid_rows, invalid_rows, duplicate_rows, inserted_count, updated_count, skipped_count, created_at, committed_at, rolled_back_at",
    order: "id",
  },
  { name: "subscriptions", key: "subscriptions", columns: "status, plan, current_period_start, current_period_end, cancel_at_period_end, cancel_at, canceled_at, ended_at, trial_end, created_at", order: "id" },
  { name: "audit_events", key: "audit_trail", columns: "action, target_type, target_id, metadata, created_at", order: "id" },
];

export async function GET() {
  const ws = await getWorkspace().catch(() => null);
  const errors = accountExportErrors[await getRequestLocale()];
  if (!ws) return new Response(errors.signIn, { status: 401 });
  if (!(await consumeRateLimit(`account-export:${ws.user.id}`, 5, 3600))) return new Response(errors.tooMany, { status: 429 });
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, created_at").eq("id", ws.user.id).maybeSingle();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        write("{\n");
        write(`"format": "narixia-export/1",\n"exported_at": ${JSON.stringify(new Date().toISOString())},\n`);
        write(`"notes": ${JSON.stringify("Amounts are integers in the minor unit of each store's currency (cents for EUR); unit_cost_e4 values are costs × 10,000. All amounts exclude tax.")},\n`);
        write(`"user": ${JSON.stringify({ id: ws.user.id, email: ws.user.email, full_name: profile?.full_name ?? null, created_at: profile?.created_at ?? null })},\n`);
        write(`"organization": ${JSON.stringify(ws.organization ? { ...ws.organization, role: ws.role } : null)}`);
        if (ws.organization) {
          for (const table of TABLES) {
            write(`,\n${JSON.stringify(table.key)}: [`);
            let first = true;
            for (let from = 0; from < 5_000_000; from += 1000) {
              const { data, error } = await supabase
                .from(table.name)
                .select(table.columns)
                .order(table.order, { ascending: true })
                .range(from, from + 999);
              if (error) throw new Error(`${table.name}: ${error.code}`);
              for (const row of data ?? []) {
                write(`${first ? "\n" : ",\n"}${JSON.stringify(row)}`);
                first = false;
              }
              if (!data || data.length < 1000) break;
            }
            write("\n]");
          }
        }
        write("\n}\n");
        controller.close();
      } catch (error) {
        console.error("[account-export] failed", { message: error instanceof Error ? error.message : "unknown" });
        controller.error(error);
      }
    },
  });

  if (ws.organization) audit("account.export_downloaded", { organizationId: ws.organization.id, actorId: ws.user.id });
  const name = fileSlug(ws.organization?.name ?? "narixia");
  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
