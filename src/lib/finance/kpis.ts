import type { Locale } from "@/i18n/config";
import { createFormat } from "@/i18n/format";
import { kpiMessages } from "@/i18n/messages/dashboard-kpis";
import { definitionsFor, METRIC_POLARITY, type Metrics } from "./metrics";

export type KpiModel = {
  key: string;
  label: string;
  value: string;
  definition: { term: string; text: string };
  delta: { value: number | null; text: string; polarity: "up" | "down" | null } | null;
  status: { tone: "caution" | "info" | "neutral"; label: string } | null;
  footnote: string | null;
};

type Format = ReturnType<typeof createFormat>;

/** Changes that display as 0.0 are treated as no change, so the arrow and colour match the text. */
const displayedZero = (fraction: number) => (Math.abs(fraction) < 0.0005 ? 0 : fraction);

function relativeDelta(f: Format, current: number, previous: number | undefined | null) {
  if (previous === undefined || previous === null || previous === 0) return { value: null, text: "" };
  const value = displayedZero((current - previous) / Math.abs(previous));
  return { value, text: f.percent(value, { signDisplay: "exceptZero" }) };
}

function pointsDelta(f: Format, current: number | null, previous: number | null | undefined) {
  if (current === null || previous === null || previous === undefined) return { value: null, text: "" };
  const value = displayedZero(current - previous);
  return { value, text: f.points(value) };
}

function costStatus(m: Metrics, locale: Locale): KpiModel["status"] {
  const s = kpiMessages[locale].status;
  if (m.completeness.cogs === "partial" || m.completeness.cogs === "missing") return { tone: "caution", label: s.costsIncomplete };
  if (m.completeness.fees === "estimated" || m.completeness.shipping === "estimated") return { tone: "info", label: s.includesEstimates };
  if (m.completeness.fees === "missing" || m.completeness.shipping === "missing" || m.completeness.fees === "partial" || m.completeness.shipping === "partial") {
    return { tone: "caution", label: s.costsIncomplete };
  }
  return null;
}

/** The four headline figures shown at the top of the overview. */
export function buildPrimaryKpis(current: Metrics, previous: Metrics | null, currency: string, locale: Locale = "en"): KpiModel[] {
  const f = createFormat(locale);
  const t = kpiMessages[locale];
  const D = definitionsFor(locale);
  const money = (v: number) => f.money(v, currency, { wholeUnits: true });
  const p = previous;
  return [
    {
      key: "netRevenue",
      label: t.netRevenue,
      value: money(current.netRevenue),
      definition: { term: D.netRevenue.term, text: `${D.netRevenue.short} ${D.netRevenue.formula}.` },
      delta: p ? { ...relativeDelta(f, current.netRevenue, p.netRevenue), polarity: METRIC_POLARITY.netRevenue } : null,
      status: null,
      footnote: t.netSalesFootnote(money(current.netSales)),
    },
    {
      key: "contributionMargin",
      label: t.contributionMargin,
      value: money(current.contributionMargin),
      definition: {
        term: D.contributionMargin.term,
        text: `${D.contributionMargin.short} ${D.contributionMargin.formula}.`,
      },
      delta: p ? { ...relativeDelta(f, current.contributionMargin, p.contributionMargin), polarity: METRIC_POLARITY.contributionMargin } : null,
      status: costStatus(current, locale),
      footnote: current.contributionMarginRate !== null ? t.ofNetRevenue(f.percent(current.contributionMarginRate)) : null,
    },
    {
      key: "contributionMarginRate",
      label: t.contributionMarginRate,
      value: f.percent(current.contributionMarginRate),
      definition: {
        term: D.contributionMarginRate.term,
        text: `${D.contributionMarginRate.short} ${D.contributionMarginRate.formula}.`,
      },
      delta: p ? { ...pointsDelta(f, current.contributionMarginRate, p.contributionMarginRate), polarity: METRIC_POLARITY.contributionMarginRate } : null,
      status: null,
      footnote: current.grossMarginRate !== null ? t.grossMarginFootnote(f.percent(current.grossMarginRate)) : null,
    },
    {
      key: "orders",
      label: t.orders,
      value: f.count(current.orders),
      definition: { term: D.orders.term, text: D.orders.short },
      delta: p ? { ...relativeDelta(f, current.orders, p.orders), polarity: METRIC_POLARITY.orders } : null,
      status: null,
      footnote: current.averageOrderValue !== null ? t.aovFootnote(f.money(current.averageOrderValue, currency)) : null,
    },
  ];
}

