/**
 * Metric definitions — the single source of truth.
 *
 * The database aggregates raw records into PeriodTotals (all integers in minor
 * units). Everything else is derived here, so the dashboard, reports, exports
 * and the glossary always use identical formulas.
 *
 *   Net sales            = Gross sales − Discounts − Refunds
 *   Net revenue          = Net sales + Shipping charged to customers
 *   Gross profit         = Net revenue − Cost of goods sold
 *   Variable costs       = Shipping & fulfilment + Payment fees + Advertising + Other variable costs
 *   Contribution margin  = Gross profit − Variable costs
 *   Operating profit (estimate) = Contribution margin − Fixed costs recorded in Narixia
 *
 * Amounts exclude sales tax / VAT. Contribution margin is not net profit: it
 * excludes fixed costs, taxes on profit, interest and depreciation.
 */

import type { Locale } from "@/i18n/config";
import { mulDivRound } from "./money";

export type PeriodTotals = {
  orders: number;
  units: number;
  grossSales: number;
  discounts: number;
  refunds: number;
  shippingCharged: number;
  /** COGS for lines with a known unit cost. */
  cogs: number;
  /** Product sales after discounts on all order lines. */
  productSalesAfterDiscounts: number;
  /** Product sales after discounts on lines with no unit cost recorded. */
  salesWithoutCost: number;
  /** Number of order lines with no unit cost recorded. */
  linesWithoutCost: number;
  shippingCosts: number;
  /** Portion of shippingCosts estimated from the store's default rule. */
  shippingCostsEstimated: number;
  /** Orders with neither a recorded nor an estimated shipping cost. */
  ordersWithoutShippingCost: number;
  transactionFees: number;
  /** Portion of transactionFees estimated from the store's fee rule. */
  transactionFeesEstimated: number;
  /** Orders with neither recorded nor estimated payment fees. */
  ordersWithoutFees: number;
  adSpend: number;
  otherVariableCosts: number;
  fixedCosts: number;
};

export type Completeness = "complete" | "estimated" | "partial" | "missing" | "not_applicable";

export type Metrics = PeriodTotals & {
  netSales: number;
  netRevenue: number;
  grossProfit: number;
  variableCosts: number;
  contributionBeforeAds: number;
  contributionMargin: number;
  operatingProfit: number;
  grossMarginRate: number | null;
  contributionMarginRate: number | null;
  averageOrderValue: number | null;
  refundRate: number | null;
  discountRate: number | null;
  adSpendRate: number | null;
  blendedRoas: number | null;
  breakEvenRoas: number | null;
  costCoverage: number | null;
  completeness: {
    cogs: Completeness;
    shipping: Completeness;
    fees: Completeness;
  };
};

export const EMPTY_TOTALS: PeriodTotals = {
  orders: 0,
  units: 0,
  grossSales: 0,
  discounts: 0,
  refunds: 0,
  shippingCharged: 0,
  cogs: 0,
  productSalesAfterDiscounts: 0,
  salesWithoutCost: 0,
  linesWithoutCost: 0,
  shippingCosts: 0,
  shippingCostsEstimated: 0,
  ordersWithoutShippingCost: 0,
  transactionFees: 0,
  transactionFeesEstimated: 0,
  ordersWithoutFees: 0,
  adSpend: 0,
  otherVariableCosts: 0,
  fixedCosts: 0,
};

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function completenessOf(missing: number, estimated: number, total: number): Completeness {
  if (total === 0) return "not_applicable";
  if (missing >= total) return "missing";
  if (missing > 0) return "partial";
  if (estimated > 0) return "estimated";
  return "complete";
}

