[English](README.md) · **Français**

# Narixia

**Comprenez vos vraies marges. Prenez de meilleures décisions.**

Narixia est un outil d'analyse de rentabilité pour les petites entreprises de e-commerce : marchands Shopify, boutiques
en ligne indépendantes et petites marques qui utilisent la publicité payante. Il réunit les ventes, le coût des
produits, la livraison, les frais de paiement, la publicité et les autres dépenses dans une vue claire de la marge sur
coûts variables (contribution margin), par boutique et par produit.

Narixia est un outil d'aide à la décision, pas un logiciel de comptabilité. Chaque indicateur a une définition publiée,
les estimations et les données manquantes sont toujours signalées, et la marge sur coûts variables n'est jamais
présentée comme un bénéfice net.

## Fonctionnalités

- **Tableau de bord de synthèse :** ventes brutes, remises, remboursements, ventes nettes, coût des marchandises
  vendues (COGS), frais de livraison et de paiement, publicité, marge sur coûts variables et taux de marge, commandes
  et panier moyen ; comparaison avec la période précédente ; graphique du chiffre d'affaires et de la marge ;
  décomposition de la rentabilité ; analyses fondées sur des règles qui montrent leurs justificatifs ; alertes sur la
  qualité des données.
- **Produits :** recherche, tri, filtres (coût manquant, à perte, archivés), pagination, pages de détail avec les
  ventes quotidiennes, modification des coûts directement dans la liste. La publicité au niveau de la boutique n'est
  jamais répartie arbitrairement entre les produits.
- **Publicité :** dépenses, ROAS de la plateforme, ROAS global (blended ROAS) et ROAS au seuil de rentabilité par
  campagne ; association d'une campagne au produit qu'elle promeut ; saisie manuelle des dépenses quotidiennes.
- **Transactions et coûts :** commandes, remboursements et dépenses, avec saisie et correction manuelles.
- **Imports CSV :** commandes, produits et coûts, dépenses publicitaires et autres dépenses, avec modèles,
  reconnaissance automatique des exports Shopify, Meta et Google Ads, correspondance des colonnes, validation ligne par
  ligne, détection des doublons, revue avant enregistrement, validation par lots, historique et annulation. Le fichier
  est lu dans le navigateur ; seules les colonnes mises en correspondance sont envoyées.
- **Rapports :** PDF (synthèse, produits, publicité) et CSV (synthèse, quotidien), avec la période, les définitions
  et les remarques sur la qualité des données ; exports CSV des produits et des campagnes, protégés contre l'injection
  de formules.
- **Calculateur de rentabilité** avec un prix exact au seuil de rentabilité, dans l'application et en outil public.
- **Boutique d'exemple** avec des données de démonstration clairement signalées, séparée des vraies boutiques.
- **Comptes :** e-mail et mot de passe avec vérification et réinitialisation du mot de passe, prise en main en quatre
  étapes, organisations avec rôles, plusieurs boutiques (Pro), export complet des données et suppression du compte.
- **Facturation :** essai gratuit de 14 jours sans carte, offre Pro via Stripe Checkout et le portail client, webhooks
  vérifiés et idempotents, période de grâce en cas d'échec de paiement, droits d'accès appliqués par la base de
  données.
- **Site marketing** avec tarifs, FAQ, glossaire des termes financiers, pages légales, sitemap et images pour les
  réseaux sociaux.
- **Anglais et français :** pages publiques dans les deux langues (anglais à la racine, français sous `/fr`, choisi selon la langue du navigateur) ; l'application, les e-mails, les rapports PDF et les exports CSV suivent la langue choisie dans les paramètres ou via le sélecteur de langue. Les nombres et les dates sont formatés selon la langue. Les traductions sont des modules typés dans `src/i18n/messages/`.

## Stack technique

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Radix UI · Recharts · Supabase (PostgreSQL avec
Row Level Security, Auth) · Stripe · pdfkit · zod · Vitest · Playwright. Voir [docs/fr/ARCHITECTURE.md](docs/fr/ARCHITECTURE.md).

## Installation locale

Prérequis : Node.js 20.9+ (22 recommandé), npm, Docker (pour la stack Supabase locale). Facultatif : la CLI Stripe.

```bash
git clone <repository-url> narixia && cd narixia
npm install

# 1. Start the local Supabase stack (Postgres, Auth, Mailpit) and apply the migrations
npx supabase start
npm run db:reset

# 2. Configure the environment
cp .env.example .env.local
npx supabase status          # copy API_URL, PUBLISHABLE_KEY and SECRET_KEY into .env.local

# 3. Create a demo account (optional)
npm run seed                 # demo@narixia.test / margins2026ok

# 4. Run the app
npm run dev                  # http://localhost:3000
```

