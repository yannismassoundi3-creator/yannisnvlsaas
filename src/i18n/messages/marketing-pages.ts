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
      metaDescription: (days: number, price: string) =>
        `Start with a ${days}-day free trial, no payment card required. Narixia Pro is ${price} per month.`,
      eyebrow: "Pricing",
      title: "Pricing that fits a small store",
      intro: (days: number) => `Try the core product free for ${days} days. No payment card, no automatic charge.`,
      history: (days: number) => (days >= 365 ? `Last ${Math.round(days / 365)} years` : `Last ${days} days`),
      rows: {
        stores: "Stores",
        rowsPerImport: "Rows per CSV import",
        rowsPerMonth: "Imported rows per month",
        history: "History in dashboards and reports",
        dashboard: "Profit dashboard and insights",
        views: "Products and advertising views",
        calculator: "Profitability calculator",
        manual: "Manual entry and corrections",
        reports: "Downloadable reports (CSV and PDF)",
        exports: "CSV exports of products, orders and costs",
        filters: "Product and campaign filters",
        gdpr: "Full account data export (GDPR)",
      },
      included: "Included",
      notIncluded: "Not included",
      compare: "Compare plans",
      feature: "Feature",
      billingTitle: "Billing questions",
      faq: {
        trialEndsQ: "What happens when my trial ends?",
        trialEndsA:
          "Nothing is charged. Your data stays in place and you can still sign in to export it, change your settings or subscribe. Dashboards, imports and reports are paused until you subscribe to Pro.",
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
        "Définitions claires des ventes brutes, ventes nettes, marge brute, marge sur coûts variables, ROAS, ROAS de rentabilité, bénéfice net et trésorerie, telles qu'utilisées dans Narixia.",
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
      metaDescription: (days: number, price: string) =>
        `Commencez par un essai gratuit de ${days} jours, sans carte bancaire. Narixia Pro coûte ${price} par mois.`,
      eyebrow: "Tarifs",
      title: "Des tarifs adaptés aux petites boutiques",
      intro: (days: number) => `Essayez gratuitement le produit principal pendant ${days} jours. Sans carte bancaire, sans prélèvement automatique.`,
      history: (days: number) => (days >= 365 ? `${Math.round(days / 365)} dernières années` : `${days} derniers jours`),
      rows: {
        stores: "Boutiques",
        rowsPerImport: "Lignes par import CSV",
        rowsPerMonth: "Lignes importées par mois",
        history: "Historique dans les tableaux de bord et rapports",
        dashboard: "Tableau de bord de rentabilité et analyses",
        views: "Vues produits et publicité",
        calculator: "Calculateur de rentabilité",
        manual: "Saisie manuelle et corrections",
        reports: "Rapports téléchargeables (CSV et PDF)",
        exports: "Exports CSV des produits, commandes et coûts",
        filters: "Filtres par produit et par campagne",
        gdpr: "Export complet des données du compte (RGPD)",
      },
      included: "Inclus",
      notIncluded: "Non inclus",
      compare: "Comparer les offres",
      feature: "Fonctionnalité",
      billingTitle: "Questions sur la facturation",
      faq: {
        trialEndsQ: "Que se passe-t-il à la fin de mon essai ?",
        trialEndsA:
          "Rien n'est prélevé. Vos données restent en place et vous pouvez toujours vous connecter pour les exporter, modifier vos paramètres ou vous abonner. Les tableaux de bord, les imports et les rapports sont suspendus jusqu'à votre abonnement à Pro.",
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
        "Calculateur gratuit de marge sur coûts variables pour les boutiques en ligne : saisissez le prix, le coût unitaire, les remises, les remboursements, les frais de paiement, l'expédition et les dépenses publicitaires pour connaître votre marge et votre prix de rentabilité.",
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
