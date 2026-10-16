import { defineMessages } from "@/i18n/messages";

/** Validation messages for values typed into forms (src/lib/finance/input.ts). */
export const inputMessages = defineMessages({
  en: {
    empty: "Enter a value.",
    invalid_format: "Enter a number, for example 12.50.",
    multiple_signs: "Enter a single number.",
    scientific_notation: "Enter the number in full, without exponent notation.",
    too_large: "This value is too large.",
    negative_not_allowed: "Enter zero or a positive value.",
    invalid_percent: "Enter a percentage between 0 and 100.",
    not_integer: "Enter a whole number.",
    atLeast: (min: string) => `Enter ${min} or more.`,
    atMost: (max: string) => `Enter ${max} or less.`,
  },
  fr: {
    empty: "Saisissez une valeur.",
    invalid_format: "Saisissez un nombre, par exemple 12,50.",
    multiple_signs: "Saisissez un seul nombre.",
    scientific_notation: "Saisissez le nombre en entier, sans notation scientifique.",
    too_large: "Cette valeur est trop élevée.",
    negative_not_allowed: "Saisissez zéro ou une valeur positive.",
    invalid_percent: "Saisissez un pourcentage entre 0 et 100.",
    not_integer: "Saisissez un nombre entier.",
    atLeast: (min: string) => `Saisissez ${min} ou plus.`,
    atMost: (max: string) => `Saisissez ${max} ou moins.`,
  },
});
