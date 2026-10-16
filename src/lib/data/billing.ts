import "server-only";
import type { ReadyWorkspace } from "@/lib/auth/workspace";
import { getStripe, isLiveMode } from "@/lib/billing/stripe";
import { isStripeConfigured, serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type InvoiceSummary = {
  id: string;
  number: string | null;
  created: string;
  total: number;
  currency: string;
  status: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
};

export type BillingDetails = {
  configured: boolean;
  liveMode: boolean;
  hasCustomer: boolean;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
    trialEnd: string | null;
    pastDueSince: string | null;
  } | null;
  invoices: InvoiceSummary[];
  invoicesUnavailable: boolean;
};

export async function getBillingDetails(ws: ReadyWorkspace): Promise<BillingDetails> {
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end, cancel_at, trial_end, past_due_since")
    .eq("organization_id", ws.organization.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const configured = isStripeConfigured();
  let customerId: string | null = null;
  if (serverEnv().supabaseSecretKey) {
    const { data } = await createAdminClient().from("billing_customers").select("stripe_customer_id").eq("organization_id", ws.organization.id).maybeSingle();
    customerId = data?.stripe_customer_id ?? null;
  }

  let invoices: InvoiceSummary[] = [];
  let invoicesUnavailable = false;
  if (configured && customerId) {
    try {
      const list = await getStripe().invoices.list({ customer: customerId, limit: 12 });
      invoices = list.data.map((i) => ({
        id: i.id ?? "",
        number: i.number,
        created: new Date(i.created * 1000).toISOString(),
        total: i.total,
        currency: i.currency.toUpperCase(),
        status: i.status,
        hostedUrl: i.hosted_invoice_url ?? null,
        pdfUrl: i.invoice_pdf ?? null,
      }));
    } catch {
      invoicesUnavailable = true;
    }
  }

  return {
    configured,
    liveMode: configured && isLiveMode(),
    hasCustomer: Boolean(customerId),
    subscription: sub
      ? {
          status: sub.status,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          cancelAt: sub.cancel_at,
          trialEnd: sub.trial_end,
          pastDueSince: sub.past_due_since,
        }
      : null,
    invoices,
    invoicesUnavailable,
  };
}
