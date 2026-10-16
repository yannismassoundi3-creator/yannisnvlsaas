import "server-only";
import Stripe from "stripe";
import { MissingConfigurationError, serverEnv } from "@/lib/env";

let client: Stripe | null = null;

/**
 * Stripe API client. Requires STRIPE_SECRET_KEY; use a test-mode key
 * (sk_test_…) everywhere except a verified production account.
 */
export function getStripe(): Stripe {
  const key = serverEnv().stripeSecretKey;
  if (!key) throw new MissingConfigurationError(["STRIPE_SECRET_KEY"]);
  if (!client) {
    client = new Stripe(key, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: "Narixia" },
    });
  }
  return client;
}

export function isLiveMode(): boolean {
  const key = serverEnv().stripeSecretKey;
  return key.startsWith("sk_live_") || key.startsWith("rk_live_");
}

/**
 * Live keys alone never start real payments: new checkouts also need
 * STRIPE_LIVE_ENABLED=true, set once the launch checklist is complete.
 * Webhooks, the billing portal and cancellations keep working regardless.
 */
export function isLiveCheckoutBlocked(): boolean {
  return isLiveMode() && !serverEnv().stripeLiveEnabled;
}

export type { Stripe };
