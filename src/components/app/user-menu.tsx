"use client";

import { Check, ChevronsUpDown, LifeBuoy, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { useLocale } from "@/i18n/client";
import { LOCALE_NAMES, LOCALE_PARAM, LOCALES, type Locale } from "@/i18n/config";
import { shellMenus } from "@/i18n/messages/shell-menus";
import { signOut } from "@/lib/auth/actions";
import { FeedbackDialog } from "./feedback-dialog";

function initials(name: string | null, email: string | null) {
  const source = name?.trim() || email || "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 && name ? parts[1][0] : "")).toUpperCase();
}

/** Same page and query in another language: the proxy stores the choice and redirects. */
function useLanguageHref() {
  const params = useSearchParams();
  return (locale: Locale) => {
    const query = new URLSearchParams(params?.toString());
    query.set(LOCALE_PARAM, locale);
    return `?${query.toString()}`;
  };
}

export function UserMenu({ name, email, organization }: { name: string | null; email: string | null; organization: string }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const locale = useLocale();
  const t = shellMenus[locale].account;
  const languageHref = useLanguageHref();
  const languageId = useId();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-hover">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[11px] font-semibold text-white" aria-hidden>
            {initials(name, email)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{name || email}</span>
            <span className="block truncate text-xs text-ink-3">{organization}</span>
          </span>
          <span className="sr-only">{t.menuSuffix}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-3" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-60">
          <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/app/settings">
              <Settings aria-hidden />
              {t.settings}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <LifeBuoy aria-hidden />
            {t.help}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup aria-labelledby={languageId}>
            <DropdownMenuLabel id={languageId}>{t.language}</DropdownMenuLabel>
            {LOCALES.map((l) => {
              const current = l === locale;
              return (
                <DropdownMenuItem key={l} asChild>
                  {/* A full page load, so the whole interface is rendered again in the new language. */}
                  <a href={languageHref(l)} hrefLang={l} lang={l} aria-current={current ? "true" : undefined}>
                    <span className="min-w-0 flex-1">{LOCALE_NAMES[l]}</span>
                    {current ? (
                      <>
                        <Check className="!text-ink" aria-hidden />
                        <span className="sr-only" lang={locale}>
                          , {t.currentLanguage}
                        </span>
                      </>
                    ) : (
                      <span className="w-4" />
                    )}
                  </a>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              void signOut();
            }}
          >
            <LogOut aria-hidden />
            {t.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
