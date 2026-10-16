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
  legalLastUpdated: "2026-10-16",
} as const;

export type Site = typeof site;
