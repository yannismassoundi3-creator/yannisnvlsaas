import { lang } from "next/root-params";
import { cache } from "react";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { createFormat } from "./format";

/**
 * Language of the current page, for Server Components (from the [lang] root
 * segment, set by the URL or by the proxy's rewrite). Server Actions and Route
 * Handlers cannot read root params: use getRequestLocale() from ./request.
 */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export const getFormat = cache(async () => createFormat(await getLocale()));
