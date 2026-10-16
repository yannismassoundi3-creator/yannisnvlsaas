import { formatCount, formatMultiple, formatPercent, formatPoints } from "./format";
import { DEFINITIONS, METRIC_POLARITY, type Metrics } from "./metrics";
import { formatMoney } from "./money";

export type KpiModel = {
  key: string;
  label: string;
  value: string;
  definition: { term: string; text: string };
  delta: { value: number | null; text: string; polarity: "up" | "down" | null } | null;
  status: { tone: "caution" | "info" | "neutral"; label: string } | null;
  footnote: string | null;
};

function relativeDelta(current: number, previous: number | undefined | null) {
  if (previous === undefined || previous === null || previous === 0) return { value: null, text: "" };
  const value = (current - previous) / Math.abs(previous);
  return { value, text: formatPercent(value, { signDisplay: "exceptZero" }) };
}

function pointsDelta(current: number | null, previous: number | null | undefined) {
  if (current === null || previous === null || previous === undefined) return { value: null, text: "" };
  const value = current - previous;
  return { value, text: formatPoints(value) };
}

function costStatus(m: Metrics): KpiModel["status"] {
  if (m.completeness.cogs === "partial" || m.completeness.cogs === "missing") return { tone: "caution", label: "Costs incomplete" };
  if (m.completeness.fees === "estimated" || m.completeness.shipping === "estimated") return { tone: "info", label: "Includes estimates" };
  if (m.completeness.fees === "missing" || m.completeness.shipping === "missing" || m.completeness.fees === "partial" || m.completeness.shipping === "partial") {
    return { tone: "caution", label: "Costs incomplete" };
  }
  return null;
}

/** The four headline figures shown at the top of the overview. */
export function buildPrimaryKpis(current: Metrics, previous: Metrics | null, currency: string): KpiModel[] {
  const money = (v: number) => formatMoney(v, currency, { wholeUnits: true });
  const p = previous;
  return [
    {
      key: "netRevenue",
      label: "Net revenue",
      value: money(current.netRevenue),
      definition: { term: DEFINITIONS.netRevenue.term, text: `${DEFINITIONS.netRevenue.short} ${DEFINITIONS.netRevenue.formula}.` },
      delta: p ? { ...relativeDelta(current.netRevenue, p.netRevenue), polarity: METRIC_POLARITY.netRevenue } : null,
      status: null,
      footnote: `Net sales ${money(current.netSales)}`,
    },
    {
      key: "contributionMargin",
      label: "Contribution margin",
      value: money(current.contributionMargin),
      definition: {
        term: DEFINITIONS.contributionMargin.term,
        text: `${DEFINITIONS.contributionMargin.short} ${DEFINITIONS.contributionMargin.formula}.`,
      },
      delta: p ? { ...relativeDelta(current.contributionMargin, p.contributionMargin), polarity: METRIC_POLARITY.contributionMargin } : null,
      status: costStatus(current),
      footnote: current.contributionMarginRate !== null ? `${formatPercent(current.contributionMarginRate)} of net revenue` : null,
    },
    {
      key: "contributionMarginRate",
      label: "Contribution margin %",
      value: formatPercent(current.contributionMarginRate),
      definition: {
        term: DEFINITIONS.contributionMarginRate.term,
        text: `${DEFINITIONS.contributionMarginRate.short} ${DEFINITIONS.contributionMarginRate.formula}.`,
      },
      delta: p ? { ...pointsDelta(current.contributionMarginRate, p.contributionMarginRate), polarity: METRIC_POLARITY.contributionMarginRate } : null,
      status: null,
      footnote: current.grossMarginRate !== null ? `Gross margin ${formatPercent(current.grossMarginRate)}` : null,
    },
    {
      key: "orders",
      label: "Orders",
      value: formatCount(current.orders),
      definition: { term: DEFINITIONS.orders.term, text: DEFINITIONS.orders.short },
      delta: p ? { ...relativeDelta(current.orders, p.orders), polarity: METRIC_POLARITY.orders } : null,
      status: null,
      footnote: current.averageOrderValue !== null ? `Average order value ${formatMoney(current.averageOrderValue, currency)}` : null,
    },
  ];
}

/** Advertising headline figures. */
export function buildAdvertisingKpis(current: Metrics, previous: Metrics | null, currency: string): KpiModel[] {
  const money = (v: number) => formatMoney(v, currency, { wholeUnits: true });
  return [
    {
      key: "adSpend",
      label: "Ad spend",
      value: money(current.adSpend),
      definition: { term: DEFINITIONS.adSpend.term, text: DEFINITIONS.adSpend.short },
      delta: previous ? { ...relativeDelta(current.adSpend, previous.adSpend), polarity: METRIC_POLARITY.adSpend } : null,
      status: null,
      footnote: current.adSpendRate !== null ? `${formatPercent(current.adSpendRate)} of net revenue` : null,
    },
    {
      key: "blendedRoas",
      label: "Blended ROAS",
      value: formatMultiple(current.blendedRoas),
      definition: { term: DEFINITIONS.blendedRoas.term, text: `${DEFINITIONS.blendedRoas.short} ${DEFINITIONS.blendedRoas.formula}.` },
      delta: null,
      status: null,
      footnote: "Net revenue ÷ ad spend",
    },
    {
      key: "breakEvenRoas",
      label: "Break-even ROAS",
      value: formatMultiple(current.breakEvenRoas),
      definition: { term: DEFINITIONS.breakEvenRoas.term, text: `${DEFINITIONS.breakEvenRoas.short} ${DEFINITIONS.breakEvenRoas.formula}.` },
      delta: null,
      status: costStatus(current),
      footnote: "Below this, ads cost more than the margin they bring",
    },
    {
      key: "contributionBeforeAds",
      label: "Margin before advertising",
      value: money(current.contributionBeforeAds),
      definition: {
        term: "Contribution before advertising",
        text: "Net revenue minus product, shipping, payment and other variable costs, before ad spend.",
      },
      delta: previous
        ? { ...relativeDelta(current.contributionBeforeAds, previous.contributionBeforeAds), polarity: "up" }
        : null,
      status: null,
      footnote: current.netRevenue > 0 ? `${formatPercent(current.contributionBeforeAds / current.netRevenue)} of net revenue` : null,
    },
  ];
}
