[English](../TESTING.md) · **Français**

# Tests

Quatre niveaux, du plus rapide au plus lent. Exécutez les vérifications rapides avant chaque commit ; exécutez
l'ensemble avant une mise en production.

```bash
npm run check            # lint + typecheck + unit and component tests (no services needed)
npm run test:db          # database tests (local Supabase stack)
npm run test:e2e         # end-to-end tests in Chromium (local stack + dev server)
npm run build            # production build
```

## Tests unitaires (`tests/unit`, Vitest, Node)

Logique pure, sans réseau ni base de données. `npm run test:unit`.

| Domaine | Ce qui est couvert |
| --- | --- |
| Montants et décimaux | Analyse exacte des décimaux (séparateurs, signes, notation scientifique, limites), devises à 0, 2 et 3 décimales, coûts unitaires en e4, arrondi au plus proche avec moitié éloignée de zéro, répartition selon la méthode du plus fort reste, formatage |
| Taxes et indicateurs | Retrait de la taxe incluse (sans taxe, TVA à 20 %, résidu d'arrondi, totaux exacts sur de nombreuses commandes aléatoires, montants de taxe impossibles), la cascade de rentabilité, marge négative, remboursements supérieurs aux ventes, états de complétude, écarts, sémantique des écarts de KPI |
| Calculateur | Du brut à la marge sur coûts variables, valeurs nulles, ajustements négatifs, remboursements, saisies fixes ou en pourcentage, coûts manquants, devises inhabituelles, prix d'équilibre exact et cas « cannot break even » (équilibre impossible) |
| Référence d'agrégation | Déterminisme du générateur de démonstration, attribution des dates selon le fuseau horaire, remboursements datés séparément, estimations, répartition par produit, règles d'analyse sur la boutique de démonstration |
| Plages de dates et séries | Préréglages, plages personnalisées tronquées à l'historique de l'offre, périodes de comparaison, regroupements hebdomadaires/mensuels et regroupements partiels, correspondance des lignes SQL |
| Imports | Reconnaissance des en-têtes (Shopify, Meta, Google Ads), horodatages avec décalage, heures locales lors des changements d'heure, détection de l'ordre jour/mois et des ambiguïtés, regroupement des commandes, répartition des remises de commande, commandes et remboursements TTC, mise en attente de la commande entière, commandes annulées, autres devises, valeurs contradictoires au niveau de la commande, variantes Shopify, correspondance des produits identique à celle de la base de données, lignes de publicité et de dépenses |
| Mode revendeur | Numéros de vente et références d'articles (format, sans lettres ambiguës, unicité), règle des 60 jours (« articles qui traînent »), mode suggéré selon la plateforme, plateformes de vente, plateforme par défaut, rapprochement approximatif des noms, validation des articles et des ventes (décimales à virgule, champs obligatoires, dates futures, limites, messages dans les deux langues) |
| Droits d'accès | Niveaux d'accès, compte à rebours de l'essai, période de grâce, limites de l'offre, début de l'historique |
| Redirections d'authentification | Seuls les chemins `next` relatifs du même site sont acceptés |
| Exports | Neutralisation de l'injection de formules CSV, BOM et CRLF, cellules décimales, noms de fichiers ; rendu des rapports PDF (libellé de la boutique d'exemple inclus) |

## Tests de composants (`tests/components`, Vitest, jsdom, Testing Library)

Comportements de l'interface qui comptent pour l'exactitude et l'accessibilité. `npm run test:components`.

- Les tuiles de KPI indiquent le sens d'une variation par du texte et ne colorent que les variations significatives.
- La décomposition de la rentabilité conserve le signe d'une marge sur coûts variables négative, signale les coûts
  incomplets et indique que la marge sur coûts variables n'est pas le bénéfice net.
- Les avis sur les données expliquent les coûts manquants et les estimations avec les montants et un lien pour les
  corriger, et restent silencieux lorsque les données sont complètes.
- L'éditeur de coûts en ligne s'ouvre avec le focus dans le champ et se ferme avec Échap.

## Tests de base de données (`tests/db`, Vitest sur la pile Supabase locale)

Ces tests exécutent du vrai SQL, des politiques RLS et des fonctions avec les rôles `authenticated`, `anon` et
`service_role`. `npm run test:db` (nécessite `npx supabase start` ; utilise `SUPABASE_DB_URL` et les clés de
`.env.local`).

