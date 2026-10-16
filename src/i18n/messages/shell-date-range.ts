import { defineMessages } from "@/i18n/messages";

/** Reporting period selector. */
export const shellDateRange = defineMessages({
  en: {
    enterBoth: "Enter both dates.",
    startAfterEnd: "The start date must be before the end date.",
    historyLimit: (date: string) => `Your plan includes data from ${date}.`,
    future: "The end date cannot be in the future.",
    custom: "Custom",
    customRange: "Custom range",
    srPrefix: "Reporting period: ",
    srSuffix: ". Change period",
    period: "Period",
    from: "From",
    to: "To",
    timezone: "Dates use your store's time zone.",
    apply: "Apply",
  },
  fr: {
    enterBoth: "Saisissez les deux dates.",
    startAfterEnd: "La date de début doit précéder la date de fin.",
    historyLimit: (date: string) => `Votre offre inclut les données à partir du ${date}.`,
    future: "La date de fin ne peut pas être dans le futur.",
    custom: "Personnalisée",
    customRange: "Période personnalisée",
    srPrefix: "Période d'analyse : ",
    srSuffix: ". Changer de période",
    period: "Période",
    from: "Du",
    to: "Au",
    timezone: "Les dates suivent le fuseau horaire de votre boutique.",
    apply: "Appliquer",
  },
});
