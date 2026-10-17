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
  // A fixed collation, so the order does not depend on the runtime's default language.
  return [...new Set(["UTC", ...extra.filter(Boolean), ...list])].sort((a, b) => (a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b, "en")));
}

/** Currency picker label in the interface language: "EUR — Euro" / "USD — dollar des États-Unis". */
export function currencyLabel(code: string, locale: Locale = "en"): string {
  return `${code} — ${currencyName(code, INTL_LOCALE[locale])}`;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat | null>();

/** UTC offset of a time zone at an instant: "UTC+02:00", "UTC−03:30", or "UTC" for zero. Null for an unknown zone. */
export function utcOffsetLabel(tz: string, at: Date = new Date()): string | null {
  if (!offsetFormatters.has(tz)) {
    let formatter: Intl.DateTimeFormat | null = null;
    try {
      // "en-US" with "longOffset" always yields "GMT", "GMT+02:00" or "GMT-03:30", whatever the interface language.
      formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" });
    } catch {
      formatter = null;
    }
    offsetFormatters.set(tz, formatter);
  }
  const formatter = offsetFormatters.get(tz);
  const raw = formatter?.formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
  const match = raw?.match(/^GMT(?:([+-])(\d{2}):(\d{2}))?$/);
  if (!match) return null;
  const [, sign, hours, minutes] = match;
  return sign ? `UTC${sign === "-" ? "−" : "+"}${hours}:${minutes}` : "UTC";
}

/**
 * Time zone picker label: the IANA identifier and its current UTC offset,
 * "Europe/Paris (UTC+02:00)", or the identifier alone with `offset: false`.
 *
 * Localised zone names ("heure : Scoresbysund") are deliberately not used:
 * they come from the runtime's ICU data, whose wording differs between Node
 * and browsers ("Ittoqqortoormiit"), so server and browser renders disagreed.
 * The offset depends on the runtime's time zone rules and the current date,
 * so pages that server-render the picker show it once hydrated (see
 * StoreSettingsForm).
 */
export function timezoneLabel(tz: string, options: { offset?: boolean; at?: Date } = {}): string {
  const id = tz.replaceAll("_", " ");
  if (options.offset === false) return id;
  const offset = utcOffsetLabel(tz, options.at);
  return offset && offset !== id ? `${id} (${offset})` : id;
}
