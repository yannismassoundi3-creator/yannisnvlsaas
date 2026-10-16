import { detectDecimalSeparator, parseDecimal, rescale } from "./decimal";
import { parseAmountToMinor, parseUnitCostToE4, type MoneyParseError } from "./money";

/**
 * Parsing for values typed into forms. People type "1 234,50", "1,234.50" or
 * "12,5" depending on habit; the decimal separator is inferred per value.
 */

export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string };

const MESSAGES: Record<MoneyParseError | "invalid_percent" | "not_integer", string> = {
  empty: "Enter a value.",
  invalid_format: "Enter a number, for example 12.50.",
  multiple_signs: "Enter a single number.",
  scientific_notation: "Enter the number in full, without exponent notation.",
  too_large: "This value is too large.",
  negative_not_allowed: "Enter zero or a positive value.",
  invalid_percent: "Enter a percentage between 0 and 100.",
  not_integer: "Enter a whole number.",
};

function separatorFor(value: string) {
  return detectDecimalSeparator([value]);
}

export function parseUserAmount(value: string, currency: string, options: { allowNegative?: boolean; optional?: boolean } = {}): FieldResult<number | null> {
  if (value.trim() === "" && options.optional) return { ok: true, value: null };
  const r = parseAmountToMinor(value, currency, { decimalSeparator: separatorFor(value), allowNegative: options.allowNegative });
  return r.ok ? { ok: true, value: r.value } : { ok: false, message: MESSAGES[r.error] };
}

export function parseUserUnitCost(value: string, options: { optional?: boolean } = {}): FieldResult<number | null> {
  if (value.trim() === "" && options.optional) return { ok: true, value: null };
  const r = parseUnitCostToE4(value, { decimalSeparator: separatorFor(value) });
  return r.ok ? { ok: true, value: r.value } : { ok: false, message: MESSAGES[r.error] };
}

/** "2.9" or "2,9" (%) -> 290 basis points. Up to two decimals are kept. */
export function parseUserPercentToBps(value: string, options: { optional?: boolean } = {}): FieldResult<number | null> {
  const trimmed = value.trim().replace(/%$/, "").trim();
  if (trimmed === "" && options.optional) return { ok: true, value: null };
  const parsed = parseDecimal(trimmed, separatorFor(trimmed));
  if (!parsed.ok) return { ok: false, message: parsed.error === "empty" ? MESSAGES.empty : MESSAGES.invalid_percent };
  const { value: bps } = rescale(parsed.value, 2);
  if (bps < 0n || bps > 10_000n) return { ok: false, message: MESSAGES.invalid_percent };
  return { ok: true, value: Number(bps) };
}

export function parseUserInteger(value: string, options: { optional?: boolean; min?: number; max?: number } = {}): FieldResult<number | null> {
  const trimmed = value.trim().replace(/[\s  ,.'](?=\d{3}\b)/g, "");
  if (trimmed === "" && options.optional) return { ok: true, value: null };
  if (trimmed === "") return { ok: false, message: MESSAGES.empty };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, message: MESSAGES.not_integer };
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return { ok: false, message: MESSAGES.too_large };
  const { min = 0, max = Number.MAX_SAFE_INTEGER } = options;
  if (n < min) return { ok: false, message: min === 0 ? MESSAGES.negative_not_allowed : `Enter ${min} or more.` };
  if (n > max) return { ok: false, message: `Enter ${max.toLocaleString("en-GB")} or less.` };
  return { ok: true, value: n };
}

/** Basis points to an editable percentage string: 290 -> "2.9". */
export function bpsToInputValue(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}
