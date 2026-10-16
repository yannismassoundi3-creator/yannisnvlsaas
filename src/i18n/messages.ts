import type { Locale } from "./config";

/**
 * Translations live next to the code that uses them, as typed modules:
 *
 *   export const m = defineMessages({
 *     en: { title: "Products", rows: (n: number) => `${n} rows` },
 *     fr: { title: "Produits", rows: (n: number) => `${n} lignes` },
 *   });
 *   m[locale].title
 *
 * The French object must have exactly the same shape as the English one, so a
 * missing translation is a type error. Values may be functions for plurals and
 * interpolation. Modules import nothing server-only, so client components can
 * use them too (only the namespaces they import are bundled).
 */
/** String literals become `string`, so constants such as `site.description` can be used in English. */
export type Widen<T> = T extends string ? string : T extends (...args: infer A) => infer R ? (...args: A) => Widen<R> : { [K in keyof T]: Widen<T[K]> };

export function defineMessages<T>(messages: { en: T; fr: NoInfer<Widen<T>> }): Record<Locale, Widen<T>> {
  return messages as Record<Locale, Widen<T>>;
}

/** Plural helper for message functions: plural(n, "row", "rows"). French treats 0 and 1 as singular. */
export function plural(locale: Locale, n: number, one: string, other: string): string {
  const singular = locale === "fr" ? Math.abs(n) < 2 : Math.abs(n) === 1;
  return singular ? one : other;
}
