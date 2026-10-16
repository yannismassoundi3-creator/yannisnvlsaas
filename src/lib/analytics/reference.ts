import { eachDay, isInRange, localDateOf } from "@/lib/dates";
import type { DateRange, Dataset, Order, Product } from "@/lib/domain/types";
import { EMPTY_TOTALS, type PeriodTotals } from "@/lib/finance/metrics";
import { allocateProportionally, applyBasisPoints, lineCostMinor } from "@/lib/finance/money";

/**
 * In-memory reference implementation of Narixia's aggregation rules.
 *
 * Used to render the public dashboard preview from demo data and as the
 * oracle in database tests: the SQL reporting functions must return exactly
 * the same numbers for the same dataset.
 *
 * Rules
 * - Orders count on the local date (store time zone) they were placed.
 * - Refunds count on their own local date.
 * - COGS uses the line's cost snapshot, else the product's current cost.
 *   Lines with neither are reported as missing cost, never assumed.
 * - Shipping cost: recorded value, else the store's default estimate, else missing.
 * - Payment fees: recorded value, else the store's fee rule applied to the
 *   amount the customer paid (incl. tax), else missing.
 * - Variable expenses: shipping/fulfilment -> shipping costs, payment_fees ->
 *   payment fees, others -> other variable costs. Fixed expenses -> fixed costs.
 * - Product view: order-level shipping charged, shipping cost, fees and
 *   order-linked refunds are allocated to lines by net line sales (largest
 *   remainder, ties to the earlier line). Ad spend is attributed to a product
 *   only through campaigns linked to it; everything else stays store-level.
 */

type Settings = Dataset["settings"];

function addTotals(a: PeriodTotals, b: PeriodTotals): PeriodTotals {
  const out = { ...a };
  for (const key of Object.keys(b) as (keyof PeriodTotals)[]) out[key] = a[key] + b[key];
  return out;
}

function lineNet(line: { grossMinor: number; discountMinor: number }) {
  return line.grossMinor - line.discountMinor;
}

function orderNet(order: Order) {
  return order.lines.reduce((acc, l) => acc + lineNet(l), 0);
}

/** Amount the customer paid: product sales after discounts + shipping + tax. */
export function orderAmountPaid(order: Order) {
  return orderNet(order) + order.shippingChargedMinor + order.taxesMinor;
}

export function resolvedShippingCost(order: Order, settings: Settings): { amount: number | null; estimated: boolean } {
  if (order.shippingCostMinor !== null) return { amount: order.shippingCostMinor, estimated: false };
  if (settings.defaultShippingCostMinor !== null) return { amount: settings.defaultShippingCostMinor, estimated: true };
  return { amount: null, estimated: false };
}

export function resolvedFees(order: Order, settings: Settings): { amount: number | null; estimated: boolean } {
  if (order.transactionFeesMinor !== null) return { amount: order.transactionFeesMinor, estimated: false };
  if (settings.feeRuleBasisPoints !== null || settings.feeRuleFixedMinor !== null) {
    const amount = applyBasisPoints(Math.max(orderAmountPaid(order), 0), settings.feeRuleBasisPoints ?? 0) + (settings.feeRuleFixedMinor ?? 0);
    return { amount, estimated: true };
  }
  return { amount: null, estimated: false };
}

function lineCostE4(line: Order["lines"][number], products: Map<string, Product>): number | null {
  if (line.unitCostE4 !== null) return line.unitCostE4;
  if (line.productId) return products.get(line.productId)?.unitCostE4 ?? null;
  return null;
}

