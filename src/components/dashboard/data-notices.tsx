import type { Route } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/feedback";
import type { Locale } from "@/i18n/config";
import { createFormat } from "@/i18n/format";
import { dashboardMessages } from "@/i18n/messages/dashboard-components";
import type { Store } from "@/lib/auth/workspace";
import type { Metrics } from "@/lib/finance/metrics";

type Notice = { key: string; tone: "caution" | "info"; title: string; body: string; href?: Route; action?: string };

/**
 * Data-quality notices for a period: what is missing or estimated, how much
 * it affects the figures, and where to fix it. Never silent, never alarming.
 */
export function dataNotices(
  m: Metrics,
  store: Pick<Store, "currency" | "fee_rule_bps" | "fee_rule_fixed_minor" | "default_shipping_cost_minor">,
  locale: Locale = "en",
): Notice[] {
  const f = createFormat(locale);
  const t = dashboardMessages[locale].dataNotices;
  const money = (v: number) => f.money(v, store.currency);
  const notices: Notice[] = [];

  if (m.completeness.cogs === "partial" || m.completeness.cogs === "missing") {
    const share = m.productSalesAfterDiscounts > 0 ? m.salesWithoutCost / m.productSalesAfterDiscounts : null;
    notices.push({
      key: "cogs",
      tone: "caution",
      title: t.cogsTitle,
      body: t.cogsBody(f.count(m.linesWithoutCost), m.linesWithoutCost, money(m.salesWithoutCost), f.percent(share)),
      href: "/app/products?filter=missing-cost" as Route,
      action: t.cogsAction,
    });
  }
  if (m.ordersWithoutShippingCost > 0) {
    notices.push({
      key: "shipping",
      tone: "caution",
      title: t.shippingTitle,
      body: t.shippingBody(f.count(m.ordersWithoutShippingCost), m.ordersWithoutShippingCost),
      href: "/app/settings?section=costs" as Route,
      action: t.shippingAction,
    });
  }
  if (m.ordersWithoutFees > 0) {
    notices.push({
      key: "fees",
      tone: "caution",
      title: t.feesTitle,
      body: t.feesBody(f.count(m.ordersWithoutFees), m.ordersWithoutFees),
      href: "/app/settings?section=costs" as Route,
      action: t.feesAction,
    });
  }

  const estimates: string[] = [];
  if (m.transactionFeesEstimated > 0) {
    const rule = [
      store.fee_rule_bps !== null ? f.percent(store.fee_rule_bps / 10_000, { digits: 2 }) : null,
      store.fee_rule_fixed_minor !== null ? t.perOrder(money(store.fee_rule_fixed_minor)) : null,
    ]
      .filter(Boolean)
      .join(" + ");
    estimates.push(t.estimatedFees(money(m.transactionFeesEstimated), rule));
  }
  if (m.shippingCostsEstimated > 0) {
    estimates.push(
      t.estimatedShipping(money(m.shippingCostsEstimated), store.default_shipping_cost_minor !== null ? money(store.default_shipping_cost_minor) : null),
    );
  }
  if (estimates.length > 0) {
    notices.push({
      key: "estimates",
      tone: "info",
      title: t.estimatesTitle,
      body: t.estimatesBody(estimates),
      href: "/app/settings?section=costs" as Route,
      action: t.estimatesAction,
    });
  }
  return notices;
}

/** `locale` only sets the hidden heading: the notices arrive already in the interface language. */
export function DataNotices({ notices, className, locale = "en" }: { notices: Notice[]; className?: string; locale?: Locale }) {
  if (notices.length === 0) return null;
  return (
    <div className={className}>
      <h2 className="sr-only">{dashboardMessages[locale].dataNotices.heading}</h2>
      <div className="grid gap-2 lg:grid-cols-2">
        {notices.map((n) => (
          <Alert
            key={n.key}
            tone={n.tone}
            title={n.title}
            action={
              n.href && n.action ? (
                <Link href={n.href} className="text-sm font-medium whitespace-nowrap underline-offset-2 hover:underline">
                  {n.action}
                </Link>
              ) : null
            }
          >
            {n.body}
          </Alert>
        ))}
      </div>
    </div>
  );
}
