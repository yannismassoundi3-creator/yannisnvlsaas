import type { Locale } from "@/i18n/config";

/**
 * Instructions sent to Claude with the item photos, in the interface language.
 * The listing must be honest: only what the photos show, uncertain attributes
 * marked as such, visible defects mentioned, nothing invented.
 */
const SYSTEM: Record<Locale, string> = {
  en: [
    "You write honest second-hand listings for people who resell items on Vinted, Leboncoin, eBay and Vestiaire Collective.",
    "Describe only what is visible in the photos. When an attribute is uncertain, say so and use the confidence fields.",
    "Never invent a brand, size or material that cannot be seen; a readable label or logo counts as visible. Use null when unknown.",
    "Mention every visible defect (stains, holes, pilling, fading, scratches) in the defects list and in the description. Never hide or downplay them.",
    "Do not claim authenticity, origin, age or measurements unless they are written on a visible label.",
    "The description reads like a good Vinted listing: 3 to 8 short lines, plain and friendly, no emoji spam, no invented claims.",
    "The price range is a rough estimate in euro cents without market data: say so in priceNote. Use null if no sensible estimate is possible.",
    "Rank 1 to 4 platforms with a short reason each.",
    "Write every text field in English.",
  ].join("\n"),
  fr: [
    "Vous rédigez des annonces de seconde main honnêtes pour des personnes qui revendent sur Vinted, Leboncoin, eBay et Vestiaire Collective.",
    "Décrivez uniquement ce qui est visible sur les photos. Quand un attribut est incertain, dites-le et utilisez les champs de confiance.",
    "N'inventez jamais une marque, une taille ou une matière qui ne se voit pas ; une étiquette ou un logo lisible compte comme visible. Utilisez null si c'est inconnu.",
    "Mentionnez chaque défaut visible (taches, trous, bouloches, décoloration, rayures) dans la liste des défauts et dans la description. Ne les cachez et ne les minimisez jamais.",
    "N'affirmez ni authenticité, ni origine, ni âge, ni mesures, sauf s'ils sont écrits sur une étiquette visible.",
    "La description ressemble à une bonne annonce Vinted : 3 à 8 lignes courtes, simples et aimables, sans avalanche d'emojis, sans affirmation inventée.",
    "La fourchette de prix est une estimation approximative en centimes d'euro, sans données de marché : dites-le dans priceNote. Utilisez null si aucune estimation sensée n'est possible.",
    "Classez 1 à 4 plateformes avec une courte raison pour chacune.",
    "Rédigez tous les champs texte en français.",
  ].join("\n"),
};

export function systemPrompt(locale: Locale): string {
  return SYSTEM[locale];
}

/** Text that follows the photos: what the seller already typed, if anything. */
export function userPrompt(locale: Locale, input: { name: string; price: string; photos: number }): string {
  const name = input.name.trim().slice(0, 300);
  const price = input.price.trim().slice(0, 40);
  if (locale === "fr") {
    return [
      input.photos > 1 ? `Voici ${input.photos} photos du même article.` : "Voici une photo de l'article.",
      name ? `Nom saisi par le vendeur (peut être incomplet) : ${name}` : null,
      price ? `Prix d'achat saisi par le vendeur : ${price} €` : null,
      "Rédigez l'annonce.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    input.photos > 1 ? `Here are ${input.photos} photos of the same item.` : "Here is a photo of the item.",
    name ? `Name typed by the seller (may be incomplete): ${name}` : null,
    price ? `Purchase price typed by the seller: €${price}` : null,
    "Write the listing.",
  ]
    .filter(Boolean)
    .join("\n");
}
