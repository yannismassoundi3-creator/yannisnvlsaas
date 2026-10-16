import type { Locale } from "@/i18n/config";
import { formatCount } from "@/lib/finance/format";

/**
 * Plans, prices and limits.
 *
 * This is the single place to change commercial terms. The displayed Pro
 * price must match the Stripe Price configured in STRIPE_PRICE_PRO_MONTHLY;
 * the amount actually charged always comes from Stripe.
 */

export type PlanId = "trial" | "pro";

export type PlanLimits = {
  /** Real (non-demo) stores per organisation. */
  stores: number;
  /** Maximum data rows in a single CSV import. */
  importRowsPerFile: number;
  /** Maximum imported rows per calendar month. */
  importRowsPerMonth: number;
  /** How far back dashboards and reports can look. */
  historyDays: number;
  /** CSV exports and downloadable reports. */
  exports: boolean;
  /** Product and campaign filters on the dashboard. */
  advancedFilters: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  /** Price per interval in minor units of `currency`; 0 for the trial. */
  priceMinor: number;
  currency: string;
  interval: "month" | null;
  description: string;
  limits: PlanLimits;
  highlights: string[];
};

/** `raw` must come from a literal process.env.NEXT_PUBLIC_* reference so Next.js can inline it. */
function envInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}

/**
 * Trial length and payment grace period. Mirrored by private.trial_period()
 * and private.payment_grace_period() in the database, which enforce them; a
 * database test fails if the values drift apart. Change both together.
 */
export const TRIAL_DAYS = 14;
/** Days of full access kept after a renewal payment fails, while Stripe retries. */
export const PAYMENT_GRACE_DAYS = 7;

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Free trial",
    priceMinor: 0,
    currency: "EUR",
    interval: null,
    description: `${TRIAL_DAYS} days of the core product. No payment card needed to start.`,
    limits: {
      stores: 1,
      importRowsPerFile: 5_000,
      importRowsPerMonth: 20_000,
      historyDays: 90,
      exports: false,
      advancedFilters: false,
    },
    highlights: [
      "One store",
      "Dashboard, products and advertising views",
      "Profitability calculator",
      "CSV imports up to 5,000 rows per file",
      "Last 90 days of history",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMinor: envInt(process.env.NEXT_PUBLIC_PRO_PRICE_MINOR, 1_900),
    currency: process.env.NEXT_PUBLIC_PRO_PRICE_CURRENCY || "EUR",
    interval: "month",
    description: "For stores that want the full picture, month after month.",
    limits: {
      stores: 3,
      importRowsPerFile: 100_000,
      importRowsPerMonth: 1_000_000,
      historyDays: 3 * 366,
      exports: true,
      advancedFilters: true,
    },
    highlights: [
      "Up to three stores",
      "CSV imports up to 100,000 rows per file",
      "Three years of history",
      "Product profitability reports (CSV and PDF)",
      "Exports of products, orders and costs",
      "Product and campaign filters",
    ],
  },
};

export type PlanCopy = { name: string; description: string; highlights: string[] };

/**
 * Plan name, description and highlights in the interface language. The English
 * fields on PLANS stay the source for English; French is derived here so the
 * figures always follow the limits above.
 */
export function planCopy(planId: PlanId, locale: Locale = "en"): PlanCopy {
  const plan = PLANS[planId];
  if (locale === "en") return { name: plan.name, description: plan.description, highlights: plan.highlights };
  const rows = (n: number) => formatCount(n, "fr-FR");
  if (planId === "trial") {
    return {
      name: "Essai gratuit",
      description: `${TRIAL_DAYS} jours du produit principal. Aucune carte bancaire nécessaire pour commencer.`,
      highlights: [
        "Une boutique",
        "Vue d'ensemble, produits et publicité",
        "Calculateur de rentabilité",
        `Imports CSV jusqu'à ${rows(plan.limits.importRowsPerFile)} lignes par fichier`,
        `Historique des ${plan.limits.historyDays} derniers jours`,
      ],
    };
  }
  return {
    name: plan.name,
    description: "Pour les boutiques qui veulent une vision complète, mois après mois.",
    highlights: [
      "Jusqu'à trois boutiques",
      `Imports CSV jusqu'à ${rows(plan.limits.importRowsPerFile)} lignes par fichier`,
      "Trois ans d'historique",
      "Rapports de rentabilité par produit (CSV et PDF)",
      "Exports des produits, commandes et coûts",
      "Filtres par produit et par campagne",
    ],
  };
}
