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

export type NavItem = { label: string; href: Route; icon: LucideIcon; exact?: boolean };

export const PRIMARY_NAV: NavItem[] = [
  { label: "Overview", href: "/app", icon: LayoutDashboard, exact: true },
  { label: "Products", href: "/app/products", icon: Package },
  { label: "Advertising", href: "/app/advertising", icon: Megaphone },
  { label: "Transactions & costs", href: "/app/transactions", icon: Receipt },
  { label: "Imports", href: "/app/imports", icon: Upload },
  { label: "Reports", href: "/app/reports", icon: FileText },
  { label: "Calculator", href: "/app/calculator", icon: Calculator },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Settings", href: "/app/settings", icon: Settings },
  { label: "Billing", href: "/app/billing", icon: CreditCard },
];

export function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
