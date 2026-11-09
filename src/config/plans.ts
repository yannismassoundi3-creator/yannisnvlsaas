import type { Locale } from "@/i18n/config";
import { formatCount } from "@/lib/finance/format";

/**
 * Plans, prices and limits.
 *
 * This is the single place to change commercial terms. The displayed prices
 * must match the Stripe Prices configured in STRIPE_PRICE_PRO_MONTHLY and
 * STRIPE_PRICE_RESELLER_MONTHLY; the amount actually charged always comes
 * from Stripe.
 *
 *   trial     14 days of everything, no card (every new workspace)
 *   free      after the trial, workspaces whose stores are all in reseller
 *             mode: reseller mode with at most FREE_STOCK_ITEMS pieces in stock
 *   reseller  "Revendeur": reseller mode with unlimited stock, AI listings and
 *             sales received by email
 *   pro       online stores (imports, advertising, reports) and everything above
 */

export type PlanId = "trial" | "free" | "reseller" | "pro";
/** Plans sold through Stripe (subscriptions.plan). */
export type PaidPlanId = "reseller" | "pro";

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
  /** Pieces in stock across reseller stores; null when unlimited. */
  stockItems: number | null;
};

export type Plan = {
  id: PlanId;
  name: string;
  /** Price per interval in minor units of `currency`; 0 for the trial and the free plan. */
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
/**
 * Pieces in stock on the free plan. Mirrored by private.free_stock_limit() in
 * the database, which enforces it; a database test fails if they drift apart.
 */
export const FREE_STOCK_ITEMS = 30;
/** AI listings per month on paid plans and during the trial, unless LISTING_AI_MONTHLY_LIMIT says otherwise. */
export const DEFAULT_AI_LISTINGS_PER_MONTH = 50;

const CURRENCY = process.env.NEXT_PUBLIC_PRO_PRICE_CURRENCY || "EUR";

const PAID_LIMITS: PlanLimits = {
  stores: 3,
  importRowsPerFile: 100_000,
  importRowsPerMonth: 1_000_000,
  historyDays: 3 * 366,
  exports: true,
  advancedFilters: true,
  stockItems: null,
};

/** Whether the optional features are switched on for this deployment (pricing copy says "coming soon" otherwise). */
export type FeatureAvailability = { aiListings: boolean; inboundEmail: boolean; aiListingsPerMonth?: number };
const NOT_YET: FeatureAvailability = { aiListings: false, inboundEmail: false };

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
      stockItems: null,
    },
    highlights: [
      "One store",
      "Dashboard, products and advertising views",
      "Profitability calculator",
      "CSV imports up to 5,000 rows per file",
      "Last 90 days of history",
    ],
  },
  free: {
    id: "free",
    name: "Free",
    priceMinor: 0,
    currency: CURRENCY,
    interval: null,
    description: "For resellers on Vinted, Leboncoin or eBay. No payment card.",
    limits: {
      stores: 1,
      importRowsPerFile: 5_000,
      importRowsPerMonth: 20_000,
      // Sold history stays visible: the items list has no date limit.
      historyDays: 3 * 366,
      exports: false,
      advancedFilters: false,
      stockItems: FREE_STOCK_ITEMS,
    },
    highlights: planHighlights("free", "en", NOT_YET),
  },
  reseller: {
    id: "reseller",
    name: "Reseller",
    priceMinor: envInt(process.env.NEXT_PUBLIC_RESELLER_PRICE_MINOR, 799),
    currency: CURRENCY,
    interval: "month",
    description: "Everything in reseller mode, with unlimited stock.",
    limits: PAID_LIMITS,
    highlights: planHighlights("reseller", "en", NOT_YET),
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMinor: envInt(process.env.NEXT_PUBLIC_PRO_PRICE_MINOR, 1_900),
    currency: CURRENCY,
    interval: "month",
    description: "For online stores: imports, advertising and reports, month after month.",
    limits: PAID_LIMITS,
    highlights: planHighlights("pro", "en", NOT_YET),
  },
};

