import { defineMessages, plural } from "@/i18n/messages";

/** Status banners above application pages, the paused-analytics notice and the sample store button. */
export const shellBanners = defineMessages({
  en: {
    trialEndsToday: "Your free trial ends today.",
    trialDaysLeft: (days: number, until: string | null) =>
      `Free trial: ${days} ${plural("en", days, "day", "days")} left${until ? `, until ${until}` : ""}.`,
    choosePlan: "Choose a plan",
    paymentFailed: (before: string | null) =>
      `Your last payment failed. Update your payment method${before ? ` before ${before}` : ""} to keep full access.`,
    updatePayment: "Update payment",
    trialEnded: "Your trial has ended. Your data is safe and can be exported; dashboards and imports are paused.",
    subscribe: "Subscribe to Pro",
    demoNotice: "You are viewing the sample store. Every figure here is fictional demo data.",
    switchToReal: (store: string) => `Switch to ${store} from the store menu.`,
    paused: {
      defaultWhat: "Dashboards and reports",
      title: (what: string) => `${what} are paused`,
      description:
        "Your free trial or subscription has ended. Your data is kept: you can still export it or delete it from Settings. Subscribe to Pro to pick up where you left off.",
      seePlans: "See plans",
      exportOrDelete: "Export or delete data",
    },
    sample: {
      open: "Open the sample store",
      create: "Create a sample store",
      failed: "Could not open the sample store.",
    },
  },
  fr: {
    trialEndsToday: "Votre essai gratuit se termine aujourd'hui.",
    trialDaysLeft: (days: number, until: string | null) =>
      `Essai gratuit : ${days} ${plural("fr", days, "jour restant", "jours restants")}${until ? `, jusqu'au ${until}` : ""}.`,
    choosePlan: "Choisir une offre",
    paymentFailed: (before: string | null) =>
      `Votre dernier paiement a échoué. Mettez à jour votre moyen de paiement${before ? ` avant le ${before}` : ""} pour conserver un accès complet.`,
    updatePayment: "Mettre à jour le paiement",
    trialEnded:
      "Votre essai gratuit est terminé. Vos données sont en sécurité et peuvent être exportées ; les tableaux de bord et les imports sont en pause.",
    subscribe: "S'abonner à Pro",
    demoNotice: "Vous consultez la boutique exemple. Tous les chiffres affichés ici sont des données de démonstration fictives.",
    switchToReal: (store: string) => `Passez à ${store} depuis le menu des boutiques.`,
    paused: {
      defaultWhat: "Tableaux de bord et rapports",
      title: (what: string) => `${what} en pause`,
      description:
        "Votre essai gratuit ou votre abonnement est terminé. Vos données sont conservées : vous pouvez toujours les exporter ou les supprimer depuis les paramètres. Abonnez-vous à Pro pour reprendre là où vous vous étiez arrêté.",
      seePlans: "Voir les offres",
      exportOrDelete: "Exporter ou supprimer les données",
    },
    sample: {
      open: "Ouvrir la boutique exemple",
      create: "Créer une boutique exemple",
      failed: "Impossible d'ouvrir la boutique exemple.",
    },
  },
});
