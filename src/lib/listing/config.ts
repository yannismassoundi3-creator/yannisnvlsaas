import "server-only";
import { parseMonthlyLimit } from "./quota";

export const DEFAULT_LISTING_MODEL = "claude-opus-5-5";

/**
 * Listings written with AI are off unless ANTHROPIC_API_KEY is set: nothing is
 * sent anywhere and the interface says "coming soon". LISTING_AI_FAKE=1
 * returns a canned listing instead of calling Claude, for local development
 * and end-to-end tests; it is ignored in production builds.
 */
export function listingAiConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const fake = process.env.NODE_ENV !== "production" && process.env.LISTING_AI_FAKE === "1";
  return {
    enabled: Boolean(apiKey) || fake,
    fake,
    apiKey,
    model: process.env.LISTING_AI_MODEL?.trim() || DEFAULT_LISTING_MODEL,
    monthlyLimit: parseMonthlyLimit(process.env.LISTING_AI_MONTHLY_LIMIT),
  };
}

export type ListingAiConfig = ReturnType<typeof listingAiConfig>;

/**
 * In fake mode only (never in production), the cookie narixia_ai=off makes the
 * feature look unconfigured, so end-to-end tests can check the "coming soon"
 * state against the same server.
 */
export const FAKE_OFF_COOKIE = "narixia_ai";
