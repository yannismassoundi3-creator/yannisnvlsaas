import { isValidDateString, localDateOf, zonedTimeToUtc } from "@/lib/dates";

/**
 * Date parsing for imported files. Supported forms:
 *   2026-03-15, 2026/03/15, 2026-03-15 14:23, 2026-03-15T14:23:11Z,
 *   2026-03-15 14:23:11 +0100 (Shopify), 15/03/2026, 15.03.2026 14:23,
 *   03/15/2026 2:23 PM, two-digit years (15/03/26).
 * Day/month order for numeric dates comes from the import options.
 */

export type DateOrder = "ymd" | "dmy" | "mdy";

type Parts = { y: number; m: number; d: number; hh: number; mi: number; ss: number; hasTime: boolean; offsetMinutes: number | null };

const YMD_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?$/i;
const NUMERIC_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?$/i;

function offsetToMinutes(token: string | undefined): number | null {
  if (!token) return null;
  if (/^(z|utc|gmt)$/i.test(token)) return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(token);
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -minutes : minutes;
}

function expandYear(y: string): number {
  if (y.length === 4) return Number(y);
  const n = Number(y);
  return n < 70 ? 2000 + n : 1900 + n;
}

function split(input: string, order: DateOrder): Parts | null {
  const s = input.trim().replace(/\s+/g, " ");
  let m = YMD_RE.exec(s);
  if (m) {
    return {
      y: Number(m[1]),
      m: Number(m[2]),
      d: Number(m[3]),
      hh: m[4] ? Number(m[4]) : 0,
      mi: m[5] ? Number(m[5]) : 0,
      ss: m[6] ? Number(m[6]) : 0,
      hasTime: Boolean(m[4]),
      offsetMinutes: offsetToMinutes(m[7]),
    };
  }
  m = NUMERIC_RE.exec(s);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    let hh = m[4] ? Number(m[4]) : 0;
    const meridiem = m[7]?.toLowerCase();
    if (meridiem) {
      if (hh < 1 || hh > 12) return null;
      if (meridiem === "pm" && hh !== 12) hh += 12;
      if (meridiem === "am" && hh === 12) hh = 0;
    }
    return {
      y: expandYear(m[3]),
      m: order === "mdy" ? a : b,
      d: order === "mdy" ? b : a,
      hh,
      mi: m[5] ? Number(m[5]) : 0,
      ss: m[6] ? Number(m[6]) : 0,
      hasTime: Boolean(m[4]),
      offsetMinutes: offsetToMinutes(m[8]),
    };
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function validate(p: Parts): string | null {
  const date = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  if (!isValidDateString(date)) return "This date does not exist. Check the day/month order in the import options.";
  if (p.y < 2000 || p.y > 2100) return "Dates must be between the years 2000 and 2100.";
  if (p.hh > 23 || p.mi > 59 || p.ss > 59) return "The time is not valid.";
  return null;
}

export type DateTimeResult = { ok: true; instant: string; localDate: string; hadTime: boolean } | { ok: false; message: string };

/**
 * An instant for an order or refund. With an offset the instant is exact;
 * without one, the time is read in the store's time zone. A date without a
 * time is placed at noon local time, so it stays on the same local day.
 */
export function parseDateTime(input: string, order: DateOrder, timezone: string): DateTimeResult {
  if (!input.trim()) return { ok: false, message: "Enter a date." };
  const p = split(input, order);
  if (!p) return { ok: false, message: "Unrecognised date. Use a form such as 2026-03-15 or 15/03/2026 14:30." };
  const invalid = validate(p);
  if (invalid) return { ok: false, message: invalid };
  const date = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  let instant: string;
  if (p.offsetMinutes !== null) {
    instant = new Date(Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mi, p.ss) - p.offsetMinutes * 60_000).toISOString();
  } else {
    instant = zonedTimeToUtc(date, p.hasTime ? `${pad(p.hh)}:${pad(p.mi)}:${pad(p.ss)}` : "12:00:00", timezone);
  }
  return { ok: true, instant, localDate: localDateOf(instant, timezone), hadTime: p.hasTime };
}

export type DateResult = { ok: true; date: string } | { ok: false; message: string };

/** A calendar date (ad spend, expenses). A time part, if any, is ignored. */
export function parseLocalDate(input: string, order: DateOrder): DateResult {
  if (!input.trim()) return { ok: false, message: "Enter a date." };
  const p = split(input, order);
  if (!p) return { ok: false, message: "Unrecognised date. Use a form such as 2026-03-15 or 15/03/2026." };
  const invalid = validate(p);
  if (invalid) return { ok: false, message: invalid };
  return { ok: true, date: `${p.y}-${pad(p.m)}-${pad(p.d)}` };
}

/**
 * Infers the day/month order from sample values. "ambiguous" is true when no
 * sample settles it (every day and month is 12 or less).
 */
export function detectDateOrder(samples: string[]): { order: DateOrder; ambiguous: boolean } {
  let ymd = 0;
  let dmy = 0;
  let mdy = 0;
  let numeric = 0;
  for (const raw of samples) {
    const s = raw.trim();
    if (!s) continue;
    if (YMD_RE.test(s)) {
      ymd++;
      continue;
    }
    const m = NUMERIC_RE.exec(s);
    if (!m) continue;
    numeric++;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (ymd >= numeric) return { order: "ymd", ambiguous: false };
  if (mdy > dmy) return { order: "mdy", ambiguous: false };
  return { order: "dmy", ambiguous: dmy === 0 };
}
