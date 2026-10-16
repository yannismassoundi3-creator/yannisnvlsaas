import { defineMessages } from "@/i18n/messages";

type Granularity = "day" | "week" | "month";

const EN_GRANULARITY: Record<Granularity, string> = { day: "Daily", week: "Weekly", month: "Monthly" };
const FR_TOTALS: Record<Granularity, string> = { day: "quotidiens", week: "hebdomadaires", month: "mensuels" };
const FR_CAPTION: Record<Granularity, string> = { day: "par jour", week: "par semaine", month: "par mois" };

/** Chart frame, legends, tooltips and table views (src/components/charts). */
export const chartMessages = defineMessages({
  en: {
    viewAsTable: "View as table",
    viewAsChart: "View as chart",
    legend: "Legend",
    date: "Date",
    period: "Period",
    total: "Total",
    partialSuffix: " (partial)",
    partialBucket: (granularity: Granularity) => ` (partial ${granularity})`,
    lighterBars: (granularity: "week" | "month") => ` Lighter bars are partial ${granularity === "week" ? "weeks" : "months"}.`,
    lighterBarsCut: (granularity: "week" | "month") => ` Lighter bars are partial ${granularity === "week" ? "weeks" : "months"}, cut short by the selected dates.`,
    netRevenue: "Net revenue",
    contributionMargin: "Contribution margin",
    marginRate: "Margin %",
    revenueMarginTitle: "Net revenue and contribution margin",
    revenueMarginDescription: (granularity: Granularity) =>
      `${EN_GRANULARITY[granularity]} totals. Contribution margin is net revenue minus product and variable costs.`,
    revenueMarginCaption: (granularity: Granularity) => `${EN_GRANULARITY[granularity]} net revenue and contribution margin`,
  },
  fr: {
    viewAsTable: "Afficher en tableau",
    viewAsChart: "Afficher en graphique",
    legend: "Légende",
    date: "Date",
    period: "Période",
    total: "Total",
    partialSuffix: " (partiel)",
    partialBucket: (granularity: Granularity) =>
      granularity === "day" ? " (jour partiel)" : granularity === "week" ? " (semaine partielle)" : " (mois partiel)",
    lighterBars: (granularity: "week" | "month") =>
      granularity === "week" ? " Les barres plus claires sont des semaines partielles." : " Les barres plus claires sont des mois partiels.",
    lighterBarsCut: (granularity: "week" | "month") =>
      granularity === "week"
        ? " Les barres plus claires sont des semaines partielles, tronquées par les dates choisies."
        : " Les barres plus claires sont des mois partiels, tronqués par les dates choisies.",
    netRevenue: "Chiffre d'affaires net",
    contributionMargin: "Marge sur coûts variables",
    marginRate: "Marge %",
    revenueMarginTitle: "Chiffre d'affaires net et marge sur coûts variables",
    revenueMarginDescription: (granularity: Granularity) =>
      `Totaux ${FR_TOTALS[granularity]}. La marge sur coûts variables correspond au chiffre d'affaires net moins le coût des produits et les coûts variables.`,
    revenueMarginCaption: (granularity: Granularity) => `Chiffre d'affaires net et marge sur coûts variables ${FR_CAPTION[granularity]}`,
  },
});
