import { isValidCurrency } from "./currency";

/**
 * Exact decimal parsing. Values never pass through binary floating point:
 * a string such as "1.234,56" becomes the scaled integer 123456n with scale 2.
 */

export type DecimalSeparator = "." | ",";

export type ParsedDecimal = {
  /** Integer value scaled by 10^scale, e.g. 12.5 -> { value: 125n, scale: 1 }. */
  value: bigint;
  scale: number;
};

export type DecimalParseError = "empty" | "invalid_format" | "multiple_signs" | "scientific_notation";

export type DecimalResult = { ok: true; value: ParsedDecimal } | { ok: false; error: DecimalParseError };

// Spaces used as thousands separators: regular, no-break, narrow no-break, thin.
const SPACE_RE = /[\s   ]/g;
const SYMBOLS = "€|\\$|£|¥|₹|₩|₺|₽|₪|₫|฿|₴|₦|₱|kr\\.?|zł|Kč|Ft|lei|Fr\\.?";
const LEADING_CURRENCY = new RegExp(`^([+-]?)[\\s\\u00a0\\u202f]*(${SYMBOLS}|[A-Z]{3})[\\s\\u00a0\\u202f]*`);
const TRAILING_CURRENCY = new RegExp(`[\\s\\u00a0\\u202f]*(${SYMBOLS}|[A-Z]{3})$`);

function isCurrencyToken(token: string): boolean {
  return /^[A-Z]{3}$/.test(token) ? isValidCurrency(token) : true;
}

/** Removes one leading and one trailing currency marker ("€", "EUR", "kr"...). */
function stripCurrency(s: string): string {
  const lead = s.match(LEADING_CURRENCY);
  if (lead && isCurrencyToken(lead[2])) s = lead[1] + s.slice(lead[0].length);
  const trail = s.match(TRAILING_CURRENCY);
  if (trail && isCurrencyToken(trail[1])) s = s.slice(0, s.length - trail[0].length);
  return s;
}

/**
 * Parse a human or spreadsheet formatted number.
 *
 * Supported: "1234.56", "1,234.56", "1.234,56" (with decimalSeparator ","),
 * "1 234,56", "-12.5", "−12.5" (unicode minus), "(12.50)" (accounting
 * negative), "+3", "€12.50", "-€12.50", "12.50 EUR", "12.5-" (trailing minus).
 *
 * Rejected: empty strings, scientific notation, multiple decimal separators,
 * misplaced thousands separators and anything else that is not a number.
 */
export function parseDecimal(input: string, decimalSeparator: DecimalSeparator = "."): DecimalResult {
  let s = input.trim();
  if (s === "") return { ok: false, error: "empty" };

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/−/g, "-");
  s = stripCurrency(s).replace(SPACE_RE, "");
  if (s === "") return { ok: false, error: "invalid_format" };

  if (/^[+-]?\d*[.,]?\d*[eE][+-]?\d+$/.test(s)) return { ok: false, error: "scientific_notation" };
  if (/[^0-9.,+-]/.test(s)) return { ok: false, error: "invalid_format" };

  const signs = s.match(/[+-]/g) ?? [];
  if (signs.length > 1 || (negative && signs.length > 0)) return { ok: false, error: "multiple_signs" };
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  } else if (signs.length === 1) {
    return { ok: false, error: "invalid_format" };
  }
  if (s === "") return { ok: false, error: "invalid_format" };

  const thousandsSeparator = decimalSeparator === "." ? "," : ".";
  const parts = s.split(decimalSeparator);
  if (parts.length > 2) return { ok: false, error: "invalid_format" };
  let intPart = parts[0];
  const fracPart = parts[1] ?? "";

  if (intPart.includes(thousandsSeparator)) {
    // Thousands groups must be complete: 1,234,567 but not 12,34.
    const groups = intPart.split(thousandsSeparator);
    const [first, ...rest] = groups;
    if (!/^\d{1,3}$/.test(first) || rest.some((g) => !/^\d{3}$/.test(g))) {
      return { ok: false, error: "invalid_format" };
    }
    intPart = groups.join("");
  }
  if (fracPart.includes(thousandsSeparator)) return { ok: false, error: "invalid_format" };
  if (intPart === "" && fracPart === "") return { ok: false, error: "invalid_format" };
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return { ok: false, error: "invalid_format" };

  const digits = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "") || "0";
  let value = BigInt(digits);
  if (negative && value !== 0n) value = -value;
  return { ok: true, value: { value, scale: fracPart.length } };
}

/** Round a scaled decimal to a target scale, half away from zero. */
export function rescale(dec: ParsedDecimal, targetScale: number): { value: bigint; rounded: boolean } {
  if (dec.scale === targetScale) return { value: dec.value, rounded: false };
  if (dec.scale < targetScale) {
    return { value: dec.value * 10n ** BigInt(targetScale - dec.scale), rounded: false };
  }
  const divisor = 10n ** BigInt(dec.scale - targetScale);
  return { value: divideRoundHalfAwayFromZero(dec.value, divisor), rounded: dec.value % divisor !== 0n };
}

/** Integer division rounding half away from zero (PostgreSQL numeric semantics). */
export function divideRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Detects the decimal separator most likely used by a sample of numeric strings. */
export function detectDecimalSeparator(samples: string[]): DecimalSeparator {
  let commaVotes = 0;
  let dotVotes = 0;
  for (const raw of samples) {
    const s = stripCurrency(raw.trim()).replace(SPACE_RE, "");
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma >= 0 && lastDot >= 0) {
      // Whichever comes last is the decimal separator: 1.234,56 or 1,234.56.
      if (lastComma > lastDot) commaVotes += 2;
      else dotVotes += 2;
    } else if (lastComma >= 0) {
      // "12,5" suggests comma decimals; "1,234" is ambiguous (could be thousands).
      if (s.length - lastComma - 1 !== 3) commaVotes += 1;
    } else if (lastDot >= 0) {
      if (s.length - lastDot - 1 !== 3) dotVotes += 1;
    }
  }
  return commaVotes > dotVotes ? "," : ".";
}
