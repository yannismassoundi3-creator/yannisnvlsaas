"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV: { label: string; href: Route }[] = [
  { label: "Product", href: "/#product" as Route },
  { label: "Features", href: "/#features" as Route },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" as Route },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

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
        <Link href="/" className="rounded-sm" aria-label="Narixia home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
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
          <Button asChild variant="ghost">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant="accent">
            <Link href="/sign-up">Start free trial</Link>
          </Button>
        </div>

        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Trigger asChild>
            <Button variant="ghost" size="icon" className="ml-auto md:hidden" aria-label="Open menu">
              <Menu />
            </Button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-900/30 data-[state=open]:animate-fade-in" />
            <DialogPrimitive.Content className="fixed inset-x-0 top-0 z-50 border-b border-line bg-ivory px-4 pt-3 pb-6 shadow-lg data-[state=open]:animate-rise-in">
              <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Site navigation</DialogPrimitive.Description>
              <div className="flex h-10 items-center justify-between">
                <Logo />
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Close menu">
                    <X />
                  </Button>
                </DialogPrimitive.Close>
              </div>
              <nav aria-label="Mobile" className="mt-4">
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
                      Sign in
                    </Link>
                  </li>
                </ul>
              </nav>
              <Button asChild variant="accent" size="lg" className="mt-5 w-full">
                <Link href="/sign-up" onClick={() => setOpen(false)}>
                  Start free trial
                </Link>
              </Button>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    </header>
  );
}