/** Advertising headline figures. */
export function buildAdvertisingKpis(current: Metrics, previous: Metrics | null, currency: string, locale: Locale = "en"): KpiModel[] {
  const f = createFormat(locale);
  const t = kpiMessages[locale];
  const D = definitionsFor(locale);
  const money = (v: number) => f.money(v, currency, { wholeUnits: true });
  return [
    {
      key: "adSpend",
      label: t.adSpend,
      value: money(current.adSpend),
      definition: { term: D.adSpend.term, text: D.adSpend.short },
      delta: previous ? { ...relativeDelta(f, current.adSpend, previous.adSpend), polarity: METRIC_POLARITY.adSpend } : null,
      status: null,
      footnote: current.adSpendRate !== null ? t.ofNetRevenue(f.percent(current.adSpendRate)) : null,
    },
    {
      key: "blendedRoas",
      label: t.blendedRoas,
      value: f.multiple(current.blendedRoas),
      definition: { term: D.blendedRoas.term, text: `${D.blendedRoas.short} ${D.blendedRoas.formula}.` },
      delta: null,
      status: null,
      footnote: t.blendedRoasFootnote,
    },
    {
      key: "breakEvenRoas",
      label: t.breakEvenRoas,
      value: f.multiple(current.breakEvenRoas),
      definition: { term: D.breakEvenRoas.term, text: `${D.breakEvenRoas.short} ${D.breakEvenRoas.formula}.` },
      delta: null,
      status: costStatus(current, locale),
      footnote: t.breakEvenRoasFootnote,
    },
    {
      key: "contributionBeforeAds",
      label: t.marginBeforeAds,
      value: money(current.contributionBeforeAds),
      definition: {
        term: t.contributionBeforeAdsTerm,
        text: t.contributionBeforeAdsText,
      },
      delta: previous
        ? { ...relativeDelta(f, current.contributionBeforeAds, previous.contributionBeforeAds), polarity: "up" }
        : null,
      status: null,
      footnote: current.netRevenue > 0 ? t.ofNetRevenue(f.percent(current.contributionBeforeAds / current.netRevenue)) : null,
    },
  ];
}

function shippingAndFeesStatus(m: Metrics, locale: Locale): KpiModel["status"] {
  const s = kpiMessages[locale].status;
  const states = [m.completeness.shipping, m.completeness.fees];
  if (states.some((x) => x === "missing" || x === "partial")) return { tone: "caution", label: s.incomplete };
  if (states.includes("estimated")) return { tone: "info", label: s.includesEstimates };
  return null;
}

/** Supporting figures under the headline KPIs, each compared with the previous period. */
export function buildSecondaryKpis(current: Metrics, previous: Metrics | null, currency: string, locale: Locale = "en"): KpiModel[] {
  const f = createFormat(locale);
  const t = kpiMessages[locale];
  const D = definitionsFor(locale);
  const money = (v: number) => f.money(v, currency, { wholeUnits: true });
  const p = previous;
  const shippingAndFees = (m: Metrics) => m.shippingCosts + m.transactionFees;
  return [
    {
      key: "grossSales",
      label: t.grossSales,
      value: money(current.grossSales),
      definition: { term: D.grossSales.term, text: `${D.grossSales.short} ${D.grossSales.formula}.` },
      delta: p ? { ...relativeDelta(f, current.grossSales, p.grossSales), polarity: METRIC_POLARITY.grossSales } : null,
      status: null,
      footnote: t.unitsSold(f.count(current.units), current.units),
    },
    {
      key: "discounts",
      label: t.discounts,
      value: money(current.discounts),
      definition: { term: D.discounts.term, text: D.discounts.short },
      delta: p ? { ...relativeDelta(f, current.discounts, p.discounts), polarity: METRIC_POLARITY.discounts } : null,
      status: null,
      footnote: current.discountRate !== null ? t.ofGrossSales(f.percent(current.discountRate)) : null,
    },
    {
      key: "refunds",
      label: t.refunds,
      value: money(current.refunds),
      definition: { term: D.refunds.term, text: D.refunds.short },
      delta: p ? { ...relativeDelta(f, current.refunds, p.refunds), polarity: METRIC_POLARITY.refunds } : null,
      status: null,
      footnote: current.refundRate !== null ? t.ofGrossSales(f.percent(current.refundRate)) : null,
    },
    {
      key: "cogs",
      label: t.cogs,
      value: money(current.cogs),
      definition: { term: D.cogs.term, text: D.cogs.short },
      delta: p ? { ...relativeDelta(f, current.cogs, p.cogs), polarity: METRIC_POLARITY.cogs } : null,
      status:
        current.completeness.cogs === "partial" || current.completeness.cogs === "missing" ? { tone: "caution", label: t.status.costsIncomplete } : null,
      footnote: current.costCoverage !== null && current.costCoverage < 1 ? t.salesWithCost(f.percent(current.costCoverage)) : null,
    },
    {
      key: "shippingAndFees",
      label: t.shippingAndFees,
      value: money(shippingAndFees(current)),
      definition: {
        term: t.shippingAndFeesTerm,
        text: `${D.shippingCosts.short} ${D.transactionFees.short}`,
      },
      delta: p ? { ...relativeDelta(f, shippingAndFees(current), shippingAndFees(p)), polarity: null } : null,
      status: shippingAndFeesStatus(current, locale),
      footnote: t.shippingAndFeesFootnote(money(current.shippingCosts), money(current.transactionFees)),
    },
    {
      key: "adSpend",
      label: t.adSpend,
      value: money(current.adSpend),
      definition: { term: D.adSpend.term, text: D.adSpend.short },
      delta: p ? { ...relativeDelta(f, current.adSpend, p.adSpend), polarity: METRIC_POLARITY.adSpend } : null,
      status: null,
      footnote: current.adSpendRate !== null ? t.ofNetRevenue(f.percent(current.adSpendRate)) : null,
    },
  ];
}
