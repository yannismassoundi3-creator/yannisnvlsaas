import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { COMMON_CURRENCIES, currencyName } from "@/lib/finance/currency";

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

/** Currency picker label in the interface language: "EUR — Euro" / "USD — dollar des États-Unis". */
export function currencyLabel(code: string, locale: Locale = "en"): string {
  return `${code} — ${currencyName(code, INTL_LOCALE[locale])}`;
}

const zoneNameCache = new Map<string, string | null>();

/** Generic name of a time zone in a language ("Central European Time", "heure d’Europe centrale"), or null. */
function zoneName(tz: string, locale: Locale): string | null {
  const key = `${locale}:${tz}`;
  if (!zoneNameCache.has(key)) {
    let name: string | null = null;
    try {
      const parts = new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: tz, timeZoneName: "longGeneric" }).formatToParts(new Date(0));
      name = parts.find((p) => p.type === "timeZoneName")?.value ?? null;
    } catch {
      name = null;
    }
    // Offsets ("GMT+03:00") and raw identifiers add nothing to the identifier itself.
    if (name && (/^(GMT|UTC)([+\-−]|$)/.test(name) || name === tz)) name = null;
    zoneNameCache.set(key, name);
  }
  return zoneNameCache.get(key) ?? null;
}

/** Time zone picker label: the IANA identifier followed by its name in the interface language. */
export function timezoneLabel(tz: string, locale: Locale = "en"): string {
  const id = tz.replaceAll("_", " ");
  const name = zoneName(tz, locale);
  return name ? `${id} (${name})` : id;
}