Les e-mails envoyés par la stack locale (confirmation d'inscription, réinitialisation du mot de passe) apparaissent
dans Mailpit à l'adresse http://127.0.0.1:54324.

La facturation fonctionne en local dès que les clés de test Stripe sont définies et que
`stripe listen --forward-to localhost:3000/api/stripe/webhook` est lancé ; voir [docs/fr/BILLING.md](docs/fr/BILLING.md).
Sans clés Stripe, l'application fonctionne normalement et la page Billing (facturation) indique que les paiements ne
sont pas configurés.

## Variables d'environnement

Chaque variable est listée et expliquée dans [`.env.example`](.env.example). L'essentiel :

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | oui | Origine publique (redirections d'authentification, URL de retour Stripe, SEO) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | oui | Projet Supabase |
| `SUPABASE_SECRET_KEY` | oui | Clé réservée au serveur pour les webhooks, la suppression, l'audit et les limites de débit |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY` | pour la facturation | Clés Stripe de test ou de production |
| `STRIPE_LIVE_ENABLED` | pour les paiements réels | Activation explicite avant que les clés de production puissent lancer des paiements Checkout |
| `CRON_SECRET` | en production | Protège le point d'accès de maintenance quotidienne |
| `NEXT_PUBLIC_COMPANY_*`, `NEXT_PUBLIC_SUPPORT_EMAIL` | avant le lancement | Informations sur l'entreprise affichées dans les pages légales |

Ne commitez jamais de vrais identifiants : les fichiers `.env*` sont ignorés par git, sauf `.env.example`.

## Scripts

| Commande | Ce qu'elle fait |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build de production / le servir |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Tests unitaires et de composants |
| `npm run test:db` | Tests de base de données sur la stack locale (RLS, rapports SQL, imports, synchronisation de la facturation) |
| `npm run test:e2e` | Tests de bout en bout dans Chromium, y compris des contrôles d'accessibilité |
| `npm run check` | Lint, vérification des types, tests unitaires et de composants |
| `npm run db:start` / `npm run db:reset` | Démarrer la stack locale / recréer la base de données locale à partir des migrations |
| `npm run db:types` | Régénérer `src/lib/supabase/database.types.ts` |
| `npm run seed` | Créer le compte de démonstration local (refuse de s'exécuter sur un projet non local) |

## Tests

```bash
npm run check          # fast, no services
npm run test:db        # needs `npx supabase start`
npm run test:e2e       # needs the local stack; starts the dev server
```

Ce que couvre chaque niveau de tests est décrit dans [docs/fr/TESTING.md](docs/fr/TESTING.md).

## Déploiement

Projet Supabase hébergé (migrations avec `npx supabase db push`), Vercel pour l'application et le cron quotidien,
Stripe pour la facturation. Les instructions pas à pas, le processus de migration, les sauvegardes et la restauration,
ainsi que l'exploitation, sont décrits dans [docs/fr/DEPLOYMENT.md](docs/fr/DEPLOYMENT.md).

## Documentation

| Document | Contenu |
| --- | --- |
| [ARCHITECTURE.md](docs/fr/ARCHITECTURE.md) | Stack, organisation du code, cheminement des requêtes, modèle de données, points d'extension |
| [METRICS.md](docs/fr/METRICS.md) | Chaque formule, règle d'agrégation, méthode fiscale, calculateur et règle d'analyse |
| [IMPORTS.md](docs/fr/IMPORTS.md) | Le pipeline d'import, les modèles, les règles de doublons, l'annulation, les limites |
| [BILLING.md](docs/fr/BILLING.md) | Offres, droits d'accès, configuration Stripe, webhooks, procédure de test, exigences pour les paiements réels |
| [SECURITY.md](docs/fr/SECURITY.md) | Isolation des locataires, RLS, authentification, en-têtes, limites de débit, confidentialité, lacunes connues |
| [DESIGN.md](docs/fr/DESIGN.md) | Design tokens, contraste, graphiques, composants, accessibilité |
| [DEPLOYMENT.md](docs/fr/DEPLOYMENT.md) | Supabase, Vercel, Stripe, migrations, sauvegardes, restauration, exploitation |
| [TESTING.md](docs/fr/TESTING.md) | Niveaux de tests et comment les lancer |
| [LAUNCH.md](docs/fr/LAUNCH.md) | Checklist de lancement, limitations connues, fonctionnalités incomplètes, prochaines fonctionnalités |

La documentation en anglais se trouve dans [docs/](docs/).

## État du projet

Le produit est implémenté de bout en bout et testé en local (tests unitaires, de composants, de base de données et de
bout en bout, build de production). Il n'a pas encore été déployé en production ni connecté à un vrai compte Stripe,
et les pages légales doivent être revues par un professionnel. Le travail restant est listé dans
[docs/fr/LAUNCH.md](docs/fr/LAUNCH.md).
