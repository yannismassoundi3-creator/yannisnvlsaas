import { defineMessages } from "@/i18n/messages";

/** Default text of the generic UI components. */
export const shellUi = defineMessages({
  en: {
    close: "Close",
    cancel: "Cancel",
    optional: "Optional",
    whatIs: (term: string) => `What is ${term}?`,
    notifications: "Notifications",
    closeToast: "Close toast",
    showPassword: "Show password",
    hidePassword: "Hide password",
    capsLock: "Caps Lock is on.",
  },
  fr: {
    close: "Fermer",
    cancel: "Annuler",
    optional: "Facultatif",
    whatIs: (term: string) => `Qu'est-ce que « ${term} » ?`,
    notifications: "Notifications",
    closeToast: "Fermer la notification",
    showPassword: "Afficher le mot de passe",
    hidePassword: "Masquer le mot de passe",
    capsLock: "La touche Verr. Maj est activée.",
  },
});