/** Totals per local date for every day in `range`. */
export function computeDailyTotals(ds: Dataset, range: DateRange): Map<string, PeriodTotals> {
  const { settings } = ds;
  const products = new Map(ds.products.map((p) => [p.id, p]));
  const byDay = new Map<string, PeriodTotals>(eachDay(range).map((d) => [d, { ...EMPTY_TOTALS }]));
  const bucket = (date: string) => byDay.get(date);

  for (const order of ds.orders) {
    const t = bucket(localDateOf(order.orderedAt, settings.timezone));
    if (!t) continue;
    t.orders += 1;
    t.shippingCharged += order.shippingChargedMinor;
    for (const line of order.lines) {
      t.units += line.quantity;
      t.grossSales += line.grossMinor;
      t.discounts += line.discountMinor;
      t.productSalesAfterDiscounts += lineNet(line);
      const cost = lineCostE4(line, products);
      if (cost === null) {
        t.linesWithoutCost += 1;
        t.salesWithoutCost += lineNet(line);
      } else {
        t.cogs += lineCostMinor(cost, line.quantity, settings.currency);
      }
    }
    const shipping = resolvedShippingCost(order, settings);
    if (shipping.amount === null) t.ordersWithoutShippingCost += 1;
    else {
      t.shippingCosts += shipping.amount;
      if (shipping.estimated) t.shippingCostsEstimated += shipping.amount;
    }
    const fees = resolvedFees(order, settings);
    if (fees.amount === null) t.ordersWithoutFees += 1;
    else {
      t.transactionFees += fees.amount;
      if (fees.estimated) t.transactionFeesEstimated += fees.amount;
    }
  }

  for (const refund of ds.refunds) {
    const t = bucket(localDateOf(refund.refundedAt, settings.timezone));
    if (t) t.refunds += refund.amountMinor;
  }

  for (const day of ds.adSpend) {
    const t = bucket(day.date);
    if (t) t.adSpend += day.spendMinor;
  }

  for (const e of ds.expenses) {
    const t = bucket(e.incurredOn);
    if (!t) continue;
    if (e.kind === "fixed") t.fixedCosts += e.amountMinor;
    else if (e.category === "shipping" || e.category === "fulfilment") t.shippingCosts += e.amountMinor;
    else if (e.category === "payment_fees") t.transactionFees += e.amountMinor;
    else t.otherVariableCosts += e.amountMinor;
  }

  return byDay;
}

export function computeTotals(ds: Dataset, range: DateRange): PeriodTotals {
  let total = { ...EMPTY_TOTALS };
  for (const t of computeDailyTotals(ds, range).values()) total = addTotals(total, t);
  return total;
}

export type ProductRow = {
  productId: string;
  sku: string | null;
  name: string;
  unitCostE4: number | null;
  units: number;
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  shippingCharged: number;
  netRevenue: number;
  /** null when any line in the period has no cost. */
  cogs: number | null;
  linesWithoutCost: number;
  shippingCosts: number;
  transactionFees: number;
  adSpend: number;
  contributionMargin: number | null;
  contributionMarginRate: number | null;
};

export type ProductBreakdown = {
  rows: ProductRow[];
  /** Amounts that stay at store level because no valid allocation exists. */
  unallocated: { adSpend: number; refunds: number; variableExpenses: number };
};

/** Aggregated product amounts before the derived figures are computed. */
export type ProductBase = Omit<ProductRow, "netSales" | "netRevenue" | "contributionMargin" | "contributionMarginRate">;

/**
 * Derived product figures, shared by this reference and the SQL-backed reports.
 * Contribution margin is unknown (null) when any sold line has no unit cost.
 */
export function deriveProductRow(base: ProductBase): ProductRow {
  const netSales = base.grossSales - base.discounts - base.refunds;
  const netRevenue = netSales + base.shippingCharged;
  const contributionMargin =
    base.cogs === null ? null : netRevenue - base.cogs - base.shippingCosts - base.transactionFees - base.adSpend;
  return {
    ...base,
    netSales,
    netRevenue,
    contributionMargin,
    contributionMarginRate: contributionMargin !== null && netRevenue > 0 ? contributionMargin / netRevenue : null,
  };
}

/** Default product order: highest net revenue first, then by name. */
export function compareProductRows(x: Pick<ProductRow, "netRevenue" | "name">, y: Pick<ProductRow, "netRevenue" | "name">) {
  return y.netRevenue - x.netRevenue || x.name.localeCompare(y.name);
}

type Acc = Omit<ProductBase, "cogs"> & { cogsKnown: number };

