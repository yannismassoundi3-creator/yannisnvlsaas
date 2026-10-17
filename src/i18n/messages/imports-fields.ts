import type { ImportKind } from "@/lib/imports/schema";

/**
 * French copy of the import kinds and fields. The English copy, the header
 * synonyms and the templates stay in src/lib/imports/schema.ts; read either
 * language through kindCopy() and fieldCopy() from there.
 */
export type KindCopyFr = { label: string; description: string; fields: Record<string, { label: string; description: string }> };

export const importKindsFr: Record<ImportKind, KindCopyFr> = {
  orders: {
    label: "Commandes",
    description: "Une ligne par article commandé. Les exports de commandes Shopify sont reconnus automatiquement.",
    fields: {
      order_number: {
        label: "Numéro de commande",
        description: "Identifie la commande, par exemple #1001. Les lignes qui portent le même numéro appartiennent à une même commande.",
      },
      ordered_at: {
        label: "Date de commande",
        description: "Date et heure de la commande. Le décalage horaire est utilisé s'il est indiqué ; sinon, le fuseau horaire de votre boutique.",
      },
      line_name: { label: "Nom du produit", description: "Nom du produit sur cette ligne." },
      line_sku: { label: "Référence (SKU)", description: "Sert à relier la ligne à un produit. Sans référence, les produits sont reliés par leur nom." },
      quantity: { label: "Quantité", description: "Nombre d'unités vendues sur cette ligne." },
      unit_price: { label: "Prix unitaire", description: "Prix de vente d'une unité, avant remises." },
      line_discount: { label: "Remise sur la ligne", description: "Remise totale sur cette ligne (et non par unité)." },
      order_discount: {
        label: "Remise sur la commande",
        description: "Remise sur l'ensemble de la commande. Utilisée seulement en l'absence de remises par ligne ; répartie entre les lignes selon leur montant.",
      },
      shipping_charged: { label: "Frais de port facturés", description: "Frais de port payés par le client pour la commande." },
      taxes: {
        label: "Taxes",
        description: "Taxes (TVA ou taxe de vente) de la commande. Nécessaires pour retirer la taxe des prix TTC.",
      },
      shipping_cost: {
        label: "Coût d'expédition",
        description: "Ce que l'expédition de la commande vous a coûté. Sans cette colonne, votre estimation par défaut est utilisée.",
      },
      transaction_fees: {
        label: "Frais de paiement",
        description: "Frais prélevés par le prestataire de paiement. Sans cette colonne, votre règle de frais est utilisée.",
      },
      refunded_amount: { label: "Montant remboursé", description: "Total remboursé pour la commande." },
      refunded_at: {
        label: "Date du remboursement",
        description: "Date du remboursement. Sans elle, le remboursement est daté du jour de la commande et marqué comme estimé.",
      },
      unit_cost: {
        label: "Coût unitaire",
        description: "Ce qu'une unité vous a coûté. Enregistré avec la ligne : un changement de coût ultérieur ne modifie pas cette commande.",
      },
      currency: { label: "Devise", description: "Comparée à la devise de votre boutique." },
      cancelled_at: { label: "Date d'annulation", description: "Les commandes annulées peuvent être ignorées." },
    },
  },
  products: {
    label: "Produits et coûts",
    description: "Votre catalogue avec les coûts unitaires. Les exports de produits Shopify sont reconnus automatiquement.",
    fields: {
      name: { label: "Nom du produit", description: "Nom du produit (et de la variante)." },
      sku: { label: "Référence (SKU)", description: "Vivement recommandé : les lignes de commande sont reliées aux produits par leur référence (SKU)." },
      unit_cost: { label: "Coût unitaire", description: "Ce qu'une unité vous coûte, HT. Jusqu'à quatre décimales." },
      price: { label: "Prix de vente", description: "Prix de vente actuel, pour information." },
      handle: { label: "Handle", description: "Handle du produit Shopify : nomme les lignes de variantes dont le titre est vide." },
      option1: { label: "Option de variante 1", description: "Valeur d'option de variante Shopify, ajoutée au nom." },
      option2: { label: "Option de variante 2", description: "Valeur d'option de variante Shopify, ajoutée au nom." },
      option3: { label: "Option de variante 3", description: "Valeur d'option de variante Shopify, ajoutée au nom." },
    },
  },
  ad_spend: {
    label: "Dépenses publicitaires",
    description: "Dépenses quotidiennes par campagne. Les exports Meta, Google Ads et TikTok ventilés par jour sont reconnus.",
    fields: {
      date: { label: "Jour", description: "Jour de la dépense. Exportez votre rapport ventilé par jour." },
      campaign: { label: "Campagne", description: "Nom de la campagne." },
      campaign_id: {
        label: "ID de campagne",
        description: "Identifiant de la campagne sur la plateforme ; la campagne reste reconnue si elle est renommée.",
      },
      platform: {
        label: "Plateforme",
        description: "Meta, Google, TikTok… Sans cette colonne, la plateforme choisie plus bas est utilisée.",
      },
      spend: { label: "Dépense", description: "Montant dépensé ce jour-là, HT." },
      impressions: { label: "Impressions", description: "" },
      clicks: { label: "Clics", description: "" },
      conversions: { label: "Conversions", description: "Telles que déclarées par la plateforme." },
      conversion_value: { label: "Valeur de conversion", description: "Chiffre d'affaires que la plateforme attribue à la campagne." },
    },
  },
  expenses: {
    label: "Dépenses",
    description: "Autres coûts : emballages, abonnements, commissions des places de marché, loyer.",
    fields: {
      date: { label: "Date", description: "Date à laquelle le coût a été engagé." },
      amount: { label: "Montant", description: "Montant HT." },
      category: {
        label: "Catégorie",
        description: "Emballage, logiciels, loyer… Sans cette colonne, la catégorie choisie plus bas est utilisée.",
      },
      kind: {
        label: "Fixe ou variable",
        description: "« fixe » ou « variable ». Sans cette colonne, le type habituel de chaque catégorie est utilisé.",
      },
      description: { label: "Description", description: "" },
    },
  },
};
