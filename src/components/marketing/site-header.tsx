"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { localizedPath } from "@/i18n/config";
import { useLocale } from "@/i18n/client";
import { marketingCommon } from "@/i18n/messages/marketing-common";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const t = marketingCommon[locale].header;
  const NAV: { label: string; href: string }[] = [
    { label: t.nav.product, href: localizedPath("/#product", locale) },
    { label: t.nav.features, href: localizedPath("/#features", locale) },
    { label: t.nav.pricing, href: localizedPath("/pricing", locale) },
    { label: t.nav.faq, href: localizedPath("/#faq", locale) },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-ivory/92 backdrop-blur-[6px] transition-[border-color] duration-200",
        scrolled ? "border-line" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
        <Link href={localizedPath("/", locale)} className="rounded-sm" aria-label={t.home}>
          <Logo />
        </Link>
        <nav aria-label={t.mainNav} className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="rounded-sm px-3 py-2 text-base text-ink-2 transition-colors hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <LanguageSwitcher locale={locale} className="mr-2 hidden lg:flex" />
          <Button asChild variant="ghost">
            <Link href="/sign-in">{t.signIn}</Link>
          </Button>
          <Button asChild variant="accent">
            <Link href="/sign-up">{t.startTrial}</Link>
          </Button>
        </div>

        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Trigger asChild>
            <Button variant="ghost" size="icon" className="ml-auto md:hidden" aria-label={t.openMenu}>
              <Menu />
            </Button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-900/30 data-[state=open]:animate-fade-in" />
            <DialogPrimitive.Content className="fixed inset-x-0 top-0 z-50 border-b border-line bg-ivory px-4 pt-3 pb-6 shadow-lg data-[state=open]:animate-rise-in">
              <DialogPrimitive.Title className="sr-only">{t.menu}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">{t.siteNavigation}</DialogPrimitive.Description>
              <div className="flex h-10 items-center justify-between">
                <Logo />
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon" aria-label={t.closeMenu}>
                    <X />
                  </Button>
                </DialogPrimitive.Close>
              </div>
              <nav aria-label={t.mobileNav} className="mt-4">
                <ul className="divide-y divide-line border-y border-line">
                  {NAV.map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} onClick={() => setOpen(false)} className="block py-3 text-md text-ink">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/sign-in" onClick={() => setOpen(false)} className="block py-3 text-md text-ink">
                      {t.signIn}
                    </Link>
                  </li>
                </ul>
              </nav>
              <Button asChild variant="accent" size="lg" className="mt-5 w-full">
                <Link href="/sign-up" onClick={() => setOpen(false)}>
                  {t.startTrial}
                </Link>
              </Button>
              <LanguageSwitcher locale={locale} className="mt-5 justify-center" />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    </header>
  );
}
