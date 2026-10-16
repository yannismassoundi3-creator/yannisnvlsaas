/**
 * Display formatting for ratios and counts. Money formatting lives in money.ts.
 * Ratios are plain fractions (0.246 = 24.6%) and are only ever used for display;
 * they never feed back into stored amounts.
 */

const cache = new Map<string, Intl.NumberFormat>();

function nf(key: string, factory: () => Intl.NumberFormat) {
  let f = cache.get(key);
  if (!f) {
    f = factory();
    cache.set(key, f);
  }
  return f;
}

export function formatPercent(
  rate: number | null | undefined,
  options: { digits?: number; signDisplay?: "auto" | "always" | "exceptZero"; locale?: string } = {},
): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  const { digits = 1, signDisplay = "auto", locale = "en-GB" } = options;
  return nf(`pct|${locale}|${digits}|${signDisplay}`, () =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay,
    }),
  ).format(rate);
}

function fixed(value: number, digits: number, locale: string): string {
  return nf(`fixed|${locale}|${digits}`, () => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })).format(value);
}

/** Percentage-point difference, e.g. 0.031 -> "+3.1 pts" ("+3,1 pts" in French). */
export function formatPoints(delta: number | null | undefined, digits = 1, locale = "en-GB"): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return "—";
  const value = delta * 100;
  const rounded = Number(value.toFixed(digits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${fixed(Math.abs(rounded), digits, locale)} pts`;
}

export function formatCount(value: number | null | undefined, locale = "en-GB"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return nf(`count|${locale}`, () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })).format(value);
}

/** Multiplier such as ROAS: 2.43 -> "2.43×" ("2,43×" in French). */
export function formatMultiple(value: number | null | undefined, digits = 2, locale = "en-GB"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${fixed(value, digits, locale)}×`;
}

export function formatCompactNumber(value: number, locale = "en-GB"): string {
  return nf(`compact|${locale}`, () => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })).format(value);
}
