import { defineMessages } from "@/i18n/messages";

/** Authentication pages, their layout and the email-link error page. */
export const authPageMessages = defineMessages({
  en: {
    layout: {
      home: "Narixia home",
      privacy: "Privacy",
      terms: "Terms",
      contact: "Contact",
    },
    backToSignIn: "Back to sign in",
    checkEmail: {
      metaTitle: "Confirm your email",
      title: "Confirm your email address",
      description: "Open the link in the email we just sent to activate your account and start your trial. You can open it on any device.",
      noEmail: "No email after a few minutes? Check your spam folder, or make sure the address is correct.",
    },
    forgotPassword: {
      metaTitle: "Reset your password",
      title: "Reset your password",
      description: "Enter the email address of your account and we will send you a link to choose a new password.",
    },
    resetPassword: {
      metaTitle: "Choose a new password",
      title: "Choose a new password",
      description: "You will stay signed in on this device after the change.",
    },
    signIn: {
      metaTitle: "Sign in",
      title: "Sign in to Narixia",
      description: "Welcome back. See how your store is doing.",
      newTo: "New to Narixia?",
      startTrial: "Start your free trial",
    },
    signUp: {
      metaTitle: "Start your free trial",
      metaDescription: "Create a Narixia account. 14 days free, no payment card required.",
      title: "Create your account",
      description: "Understand your real margins in minutes.",
      haveAccount: "Already have an account?",
      signIn: "Sign in",
    },
    linkError: {
      metaTitle: "Link problem",
      expired: { title: "This link has expired", body: "Email links work once and expire after one hour. Request a new one below." },
      invalid: { title: "This link is not valid", body: "It may have been used already, or copied incompletely. Request a new one below." },
      missing: { title: "Something is missing from this link", body: "Open the link directly from the email, or request a new one." },
      signIn: "Sign in",
      resetPassword: "Reset my password",
    },
  },
  fr: {
    layout: {
      home: "Accueil Narixia",
      privacy: "Confidentialité",
      terms: "Conditions",
      contact: "Contact",
    },
    backToSignIn: "Retour à la connexion",
    checkEmail: {
      metaTitle: "Confirmez votre e-mail",
      title: "Confirmez votre adresse e-mail",
      description:
        "Ouvrez le lien de l'e-mail que nous venons de vous envoyer pour activer votre compte et démarrer votre essai gratuit. Vous pouvez l'ouvrir sur n'importe quel appareil.",
      noEmail: "Toujours pas d'e-mail après quelques minutes ? Vérifiez vos courriers indésirables ou assurez-vous que l'adresse est correcte.",
    },
    forgotPassword: {
      metaTitle: "Réinitialiser votre mot de passe",
      title: "Réinitialiser votre mot de passe",
      description: "Saisissez l'adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.",
    },
    resetPassword: {
      metaTitle: "Choisir un nouveau mot de passe",
      title: "Choisir un nouveau mot de passe",
      description: "Vous resterez connecté sur cet appareil après la modification.",
    },
    signIn: {
      metaTitle: "Connexion",
      title: "Connexion à Narixia",
      description: "Bon retour parmi nous. Voyez où en est votre boutique.",
      newTo: "Nouveau sur Narixia ?",
      startTrial: "Démarrer votre essai gratuit",
    },
    signUp: {
      metaTitle: "Démarrer votre essai gratuit",
      metaDescription: "Créez un compte Narixia. 14 jours gratuits, sans carte bancaire.",
      title: "Créer votre compte",
      description: "Découvrez vos vraies marges en quelques minutes.",
      haveAccount: "Vous avez déjà un compte ?",
      signIn: "Se connecter",
    },
    linkError: {
      metaTitle: "Problème de lien",
      expired: { title: "Ce lien a expiré", body: "Les liens envoyés par e-mail ne fonctionnent qu'une fois et expirent au bout d'une heure. Demandez-en un nouveau ci-dessous." },
      invalid: { title: "Ce lien n'est pas valide", body: "Il a peut-être déjà été utilisé ou mal copié. Demandez-en un nouveau ci-dessous." },
      missing: { title: "Il manque une information dans ce lien", body: "Ouvrez le lien directement depuis l'e-mail, ou demandez-en un nouveau." },
      signIn: "Se connecter",
      resetPassword: "Réinitialiser mon mot de passe",
    },
  },
});
