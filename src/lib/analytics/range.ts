import { isValidDateString, presetRange, RANGE_PRESETS, rangeLength, type RangePreset } from "@/lib/dates";
import type { DateRange } from "@/lib/domain/types";

export const DEFAULT_PRESET: RangePreset = "last_30";
const MAX_RANGE_DAYS = 3 * 366;

export type ResolvedRange = {
  range: DateRange;
  preset: RangePreset | null;
  /** True when the requested start was moved to respect the plan's history limit. */
  clampedToHistory: boolean;
  /** Earliest date the plan allows. */
  historyStart: string;
};

type Params = { range?: string | string[]; from?: string | string[]; to?: string | string[] };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Resolves the reporting period from URL parameters: a preset (?range=last_90)
 * or explicit dates (?from=2026-09-01&to=2026-09-30). Invalid input falls back
 * to the default preset; dates are clamped to [historyStart, today].
 */
export function resolveRange(params: Params, today: string, historyStart: string): ResolvedRange {
  const presetParam = first(params.range);
  const fromParam = first(params.from);
  const toParam = first(params.to);

  let preset: RangePreset | null = null;
  let range: DateRange;

  if (fromParam && toParam && isValidDateString(fromParam) && isValidDateString(toParam) && fromParam <= toParam) {
    range = { from: fromParam, to: toParam };
  } else {
    preset = RANGE_PRESETS.some((p) => p.id === presetParam) ? (presetParam as RangePreset) : DEFAULT_PRESET;
    range = presetRange(preset, today);
  }

  if (range.to > today) range = { ...range, to: today };
  if (range.from > range.to) range = { from: range.to, to: range.to };

  let clampedToHistory = false;
  if (range.from < historyStart) {
    clampedToHistory = true;
    range = { from: historyStart, to: range.to < historyStart ? historyStart : range.to };
  }
  if (rangeLength(range) > MAX_RANGE_DAYS) {
    clampedToHistory = true;
    const d = new Date(`${range.to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (MAX_RANGE_DAYS - 1));
    range = { ...range, from: d.toISOString().slice(0, 10) };
  }
  return { range, preset, clampedToHistory, historyStart };
}

/** Query string that reproduces a range, for links that keep the current period. */
export function rangeQuery(resolved: Pick<ResolvedRange, "range" | "preset">): string {
  return resolved.preset ? `range=${resolved.preset}` : `from=${resolved.range.from}&to=${resolved.range.to}`;
}
