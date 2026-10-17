import "server-only";
import { serverEnv } from "@/lib/env";
import { inboundAddress } from "./parse";

/**
 * Sales received by email are available only when the inbound provider is
 * configured (INBOUND_WEBHOOK_SECRET and an address template or domain) and
 * the server can write with the service role. Otherwise the interface says
 * "coming soon" and the webhook answers 503.
 */
export function inboundConfig() {
  const env = serverEnv();
  const template = env.inboundEmailAddressTemplate.trim();
  const domain = env.inboundEmailDomain.trim();
  const enabled = Boolean(env.inboundWebhookSecret && env.supabaseSecretKey && ((template && template.includes("{token}")) || domain));
  return { enabled, template, domain, secret: env.inboundWebhookSecret };
}

/** The store's inbound address, or null when the feature is not configured or the store has no token. */
export function storeInboundAddress(token: string | null | undefined): string | null {
  const config = inboundConfig();
  if (!config.enabled || !token) return null;
  return inboundAddress(token, config);
}
