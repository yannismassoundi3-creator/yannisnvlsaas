import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { inputMessages } from "@/i18n/messages/catalog-input";
import { detectDecimalSeparator, parseDecimal, rescale } from "./decimal";
import { parseAmountToMinor, parseUnitCostToE4 } from "./money";

/**
 * Parsing for values typed into forms. People type "1 234,50", "1,234.50" or
 * "12,5" depending on habit; the decimal separator is inferred per value.
 * Error messages follow `options.locale` (English by default).
 */

export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string };

function separatorFor(value: string) {
  return detectDecimalSeparator([value]);
}

type LocaleOption = { locale?: Locale };

export function parseUserAmount(value: string, currency: string, options: { allowNegative?: boolean; optional?: boolean } & LocaleOption = {}): FieldResult<number | null> {
  if (value.trim() === "" && options.optional) return { ok: true, value: null };
  const r = parseAmountToMinor(value, currency, { decimalSeparator: separatorFor(value), allowNegative: options.allowNegative });
  return r.ok ? { ok: true, value: r.value } : { ok: false, message: inputMessages[options.locale ?? "en"][r.error] };
}

export function parseUserUnitCost(value: string, options: { optional?: boolean } & LocaleOption = {}): FieldResult<number | null> {
  if (value.trim() === "" && options.optional) return { ok: true, value: null };
  const r = parseUnitCostToE4(value, { decimalSeparator: separatorFor(value) });
  return r.ok ? { ok: true, value: r.value } : { ok: false, message: inputMessages[options.locale ?? "en"][r.error] };
}

/** "2.9" or "2,9" (%) -> 290 basis points. Up to two decimals are kept. */
export function parseUserPercentToBps(value: string, options: { optional?: boolean } & LocaleOption = {}): FieldResult<number | null> {
  const t = inputMessages[options.locale ?? "en"];
  const trimmed = value.trim().replace(/%$/, "").trim();
  if (trimmed === "" && options.optional) return { ok: true, value: null };
  const parsed = parseDecimal(trimmed, separatorFor(trimmed));
  if (!parsed.ok) return { ok: false, message: parsed.error === "empty" ? t.empty : t.invalid_percent };
  const { value: bps } = rescale(parsed.value, 2);
  if (bps < 0n || bps > 10_000n) return { ok: false, message: t.invalid_percent };
  return { ok: true, value: Number(bps) };
}

export function parseUserInteger(value: string, options: { optional?: boolean; min?: number; max?: number } & LocaleOption = {}): FieldResult<number | null> {
  const locale = options.locale ?? "en";
  const t = inputMessages[locale];
  const trimmed = value.trim().replace(/[\s  ,.'](?=\d{3}\b)/g, "");
  if (trimmed === "" && options.optional) return { ok: true, value: null };
  if (trimmed === "") return { ok: false, message: t.empty };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, message: t.not_integer };
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return { ok: false, message: t.too_large };
  const { min = 0, max = Number.MAX_SAFE_INTEGER } = options;
  if (n < min) return { ok: false, message: min === 0 ? t.negative_not_allowed : t.atLeast(String(min)) };
  if (n > max) return { ok: false, message: t.atMost(max.toLocaleString(INTL_LOCALE[locale])) };
  return { ok: true, value: n };
}

/** Basis points to an editable percentage string: 290 -> "2.9". */
export function bpsToInputValue(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}