/** Highlights of the free, reseller and pro plans; optional features say "coming soon" until they are switched on. */
function planHighlights(planId: "free" | "reseller" | "pro", locale: Locale, features: FeatureAvailability): string[] {
  const perMonth = features.aiListingsPerMonth ?? DEFAULT_AI_LISTINGS_PER_MONTH;
  if (locale === "en") {
    const ai = features.aiListings ? `Listings written by AI from your photos (${perMonth} per month)` : "Listings written by AI from your photos (coming soon)";
    const email = features.inboundEmail ? "Sales recorded from your forwarded emails" : "Sales recorded from your forwarded emails (coming soon)";
    if (planId === "free") {
      return [
        "Reseller mode: items, sales in two taps, margin per platform",
        `Up to ${FREE_STOCK_ITEMS} items in stock`,
        "Unlimited sales history",
        "Photos enhanced on your phone",
        "Full data export",
      ];
    }
    if (planId === "reseller") {
      return ["Everything in the free plan", "Unlimited items in stock", ai, email, "CSV and PDF reports and exports", `${TRIAL_DAYS}-day free trial, no card`];
    }
    return [
      "Up to three stores",
      `CSV imports of orders, products and ads up to ${formatCount(100_000, "en-GB")} rows per file`,
      "Advertising: break-even ROAS, campaigns",
      "Three years of history",
      "Product profitability reports (CSV and PDF)",
      "Exports of products, orders and costs",
      "Product and campaign filters",
      "Everything in the Reseller plan",
    ];
  }
  const ai = features.aiListings ? `Annonces générées par IA à partir de vos photos (${perMonth} par mois)` : "Annonces générées par IA (bientôt)";
  const email = features.inboundEmail ? "Ventes enregistrées depuis vos e-mails transférés" : "Ventes reçues par e-mail (bientôt)";
  if (planId === "free") {
    return [
      "Mode revendeur : articles, ventes en deux gestes, marge par plateforme",
      `Jusqu'à ${FREE_STOCK_ITEMS} articles en stock`,
      "Historique des ventes illimité",
      "Photos améliorées sur votre téléphone",
      "Export complet de vos données",
    ];
  }
  if (planId === "reseller") {
    return ["Tout ce que contient l'offre gratuite", "Stock illimité", ai, email, "Rapports et exports CSV et PDF", `Essai gratuit de ${TRIAL_DAYS} jours, sans carte`];
  }
  return [
    "Jusqu'à trois boutiques",
    `Imports CSV des commandes, produits et publicités jusqu'à ${formatCount(100_000, "fr-FR")} lignes par fichier`,
    "Publicité : ROAS de rentabilité, campagnes",
    "Trois ans d'historique",
    "Rapports de rentabilité par produit (CSV et PDF)",
    "Exports des produits, commandes et coûts",
    "Filtres par produit et par campagne",
    "Tout ce que contient l'offre Revendeur",
  ];
}

export type PlanCopy = { name: string; description: string; highlights: string[] };

/**
 * Plan name, description and highlights in the interface language. The English
 * fields on PLANS stay the source for English; French is derived here so the
 * figures always follow the limits above. `features` says which optional
 * features are switched on (they are labelled "coming soon" otherwise).
 */
export function planCopy(planId: PlanId, locale: Locale = "en", features: FeatureAvailability = NOT_YET): PlanCopy {
  const plan = PLANS[planId];
  if (planId !== "trial") {
    const highlights = planHighlights(planId, locale, features);
    if (locale === "en") return { name: plan.name, description: plan.description, highlights };
    const fr = {
      free: { name: "Gratuit", description: "Pour les revendeurs sur Vinted, Leboncoin ou eBay. Sans carte bancaire." },
      reseller: { name: "Revendeur", description: "Tout le mode revendeur, avec un stock illimité." },
      pro: { name: "Pro", description: "Pour les boutiques en ligne : imports, publicité et rapports, mois après mois." },
    }[planId];
    return { ...fr, highlights };
  }
  if (locale === "en") return { name: plan.name, description: plan.description, highlights: plan.highlights };
  const rows = (n: number) => formatCount(n, "fr-FR");
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

/** Price ids configured for this deployment (server-side environment). */
export type PriceIds = { pro: string; reseller: string };

/**
 * Plan of a Stripe price: the Revendeur price maps to "reseller"; any other
 * price (the Pro price, or a price this deployment does not know, such as an
 * older Pro price) maps to "pro", as every subscription did before.
 */
export function planForPrice(priceId: string | null | undefined, resellerPriceId: string | null | undefined): PaidPlanId {
  return priceId && resellerPriceId && priceId === resellerPriceId ? "reseller" : "pro";
}
