import { defineMessages, plural } from "@/i18n/messages";

/** Texts of the dashboard components (src/components/dashboard). */
export const dashboardMessages = defineMessages({
  en: {
    campaignTable: {
      caption: "Campaign performance",
      campaign: "Campaign",
      spend: "Spend",
      clicks: "Clicks",
      conversionValue: "Platform conversion value",
      platformRoas: "Platform ROAS",
      promotes: (name: string) => `· Promotes ${name}`,
      belowBreakEven: "Below break-even",
    },
    dataNotices: {
      heading: "Data quality",
      cogsTitle: "Some sales have no product cost",
      cogsBody: (lines: string, n: number, amount: string, pct: string) =>
        `${lines} order ${n === 1 ? "line" : "lines"} (${amount}, ${pct} of product sales) ${n === 1 ? "has" : "have"} no unit cost. ${n === 1 ? "Its" : "Their"} cost is left out rather than guessed, so gross profit and contribution margin are overstated until you add it.`,
      cogsAction: "Add product costs",
      shippingTitle: "Shipping costs are incomplete",
      shippingBody: (orders: string, n: number) =>
        `${orders} ${n === 1 ? "order has" : "orders have"} no recorded shipping cost and no default applies, so shipping costs are understated.`,
      shippingAction: "Set a default shipping cost",
      feesTitle: "Payment fees are incomplete",
      feesBody: (orders: string, n: number) =>
        `${orders} ${n === 1 ? "order has" : "orders have"} no recorded payment fee and no fee rule applies, so payment fees are understated.`,
      feesAction: "Set a fee rule",
      perOrder: (amount: string) => `${amount} per order`,
      estimatedFees: (amount: string, rule: string) => `payment fees of ${amount}${rule ? ` (rule: ${rule})` : ""}`,
      estimatedShipping: (amount: string, fallback: string | null) => `shipping costs of ${amount}${fallback ? ` (default: ${fallback} per order)` : ""}`,
      estimatesTitle: "Includes estimates",
      estimatesBody: (parts: string[]) =>
        `For orders without recorded values, this period includes estimated ${parts.join(" and ")}. Record actual values through imports to replace them.`,
      estimatesAction: "Review rules",
    },
    insightList: {
      attention: "Needs attention",
      info: "Information",
    },
    kpiTile: {
      noComparison: "No comparison available",
      up: "Up",
      down: "Down",
      unchanged: "Unchanged",
    },
    productMarginBars: {
      title: "Contribution margin by product",
      description: "After product costs, allocated shipping and fees, and linked campaigns.",
      product: "Product",
      bar: "Bar",
      margin: "Margin",
      marginRate: "Margin %",
      costMissing: "Cost missing",
    },
    profitBreakdown: {
      title: "Profit breakdown",
      exclVat: "Amounts exclude VAT / sales tax",
      caption: "Profit breakdown from gross sales to operating profit",
      line: "Line",
      amount: "Amount",
      share: "Share of net revenue",
      badge: { incomplete: "Incomplete", missing: "Missing", estimated: "Includes estimates" },
      rows: {
        grossSales: "Gross sales",
        discounts: "Discounts",
        refunds: "Refunds",
        netSales: "Net sales",
        shippingCharged: "Shipping charged",
        netRevenue: "Net revenue",
        cogs: "Cost of goods sold",
        grossProfit: "Gross profit",
        shippingCosts: "Shipping & fulfilment",
        transactionFees: "Payment fees",
        adSpend: "Advertising",
        otherVariableCosts: "Other variable costs",
        contributionMargin: "Contribution margin",
        fixedCosts: "Fixed costs",
        operatingProfit: "Operating profit (estimate)",
      },
      footnote:
        "Percentages are shares of net revenue (net sales plus shipping charged). Contribution margin is not net profit: fixed costs, taxes on profit, interest and depreciation are not included above it.",
    },
    setupChecklist: {
      heading: "Complete your margins",
      progress: (done: number, total: number) => `${done} of ${total} steps done`,
      done: "Done:",
      todo: "To do:",
      optional: "Optional",
      orders: {
        title: "Import your orders",
        description: "Upload an order export from Shopify or any platform. Narixia reads the file in your browser and only sends the columns you map.",
        action: "Import orders",
      },
      costs: {
        title: "Add product costs",
        descriptionEmpty: "Products are created from your orders, or you can import a product list with unit costs.",
        descriptionMissing: (missing: number, total: number) => `${missing} of ${total} products have no unit cost yet. Margins stay incomplete until they do.`,
        actionImport: "Import products",
        actionAdd: "Add costs",
      },
      rules: {
        title: "Set payment fee and shipping rules",
        description: "Used to estimate costs for orders without recorded values. Estimates are always labelled as such.",
        action: "Open cost settings",
      },
      ads: {
        title: "Add advertising spend",
        description: "Import daily spend from Meta, Google or TikTok exports, or enter it manually.",
        action: "Add ad spend",
      },
      expenses: {
        title: "Record other costs",
        description: "Packaging, marketplace commissions or subscriptions, to complete contribution margin and the operating estimate.",
        action: "Add expenses",
      },
    },
  },
  fr: {
    campaignTable: {
      caption: "Performance des campagnes",
      campaign: "Campagne",
      spend: "Dépenses",
      clicks: "Clics",
      conversionValue: "Valeur de conversion (plateforme)",
      platformRoas: "ROAS annoncé par la plateforme",
      promotes: (name: string) => `· Produit promu : ${name}`,
      belowBreakEven: "Sous le seuil de rentabilité",
    },
    dataNotices: {
      heading: "Qualité des données",
      cogsTitle: "Certaines ventes n'ont pas de coût d'achat",
      cogsBody: (lines: string, n: number, amount: string, pct: string) =>
        `${lines} ${plural("fr", n, "ligne de commande", "lignes de commande")} (${amount}, ${pct} des ventes de produits) ${plural("fr", n, "n'a", "n'ont")} pas de coût unitaire. ${plural("fr", n, "Son", "Leur")} coût est exclu plutôt que deviné : la marge brute et ce qui vous reste (marge sur coûts variables) sont donc surestimés tant que vous ne l'avez pas ajouté.`,
      cogsAction: "Ajouter les coûts des produits",
      shippingTitle: "Les coûts d'expédition sont incomplets",
      shippingBody: (orders: string, n: number) =>
        `${orders} ${plural("fr", n, "commande n'a", "commandes n'ont")} aucun coût d'expédition enregistré et aucune valeur par défaut ne s'applique : les coûts d'expédition sont donc sous-estimés.`,
      shippingAction: "Définir un coût d'expédition par défaut",
      feesTitle: "Les frais de paiement sont incomplets",
      feesBody: (orders: string, n: number) =>
        `${orders} ${plural("fr", n, "commande n'a", "commandes n'ont")} aucun frais de paiement enregistré et aucune règle de frais ne s'applique : les frais de paiement sont donc sous-estimés.`,
      feesAction: "Définir une règle de frais",
      perOrder: (amount: string) => `${amount} par commande`,
      estimatedFees: (amount: string, rule: string) => `des frais de paiement estimés à ${amount}${rule ? ` (règle : ${rule})` : ""}`,
      estimatedShipping: (amount: string, fallback: string | null) =>
        `des coûts d'expédition estimés à ${amount}${fallback ? ` (par défaut : ${fallback} par commande)` : ""}`,
      estimatesTitle: "Inclut des estimations",
      estimatesBody: (parts: string[]) =>
        `Pour les commandes sans valeurs enregistrées, cette période inclut ${parts.join(" et ")}. Enregistrez les valeurs réelles via les imports pour les remplacer.`,
      estimatesAction: "Vérifier les règles",
    },
    insightList: {
      attention: "À surveiller",
      info: "Information",
    },
    kpiTile: {
      noComparison: "Aucune comparaison disponible",
      up: "Hausse",
      down: "Baisse",
      unchanged: "Stable",
    },
    productMarginBars: {
      title: "Ce qui vous reste par produit",
      description: "Après coût d'achat des produits, expédition et frais répartis, et campagnes liées.",
      product: "Produit",
      bar: "Barre",
      margin: "Ce qui vous reste",
      marginRate: "En %",
      costMissing: "Coût manquant",
    },
    profitBreakdown: {
      title: "Décomposition du résultat",
      exclVat: "Montants HT",
      caption: "Décomposition du résultat, des ventes brutes au résultat d'exploitation",
      line: "Ligne",
      amount: "Montant",
      share: "Part du chiffre d'affaires net",
      badge: { incomplete: "Incomplet", missing: "Manquant", estimated: "Inclut des estimations" },
      rows: {
        grossSales: "Ventes brutes",
        discounts: "Remises",
        refunds: "Remboursements",
        netSales: "Ventes nettes",
        shippingCharged: "Frais de port facturés",
        netRevenue: "Chiffre d'affaires net",
        cogs: "Coût d'achat des produits",
        grossProfit: "Marge brute",
        shippingCosts: "Expédition et logistique",
        transactionFees: "Frais de paiement",
        adSpend: "Publicité",
        otherVariableCosts: "Autres coûts variables",
        contributionMargin: "Ce qui vous reste",
        fixedCosts: "Coûts fixes",
        operatingProfit: "Résultat d'exploitation (estimation)",
      },
      footnote:
        "Les pourcentages sont des parts du chiffre d'affaires net (ventes nettes plus frais de port facturés). « Ce qui vous reste » (marge sur coûts variables) n'est pas votre bénéfice net : les coûts fixes, l'impôt sur les bénéfices, les intérêts et les amortissements n'y sont pas encore déduits.",
    },
    setupChecklist: {
      heading: "Complétez vos marges",
      progress: (done: number, total: number) => `${done} ${plural("fr", done, "étape terminée", "étapes terminées")} sur ${total}`,
      done: "Terminé :",
      todo: "À faire :",
      optional: "Facultatif",
      orders: {
        title: "Importez vos commandes",
        description:
          "Importez un export de commandes depuis Shopify ou toute autre plateforme. Narixia lit le fichier dans votre navigateur et n'envoie que les colonnes que vous associez.",
        action: "Importer des commandes",
      },
      costs: {
        title: "Ajoutez les coûts des produits",
        descriptionEmpty: "Les produits sont créés à partir de vos commandes, ou vous pouvez importer une liste de produits avec leurs coûts unitaires.",
        descriptionMissing: (missing: number, total: number) =>
          `${missing} ${plural("fr", missing, "produit", "produits")} sur ${total} ${plural("fr", missing, "n'a", "n'ont")} pas encore de coût unitaire. Les marges restent incomplètes tant que ce n'est pas fait.`,
        actionImport: "Importer des produits",
        actionAdd: "Ajouter les coûts",
      },
      rules: {
        title: "Définissez les règles de frais de paiement et d'expédition",
        description: "Elles servent à estimer les coûts des commandes sans valeurs enregistrées. Les estimations sont toujours signalées comme telles.",
        action: "Ouvrir les paramètres de coûts",
      },
      ads: {
        title: "Ajoutez les dépenses publicitaires",
        description: "Importez les dépenses quotidiennes depuis les exports Meta, Google ou TikTok, ou saisissez-les manuellement.",
        action: "Ajouter des dépenses publicitaires",
      },
      expenses: {
        title: "Enregistrez les autres coûts",
        description:
          "Emballage, commissions des places de marché ou abonnements, pour que ce qui vous reste et l'estimation du résultat d'exploitation soient complets.",
        action: "Ajouter des dépenses",
      },
    },
  },
});
