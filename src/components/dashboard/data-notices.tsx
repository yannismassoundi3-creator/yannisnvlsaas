import type { Route } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/feedback";
import type { Store } from "@/lib/auth/workspace";
import { formatCount, formatPercent } from "@/lib/finance/format";
import type { Metrics } from "@/lib/finance/metrics";
import { formatMoney } from "@/lib/finance/money";

type Notice = { key: string; tone: "caution" | "info"; title: string; body: string; href?: Route; action?: string };

/**
 * Data-quality notices for a period: what is missing or estimated, how much
 * it affects the figures, and where to fix it. Never silent, never alarming.
 */
export function dataNotices(m: Metrics, store: Pick<Store, "currency" | "fee_rule_bps" | "fee_rule_fixed_minor" | "default_shipping_cost_minor">): Notice[] {
  const money = (v: number) => formatMoney(v, store.currency);
  const notices: Notice[] = [];

  if (m.completeness.cogs === "partial" || m.completeness.cogs === "missing") {
    const share = m.productSalesAfterDiscounts > 0 ? m.salesWithoutCost / m.productSalesAfterDiscounts : null;
    notices.push({
      key: "cogs",
      tone: "caution",
      title: "Some sales have no product cost",
      body: `${formatCount(m.linesWithoutCost)} order ${m.linesWithoutCost === 1 ? "line" : "lines"} (${money(m.salesWithoutCost)}, ${formatPercent(share)} of product sales) have no unit cost. Their cost is left out rather than guessed, so gross profit and contribution margin are overstated until you add it.`,
      href: "/app/products?filter=missing-cost" as Route,
      action: "Add product costs",
    });
  }
  if (m.ordersWithoutShippingCost > 0) {
    notices.push({
      key: "shipping",
      tone: "caution",
      title: "Shipping costs are incomplete",
      body: `${formatCount(m.ordersWithoutShippingCost)} ${m.ordersWithoutShippingCost === 1 ? "order has" : "orders have"} no recorded shipping cost and no default applies, so shipping costs are understated.`,
      href: "/app/settings?section=costs" as Route,
      action: "Set a default shipping cost",
    });
  }
  if (m.ordersWithoutFees > 0) {
    notices.push({
      key: "fees",
      tone: "caution",
      title: "Payment fees are incomplete",
      body: `${formatCount(m.ordersWithoutFees)} ${m.ordersWithoutFees === 1 ? "order has" : "orders have"} no recorded payment fee and no fee rule applies, so payment fees are understated.`,
      href: "/app/settings?section=costs" as Route,
      action: "Set a fee rule",
    });
  }

  const estimates: string[] = [];
  if (m.transactionFeesEstimated > 0) {
    const rule = [
      store.fee_rule_bps !== null ? formatPercent(store.fee_rule_bps / 10_000, { digits: 2 }) : null,
      store.fee_rule_fixed_minor !== null ? `${money(store.fee_rule_fixed_minor)} per order` : null,
    ]
      .filter(Boolean)
      .join(" + ");
    estimates.push(`payment fees of ${money(m.transactionFeesEstimated)}${rule ? ` (rule: ${rule})` : ""}`);
  }
  if (m.shippingCostsEstimated > 0) {
    estimates.push(
      `shipping costs of ${money(m.shippingCostsEstimated)}${store.default_shipping_cost_minor !== null ? ` (default: ${money(store.default_shipping_cost_minor)} per order)` : ""}`,
    );
  }
  if (estimates.length > 0) {
    notices.push({
      key: "estimates",
      tone: "info",
      title: "Includes estimates",
      body: `For orders without recorded values, this period includes estimated ${estimates.join(" and ")}. Record actual values through imports to replace them.`,
      href: "/app/settings?section=costs" as Route,
      action: "Review rules",
    });
  }
  return notices;
}

export function DataNotices({ notices, className }: { notices: Notice[]; className?: string }) {
  if (notices.length === 0) return null;
  return (
    <div className={className}>
      <h2 className="sr-only">Data quality</h2>
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
