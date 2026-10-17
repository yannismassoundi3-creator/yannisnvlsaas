"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/client";
import { shellLayout } from "@/i18n/messages/shell-layout";
import { SidebarNav } from "./sidebar-nav";

/** Top bar and slide-in navigation for small screens. */
export function MobileNav({ storeSwitcher, userMenu, mode = "ecommerce" }: { storeSwitcher: ReactNode; userMenu: ReactNode; mode?: "ecommerce" | "reseller" }) {
  const [open, setOpen] = useState(false);
  const t = shellLayout[useLocale()];
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-ivory/95 px-4 backdrop-blur-[6px] lg:hidden">
      <Link href="/app" aria-label={t.homeLabel}>
        <Logo />
      </Link>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={t.mobile.open}>
            <Menu />
          </Button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-900/30 data-[state=open]:animate-fade-in" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,300px)] flex-col gap-4 border-r border-line bg-ivory p-4 shadow-lg data-[state=open]:animate-fade-in">
            <DialogPrimitive.Title className="sr-only">{t.mobile.title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{t.mobile.description}</DialogPrimitive.Description>
            <div className="flex items-center justify-between">
              <Logo />
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" aria-label={t.mobile.close}>
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div onClick={() => undefined}>{storeSwitcher}</div>
            <SidebarNav onNavigate={() => setOpen(false)} mode={mode} />
            <div className="border-t border-line pt-3">{userMenu}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
