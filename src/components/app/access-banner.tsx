import { AlertTriangle, Clock, FlaskConical, Lock } from "lucide-react";
import Link from "next/link";
import type { ReadyWorkspace, Store } from "@/lib/auth/workspace";
import { shellBanners } from "@/i18n/messages/shell-banners";
import { getFormat, getLocale } from "@/i18n/server";
import { cn } from "@/lib/utils";

/**
 * Status bar above every application page: trial countdown, payment problems,
 * expired access and the demo-data notice. Always text plus icon, never colour alone.
 */
export async function AccessBanner({ ws }: { ws: ReadyWorkspace & { activeStore: Store | null } }) {
  const t = shellBanners[await getLocale()];
  const f = await getFormat();
  const { entitlements: e, activeStore } = ws;
  const realStore = ws.stores.find((s) => !s.is_demo);
  const items: { key: string; tone: "info" | "caution" | "negative" | "demo"; icon: React.ReactNode; text: React.ReactNode; action?: React.ReactNode }[] = [];

  if (e.access === "trial" && e.trialDaysLeft !== null) {
    items.push({
      key: "trial",
      tone: e.trialDaysLeft <= 3 ? "caution" : "info",
      icon: <Clock aria-hidden />,
      text: e.trialDaysLeft === 0 ? t.trialEndsToday : t.trialDaysLeft(e.trialDaysLeft, e.trialEndsAt ? f.date(e.trialEndsAt.slice(0, 10)) : null),
      action: (
        <Link href="/app/billing" className="font-medium underline-offset-2 hover:underline">
          {t.choosePlan}
        </Link>
      ),
    });
  }
  if (e.access === "grace") {
    items.push({
      key: "grace",
      tone: "caution",
      icon: <AlertTriangle aria-hidden />,
      text: t.paymentFailed(e.graceEndsAt ? f.date(e.graceEndsAt.slice(0, 10)) : null),
      action: (
        <Link href="/app/billing" className="font-medium underline-offset-2 hover:underline">
          {t.updatePayment}
        </Link>
      ),
    });
  }
  if (e.access === "expired") {
    items.push({
      key: "expired",
      tone: "negative",
      icon: <Lock aria-hidden />,
      text: t.trialEnded,
      action: (
        <Link href="/app/billing" className="font-medium underline-offset-2 hover:underline">
          {t.subscribe}
        </Link>
      ),
    });
  }
  if (activeStore?.is_demo) {
    items.push({
      key: "demo",
      tone: "demo",
      icon: <FlaskConical aria-hidden />,
      text: t.demoNotice,
      action: realStore ? <span className="text-xs">{t.switchToReal(realStore.name)}</span> : null,
    });
  }

  if (items.length === 0) return null;
  return (
    <div className="no-print">
      {items.map((item) => (
        <div
          key={item.key}
          role={item.tone === "negative" ? "alert" : "status"}
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm sm:px-8 [&_svg]:size-4 [&_svg]:shrink-0",
            item.tone === "info" && "border-info-100 bg-info-50 text-info-700",
            item.tone === "caution" && "border-caution-100 bg-caution-50 text-caution-800",
            item.tone === "negative" && "border-negative-100 bg-negative-50 text-negative-800",
            item.tone === "demo" && "border-caution-100 bg-caution-50/70 text-caution-800",
          )}
        >
          {item.icon}
          <span className="min-w-0 flex-[1_1_16rem]">{item.text}</span>
          {item.action}
        </div>
      ))}
    </div>
  );
}
