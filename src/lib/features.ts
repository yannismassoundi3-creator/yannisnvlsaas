import "server-only";
import type { FeatureAvailability } from "@/config/plans";
import { inboundConfig } from "@/lib/inbound/config";
import { parseMonthlyLimit } from "@/lib/listing/quota";

/**
 * Optional features switched on for this deployment, for plan descriptions:
 * until they are, plans describe them as "coming soon". Only the real
 * configuration counts (the end-to-end tests' fake AI never does). On
 * prerendered marketing pages this is read at build time, so a change needs a
 * new deployment, like any NEXT_PUBLIC_* value.
 */
export function featureAvailability(): FeatureAvailability {
  return {
    aiListings: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    inboundEmail: inboundConfig().enabled,
    aiListingsPerMonth: parseMonthlyLimit(process.env.LISTING_AI_MONTHLY_LIMIT),
  };
}
