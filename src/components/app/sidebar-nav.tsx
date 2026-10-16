"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav-items";

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isActive(pathname, item);
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
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Application" className="flex flex-1 flex-col gap-6">
      <ul className="space-y-0.5">
        {PRIMARY_NAV.map((item) => (
          <li key={item.href}>
            <NavLink item={item} pathname={pathname} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      <ul className="mt-auto space-y-0.5">
        {SECONDARY_NAV.map((item) => (
          <li key={item.href}>
            <NavLink item={item} pathname={pathname} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
