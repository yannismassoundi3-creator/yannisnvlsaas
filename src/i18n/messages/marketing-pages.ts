import { defineMessages } from "@/i18n/messages";

/** Contact, glossary, pricing and public calculator pages. */
export const marketingPages = defineMessages({
  en: {
    contact: {
      metaTitle: "Contact",
      metaDescription: "How to reach the Narixia team.",
      eyebrow: "Contact",
      title: "Talk to us",
      intro: "Questions about Narixia, your account or your data. We read every message.",
      general: "General questions",
      supportMissing: "Support email not configured yet",
      customer: "Already a customer?",
      customerUse: "Use",
      helpMenu: "Help & feedback",
      customerRest: "in the app menu. Your message reaches us with your account context, without sharing financial data.",
      privacy: "Privacy requests",
      privacySee: "See the",
      privacyLink: "privacy policy",
    },
    glossary: {
      metaTitle: "E-commerce profitability glossary",
      metaDescription:
        "Plain-language definitions of gross sales, net sales, gross profit, contribution margin, ROAS, break-even ROAS, net profit and cash flow, as used in Narixia.",
      eyebrow: "Glossary",
      title: "Profitability terms, defined",
      intro: "The exact definitions Narixia uses in every dashboard, report and export. Amounts always exclude VAT and sales tax.",
      sections: "Glossary sections",
      groups: {
        revenue: "Revenue",
        costs: "Costs",
        margins: "Margins",
        advertising: "Advertising",
        notCalculated: "What Narixia does not calculate",
      },
      tryFormulas: "Want to try the formulas?",
      openCalculator: "Open the profit margin calculator",
    },
    pricing: {
      metaTitle: "Pricing",
      metaDescription: (days: number, resellerPrice: string, proPrice: string, limit: number) =>
        `Free for resellers with up to ${limit} items in stock. Reseller plan at ${resellerPrice} per month, Pro for online stores at ${proPrice} per month, each with a ${days}-day free trial, no payment card required.`,
      eyebrow: "Pricing",
      title: "Pricing for resellers and small stores",
      intro: (days: number, limit: number) =>
        `Every account starts with a ${days}-day free trial of the whole product, without a payment card and without any automatic charge. Resellers then keep a free plan with up to ${limit} items in stock.`,
      history: (days: number) => (days >= 365 ? `Last ${Math.round(days / 365)} years` : `Last ${days} days`),
      rows: {
        audience: "For",
        stock: "Items in stock",
        resellerMode: "Reseller mode: items, sales in two taps, margin per platform",
        photos: "Photos enhanced on your phone, thumbnails",
        ai: "Listings written by AI from your photos",
        email: "Sales recorded from forwarded emails",
        ecommerce: "CSV imports of orders, products and ads",
        stores: "Stores",
        rowsPerImport: "Rows per CSV import",
        history: "History in dashboards and reports",
        reports: "Downloadable reports (CSV and PDF)",
        exports: "CSV exports of products, orders and costs",
        filters: "Product and campaign filters",
        gdpr: "Full account data export (GDPR)",
      },
      cells: {
        resellers: "Resellers",
        stores: "Online stores",
        unlimited: "Unlimited",
        soon: "Coming soon",
        perMonth: (n: number) => `${n} per month`,
      },
      trialNote: (days: number) => `Every plan starts with a ${days}-day free trial of everything, without a payment card.`,
      included: "Included",
      notIncluded: "Not included",
      compare: "Compare plans",
      feature: "Feature",
      billingTitle: "Billing questions",
      faq: {
        chooseQ: "Which plan should I choose?",
        chooseA: (limit: number) =>
          `Free if you resell a few items on Vinted, Leboncoin or eBay: up to ${limit} items in stock at a time, with your full sales history. Reseller when your stock grows, or for listings written by AI and sales received by email. Pro if you run an online store (Shopify, WooCommerce…) and import orders, costs and advertising.`,
        limitQ: (limit: number) => `What happens at ${limit} items in stock on the free plan?`,
        limitA: (limit: number) =>
          `You can keep recording sales, editing and deleting items, and exporting your data. Adding a new item is refused until an item is sold or deleted, or until you choose the Reseller plan. Sold items never count toward the ${limit}.`,
        trialEndsQ: "What happens when my trial ends?",
        trialEndsA: (limit: number) =>
          `Nothing is charged. In reseller mode, you move to the free plan (up to ${limit} items in stock). For an online store, dashboards, imports and reports are paused until you subscribe to Pro. In every case your data stays in place, and you can still sign in to export it, change your settings or subscribe.`,
        duringTrialQ: "Can I subscribe during my trial?",
        duringTrialA:
          "Yes. If more than two days of your trial remain, your first payment is taken when the trial ends; otherwise billing starts immediately. The checkout page shows the exact date before you confirm.",
        cancelQ: "How do I cancel?",
        cancelA:
          "From the billing page, open the billing portal and cancel. Your subscription stays active until the end of the period you have paid for, then does not renew.",
        failedQ: "What if a payment fails?",
        failedA: (days: number) =>
          `We keep your access for ${days} days while the payment provider retries the payment and you update your payment method. You are notified in the app.`,
        vatQ: "Do prices include VAT?",
        vatA: "Prices are shown excluding VAT. Depending on your country and whether you provide a VAT number, VAT may be added at checkout. Your invoice shows the breakdown.",
        processorQ: "Who processes payments?",
        processorA: "Payments are processed by Stripe. Narixia never receives or stores your full card details.",
      },
    },
    calculator: {
      metaTitle: "Profit margin calculator for e-commerce",
      metaDescription:
        "Free contribution margin calculator for online stores: enter price, unit cost, discounts, refunds, payment fees, shipping and ad spend to see your margin and break-even price.",
      eyebrow: "Free tool",
      title: "Profit margin calculator",
      intro:
        "See what a product really earns after discounts, refunds, payment fees, shipping and advertising, and the lowest price that still breaks even. Every formula is shown below the result.",
      ctaTitle: "Run this on your real store data",
      ctaText: "Import your orders and costs to see the margin of every product, every week.",
      ctaButton: "Start your free trial",
    },
  },
  fr: {
    contact: {
      metaTitle: "Contact",
      metaDescription: "Comment joindre l'équipe Narixia.",
      eyebrow: "Contact",
      title: "Parlons-en",
      intro: "Une question sur Narixia, votre compte ou vos données ? Nous lisons chaque message.",
      general: "Questions générales",
      supportMissing: "E-mail d'assistance pas encore configuré",
      customer: "Déjà client ?",
      customerUse: "Utilisez",
      helpMenu: "Aide et suggestions",
      customerRest:
        "dans le menu de l'application. Votre message nous parvient avec le contexte de votre compte, sans partager de données financières.",
      privacy: "Demandes relatives à la vie privée",
      privacySee: "Consultez la",
      privacyLink: "politique de confidentialité",
    },
    glossary: {
      metaTitle: "Glossaire de la rentabilité e-commerce",
      metaDescription:
        "Définitions claires des ventes brutes, ventes nettes, marge brute, marge sur coûts variables (ce qui vous reste), ROAS, seuil de rentabilité de la pub, bénéfice net et trésorerie, telles qu'utilisées dans Narixia.",
      eyebrow: "Glossaire",
      title: "Les termes de la rentabilité, définis",
      intro: "Les définitions exactes utilisées par Narixia dans chaque tableau de bord, rapport et export. Les montants s'entendent toujours hors TVA et hors taxes.",
      sections: "Sections du glossaire",
      groups: {
        revenue: "Chiffre d'affaires",
        costs: "Coûts",
        margins: "Marges",
        advertising: "Publicité",
        notCalculated: "Ce que Narixia ne calcule pas",
      },
      tryFormulas: "Envie d'essayer les formules ?",
      openCalculator: "Ouvrir le calculateur de marge",
    },
    pricing: {
      metaTitle: "Tarifs",
      metaDescription: (days: number, resellerPrice: string, proPrice: string, limit: number) =>
        `Gratuit pour les revendeurs jusqu'à ${limit} articles en stock. Offre Revendeur à ${resellerPrice} par mois, Pro pour les boutiques en ligne à ${proPrice} par mois, chacune avec ${days} jours d'essai gratuit, sans carte bancaire.`,
      eyebrow: "Tarifs",
      title: "Des tarifs pour les revendeurs et les petites boutiques",
      intro: (days: number, limit: number) =>
        `Chaque compte commence par ${days} jours d'essai gratuit de tout le produit, sans carte bancaire et sans prélèvement automatique. Les revendeurs gardent ensuite une offre gratuite jusqu'à ${limit} articles en stock.`,
      history: (days: number) => (days >= 365 ? `${Math.round(days / 365)} dernières années` : `${days} derniers jours`),
      rows: {
        audience: "Pour qui",
        stock: "Articles en stock",
        resellerMode: "Mode revendeur : articles, ventes en deux gestes, marge par plateforme",
        photos: "Photos améliorées sur votre téléphone, miniatures",
        ai: "Annonces générées par IA à partir de vos photos",
        email: "Ventes enregistrées depuis vos e-mails transférés",
        ecommerce: "Imports CSV des commandes, produits et publicités",
        stores: "Boutiques",
        rowsPerImport: "Lignes par import CSV",
        history: "Historique dans les tableaux de bord et rapports",
        reports: "Rapports téléchargeables (CSV et PDF)",
        exports: "Exports CSV des produits, commandes et coûts",
        filters: "Filtres par produit et par campagne",
        gdpr: "Export complet des données du compte (RGPD)",
      },
      cells: {
        resellers: "Revendeurs",
        stores: "Boutiques en ligne",
        unlimited: "Illimité",
        soon: "Bientôt",
        perMonth: (n: number) => `${n} par mois`,
      },
      trialNote: (days: number) => `Chaque offre commence par ${days} jours d'essai gratuit de tout le produit, sans carte bancaire.`,
      included: "Inclus",
      notIncluded: "Non inclus",
      compare: "Comparer les offres",
      feature: "Fonctionnalité",
      billingTitle: "Questions sur la facturation",
      faq: {
        chooseQ: "Quelle offre choisir ?",
        chooseA: (limit: number) =>
          `Gratuit si vous revendez quelques articles sur Vinted, Leboncoin ou eBay : jusqu'à ${limit} articles en stock à la fois, avec tout votre historique de ventes. Revendeur quand votre stock grandit, ou pour les annonces générées par IA et les ventes reçues par e-mail. Pro si vous gérez une boutique en ligne (Shopify, WooCommerce…) et importez vos commandes, vos coûts et votre publicité.`,
        limitQ: (limit: number) => `Que se passe-t-il à ${limit} articles en stock avec l'offre gratuite ?`,
        limitA: (limit: number) =>
          `Vous pouvez toujours enregistrer vos ventes, modifier ou supprimer vos articles et exporter vos données. L'ajout d'un nouvel article est refusé jusqu'à ce qu'un article soit vendu ou supprimé, ou que vous choisissiez l'offre Revendeur. Les articles vendus ne comptent jamais dans les ${limit}.`,
        trialEndsQ: "Que se passe-t-il à la fin de mon essai ?",
        trialEndsA: (limit: number) =>
          `Rien n'est prélevé. En mode revendeur, vous passez à l'offre gratuite (jusqu'à ${limit} articles en stock). Pour une boutique en ligne, les tableaux de bord, les imports et les rapports sont suspendus jusqu'à votre abonnement à Pro. Dans tous les cas, vos données restent en place et vous pouvez toujours vous connecter pour les exporter, modifier vos paramètres ou vous abonner.`,
        duringTrialQ: "Puis-je m'abonner pendant mon essai ?",
        duringTrialA:
          "Oui. S'il reste plus de deux jours d'essai, votre premier paiement est prélevé à la fin de l'essai ; sinon, la facturation commence immédiatement. La page de paiement indique la date exacte avant que vous ne confirmiez.",
        cancelQ: "Comment résilier ?",
        cancelA:
          "Depuis la page de facturation, ouvrez le portail de facturation et résiliez. Votre abonnement reste actif jusqu'à la fin de la période payée, puis n'est pas renouvelé.",
        failedQ: "Que se passe-t-il si un paiement échoue ?",
        failedA: (days: number) =>
          `Nous conservons votre accès pendant ${days} jours, le temps que le prestataire de paiement relance le paiement et que vous mettiez à jour votre moyen de paiement. Vous êtes prévenu dans l'application.`,
        vatQ: "Les prix incluent-ils la TVA ?",
        vatA: "Les prix sont affichés HT. Selon votre pays et selon que vous fournissez ou non un numéro de TVA, la TVA peut être ajoutée lors du paiement. Votre facture en présente le détail.",
        processorQ: "Qui traite les paiements ?",
        processorA: "Les paiements sont traités par Stripe. Narixia ne reçoit ni ne stocke jamais vos coordonnées bancaires complètes.",
      },
    },
    calculator: {
      metaTitle: "Calculateur de marge pour l'e-commerce",
      metaDescription:
        "Calculateur de marge gratuit pour les boutiques en ligne : saisissez le prix, le coût unitaire, les remises, les remboursements, les frais de paiement, l'expédition et les dépenses publicitaires pour savoir ce qui vous reste (marge sur coûts variables) et votre prix de rentabilité.",
      eyebrow: "Outil gratuit",
      title: "Calculateur de marge",
      intro:
        "Découvrez ce qu'un produit rapporte vraiment après remises, remboursements, frais de paiement, expédition et publicité, ainsi que le prix le plus bas qui reste rentable. Chaque formule est affichée sous le résultat.",
      ctaTitle: "Appliquez-le aux vraies données de votre boutique",
      ctaText: "Importez vos commandes et vos coûts pour voir la marge de chaque produit, chaque semaine.",
      ctaButton: "Commencer l'essai gratuit",
    },
  },
});
