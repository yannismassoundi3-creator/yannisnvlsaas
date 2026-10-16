import { currencyDigits } from "./currency";
import { divideRoundHalfAwayFromZero, parseDecimal, rescale, type DecimalSeparator } from "./decimal";

/**
 * Money model
 * -----------
 * - Amounts (sales, discounts, fees, totals) are integers in the currency's
 *   minor unit: 1999 EUR = €19.99, 1999 JPY = ¥1,999.
 * - Unit costs are integers scaled by 10^4 of the major unit ("e4"), so a
 *   €0.0450 label costs 450. Bulk purchase costs often have sub-cent precision
 *   and rounding them to cents would distort COGS at volume.
 * - Rounding is always half away from zero, matching PostgreSQL's
 *   round(numeric), so application and database totals agree to the cent.
 */

export const UNIT_COST_SCALE = 4;
const UNIT_COST_FACTOR = 10n ** BigInt(UNIT_COST_SCALE);

/** Largest magnitude accepted for a single amount (minor units). */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000; // 10 billion EUR
/** Largest unit cost accepted (e4), i.e. 100 million per unit. */
export const MAX_UNIT_COST_E4 = 1_000_000_000_000;

export type MoneyParseError =
  | "empty"
  | "invalid_format"
  | "multiple_signs"
  | "scientific_notation"
  | "too_large"
  | "negative_not_allowed";

export type MoneyParseResult =
  | { ok: true; value: number; /** true when extra decimals were rounded away */ rounded: boolean }
  | { ok: false; error: MoneyParseError };

type ParseOptions = {
  decimalSeparator?: DecimalSeparator;
  allowNegative?: boolean;
};

/** Parse a formatted amount ("1.234,56 €") into minor units of `currency`. */
export function parseAmountToMinor(input: string, currency: string, options: ParseOptions = {}): MoneyParseResult {
  const { decimalSeparator = ".", allowNegative = false } = options;
  const parsed = parseDecimal(input, decimalSeparator);
  if (!parsed.ok) return parsed;
  const { value, rounded } = rescale(parsed.value, currencyDigits(currency));
  if (value < 0n && !allowNegative) return { ok: false, error: "negative_not_allowed" };
  if (value > BigInt(MAX_AMOUNT_MINOR) || value < -BigInt(MAX_AMOUNT_MINOR)) return { ok: false, error: "too_large" };
  return { ok: true, value: Number(value), rounded };
}

/** Parse a unit cost ("0,045") into e4 units. Negative costs are never valid. */
export function parseUnitCostToE4(input: string, options: Omit<ParseOptions, "allowNegative"> = {}): MoneyParseResult {
  const parsed = parseDecimal(input, options.decimalSeparator ?? ".");
  if (!parsed.ok) return parsed;
  const { value, rounded } = rescale(parsed.value, UNIT_COST_SCALE);
  if (value < 0n) return { ok: false, error: "negative_not_allowed" };
  if (value > BigInt(MAX_UNIT_COST_E4)) return { ok: false, error: "too_large" };
  return { ok: true, value: Number(value), rounded };
}

/** Convert minor units to e4 (exact): €12.34 -> 123400. */
export function minorToE4(minor: number, currency: string): number {
  const digits = currencyDigits(currency);
  return minor * 10 ** (UNIT_COST_SCALE - digits);
}

/** Convert e4 to minor units, rounding half away from zero. */
export function e4ToMinor(e4: number, currency: string): number {
  const digits = currencyDigits(currency);
  return Number(divideRoundHalfAwayFromZero(BigInt(e4), 10n ** BigInt(UNIT_COST_SCALE - digits)));
}

/**
 * Cost of `quantity` units at `unitCostE4`, in minor units.
 * Computed with BigInt so large quantities never lose precision.
 */
export function lineCostMinor(unitCostE4: number, quantity: number, currency: string): number {
  assertSafeInteger(unitCostE4, "unitCostE4");
  assertSafeInteger(quantity, "quantity");
  const digits = currencyDigits(currency);
  const numerator = BigInt(unitCostE4) * BigInt(quantity) * 10n ** BigInt(digits);
  return toSafeNumber(divideRoundHalfAwayFromZero(numerator, UNIT_COST_FACTOR));
}

/** Apply a rate in basis points (290 = 2.90%) to an amount, half away from zero. */
export function applyBasisPoints(amountMinor: number, basisPoints: number): number {
  assertSafeInteger(amountMinor, "amountMinor");
  assertSafeInteger(basisPoints, "basisPoints");
  return toSafeNumber(divideRoundHalfAwayFromZero(BigInt(amountMinor) * BigInt(basisPoints), 10_000n));
}

/** amount * numerator / denominator, half away from zero, without float error. */
export function mulDivRound(amountMinor: number, numerator: number, denominator: number): number {
  assertSafeInteger(amountMinor, "amountMinor");
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  return toSafeNumber(divideRoundHalfAwayFromZero(BigInt(amountMinor) * BigInt(numerator), BigInt(denominator)));
}