| Fichier | Ce qui est couvert |
| --- | --- |
| `tenancy.test.ts` | RPC d'onboarding ; pour chaque table, un autre client ne peut ni lire ni écrire ; les colonnes protégées (dates d'essai, données de facturation) ne peuvent pas être modifiées par les utilisateurs ; les comptes expirés sont en lecture seule ; les constantes d'essai et de grâce correspondent à `src/config/plans.ts` |
| `integrity.test.ts` | Références entre boutiques rejetées (lignes de commande, remboursements, liens de campagne, dépenses publicitaires) ; invariants de montant (remise ≤ montant de la ligne) ; numéros de commande en double refusés ; correspondance des produits par SKU ou par nom |
| `reporting.test.ts` | Les totaux SQL, séries quotidiennes, décompositions par produit et par campagne sont égaux à la référence TypeScript sur un jeu de données généré, y compris les égalités de répartition ; la boutique d'une autre organisation ne renvoie rien ; les rapports sont suspendus après expiration tandis que les données restent exportables ; les plages invalides sont rejetées |
| `imports.test.ts` | Règles de mise en attente (staging), de finalisation et de doublons pour chaque type (stratégies d'ignorance et de mise à jour), mise en attente de la commande entière, validation par lots, annulation restaurant les enregistrements remplacés, « seul le dernier import peut être annulé », contrôle d'accès |
| `billing.test.ts` | Pro uniquement à partir d'un événement de checkout vérifié ; début et fin de la période de grâce ; rétablissement après un paiement réessayé ; événements obsolètes ignorés ; résiliation ; organisations inconnues ignorées ; périodes de facturation issues des éléments d'abonnement ; vérification de la signature du webhook (requêtes non signées ou mal signées rejetées) et rejeux idempotents, à l'aide de l'outil de signature de test fourni par Stripe |
| `reseller.test.ts` | Onboarding en mode revendeur (règles de frais et d'expédition nulles) et ancien appel à sept arguments ; contraintes sur le mode, la plateforme de vente et la date d'achat ; numéros de vente uniques ; une vente rapide alimente les totaux quotidiens, le rapport produits, la répartition par plateforme et la liste des articles ; remboursements par plateforme ; annuler une vente remet l'article en stock ; les autres clients et les visiteurs anonymes ne voient rien ; un compte expiré ne peut pas changer de mode |
| `stores.test.ts` | Limite de boutiques par offre appliquée par la base de données ; la boutique d'exemple n'est pas comptée |

Les tests de facturation ne simulent que l'appel qui relit un abonnement depuis Stripe ; les signatures sont produites
et vérifiées avec le vrai SDK Stripe. Ils ne contactent pas Stripe.

## Tests de bout en bout (`tests/e2e`, Playwright, Chromium)

`npm run test:e2e` lance `npm run dev`, sauf si `E2E_BASE_URL` pointe vers un déploiement en cours d'exécution. Ces
tests nécessitent la pile Supabase locale (les e-mails de confirmation d'inscription sont lus dans sa boîte Mailpit à
`MAILPIT_URL`).

- **Site public :** contenu de la page d'accueil et absence d'erreurs de page ; la tarification, le glossaire, les
  pages légales, la page de contact et le calculateur public s'affichent avec un code HTTP 200 ; les pages de
  l'application et l'export des données exigent une connexion ; en-têtes de sécurité.
- **Parcours marchand** (en série) : inscription et confirmation par e-mail → onboarding → boutique d'exemple → passage
  à la vraie boutique → import d'un CSV Shopify contenant une ligne invalide, examen de l'erreur, confirmation →
  chiffres de la vue d'ensemble et avis de coût manquant → ajout d'un coût en ligne → annulation de l'import →
  enregistrement des règles de coûts → téléchargement de l'export complet des données → suppression du compte.
- **Mode revendeur** (en français) : inscription → onboarding avec Vinted, qui sélectionne le mode revendeur → ajout
  de deux articles à la suite → vente enregistrée avec « Vendu ! » et un prix à virgule (18,50) → l'accueil affiche la
  vente, ce qui reste et un article en stock → Mes articles l'affiche comme vendu ; contrôles axe sur l'accueil et les
  deux fenêtres, et aucun débordement horizontal à 390 px de large (téléphone).
- **Accessibilité :** axe-core (règles WCAG 2.0/2.1/2.2 de niveaux A et AA) s'exécute sur les pages publiques, le
  tableau de bord et l'examen de l'import, et ne doit signaler aucune violation.

## Écrire des tests

- Nouvelles règles financières : tests unitaires d'abord, avec des valeurs explicites en unités mineures (par exemple
  `-1_000` vaut −10,00 €).
- Nouveau SQL ou nouvelle RLS : un test de base de données qui prouve à la fois le cas autorisé et le cas refusé.
- Utilisez uniquement des données fictives (e-mails `example.test`, produits inventés). Ne copiez jamais de vrais
  exports clients dans les fixtures.
