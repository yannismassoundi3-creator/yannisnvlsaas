import type { Route } from "next";
import {
  Calculator,
  CreditCard,
  FileText,
  LayoutDashboard,
  Megaphone,
  Package,
  Receipt,
  Settings,
  Upload,
  type LucideIcon,
} from "lucide-react";

/** Key of the item's label in the shell-layout messages (`nav.<key>`). */
export type NavKey = "overview" | "products" | "advertising" | "transactions" | "imports" | "reports" | "calculator" | "settings" | "billing";

export type NavItem = { key: NavKey; href: Route; icon: LucideIcon; exact?: boolean };

export const PRIMARY_NAV: NavItem[] = [
  { key: "overview", href: "/app", icon: LayoutDashboard, exact: true },
  { key: "products", href: "/app/products", icon: Package },
  { key: "advertising", href: "/app/advertising", icon: Megaphone },
  { key: "transactions", href: "/app/transactions", icon: Receipt },
  { key: "imports", href: "/app/imports", icon: Upload },
  { key: "reports", href: "/app/reports", icon: FileText },
  { key: "calculator", href: "/app/calculator", icon: Calculator },
];

export const SECONDARY_NAV: NavItem[] = [
  { key: "settings", href: "/app/settings", icon: Settings },
  { key: "billing", href: "/app/billing", icon: CreditCard },
];

export function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
