/**
 * Monthly cap of AI listings per organisation. Pure helpers (unit-tested); the
 * counter itself lives in public.ai_usage and is only changed by
 * public.reserve_listing_analysis / public.release_listing_analysis.
 */

export const DEFAULT_MONTHLY_LIMIT = 50;
/** Highest cap accepted from the environment (the database refuses more than 10,000). */
export const MAX_MONTHLY_LIMIT = 10_000;

/** First day of the calendar month (UTC) of `now`, as YYYY-MM-DD: the key of ai_usage.period. */
export function usagePeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Cap from LISTING_AI_MONTHLY_LIMIT: a whole number between 0 and 10,000, else the default. */
export function parseMonthlyLimit(raw: string | undefined | null): number {
  const value = raw?.trim();
  if (!value || !/^\d{1,6}$/.test(value)) return DEFAULT_MONTHLY_LIMIT;
  const n = Number(value);
  return n <= MAX_MONTHLY_LIMIT ? n : DEFAULT_MONTHLY_LIMIT;
}

/** Analyses left this month, never below zero. */
export function remainingAnalyses(limit: number, used: number | null | undefined): number {
  return Math.max(0, limit - Math.max(0, used ?? 0));
}

/**
 * PostgREST / Postgres codes meaning the photos and AI migration is not in the
 * database yet (the code is deployed before the SQL is run): unknown table,
 * column or function.
 */
const MISSING_OBJECT = new Set(["42P01", "PGRST205", "42703", "PGRST204", "PGRST202", "42883"]);

export function isMissingObject(code: string | null | undefined): boolean {
  return Boolean(code && MISSING_OBJECT.has(code));
}
