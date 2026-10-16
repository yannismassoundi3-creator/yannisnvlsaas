[English](../BILLING.md) · **Français**

# Facturation, essai gratuit et droits d'accès

Narixia utilise **Stripe Billing** avec Checkout hébergé par Stripe et le portail client Stripe. Les coordonnées
bancaires sont saisies uniquement sur les pages de Stripe ; Narixia ne les voit ni ne les stocke jamais. L'accès aux
fonctionnalités payantes est accordé **uniquement à partir d'événements webhook vérifiés**, jamais à partir de la
redirection de retour depuis Checkout.

> État de cette intégration : implémentée et couverte par des tests automatisés qui utilisent le propre schéma de
> signature de Stripe et des contenus d'événements réalistes (`tests/db/billing.test.ts`). Elle n'a **pas** été
> exécutée sur un vrai compte Stripe depuis ce dépôt, faute d'identifiants Stripe disponibles. Suivez la procédure en
> mode test ci-dessous avant de vous y fier, et la checklist de lancement avant d'encaisser de vrais paiements.

## Conditions commerciales (configurables)

Définies dans `src/config/plans.ts`. Le prix Pro affiché provient de `NEXT_PUBLIC_PRO_PRICE_MINOR` /
`NEXT_PUBLIC_PRO_PRICE_CURRENCY` ; **le montant facturé provient toujours du Price Stripe** défini dans
`STRIPE_PRICE_PRO_MONTHLY`, gardez-les donc identiques.

