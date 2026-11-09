import { defineMessages, plural } from "@/i18n/messages";

/**
 * Free plan and paid-plan upsells shown inside the application (reseller
 * mode): the stock limit, AI listings and sales received by email.
 */
export const planMessages = defineMessages({
  en: {
    seePlans: "See plans",
    upgrade: "Upgrade to Reseller",
    freeStockLimit: (limit: number) => `You have reached ${limit} items in stock on the free plan. Upgrade to the Reseller plan for unlimited stock.`,
    freeUsage: (count: number, limit: number) => `Free plan: ${count} of ${limit} ${plural("en", limit, "item", "items")} in stock.`,
    freeUsageHint: "Sold items do not count, and your sales history stays visible without limit.",
    freeBanner: (limit: number) => `Free plan: up to ${limit} items in stock. AI listings and sales received by email come with the Reseller plan.`,
    aiTitle: "Included in the Reseller and Pro plans",
    aiText: "Writing listings with AI from your photos is part of the paid plans. Your photos can still be enhanced and downloaded.",
    inboundTitle: "Included in the Reseller and Pro plans",
    inboundText: "Receiving your sales by email is part of the paid plans. Meanwhile, record your sales with “Sold!”.",
    ecommerceRequiresPro: "The e-commerce mode needs the Pro plan. Your store stays in reseller mode.",
  },
  fr: {
    seePlans: "Voir les offres",
    upgrade: "Passer à l'offre Revendeur",
    freeStockLimit: (limit: number) => `Vous avez atteint ${limit} articles en stock avec l'offre gratuite. Passez à l'offre Revendeur pour un stock illimité.`,
    freeUsage: (count: number, limit: number) => `Offre gratuite : ${count} ${plural("fr", count, "article", "articles")} en stock sur ${limit}.`,
    freeUsageHint: "Les articles vendus ne comptent pas, et votre historique de ventes reste visible sans limite.",
    freeBanner: (limit: number) =>
      `Offre gratuite : jusqu'à ${limit} articles en stock. Les annonces IA et les ventes reçues par e-mail sont incluses dans l'offre Revendeur.`,
    aiTitle: "Inclus dans les offres Revendeur et Pro",
    aiText: "La rédaction d'annonces par IA à partir de vos photos fait partie des offres payantes. Vos photos peuvent toujours être améliorées et téléchargées.",
    inboundTitle: "Inclus dans les offres Revendeur et Pro",
    inboundText: "La réception de vos ventes par e-mail fait partie des offres payantes. En attendant, enregistrez vos ventes avec « Vendu ! ».",
    ecommerceRequiresPro: "Le mode e-commerce nécessite l'offre Pro. Votre boutique reste en mode revendeur.",
  },
});
