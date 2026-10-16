import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "./config";

/**
 * Language of the current request for Server Actions and Route Handlers
 * (exports, reports, webhooks never need it). The proxy sets the cookie on
 * every page view, so it matches the page the action was called from.
 */
export async function getRequestLocale(): Promise<Locale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return negotiateLocale((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}