export function deriveMetrics(t: PeriodTotals): Metrics {
  const netSales = t.grossSales - t.discounts - t.refunds;
  const netRevenue = netSales + t.shippingCharged;
  const grossProfit = netRevenue - t.cogs;
  const variableCosts = t.shippingCosts + t.transactionFees + t.adSpend + t.otherVariableCosts;
  const contributionBeforeAds = grossProfit - t.shippingCosts - t.transactionFees - t.otherVariableCosts;
  const contributionMargin = grossProfit - variableCosts;
  const operatingProfit = contributionMargin - t.fixedCosts;

  const contributionBeforeAdsRate = ratio(contributionBeforeAds, netRevenue);
  const breakEvenRoas =
    contributionBeforeAdsRate !== null && contributionBeforeAdsRate > 0 ? 1 / contributionBeforeAdsRate : null;

  const cogsMissingShare = t.productSalesAfterDiscounts > 0 ? t.salesWithoutCost / t.productSalesAfterDiscounts : 0;

  return {
    ...t,
    netSales,
    netRevenue,
    grossProfit,
    variableCosts,
    contributionBeforeAds,
    contributionMargin,
    operatingProfit,
    grossMarginRate: ratio(grossProfit, netRevenue),
    contributionMarginRate: ratio(contributionMargin, netRevenue),
    averageOrderValue: t.orders > 0 ? mulDivRound(t.grossSales - t.discounts, 1, t.orders) : null,
    refundRate: ratio(t.refunds, t.grossSales),
    discountRate: ratio(t.discounts, t.grossSales),
    adSpendRate: t.adSpend > 0 ? ratio(t.adSpend, netRevenue) : null,
    blendedRoas: t.adSpend > 0 ? netRevenue / t.adSpend : null,
    breakEvenRoas,
    costCoverage: t.productSalesAfterDiscounts > 0 ? 1 - cogsMissingShare : null,
    completeness: {
      cogs:
        t.linesWithoutCost === 0
          ? t.productSalesAfterDiscounts > 0
            ? "complete"
            : "not_applicable"
          : t.salesWithoutCost >= t.productSalesAfterDiscounts
            ? "missing"
            : "partial",
      shipping: completenessOf(t.ordersWithoutShippingCost, t.shippingCostsEstimated, t.orders),
      fees: completenessOf(t.ordersWithoutFees, t.transactionFeesEstimated, t.orders),
    },
  };
}

export type MetricKey =
  | "grossSales"
  | "discounts"
  | "refunds"
  | "netSales"
  | "shippingCharged"
  | "netRevenue"
  | "cogs"
  | "grossProfit"
  | "shippingCosts"
  | "transactionFees"
  | "adSpend"
  | "otherVariableCosts"
  | "contributionMargin"
  | "fixedCosts"
  | "operatingProfit"
  | "orders"
  | "averageOrderValue";

/** Direction in which a change is good, used to colour deltas. null = neutral. */
export const METRIC_POLARITY: Record<MetricKey | "contributionMarginRate" | "refundRate", "up" | "down" | null> = {
  grossSales: "up",
  discounts: null,
  refunds: "down",
  netSales: "up",
  shippingCharged: null,
  netRevenue: "up",
  cogs: null,
  grossProfit: "up",
  shippingCosts: null,
  transactionFees: null,
  adSpend: null,
  otherVariableCosts: null,
  contributionMargin: "up",
  fixedCosts: null,
  operatingProfit: "up",
  orders: "up",
  averageOrderValue: "up",
  contributionMarginRate: "up",
  refundRate: "down",
};

export type Delta = {
  current: number | null;
  previous: number | null;
  /** current - previous (minor units for money, fraction for rates). */
  absolute: number | null;
  /** Relative change; null when previous is zero or missing. */
  relative: number | null;
};

export function delta(current: number | null, previous: number | null): Delta {
  if (current === null || previous === null) return { current, previous, absolute: null, relative: null };
  const absolute = current - previous;
  const relative = previous !== 0 ? absolute / Math.abs(previous) : null;
  return { current, previous, absolute, relative };
}

/**
 * Plain-language definitions shown in tooltips, the glossary and reports.
 * Keep in sync with deriveMetrics above.
 */
