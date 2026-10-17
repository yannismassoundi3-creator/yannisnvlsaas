import type { Metadata } from "next";
import { localizedPath, type Locale } from "@/i18n/config";
import { defineMessages } from "@/i18n/messages";

/** Canonical URL and language alternates of a public page, for generateMetadata. */
export function publicAlternates(path: string, locale: Locale): NonNullable<Metadata["alternates"]> {
  return {
    canonical: localizedPath(path, locale),
    languages: { en: localizedPath(path, "en"), fr: localizedPath(path, "fr"), "x-default": localizedPath(path, "en") },
  };
}

/** Shared chrome of the public site: layout, header, footer, notices, demo labels, pricing cards, FAQ and 404. */
export const marketingCommon = defineMessages({
  en: {
    skipToContent: "Skip to content",
    header: {
      nav: { product: "Product", features: "Features", pricing: "Pricing", faq: "FAQ" },
      home: "Narixia home",
      mainNav: "Main",
      mobileNav: "Mobile",
      signIn: "Sign in",
      startTrial: "Start free trial",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      menu: "Menu",
      siteNavigation: "Site navigation",
    },
    footer: {
      product: "Product",
      company: "Company",
      legal: "Legal",
      features: "Features",
      pricing: "Pricing",
      calculator: "Margin calculator",
      glossary: "Metric glossary",
      contact: "Contact",
      legalNotice: "Legal notice",
      privacy: "Privacy policy",
      terms: "Terms of service",
      cookies: "Cookies",
      companyFallback: "© Narixia. Company details are published in the legal notice.",
      disclaimer: "Narixia provides decision support, not accounting, tax or financial advice.",
    },
    accountDeleted: "Your account and all its data have been deleted. Any subscription was cancelled. Thank you for trying Narixia.",
    demo: {
      badge: "Demo data",
      note: "Figures from a fictional sample store, generated for illustration.",
      vsPrevious: "vs previous 30 days",
      overviewTitle: "Sample store — Overview",
      whatChanged: "What changed",
      whatChangedIntro: "Rule-based insights, each traceable to the figures.",
      productViews: "Product views",
    },
    pricingCards: {
      forDays: (days: number) => `for ${days} days`,
      startTrial: "Start your free trial",
      noCard: "No payment card required. Nothing is charged automatically.",
      perMonth: "per month, VAT may apply",
      startWithTrial: "Start with the free trial",
      upgradeNote: "Upgrade from your trial whenever you are ready. Cancel anytime.",
    },
    faq: {
      calculate: {
        q: "What does Narixia calculate?",
        a: "Narixia turns your orders, product costs, advertising spend and expenses into a clear profit breakdown: net sales, gross profit and contribution margin, overall and per product. Every figure has a written definition, and estimated or missing values are labelled.",
      },
      netProfit: {
        q: "Is contribution margin the same as net profit?",
        a: "No. Contribution margin is what remains after product costs and variable costs such as shipping, payment fees and advertising. Net profit also subtracts fixed costs, taxes, interest and depreciation. Narixia shows an operating-profit estimate using the fixed costs you record, but it does not replace your accounts.",
      },
      platforms: {
        q: "Which platforms can I import from?",
        a: "Narixia imports CSV files. It recognises the column names of Shopify order and product exports and offers documented templates for orders, products, expenses and advertising campaigns, so files from other platforms or spreadsheets can be mapped in a few clicks. Direct integrations are planned but not available yet.",
      },
      customerData: {
        q: "What happens to customer data in my order exports?",
        a: "Files are read in your browser. Only the columns you map are sent to Narixia, and the order templates do not include customer names, emails or addresses. Narixia does not need them to calculate margins.",
      },
      vat: {
        q: "My prices include VAT. Does that distort the numbers?",
        a: "Tell Narixia that your prices include tax and provide the tax amount per order. Tax is removed from sales, discounts, shipping and refunds before any margin is calculated, so your margins are not inflated by VAT.",
      },
      trial: {
        q: "How does the free trial work?",
        a: (days: number, price: string) =>
          `You get ${days} days of the core product without entering a payment card. When the trial ends, nothing is charged: you can upgrade to Pro for ${price} per month, and your data stays available to export or delete.`,
      },
      attribution: {
        q: "How does Narixia handle advertising attribution?",
        a: "Ad platforms report conversions using their own attribution rules, which often overlap. Narixia shows platform-reported ROAS as reported, compares it with your break-even ROAS, and keeps store-wide ad spend separate from product margins unless a campaign is explicitly linked to a single product.",
      },
      export: {
        q: "Can I export or delete my data?",
        a: "Yes. You can download all of your data from the settings page at any time, and deleting your account removes your organisation’s data from Narixia.",
      },
    },
    notFound: {
      title: "Page not found",
      body: "The address may be mistyped, or the page has moved.",
      home: "Go to the home page",
      dashboard: "Open the dashboard",
      homeAria: "Narixia home",
    },
  },
  fr: {
    skipToContent: "Aller au contenu",
    header: {
      nav: { product: "Produit", features: "Fonctionnalités", pricing: "Tarifs", faq: "FAQ" },
      home: "Accueil Narixia",
      mainNav: "Principale",
      mobileNav: "Mobile",
      signIn: "Se connecter",
      startTrial: "Essayer gratuitement",
      openMenu: "Ouvrir le menu",
      closeMenu: "Fermer le menu",
      menu: "Menu",
      siteNavigation: "Navigation du site",
    },
    footer: {
      product: "Produit",
      company: "Entreprise",
      legal: "Juridique",
      features: "Fonctionnalités",
      pricing: "Tarifs",
      calculator: "Calculateur de marge",
      glossary: "Glossaire des indicateurs",
      contact: "Contact",
      legalNotice: "Mentions légales",
      privacy: "Politique de confidentialité",
      terms: "Conditions d'utilisation",
      cookies: "Cookies",
      companyFallback: "© Narixia. Les informations sur la société sont publiées dans les mentions légales.",
      disclaimer: "Narixia est une aide à la décision, et non un conseil comptable, fiscal ou financier.",
    },
    accountDeleted:
      "Votre compte et toutes ses données ont été supprimés. Tout abonnement en cours a été résilié. Merci d'avoir essayé Narixia.",
    demo: {
      badge: "Données de démonstration",
      note: "Chiffres d'une boutique exemple fictive, générés à titre d'illustration.",
      vsPrevious: "par rapport aux 30 jours précédents",
      overviewTitle: "Boutique exemple — Vue d'ensemble",
      whatChanged: "Ce qui a changé",
      whatChangedIntro: "Des analyses fondées sur des règles, chacune rattachée aux chiffres.",
      productViews: "Vues du produit",
    },
    pricingCards: {
      forDays: (days: number) => `pendant ${days} jours`,
      startTrial: "Commencer l'essai gratuit",
      noCard: "Aucune carte bancaire requise. Rien n'est prélevé automatiquement.",
      perMonth: "par mois, TVA éventuelle en sus",
      startWithTrial: "Commencer par l'essai gratuit",
      upgradeNote: "Passez à Pro depuis votre essai quand vous le souhaitez. Résiliable à tout moment.",
    },
    faq: {
      calculate: {
        q: "Que calcule Narixia ?",
        a: "Narixia transforme vos commandes, le coût d'achat de vos produits, vos dépenses publicitaires et vos charges en une décomposition claire de votre rentabilité : ventes nettes, marge brute et ce qui vous reste (marge sur coûts variables), au global et par produit. Chaque chiffre a une définition écrite, et les valeurs estimées ou manquantes sont signalées.",
      },
      netProfit: {
        q: "« Ce qui vous reste » est-il la même chose que le bénéfice net ?",
        a: "Non. « Ce qui vous reste » (la marge sur coûts variables) est ce qui reste après le coût d'achat des produits et les coûts variables comme l'expédition, les frais de paiement et la publicité. Le bénéfice net déduit en plus les coûts fixes, les impôts, les intérêts et les amortissements. Narixia affiche une estimation du résultat d'exploitation à partir des coûts fixes que vous enregistrez, mais ne remplace pas votre comptabilité.",
      },
      platforms: {
        q: "Depuis quelles plateformes puis-je importer ?",
        a: "Narixia importe des fichiers CSV. Il reconnaît les noms de colonnes des exports de commandes et de produits Shopify et propose des modèles documentés pour les commandes, les produits, les charges et les campagnes publicitaires : vous associez donc les colonnes des fichiers d'autres plateformes ou de tableurs en quelques clics. Des intégrations directes sont prévues mais pas encore disponibles.",
      },
      customerData: {
        q: "Que deviennent les données clients de mes exports de commandes ?",
        a: "Les fichiers sont lus dans votre navigateur. Seules les colonnes que vous associez sont envoyées à Narixia, et les modèles de commandes n'incluent ni nom, ni e-mail, ni adresse de client. Narixia n'en a pas besoin pour calculer vos marges.",
      },
      vat: {
        q: "Mes prix sont TTC. Cela fausse-t-il les chiffres ?",
        a: "Indiquez à Narixia que vos prix incluent les taxes et fournissez le montant de taxe par commande. La taxe est retirée des ventes, des remises, des frais de port et des remboursements avant tout calcul de marge : vos marges ne sont donc pas gonflées par la TVA.",
      },
      trial: {
        q: "Comment fonctionne l'essai gratuit ?",
        a: (days: number, price: string) =>
          `Vous disposez de ${days} jours avec les fonctions essentielles, sans saisir de carte bancaire. À la fin de l'essai, rien n'est prélevé : vous pouvez passer à Pro pour ${price} par mois, et vos données restent disponibles pour être exportées ou supprimées.`,
      },
      attribution: {
        q: "Comment Narixia gère-t-il l'attribution publicitaire ?",
        a: "Les plateformes publicitaires comptabilisent les conversions selon leurs propres règles d'attribution, qui se recoupent souvent. Narixia affiche le ROAS annoncé par chaque plateforme tel quel, le compare au seuil de rentabilité de votre pub et garde les dépenses publicitaires globales à l'écart des marges par produit, sauf si une campagne est explicitement liée à un seul produit.",
      },
      export: {
        q: "Puis-je exporter ou supprimer mes données ?",
        a: "Oui. Vous pouvez télécharger toutes vos données depuis la page des paramètres à tout moment, et la suppression de votre compte efface les données de votre organisation de Narixia.",
      },
    },
    notFound: {
      title: "Page introuvable",
      body: "L'adresse est peut-être mal saisie, ou la page a été déplacée.",
      home: "Aller à la page d'accueil",
      dashboard: "Ouvrir le tableau de bord",
      homeAria: "Accueil Narixia",
    },
  },
});
