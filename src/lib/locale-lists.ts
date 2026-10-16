import { COMMON_CURRENCIES } from "@/lib/finance/currency";

type IntlWithValues = typeof Intl & { supportedValuesOf?: (key: string) => string[] };

/** ISO currencies other than the common ones listed first in pickers. */
export function otherCurrencies(): string[] {
  const intl = Intl as IntlWithValues;
  const all = intl.supportedValuesOf ? intl.supportedValuesOf("currency") : [...COMMON_CURRENCIES];
  const common = new Set<string>(COMMON_CURRENCIES);
  return all.filter((c) => !common.has(c));
}

/** IANA time zones, always including UTC and the given extras, UTC first. */
export function timezoneOptions(extra: string[] = []): string[] {
  const intl = Intl as IntlWithValues;
  const list = intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : ["Europe/Paris", "Europe/London", "America/New_York"];
  return [...new Set(["UTC", ...extra.filter(Boolean), ...list])].sort((a, b) => (a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b)));
}
