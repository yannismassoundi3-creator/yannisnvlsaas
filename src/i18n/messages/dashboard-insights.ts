import { defineMessages } from "@/i18n/messages";

/**
 * Rule-based insight texts (src/lib/finance/insights.ts). Wording describes
 * what changed together and never claims one change caused another, in both
 * languages.
 */
export const insightMessages = defineMessages({
  en: {
    /** "a and b and c": reasons and estimated cost types. */
    joinAnd: (items: string[]) => items.join(" and "),
    /** Product names. */
    joinNames: (items: string[]) => items.join(", "),
    negativeContribution: {
      title: "Contribution margin is negative for this period",
      body: (amount: string) =>
        `After product costs and variable costs, the period shows ${amount}. Variable costs exceeded what sales left after product costs.`,
      netRevenue: "Net revenue",
      costs: "Product and variable costs",
    },
    missingCosts: {
      title: (pct: string) => `Cost data is missing for ${pct} of product sales`,
      body: (products: string) => `Contribution margin is overstated until these costs are added${products ? `: ${products}` : ""}.`,
      salesWithoutCost: "Sales without a unit cost",
      linesWithoutCost: "Order lines without a unit cost",
      action: "Add product costs",
    },
    adSpendOutpacing: {
      title: "Advertising spend grew faster than net revenue",
      body: (adGrowth: string, revenueGrowth: string) =>
        `Ad spend changed by ${adGrowth} while net revenue changed by ${revenueGrowth} compared with the previous period. This does not show whether the extra spend drove sales; review campaign results before adjusting budgets.`,
      adSpend: "Ad spend",
      netRevenue: "Net revenue",
      share: "Ad spend share of revenue",
      action: "Review advertising",
    },
    refundRateUp: {
      title: "Refund rate increased",
      body: (current: string, previous: string) =>
        `Refunds were ${current} of gross sales, up from ${previous}. Refunds reduce net sales; product costs of returned items are not reversed automatically.`,
      refunds: "Refunds",
      change: "Change",
      action: "View refunds",
    },
    discountRateUp: {
      title: "Discounts take a larger share of sales",
      body: (current: string, previous: string) => `Discounts were ${current} of gross sales, up from ${previous}.`,
      discounts: "Discounts",
    },
    productMarginDown: {
      title: (name: string, from: string, to: string) => `${name}: contribution margin fell from ${from} to ${to}`,
      reasonAds: "linked advertising spend rose",
      reasonDiscounts: "discounts took a larger share",
      reasonRefunds: "refunds took a larger share",
      bodyWithReasons: (reasons: string) =>
        `In the same period, ${reasons}. These changes coincide with the lower margin; they are not proven causes.`,
      bodyNoReasons: "Compare its costs, prices and discounts with the previous period to understand the change.",
      netRevenue: "Net revenue",
      contributionMargin: "Contribution margin",
      action: "Open product",
    },
    campaignsBelowBreakEven: {
      titleOne: (name: string) => `“${name}” reports ROAS below your break-even point`,
      titleMany: (count: number) => `${count} campaigns report ROAS below your break-even point`,
      body: (breakEven: string) =>
        `Your break-even ROAS is ${breakEven}: below it, advertising costs more than the margin left after product and variable costs. Platform ROAS uses each platform's own attribution and can over- or under-count sales.`,
      campaignValue: (roas: string, spend: string) => `${roas} on ${spend}`,
      spend: "Spend in these campaigns",
      action: "Review campaigns",
    },
    estimatedValues: {
      title: "Some costs are estimates",
      ruleText: (pct: string, fixed: string | null) => ` (${pct}${fixed ? ` + ${fixed}` : ""} per order)`,
      fees: (ruleText: string) => `payment fees${ruleText}`,
      shipping: "shipping costs for orders without a recorded cost",
      body: (parts: string) => `Narixia estimated ${parts} from your store settings. Import actual amounts to replace the estimates.`,
      estimatedFees: "Estimated payment fees",
      estimatedShipping: "Estimated shipping costs",
      action: "Review cost settings",
    },
  },
  fr: {
    /** "a, b et c" */
    joinAnd: (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}` : items.join("")),
    joinNames: (items: string[]) => items.join(", "),
    negativeContribution: {
      title: "Ce qui vous reste est négatif sur cette période",
      body: (amount: string) =>
        `Après le coût d'achat des produits et les coûts variables, la période affiche ${amount}. Les coûts variables ont dépassé ce que les ventes laissaient après le coût d'achat des produits.`,
      netRevenue: "Chiffre d'affaires net",
      costs: "Coût d'achat des produits et coûts variables",
    },
    missingCosts: {
      title: (pct: string) => `Le coût est manquant pour ${pct} des ventes de produits`,
      body: (products: string) => `Ce qui vous reste est surestimé tant que ces coûts ne sont pas renseignés${products ? ` : ${products}` : ""}.`,
      salesWithoutCost: "Ventes sans coût unitaire",
      linesWithoutCost: "Lignes de commande sans coût unitaire",
      action: "Ajouter les coûts des produits",
    },
    adSpendOutpacing: {
      title: "Les dépenses publicitaires ont augmenté plus vite que le chiffre d'affaires net",
      body: (adGrowth: string, revenueGrowth: string) =>
        `Les dépenses publicitaires ont varié de ${adGrowth} et le chiffre d'affaires net de ${revenueGrowth} par rapport à la période précédente. Cela ne montre pas si les dépenses supplémentaires ont généré des ventes : examinez les résultats des campagnes avant d'ajuster les budgets.`,
      adSpend: "Dépenses publicitaires",
      netRevenue: "Chiffre d'affaires net",
      share: "Part des dépenses publicitaires dans le chiffre d'affaires",
      action: "Examiner la publicité",
    },
    refundRateUp: {
      title: "Le taux de remboursement a augmenté",
      body: (current: string, previous: string) =>
        `Les remboursements représentent ${current} des ventes brutes, contre ${previous} auparavant. Les remboursements réduisent les ventes nettes ; le coût des articles retournés n'est pas annulé automatiquement.`,
      refunds: "Remboursements",
      change: "Évolution",
      action: "Voir les remboursements",
    },
    discountRateUp: {
      title: "Les remises représentent une part plus importante des ventes",
      body: (current: string, previous: string) => `Les remises représentent ${current} des ventes brutes, contre ${previous} auparavant.`,
      discounts: "Remises",
    },
    productMarginDown: {
      title: (name: string, from: string, to: string) => `${name} : ce qui vous reste est passé de ${from} à ${to} de ses ventes`,
      reasonAds: "les dépenses publicitaires liées ont augmenté",
      reasonDiscounts: "les remises ont pris une part plus importante",
      reasonRefunds: "les remboursements ont pris une part plus importante",
      bodyWithReasons: (reasons: string) =>
        `Sur la même période, ${reasons}. Ces évolutions coïncident avec la baisse de la marge ; ce n'est pas une cause prouvée.`,
      bodyNoReasons: "Comparez ses coûts, ses prix et ses remises avec la période précédente pour comprendre cette évolution.",
      netRevenue: "Chiffre d'affaires net",
      contributionMargin: "Ce qui vous reste",
      action: "Ouvrir le produit",
    },
    campaignsBelowBreakEven: {
      titleOne: (name: string) => `« ${name} » affiche un ROAS inférieur à votre seuil de rentabilité`,
      titleMany: (count: number) => `${count} campagnes affichent un ROAS inférieur à votre seuil de rentabilité`,
      body: (breakEven: string) =>
        `Le seuil de rentabilité de votre pub (ROAS) est de ${breakEven} : en dessous, la publicité coûte plus que la marge que les ventes vous laissent après le coût d'achat des produits et les coûts variables. Le ROAS annoncé par les plateformes repose sur leurs propres règles d'attribution et peut surestimer ou sous-estimer les ventes.`,
      campaignValue: (roas: string, spend: string) => `${roas} pour ${spend}`,
      spend: "Dépenses dans ces campagnes",
      action: "Examiner les campagnes",
    },
    estimatedValues: {
      title: "Certains coûts sont estimés",
      ruleText: (pct: string, fixed: string | null) => ` (${pct}${fixed ? ` + ${fixed}` : ""} par commande)`,
      fees: (ruleText: string) => `les frais de paiement${ruleText}`,
      shipping: "les coûts d'expédition des commandes sans coût enregistré",
      body: (parts: string) =>
        `Narixia a estimé ${parts} à partir des paramètres de votre boutique. Importez les montants réels pour remplacer les estimations.`,
      estimatedFees: "Frais de paiement estimés",
      estimatedShipping: "Coûts d'expédition estimés",
      action: "Vérifier les paramètres de coûts",
    },
  },
});