export function computeProductBreakdown(ds: Dataset, range: DateRange): ProductBreakdown {
  const { settings } = ds;
  const products = new Map(ds.products.map((p) => [p.id, p]));
  const orders = new Map(ds.orders.map((o) => [o.id, o]));
  const acc = new Map<string, Acc>();
  const get = (productId: string): Acc => {
    let a = acc.get(productId);
    if (!a) {
      const p = products.get(productId);
      a = {
        productId,
        sku: p?.sku ?? null,
        name: p?.name ?? "Unknown product",
        unitCostE4: p?.unitCostE4 ?? null,
        units: 0,
        grossSales: 0,
        discounts: 0,
        refunds: 0,
        shippingCharged: 0,
        cogsKnown: 0,
        linesWithoutCost: 0,
        shippingCosts: 0,
        transactionFees: 0,
        adSpend: 0,
      };
      acc.set(productId, a);
    }
    return a;
  };

  const sortedLines = (order: Order) => [...order.lines].sort((a, b) => a.position - b.position);

  for (const order of ds.orders) {
    if (!isInRange(localDateOf(order.orderedAt, settings.timezone), range)) continue;
    const lines = sortedLines(order);
    // Orders without lines have nothing to allocate to (they still count at store level).
    if (lines.length === 0) continue;
    const weights = lines.map(lineNet).map((w) => Math.max(w, 0));
    const shippingCharged = allocateProportionally(order.shippingChargedMinor, weights);
    const shippingCost = resolvedShippingCost(order, settings).amount;
    const shippingShares = shippingCost === null ? null : allocateProportionally(shippingCost, weights);
    const fees = resolvedFees(order, settings).amount;
    const feeShares = fees === null ? null : allocateProportionally(fees, weights);

    lines.forEach((line, i) => {
      if (!line.productId) return;
      const a = get(line.productId);
      a.units += line.quantity;
      a.grossSales += line.grossMinor;
      a.discounts += line.discountMinor;
      a.shippingCharged += shippingCharged[i];
      if (shippingShares) a.shippingCosts += shippingShares[i];
      if (feeShares) a.transactionFees += feeShares[i];
      const cost = lineCostE4(line, products);
      if (cost === null) a.linesWithoutCost += 1;
      else a.cogsKnown += lineCostMinor(cost, line.quantity, settings.currency);
    });
  }

  let unallocatedRefunds = 0;
  for (const refund of ds.refunds) {
    if (!isInRange(localDateOf(refund.refundedAt, settings.timezone), range)) continue;
    const order = refund.orderId ? orders.get(refund.orderId) : undefined;
    if (!order || order.lines.length === 0) {
      unallocatedRefunds += refund.amountMinor;
      continue;
    }
    const lines = sortedLines(order);
    const shares = allocateProportionally(refund.amountMinor, lines.map(lineNet).map((w) => Math.max(w, 0)));
    lines.forEach((line, i) => {
      if (line.productId) get(line.productId).refunds += shares[i];
      else unallocatedRefunds += shares[i];
    });
  }

  const campaignProduct = new Map(ds.campaigns.map((c) => [c.id, c.productId]));
  let unallocatedAds = 0;
  for (const day of ds.adSpend) {
    if (!isInRange(day.date, range)) continue;
    const productId = campaignProduct.get(day.campaignId) ?? null;
    if (productId && products.has(productId)) get(productId).adSpend += day.spendMinor;
    else unallocatedAds += day.spendMinor;
  }

  let variableExpenses = 0;
  for (const e of ds.expenses) {
    if (e.kind === "variable" && isInRange(e.incurredOn, range)) variableExpenses += e.amountMinor;
  }

  const rows: ProductRow[] = [...acc.values()].map(({ cogsKnown, ...rest }) =>
    deriveProductRow({ ...rest, cogs: rest.linesWithoutCost > 0 ? null : cogsKnown }),
  );
  rows.sort(compareProductRows);

  return { rows, unallocated: { adSpend: unallocatedAds, refunds: unallocatedRefunds, variableExpenses } };
}

export type CampaignRow = {
  campaignId: string;
  platform: string;
  name: string;
  productId: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  platformRoas: number | null;
};

export function computeCampaignBreakdown(ds: Dataset, range: DateRange): CampaignRow[] {
  const rows = new Map<string, CampaignRow>(
    ds.campaigns.map((c) => [
      c.id,
      { campaignId: c.id, platform: c.platform, name: c.name, productId: c.productId, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, platformRoas: null },
    ]),
  );
  for (const day of ds.adSpend) {
    if (!isInRange(day.date, range)) continue;
    const row = rows.get(day.campaignId);
    if (!row) continue;
    row.spend += day.spendMinor;
    row.impressions += day.impressions;
    row.clicks += day.clicks;
    row.conversions += day.conversions;
    row.conversionValue += day.conversionValueMinor;
  }
  return [...rows.values()]
    .map((r) => ({ ...r, platformRoas: r.spend > 0 ? r.conversionValue / r.spend : null }))
    .filter((r) => r.spend > 0 || r.conversionValue > 0)
    .sort((a, b) => b.spend - a.spend);
}
