"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { useLocale } from "@/i18n/client";
import { shellLayout } from "@/i18n/messages/shell-layout";
import { cn } from "@/lib/utils";
import { isActive, primaryNav, SECONDARY_NAV, type NavItem } from "./nav-items";

type Mode = "ecommerce" | "reseller";

function NavLink({ item, label, pathname, onNavigate }: { item: NavItem; label: string; pathname: string | null; onNavigate?: () => void }) {
  const active = pathname !== null && isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-base transition-colors",
        active ? "bg-surface font-medium text-ink shadow-xs ring-1 ring-line" : "text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-emerald-600" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * The current path is request data on dynamic routes, so the active state is
 * resolved inside Suspense; the links themselves render with the static shell.
 */
export function SidebarNav({ onNavigate, mode = "ecommerce" }: { onNavigate?: () => void; mode?: Mode }) {
  return (
    <Suspense fallback={<NavList pathname={null} onNavigate={onNavigate} mode={mode} />}>
      <ActiveNav onNavigate={onNavigate} mode={mode} />
    </Suspense>
  );
}

function ActiveNav({ onNavigate, mode }: { onNavigate?: () => void; mode: Mode }) {
  return <NavList pathname={usePathname()} onNavigate={onNavigate} mode={mode} />;
}

function NavList({ pathname, onNavigate, mode }: { pathname: string | null; onNavigate?: () => void; mode: Mode }) {
  const t = shellLayout[useLocale()].nav;
  return (
    <nav aria-label={t.label} className="flex flex-1 flex-col gap-6">
      <ul className="space-y-0.5">
        {primaryNav(mode).map((item) => (
          <li key={item.href}>
            <NavLink item={item} label={t[item.key]} pathname={pathname} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      <ul className="mt-auto space-y-0.5">
        {SECONDARY_NAV.map((item) => (
          <li key={item.href}>
            <NavLink item={item} label={t[item.key]} pathname={pathname} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