| | Essai gratuit | Pro (proposé à 19 €/mois) |
| --- | --- | --- |
| Durée | 14 jours à partir de la création de l'espace de travail, sans carte | Abonnement mensuel |
| Vraies boutiques | 1 (la boutique d'exemple ne compte pas) | 3 |
| Lignes par fichier CSV / par mois | 5 000 / 20 000 | 100 000 / 1 000 000 |
| Historique dans les tableaux de bord et les rapports | 90 derniers jours | 3 dernières années |
| Exports CSV, rapports PDF et CSV | — | Oui |
| Filtres par produit et par campagne | — | Oui |

La durée de l'essai gratuit (14 jours) et la période de grâce en cas d'échec de paiement (7 jours) sont définies à la
fois dans `src/config/plans.ts` et dans `private.trial_period()` / `private.payment_grace_period()` dans la base de
données, qui les applique. Un test de base de données échoue si les deux divergent.

## Niveaux d'accès

La base de données calcule le niveau d'accès de chaque organisation (`private.org_access`), et la Row Level Security
(RLS) l'utilise :

| Niveau | Quand | Effet |
| --- | --- | --- |
| `pro` | Un abonnement est `active` ou `trialing` | Limites Pro |
| `grace` | Un abonnement est `past_due` depuis moins de 7 jours | Limites Pro, bandeau demandant de mettre à jour le moyen de paiement |
| `trial` | Aucun abonnement en cours et l'essai gratuit de 14 jours n'est pas terminé | Limites de l'essai gratuit, bandeau de compte à rebours (avertissement pendant les 3 derniers jours) |
| `expired` | Dans tous les autres cas | Les données sont conservées mais en lecture seule : ni import ni modification (appliqué par la RLS), tableaux de bord et rapports suspendus. La facturation, les réglages et l'export complet des données restent disponibles. |

`src/lib/billing/entitlements.ts` traduit le niveau en limites de l'offre et en état de l'interface. Les limites de
l'offre sont appliquées côté serveur : le nombre de boutiques par un trigger de la base de données, la taille des
imports dans les actions d'import, les exports et les rapports dans leurs routes. Masquer un bouton n'est jamais le
seul contrôle.

## Parcours

### S'abonner

1. Le propriétaire clique sur **Subscribe** (s'abonner) sur la page Billing (facturation). `startCheckout` (server
   action) vérifie le rôle, le niveau d'accès actuel et une limite de débit, crée ou réutilise le client Stripe (clé
   d'idempotence par organisation), et crée une Checkout Session en mode `subscription`.
2. Tant qu'il reste plus de deux jours d'essai gratuit, l'abonnement est créé avec `trial_end` fixé à la fin de
   l'essai Narixia : la carte est enregistrée immédiatement et **le premier prélèvement a lieu à la fin de l'essai**,
   comme l'indiquent le bouton et la page. S'il reste deux jours ou moins (Stripe exige une fin d'essai au moins
   48 heures à l'avance), l'abonnement démarre immédiatement.
3. Stripe redirige vers `/app/billing?checkout=success`. La page affiche « waiting for confirmation » (en attente de
   confirmation) et se rafraîchit jusqu'à ce que le webhook ait enregistré l'abonnement. La redirection elle-même
   n'accorde rien.

### Gérer, résilier, mettre à jour la carte

Le bouton **Manage billing** (gérer la facturation) ouvre le portail client Stripe (`openBillingPortal`). La
résiliation, la mise à jour du moyen de paiement et les factures y sont gérées. Une résiliation en fin de période
conserve l'offre Pro jusqu'à la fin de la période payée ; la page Billing affiche la date de fin.

### Échecs de paiement

Lorsqu'un renouvellement échoue, Stripe marque l'abonnement `past_due` et effectue de nouvelles tentatives selon vos
réglages Stripe. Narixia conserve un accès complet pendant 7 jours à compter du premier échec (`grace`), puis le compte
passe à `expired` jusqu'à ce qu'un paiement aboutisse. Aucune donnée n'est supprimée.

### Historique de facturation

La page Billing liste les 12 dernières factures de Stripe, avec des liens vers la facture hébergée par Stripe et son
PDF.

### Suppression du compte

La suppression du compte (Settings → Data, soit Réglages → Données) commence par résilier immédiatement tous les
abonnements en cours, sans prorata ni facture finale. Si Stripe est injoignable, rien n'est supprimé et l'utilisateur
est invité à réessayer ou à contacter le support.

## Webhooks

Point d'accès : `POST /api/stripe/webhook` (`src/app/api/stripe/webhook/route.ts`).

| Événement | Traitement |
| --- | --- |
| `checkout.session.completed`, `checkout.session.async_payment_succeeded` | Associe le client Stripe à l'organisation, puis synchronise l'abonnement |
| `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.pending_update_applied`, `.pending_update_expired` | Synchronise l'abonnement |
| `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.marked_uncollectible` | Synchronise l'abonnement de la facture et enregistre l'issue de la facture |
| tout autre événement | Enregistré comme `ignored` |

Garanties :

- **Authenticité.** La signature est vérifiée sur le corps brut avec `STRIPE_WEBHOOK_SECRET` avant toute autre
  opération ; les signatures invalides ou absentes reçoivent `400`.
- **Idempotence.** Chaque identifiant d'événement est stocké une seule fois dans `billing_events`. Un événement déjà
  `processed` ou `ignored` est acquitté sans traitement ; les livraisons simultanées d'un même événement sont sans
  danger.
- **Ordre.** L'abonnement est relu depuis l'API Stripe (le contenu de l'événement peut être périmé) et n'est appliqué
  que si aucun événement plus récent n'a été appliqué avant (`stripe_event_at`).
- **Nouvelles tentatives.** Les erreurs de traitement renvoient `500` afin que Stripe réessaie avec un délai
  croissant ; l'erreur est conservée sur la ligne de l'événement pour le support.
- **Audit.** `billing_events` conserve le type, l'issue, l'organisation et un résumé (statut, identifiant et montant
  de la facture) de chaque événement. Cette table n'est lisible qu'avec le rôle de service.

Le SDK (`stripe` 23) est figé sur la version d'API **`2026-09-30.endive`**. Créez le point d'accès webhook avec la même
version d'API pour que les contenus correspondent au code (le lien facture → abonnement est lu dans
`invoice.parent.subscription_details`, les périodes de facturation dans les éléments de l'abonnement).

## Configuration en mode test Stripe

1. Créez un compte Stripe et restez en **mode test**.
2. **Produit et prix :** Catalogue de produits → Ajouter un produit « Narixia Pro » → prix récurrent, mensuel,
   19,00 € (ou votre prix). Copiez l'identifiant du prix (`price_…`) dans `STRIPE_PRICE_PRO_MONTHLY`, et réglez
   `NEXT_PUBLIC_PRO_PRICE_MINOR` et `NEXT_PUBLIC_PRO_PRICE_CURRENCY` en conséquence.
3. **Clé API :** Développeurs → Clés API → clé secrète (`sk_test_…`) dans `STRIPE_SECRET_KEY`. Une clé restreinte
   (`rk_test_…`) fonctionne aussi si elle autorise Customers, Checkout Sessions, Subscriptions, Invoices et Billing
   Portal.
4. **Portail client :** Paramètres → Billing → Portail client. Activez la résiliation (en fin de période
   recommandé), la mise à jour du moyen de paiement et l'historique des factures. Enregistrez, sinon les sessions du
   portail échouent.
5. **Webhook, développement local :** installez la CLI Stripe, puis
   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Copiez le `whsec_…` affiché dans `STRIPE_WEBHOOK_SECRET` et redémarrez `npm run dev`.
6. **Webhook, déploiement :** Développeurs → Webhooks → Ajouter un point d'accès
   `https://<your-domain>/api/stripe/webhook`, version d'API `2026-09-30.endive`, avec les événements du tableau
   ci-dessus. Copiez son secret de signature dans `STRIPE_WEBHOOK_SECRET` dans l'environnement de l'hébergeur.
7. **Taxes (facultatif) :** pour laisser Stripe calculer la TVA, activez Stripe Tax, ajoutez vos immatriculations,
   définissez le comportement fiscal du prix et réglez `STRIPE_AUTOMATIC_TAX=true`. Checkout exige alors une adresse
   de facturation et accepte les numéros de TVA.
8. **Nouvelles tentatives et e-mails :** Paramètres → Billing → Abonnements et e-mails : choisissez le calendrier des
   nouvelles tentatives (Smart Retries) et ce qui se passe après la dernière tentative (annuler ou marquer comme
   impayé ; les deux mettent fin à l'accès Pro), et activez les e-mails de Stripe pour les échecs de paiement et les
   fins d'essai à venir si vous le souhaitez. Narixia, de son côté, n'affiche que des bandeaux dans l'application.

### Test de bout en bout en mode test

Avec `npm run dev` et `stripe listen` en cours d'exécution :

1. Inscrivez-vous, ouvrez Billing, cliquez sur Subscribe, payez avec `4242 4242 4242 4242` (n'importe quelle date
   future, n'importe quel CVC).
2. De retour sur Billing, le statut passe à « Pro » en quelques secondes ; `billing_events` affiche
   `checkout.session.completed` et `customer.subscription.created` comme `processed`.
3. Ouvrez **Manage billing**, résiliez l'abonnement : Billing affiche la date de fin. Réactivez-le depuis le portail.
4. Échec de paiement : abonnez-vous avec `4000 0000 0000 0341` (la carte s'enregistre, puis le prélèvement échoue),
   ou utilisez une horloge de test (test clock) pour avancer au-delà de la fin de l'essai. Le compte affiche le
   bandeau de période de grâce, puis expire après 7 jours d'échec.
5. Rejeux : `stripe events resend <evt_id>` doit laisser les données inchangées (l'événement est acquitté comme
   doublon).
6. Lancez `stripe trigger customer.subscription.updated` et vérifiez que l'événement est traité ou ignoré, jamais en
   échec.

## Avant d'accepter de vrais paiements

Les clés de production seules ne suffisent pas à lancer de vrais paiements : avec une clé `sk_live_…`/`rk_live_…`,
les nouveaux paiements Checkout restent désactivés et la page Billing l'indique, jusqu'à ce que
**`STRIPE_LIVE_ENABLED=true`** soit défini. Ne le définissez que lorsque tous les points ci-dessous sont réglés.

**Éligibilité et vérification — à vérifier en premier ; ce sont des obligations légales, pas des formalités :**

- **Âge.** Stripe exige que le représentant du compte soit majeur (au moins 18 ans dans la plupart des pays, y compris
  en France) et ait la capacité de contracter. Un mineur ne peut pas ouvrir ni exploiter le compte Stripe en son nom
  propre ; un parent ou un représentant légal, ou une société représentée par un adulte, doit le détenir. Vérifiez les
  conditions actuelles de Stripe pour votre pays.
- **Identité de l'entreprise.** Stripe vérifie l'entité juridique (entreprise individuelle ou société), son numéro
  d'immatriculation (par exemple SIREN/SIRET en France), son adresse, la pièce d'identité du représentant et les
  propriétaires/dirigeants. Vendre un abonnement nécessite d'être immatriculé pour exercer une activité commerciale
  dans votre pays (par exemple micro-entrepreneur ou société en France). Les versements nécessitent un compte bancaire
  au nom de l'entreprise.
- **Éligibilité du produit.** Vérifiez que le type d'activité et la description de Narixia sont acceptés au regard de
  la liste des activités restreintes de Stripe, et que votre site public affiche les prix, les conditions, la
  politique de remboursement/résiliation et les coordonnées (Stripe les examine).

**Fiscalité et juridique :**

- TVA : déterminez si vous êtes sous un seuil de franchise de TVA (par exemple la *franchise en base* en France) ou
  immatriculé à la TVA. Vendre des services numériques à des consommateurs d'autres pays de l'UE peut nécessiter le
  guichet unique OSS ; les clients professionnels peuvent être facturés en autoliquidation. Faites-le confirmer par un
  expert-comptable.
- Les factures doivent comporter les mentions légales obligatoires de votre pays (réglages des factures Stripe : nom
  légal, adresse, numéro d'immatriculation, numéro de TVA ou mention d'exonération de TVA).
- Faites relire les conditions d'utilisation, la politique de confidentialité et les mentions légales par un avocat ;
  ce sont des modèles rédigés pour ce produit, pas un conseil juridique. Renseignez les informations sur l'entreprise
  (`NEXT_PUBLIC_COMPANY_*`).
- Droit de la consommation de l'UE : si vous vendez à des consommateurs, le droit de rétractation de 14 jours
  s'applique aux services numériques, sauf si le client y renonce expressément au démarrage du service ; le paiement
  Checkout et les conditions doivent refléter l'approche que vous avez choisie.

**Technique :**

- Effectuez le test de bout en bout en mode test ci-dessus sur le déploiement de production (avec les clés de test)
  et conservez les résultats.
- Créez le produit, le prix, la configuration du portail et le point d'accès webhook en mode production (le mode
  production a des objets distincts).
- Définissez les valeurs de production de `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` et `STRIPE_PRICE_PRO_MONTHLY`,
  puis `STRIPE_LIVE_ENABLED=true`, et redéployez.
- Effectuez un achat réel avec votre propre carte, vérifiez les événements webhook, la facture et le portail, puis
  remboursez-le depuis le Dashboard Stripe.