/**
 * Split `total` across parts proportionally to non-negative integer `weights`
 * using the largest-remainder method. The parts always sum exactly to
 * `total`. Ties go to the earlier index, so results are deterministic.
 * When every weight is zero the total is split as evenly as possible.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  assertSafeInteger(total, "total");
  if (weights.length === 0) {
    if (total !== 0) throw new RangeError("Cannot allocate a non-zero total across zero parts");
    return [];
  }
  weights.forEach((w) => {
    assertSafeInteger(w, "weight");
    if (w < 0) throw new RangeError("Weights must be non-negative");
  });
  const effective = weights.every((w) => w === 0) ? weights.map(() => 1) : weights;
  const sum = effective.reduce((acc, w) => acc + BigInt(w), 0n);
  const sign = total < 0 ? -1n : 1n;
  const magnitude = BigInt(Math.abs(total));

  const base: bigint[] = [];
  const remainders: { index: number; remainder: bigint }[] = [];
  let allocated = 0n;
  effective.forEach((w, index) => {
    const product = magnitude * BigInt(w);
    const share = product / sum;
    base.push(share);
    allocated += share;
    remainders.push({ index, remainder: product % sum });
  });
  let leftover = magnitude - allocated;
  remainders.sort((a, b) => (b.remainder === a.remainder ? a.index - b.index : b.remainder > a.remainder ? 1 : -1));
  for (const { index } of remainders) {
    if (leftover === 0n) break;
    base[index] += 1n;
    leftover -= 1n;
  }
  return base.map((v) => toSafeNumber(v * sign));
}

/** Sum of minor-unit amounts with overflow protection. */
export function sumMinor(values: readonly number[]): number {
  let total = 0n;
  for (const v of values) {
    assertSafeInteger(v, "amount");
    total += BigInt(v);
  }
  return toSafeNumber(total);
}

/** Exact decimal string for a minor-unit amount: 123456 EUR -> "1234.56". */
export function minorToDecimalString(minor: number, currency: string): string {
  return scaledToDecimalString(BigInt(minor), currencyDigits(currency));
}

export function e4ToDecimalString(e4: number): string {
  return scaledToDecimalString(BigInt(e4), UNIT_COST_SCALE);
}

function scaledToDecimalString(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const intPart = scale === 0 ? digits : digits.slice(0, -scale);
  const frac = scale === 0 ? "" : digits.slice(-scale);
  return `${negative ? "-" : ""}${intPart}${frac ? `.${frac}` : ""}`;
}

export type FormatMoneyOptions = {
  locale?: string;
  /** "always" shows a + for positive values, useful for deltas. */
  signDisplay?: "auto" | "always" | "exceptZero" | "never";
  /** Compact notation for axis ticks: €12.4K */
  compact?: boolean;
  /** Hide minor units for large dashboard figures. */
  wholeUnits?: boolean;
  currencyDisplay?: "symbol" | "narrowSymbol" | "code";
};

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(key: string, factory: () => Intl.NumberFormat) {
  let f = formatterCache.get(key);
  if (!f) {
    f = factory();
    formatterCache.set(key, f);
  }
  return f;
}

/**
 * Format minor units for display. Formats from an exact decimal string, so
 * the displayed value never suffers floating-point drift.
 */
export function formatMoney(minor: number, currency: string, options: FormatMoneyOptions = {}): string {
  const { locale = "en-GB", signDisplay = "auto", compact = false, wholeUnits = false, currencyDisplay = "narrowSymbol" } = options;
  const digits = currencyDigits(currency);
  const key = `${locale}|${currency}|${signDisplay}|${compact}|${wholeUnits}|${currencyDisplay}`;
  const formatter = getFormatter(
    key,
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay,
        signDisplay,
        ...(compact
          ? { notation: "compact", maximumFractionDigits: 1 }
          : wholeUnits
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
            : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
      }),
  );
  // Intl accepts exact decimal strings (ECMA-402 NumberFormat v3).
  return formatter.format(minorToDecimalString(minor, currency) as unknown as number);
}

/** Format a unit cost (e4) with as many decimals as needed, at least the currency's. */
export function formatUnitCost(e4: number, currency: string, locale = "en-GB"): string {
  const digits = currencyDigits(currency);
  const formatter = getFormatter(
    `unit|${locale}|${currency}`,
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: digits,
        maximumFractionDigits: Math.max(digits, UNIT_COST_SCALE),
      }),
  );
  return formatter.format(e4ToDecimalString(e4) as unknown as number);
}

/** Plain number input value (no symbol, no grouping): 123456 EUR -> "1234.56". */
export function minorToInputValue(minor: number, currency: string): string {
  return minorToDecimalString(minor, currency);
}

export function e4ToInputValue(e4: number): string {
  // Trim trailing zeros beyond two decimals for a friendlier edit value.
  const s = e4ToDecimalString(e4);
  return s.replace(/(\.\d{2}\d*?)0+$/, "$1");
}

function assertSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer, received ${value}`);
  }
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Amount exceeds the safe integer range");
  }
  return Number(value);
}
