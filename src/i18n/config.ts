/**
 * Languages and routing rules.
 *
 * - Public pages (marketing, legal, the public calculator) carry the language
 *   in the URL: English at the root, French under /fr. They are prerendered in
 *   both languages for search engines.
 * - Private pages (sign-in, onboarding, the application) keep the same URL in
 *   every language; the proxy picks the language from the nx_locale cookie
 *   (then the browser's Accept-Language) and rewrites to /[lang]/… internally.
 */

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "nx_locale";
/** Query parameter that switches language: /pricing?hl=fr */
export const LOCALE_PARAM = "hl";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", fr: "Français" };
/** BCP 47 tag used for number and date formatting. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", fr: "fr-FR" };
export const OG_LOCALE: Record<Locale, string> = { en: "en_GB", fr: "fr_FR" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Public pages whose URL carries the language. */
export const PUBLIC_PATHS = ["/", "/pricing", "/glossary", "/privacy", "/terms", "/legal", "/contact", "/tools/profit-margin-calculator"] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}

/** URL of a public page in a language: ("/pricing", "fr") -> "/fr/pricing". Private paths are returned unchanged. */
export function localizedPath(path: string, locale: Locale): string {
  const [pathname, rest = ""] = splitPath(path);
  if (locale === DEFAULT_LOCALE || !isPublicPath(pathname)) return path;
  return `/${locale}${pathname === "/" ? "" : pathname}${rest}`;
}

function splitPath(path: string): [string, string] {
  const i = path.search(/[?#]/);
  return i === -1 ? [path, ""] : [path.slice(0, i), path.slice(i)];
}

/** Picks the best supported language from an Accept-Language header. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) if (isLocale(lang)) return lang;
  return null;
}
