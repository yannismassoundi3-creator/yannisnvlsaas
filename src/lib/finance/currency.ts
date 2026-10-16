/**
 * Currency metadata derived from ISO 4217 via the platform Intl data, so
 * minor-unit digits are correct for every currency (EUR 2, JPY 0, KWD 3...).
 */

const digitsCache = new Map<string, number>();

let supportedCurrencies: Set<string> | null = null;

function getSupported(): Set<string> {
  if (!supportedCurrencies) {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    supportedCurrencies = new Set(intl.supportedValuesOf ? intl.supportedValuesOf("currency") : COMMON_CURRENCIES);
  }
  return supportedCurrencies;
}

/** True for a known ISO 4217 code such as "EUR". Case-sensitive (uppercase). */
export function isValidCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && getSupported().has(code);
}

/** Number of minor-unit digits for a currency: 2 for EUR, 0 for JPY, 3 for KWD. */
export function currencyDigits(code: string): number {
  const cached = digitsCache.get(code);
  if (cached !== undefined) return cached;
  if (!isValidCurrency(code)) {
    throw new RangeError(`Unsupported currency code: ${code}`);
  }
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
    .maximumFractionDigits!;
  digitsCache.set(code, digits);
  return digits;
}

/** Currencies offered first in pickers. Any valid ISO 4217 code is accepted. */
export const COMMON_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
] as const;

export function currencyName(code: string, locale = "en"): string {
  try {
    const names = new Intl.DisplayNames([locale], { type: "currency" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Narrow symbol for compact UI (e.g. "€", "$", "£"); falls back to the code. */
export function currencySymbol(code: string, locale = "en"): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}