export const DEFINITIONS = {
  grossSales: {
    term: "Gross sales",
    short: "Product sales before discounts, refunds, shipping and tax.",
    formula: "Unit price × quantity, summed over all order lines",
  },
  discounts: {
    term: "Discounts",
    short: "Price reductions on order lines and whole orders, such as discount codes.",
    formula: "Line discounts + order discounts",
  },
  refunds: {
    term: "Refunds",
    short:
      "Money returned to customers. Attributed to the refund date when known, otherwise to the original order date.",
    formula: "Sum of refunded amounts, excluding tax",
  },
  netSales: {
    term: "Net sales",
    short: "What your products sold for after discounts and refunds, excluding shipping and tax.",
    formula: "Gross sales − Discounts − Refunds",
  },
  shippingCharged: {
    term: "Shipping charged",
    short: "Shipping fees paid by customers, excluding tax.",
    formula: "Sum of shipping charged on orders",
  },
  netRevenue: {
    term: "Net revenue",
    short: "Net sales plus shipping paid by customers. The base for margin percentages.",
    formula: "Net sales + Shipping charged",
  },
  cogs: {
    term: "Cost of goods sold (COGS)",
    short:
      "What the products you sold cost you. Uses the cost recorded on the order line when available, otherwise the product's current unit cost.",
    formula: "Unit cost × quantity sold",
  },
  grossProfit: {
    term: "Gross profit",
    short: "Net revenue minus the cost of the goods sold.",
    formula: "Net revenue − COGS",
  },
  shippingCosts: {
    term: "Shipping & fulfilment costs",
    short: "What you paid to pack and ship orders. Estimated values are labelled.",
    formula: "Recorded shipping costs + estimates from your default rule",
  },
  transactionFees: {
    term: "Payment fees",
    short: "Fees charged by payment providers. Estimated values are labelled.",
    formula: "Recorded fees + estimates from your fee rule (% of amount paid + fixed fee per order)",
  },
  adSpend: {
    term: "Advertising spend",
    short: "Money spent on paid campaigns in the period.",
    formula: "Sum of daily campaign spend",
  },
  otherVariableCosts: {
    term: "Other variable costs",
    short: "Costs that grow with sales, such as packaging or marketplace commissions, recorded as expenses.",
    formula: "Sum of expenses marked as variable",
  },
  contributionMargin: {
    term: "Contribution margin",
    short:
      "What remains from net revenue after product costs and all variable costs, available to cover fixed costs and profit. It is not net profit.",
    formula: "Gross profit − Shipping − Payment fees − Advertising − Other variable costs",
  },
  contributionMarginRate: {
    term: "Contribution margin %",
    short: "Contribution margin as a share of net revenue.",
    formula: "Contribution margin ÷ Net revenue",
  },
  fixedCosts: {
    term: "Fixed costs",
    short: "Costs that do not change with sales volume, such as software subscriptions, rent or salaries.",
    formula: "Sum of expenses marked as fixed",
  },
  operatingProfit: {
    term: "Operating profit (estimate)",
    short:
      "Contribution margin minus the fixed costs recorded in Narixia. Excludes taxes on profit, interest, depreciation and any cost not entered here. Not a substitute for your accounts.",
    formula: "Contribution margin − Fixed costs",
  },
  netProfit: {
    term: "Net profit",
    short:
      "An accounting result after all costs, taxes, interest and depreciation. Narixia does not calculate net profit; ask your accountant for it.",
    formula: "Not calculated by Narixia",
  },
  cashFlow: {
    term: "Cash flow",
    short:
      "Money actually entering and leaving your bank account over time. Narixia records sales when orders are placed, not when payouts arrive, so it does not measure cash flow.",
    formula: "Not calculated by Narixia",
  },
  orders: {
    term: "Orders",
    short: "Number of orders placed in the period.",
    formula: "Count of orders",
  },
  averageOrderValue: {
    term: "Average order value (AOV)",
    short: "Average product value per order after discounts, before refunds, shipping and tax.",
    formula: "(Gross sales − Discounts) ÷ Orders",
  },
  roas: {
    term: "ROAS (as reported by the platform)",
    short:
      "Revenue the ad platform attributes to a campaign for each unit of spend. Platforms use their own attribution rules and often over-count.",
    formula: "Platform conversion value ÷ Ad spend",
  },
  blendedRoas: {
    term: "Blended ROAS",
    short:
      "Net revenue of the whole store for each unit of advertising spend. Does not depend on platform attribution, but includes sales that ads did not cause.",
    formula: "Net revenue ÷ Total ad spend",
  },
  breakEvenRoas: {
    term: "Break-even ROAS",
    short:
      "The ROAS at which advertising consumes all of the margin left after product, shipping, payment and other variable costs. Below it, ads cost more than the margin they bring in.",
    formula: "1 ÷ (Contribution before advertising ÷ Net revenue)",
  },
  roi: {
    term: "ROI",
    short:
      "Return on investment compares profit to what was invested. Unlike ROAS it uses profit, not revenue. Narixia shows contribution margin rather than an ROI figure, because investment amounts are not tracked.",
    formula: "(Gain − Cost) ÷ Cost",
  },
  refundRate: {
    term: "Refund rate",
    short: "Refunds as a share of gross sales.",
    formula: "Refunds ÷ Gross sales",
  },
} as const;

