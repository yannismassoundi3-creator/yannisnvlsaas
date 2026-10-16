import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, isPublicPath, LOCALE_COOKIE, LOCALE_PARAM, localizedPath, negotiateLocale, type Locale } from "@/i18n/config";
import { needsSession, updateSession } from "@/lib/supabase/proxy";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** "/fr/pricing" -> { locale: "fr", path: "/pricing" }; "/pricing" -> { locale: null, path: "/pricing" } */
function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const segment = pathname.split("/")[1];
  if (!isLocale(segment)) return { locale: null, path: pathname };
  return { locale: segment, path: pathname.slice(segment.length + 1) || "/" };
}

function withLocaleCookie(response: NextResponse, request: NextRequest, locale: Locale) {
  if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: ONE_YEAR, secure: request.nextUrl.protocol === "https:" });
  }
  return response;
}

function redirectTo(request: NextRequest, path: string, locale: Locale) {
  const url = request.nextUrl.clone();
  url.searchParams.delete(LOCALE_PARAM);
  url.pathname = path;
  return withLocaleCookie(NextResponse.redirect(url), request, locale);
}

function preferredLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return negotiateLocale(request.headers.get("accept-language")) ?? DEFAULT_LOCALE;
}

/**
 * Language routing and session refresh.
 * - `?hl=fr` switches language and redirects to the canonical URL.
 * - Public pages: English at the root, French under /fr (prerendered).
 *   A visitor whose preference is French is sent from /pricing to /fr/pricing.
 * - Private pages keep one URL; they are rewritten to /<locale>/… from the cookie.
 * - Supabase sessions are refreshed on private pages and session-aware API routes.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) return updateSession(request);

  const { locale: prefixed, path } = splitLocale(pathname);
  const switchTo = request.nextUrl.searchParams.get(LOCALE_PARAM);
  if (isLocale(switchTo)) return redirectTo(request, localizedPath(path, switchTo), switchTo);

  if (prefixed) {
    // Only public pages live under a prefix, and English has none.
    if (prefixed === DEFAULT_LOCALE || !isPublicPath(path)) return redirectTo(request, path, prefixed);
    return withLocaleCookie(NextResponse.next(), request, prefixed);
  }

  const locale = preferredLocale(request);
  if (isPublicPath(pathname) && locale !== DEFAULT_LOCALE) return redirectTo(request, localizedPath(pathname, locale), locale);

  const target = new URL(`/${isPublicPath(pathname) ? DEFAULT_LOCALE : locale}${pathname === "/" ? "" : pathname}${search}`, request.url);
  const response = needsSession(pathname) ? await updateSession(request, target) : NextResponse.rewrite(target);
  // Supabase redirects (signed-out visitors, signed-in users on auth pages) are returned as they are.
  return withLocaleCookie(response, request, isPublicPath(pathname) ? DEFAULT_LOCALE : locale);
}

export const config = {
  matcher: [
    // Every page, but not static files, Next.js internals, metadata routes or the email-link handler.
    "/((?!api|_next/static|_next/image|auth/confirm|opengraph-image|apple-icon|icon.svg|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.[a-zA-Z0-9]+$).*)",
    "/api/exports/:path*",
    "/api/reports/:path*",
    "/api/account/:path*",
    "/api/imports/:path*",
  ],
};
