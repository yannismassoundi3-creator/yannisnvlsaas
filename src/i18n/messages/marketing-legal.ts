import { defineMessages } from "@/i18n/messages";

/** Legal notice, privacy policy and terms of service. Translate faithfully; never drop a "not configured yet" caveat. */
export const marketingLegal = defineMessages({
  en: {
    eyebrow: "Legal",
    lastUpdated: (date: string) => `Last updated ${date}`,
    notice: {
      metaTitle: "Legal notice",
      metaDescription: "Company information for Narixia.",
      title: "Legal notice",
      notConfigured: "Not configured yet",
      company: "Company",
      address: "Registered address",
      registration: "Registration",
      contact: "Contact",
      hosting: "Hosting",
      disclaimer:
        "Narixia is a decision-support tool. Figures shown in the product are calculated from data provided by its users and do not constitute accounting, tax or financial advice.",
    },
    privacy: {
      metaTitle: "Privacy policy",
      metaDescription: "How Narixia collects, uses and protects personal data.",
      title: "Privacy policy",
      intro:
        "This policy explains what personal data Narixia processes, why, and the choices you have. Narixia is a profitability analytics service for businesses. It is designed to work without customer-level personal data from your store.",
      responsibleTitle: "Who is responsible",
      controllerLead: "The controller of personal data processed through Narixia is",
      controllerMissing: "the operating company (details not configured yet)",
      contactLead: "Contact for privacy questions:",
      contactMissing: "privacy contact not configured yet",
      businessData:
        "For the business data you upload (orders, products, costs), you decide what is uploaded and why. If that data contains personal data, Narixia processes it on your behalf to provide the service.",
      dataTitle: "Data we process",
      dataHeaders: { category: "Category", examples: "Examples", why: "Why" },
      dataRows: [
        {
          category: "Account data",
          examples: "Email address, name, password (stored as a salted hash by our authentication provider)",
          why: "To create and secure your account (contract)",
        },
        {
          category: "Business data you provide",
          examples: "Store profile, products and costs, order identifiers and amounts, expenses, advertising spend",
          why: "To calculate your margins and reports (contract)",
        },
        {
          category: "Billing data",
          examples: "Customer and subscription identifiers, invoices, payment status. Card details are handled by Stripe and never reach Narixia.",
          why: "To manage your subscription (contract) and keep accounting records (legal obligation)",
        },
        {
          category: "Security data",
          examples: "IP address and timestamps of sign-ins and sensitive actions, rate-limit counters",
          why: "To protect accounts and the service (legitimate interest)",
        },
        {
          category: "Product usage events",
          examples:
            "Events such as “import completed” with the date, linked to your account. They never contain financial amounts or file contents.",
          why: "To understand and improve the product (legitimate interest)",
        },
        {
          category: "Sale emails you forward (optional)",
          examples:
            "Only if you forward them: sender, subject and date, the detected platform, amount and item name, and an excerpt of at most 2,000 characters from which email addresses and phone numbers are removed",
          why: "To prepare the sales you confirm (contract)",
        },
        {
          category: "Item photos (optional)",
          examples:
            "Enhanced on your device. Narixia stores one small thumbnail per item. Only if you ask for a listing written with AI, the photos are sent to Anthropic (Claude) for that analysis and are not kept by Narixia",
          why: "To show your items and write listings you ask for (contract)",
        },
        { category: "Support messages", examples: "Messages and feedback you send us", why: "To answer you (contract or legitimate interest)" },
      ],
      csvTitle: "CSV files",
      csvText:
        "When you import a CSV file, it is read in your browser. Only the columns you map to Narixia fields are sent to our servers. Narixia’s templates do not ask for customer names, email addresses or postal addresses, and we recommend not mapping such columns.",
      providersTitle: "Service providers",
      providersIntro: "We use the following processors, bound by data processing agreements:",
      providerHeaders: { provider: "Provider", purpose: "Purpose", location: "Location" },
      transfers:
        "Where a provider processes data outside the European Economic Area, the transfer relies on appropriate safeguards such as the European Commission’s standard contractual clauses.",
      retentionTitle: "How long we keep data",
      retention: [
        "Account and business data: for as long as your account exists.",
        "When you delete your account, your organisation’s data is deleted from the live database immediately. Copies in encrypted backups expire with the backup rotation of our database provider.",
        "Billing records: as long as accounting and tax law requires.",
        "Security logs and usage events: up to 12 months.",
        "Forwarded sale emails: deleted 30 days after you confirm or ignore them, and after 90 days at most otherwise.",
      ],
      cookiesTitle: "Cookies",
      cookiesText:
        "Narixia uses only cookies that are strictly necessary: authentication cookies that keep you signed in and protect your session. We do not use advertising cookies. If optional analytics are ever enabled, we will ask for your consent first.",
      rightsTitle: "Your rights",
      rightsText:
        "Depending on where you live, you can ask to access, correct, delete or export your personal data, object to or restrict certain processing, and withdraw consent at any time. You can export all of your data and delete your account yourself from the settings page. You also have the right to lodge a complaint with your data protection authority.",
      securityTitle: "Security",
      securityText:
        "Data is encrypted in transit. Access to your organisation’s data is restricted to its members by database access policies, and administrative access is limited to what is needed to operate the service.",
      changesTitle: "Changes",
      changesText:
        "We will update this page when our processing changes and, for material changes, notify account holders by email or in the app.",
    },
    terms: {
      metaTitle: "Terms of service",
      metaDescription: "The terms that apply to your use of Narixia.",
      title: "Terms of service",
      introLead: "These terms form the agreement between you and",
      companyMissing: "the operating company (details not configured yet)",
      introRest: "(“Narixia”, “we”) for the use of the Narixia service. By creating an account you accept them.",
      serviceTitle: "1. The service",
      service1:
        "Narixia is a web application that helps businesses analyse sales, costs, advertising and margins from data they provide. It is intended for business use. Narixia provides decision support; it is not accounting, tax, legal or financial advice, and it does not replace your accounts.",
      service2:
        "Results depend on the completeness and accuracy of the data you provide. Estimated and missing values are labelled in the product, and you remain responsible for decisions you make based on the results.",
      accountTitle: "2. Your account",
      account: [
        "You must provide accurate information and keep your password confidential.",
        "You are responsible for activity under your account and must tell us promptly about any unauthorised use.",
        "You must have the authority to accept these terms on behalf of the business you represent.",
      ],
      trialTitle: "3. Free trial",
      trialLead: (days: number) =>
        `New accounts receive a free trial of ${days} days. No payment card is required to start, and you are never charged automatically at the end of the trial. Trial accounts are subject to the limits shown on the`,
      trialLink: "pricing page",
      trialRest: ". When the trial ends without a subscription, your data is kept and remains available for export, while analytics and imports are paused.",
      paymentTitle: "4. Subscriptions and payment",
      payment: (graceDays: number) => [
        "Paid plans are billed in advance for each billing period through our payment provider, Stripe.",
        "Subscriptions renew automatically until cancelled. You can cancel at any time from the billing page; cancellation takes effect at the end of the current period.",
        "Except where the law requires otherwise, payments are not refundable for partial periods.",
        `If a payment fails, we keep your access for ${graceDays} days while the payment is retried. If it still fails, paid features are paused until payment succeeds.`,
        "We may change prices with at least 30 days’ notice. Changes apply from the next billing period after the notice.",
      ],
      dataTitle: "5. Your data",
      dataLead:
        "You keep all rights to the data you upload. You grant us the rights needed to host and process it in order to provide the service. You can export your data and delete your account at any time from the settings page. Our handling of personal data is described in the",
      dataLink: "privacy policy",
      dataRest: ".",
      dataRight: "You must have the right to upload the data you provide and must not upload data you are not allowed to share.",
      useTitle: "6. Acceptable use",
      use: [
        "Do not attempt to access other customers’ data or to bypass security or usage limits.",
        "Do not use the service to store unlawful content or to send spam.",
        "Do not overload the service, for example with automated requests beyond normal use.",
      ],
      availabilityTitle: "7. Availability and changes",
      availability:
        "We aim to keep Narixia available and reliable but do not guarantee uninterrupted service. We may change or discontinue features; if we discontinue the service, we will give reasonable notice and an opportunity to export your data.",
      liabilityTitle: "8. Liability",
      liability:
        "To the extent permitted by law, our total liability arising from these terms is limited to the amounts you paid us in the twelve months before the event giving rise to the claim, and we are not liable for indirect losses such as lost profits or business decisions made using the service. Nothing in these terms limits liability that cannot be limited by law.",
      terminationTitle: "9. Termination",
      termination:
        "You can stop using Narixia and delete your account at any time. We may suspend or close accounts that breach these terms, after notice where reasonable.",
      lawTitle: "10. Governing law",
      lawLead: "These terms are governed by the laws of",
      countryMissing: "the country of the operating company (not configured yet)",
      lawRest: ", without prejudice to mandatory protections of the law of your country.",
      contactTitle: "11. Contact",
      contactLead: "Questions about these terms:",
      contactMissing: "contact email not configured yet",
    },
  },
  fr: {
    eyebrow: "Juridique",
    lastUpdated: (date: string) => `Dernière mise à jour : ${date}`,
    notice: {
      metaTitle: "Mentions légales",
      metaDescription: "Informations sur la société qui édite Narixia.",
      title: "Mentions légales",
      notConfigured: "Pas encore configuré",
      company: "Société",
      address: "Siège social",
      registration: "Immatriculation",
      contact: "Contact",
      hosting: "Hébergement",
      disclaimer:
        "Narixia est un outil d'aide à la décision. Les chiffres affichés dans le produit sont calculés à partir des données fournies par ses utilisateurs et ne constituent pas un conseil comptable, fiscal ou financier.",
    },
    privacy: {
      metaTitle: "Politique de confidentialité",
      metaDescription: "Comment Narixia collecte, utilise et protège les données personnelles.",
      title: "Politique de confidentialité",
      intro:
        "Cette politique explique quelles données personnelles Narixia traite, pourquoi, et les choix dont vous disposez. Narixia est un service d'analyse de rentabilité destiné aux entreprises. Il est conçu pour fonctionner sans données personnelles relatives aux clients de votre boutique.",
      responsibleTitle: "Responsable du traitement",
      controllerLead: "Le responsable du traitement des données personnelles traitées via Narixia est",
      controllerMissing: "la société exploitante (informations pas encore configurées)",
      contactLead: "Contact pour les questions relatives à la confidentialité :",
      contactMissing: "contact confidentialité pas encore configuré",
      businessData:
        "Pour les données professionnelles que vous importez (commandes, produits, coûts), c'est vous qui décidez de ce qui est importé et pourquoi. Si ces données contiennent des données personnelles, Narixia les traite pour votre compte afin de fournir le service.",
      dataTitle: "Données que nous traitons",
      dataHeaders: { category: "Catégorie", examples: "Exemples", why: "Finalité" },
      dataRows: [
        {
          category: "Données de compte",
          examples: "Adresse e-mail, nom, mot de passe (stocké sous forme de hachage salé par notre prestataire d'authentification)",
          why: "Créer et sécuriser votre compte (contrat)",
        },
        {
          category: "Données professionnelles que vous fournissez",
          examples: "Profil de la boutique, produits et coûts, identifiants et montants des commandes, charges, dépenses publicitaires",
          why: "Calculer vos marges et vos rapports (contrat)",
        },
        {
          category: "Données de facturation",
          examples:
            "Identifiants client et d'abonnement, factures, statut des paiements. Les données de carte sont gérées par Stripe et ne parviennent jamais à Narixia.",
          why: "Gérer votre abonnement (contrat) et tenir la comptabilité (obligation légale)",
        },
        {
          category: "Données de sécurité",
          examples: "Adresse IP et horodatage des connexions et des actions sensibles, compteurs de limitation de débit",
          why: "Protéger les comptes et le service (intérêt légitime)",
        },
        {
          category: "Événements d'utilisation du produit",
          examples:
            "Événements tels que « import terminé » avec leur date, liés à votre compte. Ils ne contiennent jamais de montants financiers ni le contenu de vos fichiers.",
          why: "Comprendre et améliorer le produit (intérêt légitime)",
        },
        {
          category: "E-mails de vente que vous transférez (facultatif)",
          examples:
            "Seulement si vous les transférez : expéditeur, objet et date, plateforme, montant et nom d'article détectés, et un extrait de 2 000 caractères au plus dont les adresses e-mail et numéros de téléphone sont retirés",
          why: "Préparer les ventes que vous validez (contrat)",
        },
        {
          category: "Photos d'articles (facultatif)",
          examples:
            "Améliorées sur votre appareil. Narixia conserve une petite miniature par article. Seulement si vous demandez une annonce rédigée par l'IA, les photos sont envoyées à Anthropic (Claude) pour cette analyse et ne sont pas conservées par Narixia",
          why: "Afficher vos articles et rédiger les annonces que vous demandez (contrat)",
        },
        {
          category: "Messages d'assistance",
          examples: "Les messages et retours que vous nous envoyez",
          why: "Vous répondre (contrat ou intérêt légitime)",
        },
      ],
      csvTitle: "Fichiers CSV",
      csvText:
        "Lorsque vous importez un fichier CSV, il est lu dans votre navigateur. Seules les colonnes que vous associez à des champs Narixia sont envoyées à nos serveurs. Les modèles de Narixia ne demandent ni nom de client, ni adresse e-mail, ni adresse postale, et nous vous recommandons de ne pas associer de telles colonnes.",
      providersTitle: "Prestataires",
      providersIntro: "Nous faisons appel aux sous-traitants suivants, liés par des accords de traitement des données :",
      providerHeaders: { provider: "Prestataire", purpose: "Finalité", location: "Localisation" },
      transfers:
        "Lorsqu'un prestataire traite des données en dehors de l'Espace économique européen, le transfert repose sur des garanties appropriées telles que les clauses contractuelles types de la Commission européenne.",
      retentionTitle: "Durée de conservation",
      retention: [
        "Données de compte et données professionnelles : tant que votre compte existe.",
        "Lorsque vous supprimez votre compte, les données de votre organisation sont immédiatement supprimées de la base de données en production. Les copies présentes dans les sauvegardes chiffrées expirent selon le cycle de rotation des sauvegardes de notre fournisseur de base de données.",
        "Données de facturation : aussi longtemps que l'exige la législation comptable et fiscale.",
        "Journaux de sécurité et événements d'utilisation : jusqu'à 12 mois.",
        "E-mails de vente transférés : supprimés 30 jours après que vous les avez validés ou ignorés, et au plus tard au bout de 90 jours sinon.",
      ],
      cookiesTitle: "Cookies",
      cookiesText:
        "Narixia n'utilise que des cookies strictement nécessaires : des cookies d'authentification qui vous maintiennent connecté et protègent votre session. Nous n'utilisons pas de cookies publicitaires. Si une mesure d'audience facultative devait un jour être activée, nous vous demanderions d'abord votre consentement.",
      rightsTitle: "Vos droits",
      rightsText:
        "Selon votre lieu de résidence, vous pouvez demander à accéder à vos données personnelles, à les rectifier, à les supprimer ou à les exporter, vous opposer à certains traitements ou en demander la limitation, et retirer votre consentement à tout moment. Vous pouvez exporter toutes vos données et supprimer vous-même votre compte depuis la page des paramètres. Vous avez également le droit d'introduire une réclamation auprès de votre autorité de protection des données.",
      securityTitle: "Sécurité",
      securityText:
        "Les données sont chiffrées en transit. L'accès aux données de votre organisation est réservé à ses membres par des règles d'accès au niveau de la base de données, et l'accès administratif est limité à ce qui est nécessaire pour exploiter le service.",
      changesTitle: "Modifications",
      changesText:
        "Nous mettrons à jour cette page lorsque nos traitements évolueront et, en cas de modification importante, nous en informerons les titulaires de compte par e-mail ou dans l'application.",
    },
    terms: {
      metaTitle: "Conditions d'utilisation",
      metaDescription: "Les conditions applicables à votre utilisation de Narixia.",
      title: "Conditions d'utilisation",
      introLead: "Les présentes conditions constituent l'accord entre vous et",
      companyMissing: "la société exploitante (informations pas encore configurées)",
      introRest: "(« Narixia », « nous ») pour l'utilisation du service Narixia. En créant un compte, vous les acceptez.",
      serviceTitle: "1. Le service",
      service1:
        "Narixia est une application web qui aide les entreprises à analyser leurs ventes, leurs coûts, leur publicité et leurs marges à partir des données qu'elles fournissent. Elle est destinée à un usage professionnel. Narixia est une aide à la décision ; elle ne constitue pas un conseil comptable, fiscal, juridique ou financier et ne remplace pas votre comptabilité.",
      service2:
        "Les résultats dépendent de l'exhaustivité et de l'exactitude des données que vous fournissez. Les valeurs estimées et manquantes sont signalées dans le produit, et vous restez responsable des décisions que vous prenez sur la base des résultats.",
      accountTitle: "2. Votre compte",
      account: [
        "Vous devez fournir des informations exactes et garder votre mot de passe confidentiel.",
        "Vous êtes responsable de l'activité réalisée depuis votre compte et devez nous signaler sans délai toute utilisation non autorisée.",
        "Vous devez être habilité à accepter les présentes conditions au nom de l'entreprise que vous représentez.",
      ],
      trialTitle: "3. Essai gratuit",
      trialLead: (days: number) =>
        `Les nouveaux comptes bénéficient d'un essai gratuit de ${days} jours. Aucune carte bancaire n'est requise pour commencer, et vous n'êtes jamais prélevé automatiquement à la fin de l'essai. Les comptes en essai sont soumis aux limites indiquées sur la`,
      trialLink: "page des tarifs",
      trialRest:
        ". Lorsque l'essai se termine sans abonnement, vos données sont conservées et restent disponibles à l'export, tandis que les analyses et les imports sont suspendus.",
      paymentTitle: "4. Abonnements et paiement",
      payment: (graceDays: number) => [
        "Les offres payantes sont facturées d'avance pour chaque période de facturation par l'intermédiaire de notre prestataire de paiement, Stripe.",
        "Les abonnements se renouvellent automatiquement jusqu'à leur résiliation. Vous pouvez résilier à tout moment depuis la page de facturation ; la résiliation prend effet à la fin de la période en cours.",
        "Sauf disposition légale contraire, les paiements ne sont pas remboursables au prorata des périodes entamées.",
        `Si un paiement échoue, nous conservons votre accès pendant ${graceDays} jours, le temps que le paiement soit relancé. S'il échoue encore, les fonctionnalités payantes sont suspendues jusqu'à ce que le paiement aboutisse.`,
        "Nous pouvons modifier nos prix moyennant un préavis d'au moins 30 jours. Les modifications s'appliquent à partir de la période de facturation suivant ce préavis.",
      ],
      dataTitle: "5. Vos données",
      dataLead:
        "Vous conservez tous les droits sur les données que vous importez. Vous nous accordez les droits nécessaires pour les héberger et les traiter afin de fournir le service. Vous pouvez exporter vos données et supprimer votre compte à tout moment depuis la page des paramètres. Notre traitement des données personnelles est décrit dans la",
      dataLink: "politique de confidentialité",
      dataRest: ".",
      dataRight:
        "Vous devez disposer du droit d'importer les données que vous fournissez et ne devez pas importer de données que vous n'êtes pas autorisé à partager.",
      useTitle: "6. Utilisation acceptable",
      use: [
        "N'essayez pas d'accéder aux données d'autres clients ni de contourner les mesures de sécurité ou les limites d'utilisation.",
        "N'utilisez pas le service pour stocker des contenus illicites ou envoyer du spam.",
        "Ne surchargez pas le service, par exemple par des requêtes automatisées dépassant un usage normal.",
      ],
      availabilityTitle: "7. Disponibilité et modifications",
      availability:
        "Nous nous efforçons de maintenir Narixia disponible et fiable, sans garantir un service ininterrompu. Nous pouvons modifier ou supprimer des fonctionnalités ; si nous cessons le service, nous vous en informerons dans un délai raisonnable et vous donnerons la possibilité d'exporter vos données.",
      liabilityTitle: "8. Responsabilité",
      liability:
        "Dans les limites permises par la loi, notre responsabilité totale au titre des présentes conditions est limitée aux montants que vous nous avez versés au cours des douze mois précédant le fait générateur de la réclamation, et nous ne sommes pas responsables des pertes indirectes telles que les pertes de bénéfices ou les décisions commerciales prises à l'aide du service. Rien dans les présentes conditions ne limite une responsabilité qui ne peut être limitée par la loi.",
      terminationTitle: "9. Résiliation",
      termination:
        "Vous pouvez cesser d'utiliser Narixia et supprimer votre compte à tout moment. Nous pouvons suspendre ou fermer les comptes qui enfreignent les présentes conditions, après préavis lorsque cela est raisonnable.",
      lawTitle: "10. Droit applicable",
      lawLead: "Les présentes conditions sont régies par le droit du pays suivant :",
      countryMissing: "pays de la société exploitante (pas encore configuré)",
      lawRest: ", sans préjudice des protections impératives prévues par le droit de votre pays.",
      contactTitle: "11. Contact",
      contactLead: "Questions sur les présentes conditions :",
      contactMissing: "e-mail de contact pas encore configuré",
    },
  },
});
