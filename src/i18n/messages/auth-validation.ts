import { defineMessages } from "@/i18n/messages";

/** Password rules and Supabase Auth error messages (src/lib/auth/validation.ts). */
export const authValidationMessages = defineMessages({
  en: {
    rules: {
      length: (min: number) => `At least ${min} characters`,
      letter: "At least one letter",
      digit: "At least one number",
    },
    errors: {
      invalidCredentials: "Email or password is incorrect.",
      emailNotConfirmed: "Please confirm your email address first. Check your inbox for the confirmation link.",
      weakPassword: "Choose a stronger password: at least 10 characters with letters and numbers.",
      samePassword: "Your new password must be different from the current one.",
      rateLimited: "Too many attempts. Please wait a few minutes and try again.",
      userExists: "We could not create an account with this email. Try signing in or resetting your password.",
      otpExpired: "This link has expired. Request a new one.",
      sessionEnded: "Your session has ended. Please sign in again.",
      generic: "Something went wrong. Please try again.",
    },
  },
  fr: {
    rules: {
      length: (min: number) => `Au moins ${min} caractères`,
      letter: "Au moins une lettre",
      digit: "Au moins un chiffre",
    },
    errors: {
      invalidCredentials: "E-mail ou mot de passe incorrect.",
      emailNotConfirmed: "Veuillez d'abord confirmer votre adresse e-mail. Le lien de confirmation se trouve dans votre boîte de réception.",
      weakPassword: "Choisissez un mot de passe plus robuste : au moins 10 caractères, avec des lettres et des chiffres.",
      samePassword: "Votre nouveau mot de passe doit être différent de l'actuel.",
      rateLimited: "Trop de tentatives. Patientez quelques minutes, puis réessayez.",
      userExists: "Impossible de créer un compte avec cet e-mail. Essayez de vous connecter ou de réinitialiser votre mot de passe.",
      otpExpired: "Ce lien a expiré. Demandez-en un nouveau.",
      sessionEnded: "Votre session a expiré. Veuillez vous reconnecter.",
      generic: "Une erreur est survenue. Veuillez réessayer.",
    },
  },
});
