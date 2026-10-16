import { defineMessages } from "@/i18n/messages";

/**
 * Messages produced while reading an import file and checking its rows
 * (src/lib/imports): shown in the preview and stored with the staged rows.
 * `v` is a cell value, already shortened.
 */
export const importRows = defineMessages({
  en: {
    dates: {
      notExist: "This date does not exist. Check the day/month order in the import options.",
      yearRange: "Dates must be between the years 2000 and 2100.",
      badTime: "The time is not valid.",
      enterDate: "Enter a date.",
      unrecognisedDateTime: "Unrecognised date. Use a form such as 2026-03-15 or 15/03/2026 14:30.",
      unrecognisedDate: "Unrecognised date. Use a form such as 2026-03-15 or 15/03/2026.",
    },
    file: {
      notCsv: "This does not look like a CSV file. Export your data as CSV (comma-separated values) and try again.",
      unclosedQuote: (row: number) => `The file has an unclosed quotation mark near row ${row}. Check the file and export it again.`,
      empty: "The file is empty.",
      tooManyColumns: (columns: number, max: number) => `The file has ${columns} columns; at most ${max} are supported.`,
      noDataRows: "The file has column names but no data rows.",
      tooManyRows: (rows: string, max: string) =>
        `This file has ${rows} rows; your plan allows ${max} per import. Split the file into smaller files, or upgrade for larger imports.`,
      tooLarge: (mb: number) => `The file is larger than ${mb} MB. Split it into smaller files.`,
      column: (n: number) => `Column ${n}`,
    },
    sources: {
      shopify_orders: "Shopify order export",
      shopify_products: "Shopify product export",
      meta_ads: "Meta Ads report",
      google_ads: "Google Ads report",
      tiktok_ads: "TikTok Ads report",
    },
    cell: {
      tooLong: (max: number) => `This cell is longer than ${max} characters.`,
      missing: (label: string) => `${label} is missing.`,
      longerThan: (label: string, max: number) => `${label} is longer than ${max} characters.`,
      negative: (label: string) => `${label} cannot be negative.`,
      tooLarge: (label: string) => `${label} is too large.`,
      notNumberDecimal: (label: string, v: string) => `${label} is not a number: "${v}". Check the decimal separator in the import options.`,
      notPositive: (label: string) => `${label} must be greater than zero.`,
      roundedCurrency: (label: string, currency: string) => `${label} had more decimals than ${currency} uses and was rounded.`,
      invalidAmount: (label: string, v: string) => `${label} is not a valid amount: "${v}".`,
      roundedFour: (label: string) => `${label} was rounded to four decimals.`,
      notNumber: (label: string, v: string) => `${label} is not a number: "${v}".`,
      notWhole: (label: string) => `${label} must be a whole number.`,
      atLeast: (label: string, min: number) => `${label} must be at least ${min}.`,
      outOfRange: (label: string) => `${label} is out of range.`,
    },
    orders: {
      differs: (row: number) => `Differs from row ${row} of the same order; the value on row ${row} is used.`,
      cancelled: "Cancelled order: skipped, as chosen in the import options.",
      otherCurrency: (currency: string, store: string) => `The order is in ${currency}, but this store uses ${store}. Import it into a store with that currency.`,
      tooManyLines: (max: number) => `This order has more than ${max} lines, which is not supported.`,
      lineTooLarge: "Line amount (unit price × quantity) is too large.",
      discountMismatch:
        "The order discount differs from the sum of the line discounts; the line discounts are used, so the order discount is not counted twice.",
      discountTooLarge: "The order discount is larger than the order's product sales.",
      lineDiscountTooLarge: "The discount is larger than the line amount.",
      heldBack: "Another row of this order has an error, so the whole order was held back.",
      taxExceedsTotal: "Taxes are larger than the order total, so tax cannot be removed from the prices.",
      totalNotPositive: "The order total is zero or negative, so tax cannot be removed from the prices.",
      refundTooLarge: "The refund is larger than the order total (excluding tax).",
      noRefundDate: "No refund date: the refund is dated to the order and marked as estimated.",
    },
    products: {
      emptyVariant: "Image or empty variant row without product data: skipped.",
      noUnitCost: "No unit cost: margins for this product stay incomplete until you add one.",
    },
    adSpend: {
      summary: "Summary row: skipped.",
      unknownPlatform: (v: string) => `Unknown platform "${v}": recorded as Other.`,
    },
    expenses: {
      unknownCategory: (v: string) => `Unknown category "${v}": recorded as Other.`,
      badKind: (v: string) => `"${v}" is not "fixed" or "variable".`,
    },
  },
  fr: {
    dates: {
      notExist: "Cette date n'existe pas. Vérifiez l'ordre jour/mois dans les options d'import.",
      yearRange: "Les dates doivent être comprises entre les années 2000 et 2100.",
      badTime: "L'heure n'est pas valide.",
      enterDate: "Saisissez une date.",
      unrecognisedDateTime: "Date non reconnue. Utilisez une forme comme 2026-03-15 ou 15/03/2026 14:30.",
      unrecognisedDate: "Date non reconnue. Utilisez une forme comme 2026-03-15 ou 15/03/2026.",
    },
    file: {
      notCsv: "Ce fichier ne semble pas être un fichier CSV. Exportez vos données au format CSV (valeurs séparées par des virgules) et réessayez.",
      unclosedQuote: (row: number) => `Le fichier contient un guillemet non fermé vers la ligne ${row}. Vérifiez le fichier et exportez-le de nouveau.`,
      empty: "Le fichier est vide.",
      tooManyColumns: (columns: number, max: number) => `Le fichier compte ${columns} colonnes ; ${max} au maximum sont prises en charge.`,
      noDataRows: "Le fichier contient des noms de colonnes mais aucune ligne de données.",
      tooManyRows: (rows: string, max: string) =>
        `Ce fichier compte ${rows} lignes ; votre offre en autorise ${max} par import. Découpez le fichier en fichiers plus petits, ou passez à une offre supérieure pour des imports plus volumineux.`,
      tooLarge: (mb: number) => `Le fichier dépasse ${mb} Mo. Découpez-le en fichiers plus petits.`,
      column: (n: number) => `Colonne ${n}`,
    },
    sources: {
      shopify_orders: "Export de commandes Shopify",
      shopify_products: "Export de produits Shopify",
      meta_ads: "Rapport Meta Ads",
      google_ads: "Rapport Google Ads",
      tiktok_ads: "Rapport TikTok Ads",
    },
    cell: {
      tooLong: (max: number) => `Cette cellule dépasse ${max} caractères.`,
      missing: (label: string) => `${label} : valeur manquante.`,
      longerThan: (label: string, max: number) => `${label} : plus de ${max} caractères.`,
      negative: (label: string) => `${label} : la valeur ne peut pas être négative.`,
      tooLarge: (label: string) => `${label} : valeur trop élevée.`,
      notNumberDecimal: (label: string, v: string) =>
        `${label} : « ${v} » n'est pas un nombre. Vérifiez le séparateur décimal dans les options d'import.`,
      notPositive: (label: string) => `${label} : la valeur doit être supérieure à zéro.`,
      roundedCurrency: (label: string, currency: string) => `${label} : plus de décimales que n'en utilise ${currency}, valeur arrondie.`,
      invalidAmount: (label: string, v: string) => `${label} : « ${v} » n'est pas un montant valide.`,
      roundedFour: (label: string) => `${label} : valeur arrondie à quatre décimales.`,
      notNumber: (label: string, v: string) => `${label} : « ${v} » n'est pas un nombre.`,
      notWhole: (label: string) => `${label} : la valeur doit être un nombre entier.`,
      atLeast: (label: string, min: number) => `${label} : la valeur doit être au moins égale à ${min}.`,
      outOfRange: (label: string) => `${label} : valeur hors limites.`,
    },
    orders: {
      differs: (row: number) => `Diffère de la ligne ${row} de la même commande ; la valeur de la ligne ${row} est utilisée.`,
      cancelled: "Commande annulée : ignorée, comme choisi dans les options d'import.",
      otherCurrency: (currency: string, store: string) =>
        `La commande est en ${currency}, mais cette boutique utilise ${store}. Importez-la dans une boutique qui utilise cette devise.`,
      tooManyLines: (max: number) => `Cette commande compte plus de ${max} lignes, ce qui n'est pas pris en charge.`,
      lineTooLarge: "Le montant de la ligne (prix unitaire × quantité) est trop élevé.",
      discountMismatch:
        "La remise sur la commande diffère de la somme des remises par ligne ; les remises par ligne sont utilisées, pour ne pas compter la remise deux fois.",
      discountTooLarge: "La remise sur la commande dépasse les ventes de produits de la commande.",
      lineDiscountTooLarge: "La remise dépasse le montant de la ligne.",
      heldBack: "Une autre ligne de cette commande contient une erreur : toute la commande a été mise de côté.",
      taxExceedsTotal: "Les taxes dépassent le total de la commande : la taxe ne peut pas être retirée des prix.",
      totalNotPositive: "Le total de la commande est nul ou négatif : la taxe ne peut pas être retirée des prix.",
      refundTooLarge: "Le remboursement dépasse le total de la commande (HT).",
      noRefundDate: "Pas de date de remboursement : le remboursement est daté du jour de la commande et marqué comme estimé.",
    },
    products: {
      emptyVariant: "Ligne d'image ou de variante vide, sans données produit : ignorée.",
      noUnitCost: "Pas de coût unitaire : les marges de ce produit restent incomplètes tant que vous n'en ajoutez pas.",
    },
    adSpend: {
      summary: "Ligne de total : ignorée.",
      unknownPlatform: (v: string) => `Plateforme inconnue « ${v} » : enregistrée comme Autre.`,
    },
    expenses: {
      unknownCategory: (v: string) => `Catégorie inconnue « ${v} » : enregistrée comme Autre.`,
      badKind: (v: string) => `« ${v} » n'est ni « fixe » ni « variable ».`,
    },
  },
});
