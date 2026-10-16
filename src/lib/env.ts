/**
 * Environment configuration.
 *
 * Public variables must be referenced literally (process.env.NEXT_PUBLIC_X)
 * so Next.js can inline them into browser bundles. Server secrets are read
 * lazily and only on the server; they never appear in client code.
 */

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabasePublishableKey);
}

export class MissingConfigurationError extends Error {
  constructor(public readonly variables: string[]) {
    super(`Missing environment configuration: ${variables.join(", ")}. See .env.example and README.md.`);
    this.name = "MissingConfigurationError";
  }
}

export function requirePublicSupabase() {
  const missing = [
    !publicEnv.supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
    !publicEnv.supabasePublishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean) as string[];
  if (missing.length) throw new MissingConfigurationError(missing);
  return { url: publicEnv.supabaseUrl, key: publicEnv.supabasePublishableKey };
}

/** Server-only secrets. Importing this from client code throws at build time via server-only guards in callers. */
export function serverEnv() {
  return {
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    stripePriceProMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
    stripeAutomaticTax: process.env.STRIPE_AUTOMATIC_TAX === "true",
    /** Explicit operator opt-in before live keys may start checkouts (see docs/BILLING.md). */
    stripeLiveEnabled: process.env.STRIPE_LIVE_ENABLED === "true",
    cronSecret: process.env.CRON_SECRET ?? "",
  };
}

export function isStripeConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.stripeSecretKey && env.stripePriceProMonthly);
}
