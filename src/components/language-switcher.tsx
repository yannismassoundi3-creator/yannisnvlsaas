import { Languages } from "lucide-react";
import { LOCALE_NAMES, LOCALE_PARAM, LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Language links. `?hl=fr` is handled by the proxy, which stores the choice and
 * redirects to the same page in that language, so this needs no JavaScript.
 */
export function LanguageSwitcher({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <nav aria-label={locale === "fr" ? "Langue" : "Language"} className={cn("flex items-center gap-1.5 text-xs", className)}>
      <Languages className="size-3.5 text-ink-3" aria-hidden />
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden className="text-line-strong">/</span> : null}
          {l === locale ? (
            <span aria-current="true" className="font-medium text-ink">
              {LOCALE_NAMES[l]}
            </span>
          ) : (
            <a href={`?${LOCALE_PARAM}=${l}`} hrefLang={l} lang={l} className="text-ink-3 hover:text-ink">
              {LOCALE_NAMES[l]}
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}
