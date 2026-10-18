import type { Locale } from "@/i18n/config";

/**
 * Public site configuration.
 *
 * Company and contact details are intentionally read from environment
 * variables. Narixia never invents legal or contact information: when a value
 * is missing, pages state that it has not been configured yet.
 */
export const site = {
  name: "Narixia",
  tagline: "Understand your real margins. Make better business decisions.",
  description:
    "Profitability analytics for small e-commerce businesses. See your real product margins, advertising performance and operating costs in one clear view.",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null,
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null,
  company: {
    legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME || null,
    address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || null,
    registration: process.env.NEXT_PUBLIC_COMPANY_REGISTRATION || null,
    country: process.env.NEXT_PUBLIC_COMPANY_COUNTRY || null,
  },
  /** Date shown on the legal pages. Update whenever the documents change. */
  legalLastUpdated: "2026-10-18",
  /**
   * Service providers that process personal data on Narixia's behalf. Keep this
   * list accurate for your deployment: it is published in the privacy policy.
   */
  processors: [
    { id: "database", name: "Supabase", purpose: "Database and authentication", location: process.env.NEXT_PUBLIC_DATA_REGION || "Region chosen at deployment" },
    { id: "email", name: process.env.NEXT_PUBLIC_EMAIL_PROVIDER || "Brevo", purpose: "Delivery of account emails (confirmation, sign-in codes, password reset)", location: process.env.NEXT_PUBLIC_EMAIL_REGION || "European Union" },
    { id: "payments", name: "Stripe", purpose: "Subscription payments, invoices and the billing portal", location: "European Union and United States" },
    { id: "hosting", name: process.env.NEXT_PUBLIC_HOSTING_PROVIDER || "Vercel", purpose: "Application hosting and delivery", location: process.env.NEXT_PUBLIC_HOSTING_REGION || "Region chosen at deployment" },
    {
      id: "inbound",
      name: process.env.NEXT_PUBLIC_INBOUND_EMAIL_PROVIDER || "Postmark",
      purpose: "Receiving the sale emails you forward to us",
      location: process.env.NEXT_PUBLIC_INBOUND_EMAIL_REGION || "United States",
    },
    // Listed always, not only when ANTHROPIC_API_KEY is set: the privacy policy is a
    // prerendered page, so a condition on a server secret could silently drop it from
    // the published list while the feature is on. Photos reach Anthropic only when a
    // seller presses the button, which the purpose states.
    {
      id: "ai",
      name: "Anthropic (Claude)",
      purpose: "Writing listings from your photos (only if you use this feature)",
      location: "United States",
    },
  ],
} as const;

export type Site = typeof site;

type ProcessorId = Site["processors"][number]["id"];

const COPY_FR = {
  tagline: "Comprenez vos vraies marges. Prenez de meilleures décisions.",
  description:
    "Analyse de rentabilité pour les petites boutiques en ligne. Voyez vos vraies marges par produit, la performance de vos publicités et vos coûts d'exploitation en un coup d'œil.",
};

const PROCESSORS_FR: Record<ProcessorId, { purpose: string; location: string }> = {
  database: {
    purpose: "Base de données et authentification",
    location: process.env.NEXT_PUBLIC_DATA_REGION || "Région choisie au déploiement",
  },
  email: {
    purpose: "Envoi des e-mails liés au compte (confirmation, codes de connexion, réinitialisation du mot de passe)",
    location: process.env.NEXT_PUBLIC_EMAIL_REGION || "Union européenne",
  },
  payments: { purpose: "Paiement des abonnements, factures et portail de facturation", location: "Union européenne et États-Unis" },
  hosting: {
    purpose: "Hébergement et diffusion de l'application",
    location: process.env.NEXT_PUBLIC_HOSTING_REGION || "Région choisie au déploiement",
  },
  inbound: {
    purpose: "Réception des e-mails de vente que vous nous transférez",
    location: process.env.NEXT_PUBLIC_INBOUND_EMAIL_REGION || "États-Unis",
  },
  ai: {
    purpose: "Génération d'annonces à partir de vos photos (si vous utilisez la fonction)",
    location: "États-Unis",
  },
};

/** Tagline and description in the interface language. */
export function siteCopy(locale: Locale = "en"): { tagline: string; description: string } {
  return locale === "fr" ? COPY_FR : { tagline: site.tagline, description: site.description };
}

/** Service providers with their purpose and location in the interface language (configured regions are shown as set). */
export function processorsFor(locale: Locale = "en"): { id: ProcessorId; name: string; purpose: string; location: string }[] {
  return site.processors.map((p) => {
    if (locale === "en") return { id: p.id, name: p.name, purpose: p.purpose, location: p.location };
    const fr = PROCESSORS_FR[p.id];
    return { id: p.id, name: p.name, purpose: fr.purpose, location: fr.location };
  });
}