export type DefinitionKey = keyof typeof DEFINITIONS;
export type Definition = { term: string; short: string; formula: string };

/**
 * French definitions. Same keys as DEFINITIONS; keep both in sync.
 */
const DEFINITIONS_FR: Record<DefinitionKey, Definition> = {
  grossSales: {
    term: "Ventes brutes",
    short: "Ventes de produits avant remises, remboursements, frais de port et taxes.",
    formula: "Prix unitaire × quantité, additionnés sur toutes les lignes de commande",
  },
  discounts: {
    term: "Remises",
    short: "Réductions de prix appliquées aux lignes de commande et aux commandes entières, comme les codes promo.",
    formula: "Remises sur les lignes + remises sur les commandes",
  },
  refunds: {
    term: "Remboursements",
    short:
      "Sommes rendues aux clients. Rattachées à la date du remboursement lorsqu'elle est connue, sinon à la date de la commande d'origine.",
    formula: "Somme des montants remboursés, hors taxes",
  },
  netSales: {
    term: "Ventes nettes",
    short: "Ce que vos produits ont rapporté après remises et remboursements, hors frais de port et taxes.",
    formula: "Ventes brutes − Remises − Remboursements",
  },
  shippingCharged: {
    term: "Frais de port facturés",
    short: "Frais de livraison payés par les clients, hors taxes.",
    formula: "Somme des frais de port facturés sur les commandes",
  },
  netRevenue: {
    term: "Chiffre d'affaires net",
    short: "Ventes nettes plus frais de port payés par les clients. Sert de base aux pourcentages de marge.",
    formula: "Ventes nettes + Frais de port facturés",
  },
  cogs: {
    term: "Coût d'achat des produits",
    short:
      "Ce que vous ont coûté les produits que vous avez vendus. Narixia utilise le coût enregistré sur la ligne de commande s'il existe, sinon le coût unitaire actuel du produit. En comptabilité, on parle de coût des marchandises vendues.",
    formula: "Coût unitaire × quantité vendue",
  },
  grossProfit: {
    term: "Marge brute",
    short: "Chiffre d'affaires net moins le coût d'achat des produits vendus.",
    formula: "Chiffre d'affaires net − Coût d'achat des produits",
  },
  shippingCosts: {
    term: "Coûts d'expédition et de logistique",
    short: "Ce que vous avez payé pour préparer et expédier les commandes. Les valeurs estimées sont signalées.",
    formula: "Coûts d'expédition enregistrés + estimations selon votre règle par défaut",
  },
  transactionFees: {
    term: "Frais de paiement",
    short: "Frais prélevés par les prestataires de paiement. Les valeurs estimées sont signalées.",
    formula: "Frais enregistrés + estimations selon votre règle de frais (% du montant payé + frais fixe par commande)",
  },
  adSpend: {
    term: "Dépenses publicitaires",
    short: "Sommes dépensées en campagnes payantes sur la période.",
    formula: "Somme des dépenses quotidiennes des campagnes",
  },
  otherVariableCosts: {
    term: "Autres coûts variables",
    short:
      "Coûts qui augmentent avec les ventes, comme l'emballage ou les commissions des places de marché, enregistrés comme dépenses.",
    formula: "Somme des dépenses marquées comme variables",
  },
  contributionMargin: {
    term: "Ce qui vous reste (marge sur coûts variables)",
    short:
      "Ce qui vous reste de vos ventes une fois payés le coût d'achat des produits, l'expédition, les frais de paiement, la publicité et les autres coûts liés aux ventes (emballage, commissions…). Les charges fixes (loyer, abonnements…), les impôts et les intérêts ne sont pas déduits : ce n'est pas votre bénéfice net.",
    formula: "Chiffre d'affaires net − Coût d'achat des produits − Expédition − Frais de paiement − Publicité − Autres coûts variables",
  },
  contributionMarginRate: {
    term: "Ce qui vous reste, en % (taux de marge sur coûts variables)",
    short: "La part de votre chiffre d'affaires net qui vous reste une fois payés les coûts liés aux ventes, avant les charges fixes.",
    formula: "Ce qui vous reste ÷ Chiffre d'affaires net",
  },
  fixedCosts: {
    term: "Coûts fixes",
    short: "Coûts qui ne varient pas avec le volume des ventes, comme les abonnements logiciels, le loyer ou les salaires.",
    formula: "Somme des dépenses marquées comme fixes",
  },
  operatingProfit: {
    term: "Résultat d'exploitation (estimation)",
    short:
      "Ce qui vous reste (marge sur coûts variables) moins les coûts fixes enregistrés dans Narixia. Exclut l'impôt sur les bénéfices, les intérêts, les amortissements et tout coût non saisi ici. Ne remplace pas votre comptabilité.",
    formula: "Ce qui vous reste − Coûts fixes",
  },
  netProfit: {
    term: "Bénéfice net",
    short:
      "Résultat comptable après tous les coûts, impôts, intérêts et amortissements. Narixia ne calcule pas le bénéfice net : demandez-le à votre expert-comptable.",
    formula: "Non calculé par Narixia",
  },
  cashFlow: {
    term: "Trésorerie",
    short:
      "Argent qui entre et sort réellement de votre compte bancaire au fil du temps. Narixia enregistre les ventes à la date de commande, pas à l'arrivée des versements : il ne mesure donc pas la trésorerie.",
    formula: "Non calculé par Narixia",
  },
  orders: {
    term: "Commandes",
    short: "Nombre de commandes passées sur la période.",
    formula: "Nombre de commandes",
  },
  averageOrderValue: {
    term: "Panier moyen",
    short: "Valeur moyenne des produits par commande après remises, avant remboursements, frais de port et taxes.",
    formula: "(Ventes brutes − Remises) ÷ Commandes",
  },
  roas: {
    term: "ROAS annoncé par la plateforme",
    short:
      "Les ventes que la plateforme publicitaire attribue à une campagne pour chaque euro dépensé. Chaque plateforme applique ses propres règles d'attribution et surestime souvent.",
    formula: "Valeur de conversion de la plateforme ÷ Dépenses publicitaires",
  },
  blendedRoas: {
    term: "Ventes par euro de pub (ROAS)",
    short:
      "Le chiffre d'affaires net de toute la boutique pour chaque euro dépensé en publicité. Ne dépend pas de l'attribution des plateformes, mais inclut des ventes que la publicité n'a pas générées.",
    formula: "Chiffre d'affaires net ÷ Dépenses publicitaires totales",
  },
  breakEvenRoas: {
    term: "Seuil de rentabilité de la pub (ROAS)",
    short:
      "Le montant de ventes que chaque euro de pub doit rapporter, au minimum, pour que la pub soit rentable. En dessous, la publicité coûte plus que la marge que ces ventes vous laissent après le coût d'achat des produits, l'expédition, les frais de paiement et les autres coûts variables.",
    formula: "1 ÷ (Ce qui vous reste avant publicité ÷ Chiffre d'affaires net)",
  },
  roi: {
    term: "ROI",
    short:
      "Le retour sur investissement compare le bénéfice à la somme investie. Contrairement au ROAS, il repose sur le bénéfice et non sur le chiffre d'affaires. Narixia affiche ce qui vous reste (marge sur coûts variables) plutôt qu'un ROI, car les montants investis ne sont pas suivis.",
    formula: "(Gain − Coût) ÷ Coût",
  },
  refundRate: {
    term: "Taux de remboursement",
    short: "Remboursements rapportés aux ventes brutes.",
    formula: "Remboursements ÷ Ventes brutes",
  },
};

/** Definitions in the interface language (glossary, tooltips, reports). */
export function definitionsFor(locale: Locale = "en"): Record<DefinitionKey, Definition> {
  return locale === "fr" ? DEFINITIONS_FR : DEFINITIONS;
}
