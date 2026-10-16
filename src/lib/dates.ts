import { TZDate } from "@date-fns/tz";
import type { DateRange } from "@/lib/domain/types";

/**
 * Calendar helpers. Local dates are plain "YYYY-MM-DD" strings; arithmetic on
 * them uses UTC so it is unaffected by the server's time zone or DST.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtcDate(date: string): Date {
  if (!isValidDateString(date)) throw new RangeError(`Invalid date: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const dt = toUtcDate(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtcDate(dt);
}

export function addMonths(date: string, months: number): string {
  const dt = toUtcDate(date);
  const day = dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, lastDay));
  return fromUtcDate(dt);
}

/** Number of days in an inclusive range. */
export function rangeLength(range: DateRange): number {
  return Math.round((toUtcDate(range.to).getTime() - toUtcDate(range.from).getTime()) / 86_400_000) + 1;
}

export function eachDay(range: DateRange): string[] {
  const days: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d);
  return days;
}

export function isInRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

/** The period of equal length immediately before `range`. */
export function previousPeriod(range: DateRange): DateRange {
  const length = rangeLength(range);
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(length - 1)), to };
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Local calendar date of a UTC instant in a time zone. */
export function localDateOf(instant: string | Date, timezone: string): string {
  let f = dateFormatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(timezone, f);
  }
  return f.format(typeof instant === "string" ? new Date(instant) : instant);
}

/** Today's date in a time zone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return localDateOf(now, timezone);
}

/**
 * Converts a local wall-clock time in `timezone` to a UTC ISO instant.
 * Nonexistent DST times move forward; ambiguous times resolve to the first.
 */
export function zonedTimeToUtc(localDate: string, localTime: string, timezone: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = localTime.split(":").map(Number);
  // TZDate#toISOString keeps the zone offset; go through the epoch for UTC.
  return new Date(new TZDate(y, m - 1, d, hh, mm, ss, timezone).getTime()).toISOString();
}

/** UTC bounds [start, end) of an inclusive local date range. */
export function rangeToUtcBounds(range: DateRange, timezone: string): { start: string; end: string } {
  return {
    start: zonedTimeToUtc(range.from, "00:00:00", timezone),
    end: zonedTimeToUtc(addDays(range.to, 1), "00:00:00", timezone),
  };
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export type RangePreset = "last_7" | "last_30" | "last_90" | "month_to_date" | "last_month" | "quarter_to_date" | "year_to_date";

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "last_7", label: "Last 7 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_90", label: "Last 90 days" },
  { id: "month_to_date", label: "Month to date" },
  { id: "last_month", label: "Last month" },
  { id: "quarter_to_date", label: "Quarter to date" },
  { id: "year_to_date", label: "Year to date" },
];

export function presetRange(preset: RangePreset, today: string): DateRange {
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "last_7":
      return { from: addDays(today, -6), to: today };
    case "last_30":
      return { from: addDays(today, -29), to: today };
    case "last_90":
      return { from: addDays(today, -89), to: today };
    case "month_to_date":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last_month": {
      const firstThisMonth = `${today.slice(0, 7)}-01`;
      const lastPrev = addDays(firstThisMonth, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
    case "quarter_to_date": {
      const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${String(qStartMonth).padStart(2, "0")}-01`, to: today };
    }
    case "year_to_date":
      return { from: `${y}-01-01`, to: today };
  }
}

const labelFormatters = new Map<string, Intl.DateTimeFormat>();

function labelFormatter(key: string, options: Intl.DateTimeFormatOptions) {
  let f = labelFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options });
    labelFormatters.set(key, f);
  }
  return f;
}

/** "12 Mar 2026" */
export function formatDate(date: string): string {
  return labelFormatter("long", { day: "numeric", month: "short", year: "numeric" }).format(toUtcDate(date));
}

/** "12 Mar" */
export function formatShortDate(date: string): string {
  return labelFormatter("short", { day: "numeric", month: "short" }).format(toUtcDate(date));
}

/** "1 Mar – 30 Mar 2026" or "28 Dec 2025 – 3 Jan 2026" */
export function formatRange(range: DateRange): string {
  if (range.from === range.to) return formatDate(range.from);
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  return `${sameYear ? formatShortDate(range.from) : formatDate(range.from)} – ${formatDate(range.to)}`;
}

/** Monday-based ISO week start for a date. */
export function weekStart(date: string): string {
  const dt = toUtcDate(date);
  const dow = (dt.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(date, -dow);
}
