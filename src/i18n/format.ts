import { formatDate, formatDateTime, formatRange, formatShortDate } from "@/lib/dates";
import type { DateRange } from "@/lib/domain/types";
import { formatCompactNumber, formatCount, formatMultiple, formatPercent, formatPoints } from "@/lib/finance/format";
import { formatMoney, formatUnitCost, type FormatMoneyOptions } from "@/lib/finance/money";
import { INTL_LOCALE, type Locale } from "./config";

/**
 * Formatters bound to a language. Use `getFormat()` in server components and
 * `useFormat()` in client components rather than calling the low-level
 * functions, so figures follow the interface language (1,234.56 vs 1 234,56).
 */
export function createFormat(locale: Locale) {
  const intl = INTL_LOCALE[locale];
  return {
    locale,
    intl,
    money: (minor: number, currency: string, options: Omit<FormatMoneyOptions, "locale"> = {}) => formatMoney(minor, currency, { ...options, locale: intl }),
    unitCost: (e4: number, currency: string) => formatUnitCost(e4, currency, intl),
    percent: (rate: number | null | undefined, options: { digits?: number; signDisplay?: "auto" | "always" | "exceptZero" } = {}) =>
      formatPercent(rate, { ...options, locale: intl }),
    points: (delta: number | null | undefined, digits = 1) => formatPoints(delta, digits, intl),
    count: (value: number | null | undefined) => formatCount(value, intl),
    multiple: (value: number | null | undefined, digits = 2) => formatMultiple(value, digits, intl),
    compact: (value: number) => formatCompactNumber(value, intl),
    date: (date: string) => formatDate(date, intl),
    shortDate: (date: string) => formatShortDate(date, intl),
    range: (range: DateRange) => formatRange(range, intl),
    dateTime: (instant: string | Date, timezone: string) => formatDateTime(instant, timezone, intl),
  };
}

export type Format = ReturnType<typeof createFormat>;
