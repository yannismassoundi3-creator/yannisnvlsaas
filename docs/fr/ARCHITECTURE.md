[English](../ARCHITECTURE.md) · **Français**

# Architecture

Narixia est une application Next.js unique qui s'appuie sur Supabase (PostgreSQL et Auth) et Stripe. Elle est conçue
pour être exploitée par une seule personne : peu de composants, la base de données comme point d'application de
l'isolation des clients (multi-tenant), et chaque règle financière regroupée à un seul endroit, avec des tests.

## Pile technique

| Couche | Choix |
| --- | --- |
| Framework | Next.js 16.4 (App Router, Cache Components / prérendu partiel, routes typées, `proxy.ts`), React 19.3, TypeScript |
| Interface | Tailwind CSS 4 avec des design tokens, primitives Radix UI, icônes Lucide, Recharts 3, notifications Sonner |
| Données | Supabase : PostgreSQL avec Row Level Security, Supabase Auth (e-mail et mot de passe), sessions par cookie `@supabase/ssr` |
| Validation | zod 4 sur chaque server action ; contraintes et vérifications en SQL |
| Facturation | Stripe Billing (Checkout, portail client, webhooks), `stripe` 23 |
| Fichiers | papaparse (CSV, dans le navigateur), pdfkit (rapports PDF, sur le serveur) |
| Dates | date-fns 4 avec `@date-fns/tz` ; chaque boutique a un fuseau horaire de reporting |
| Tests | Vitest (unitaires, composants avec jsdom, base de données), Playwright avec axe-core (de bout en bout) |
| Hébergement (suggéré) | Vercel pour l'application et la tâche cron quotidienne, projet Supabase hébergé dans l'UE |

## Arborescence des répertoires

```
src/
  app/
    (marketing)/        public site: home, pricing, glossary, legal pages, public calculator
    (auth)/             sign-in, sign-up, check-email, forgot/reset password
    auth/               email link confirmation route and error page
    onboarding/         four-step onboarding
    app/                the application (overview, products, advertising, transactions, imports,
                        reports, calculator, settings, billing), with Suspense skeletons and an error boundary
    api/                route handlers: Stripe webhook, exports, reports, account export, import issues, cron
  components/           UI primitives (ui/), charts, and feature components per section
  config/               plans.ts (prices, limits, trial), site.ts (company details, processors)
  lib/
    auth/               session and workspace resolution (requireUser / requireWorkspace / requireStore)
    data/               read models used by pages (one module per section)
    <feature>/actions.ts server actions (validated mutations) for products, transactions, advertising,
                        imports, billing, settings, onboarding, workspace
    finance/            money, decimals, tax, metrics, KPIs, insights, calculator (pure, unit-tested)
    analytics/          reference aggregation, date ranges, series bucketing, SQL row mapping, first-party events
    imports/            import schema, header mapping, parsing, normalisation
    billing/            Stripe client, webhook sync, entitlements
    reports/            PDF rendering and report data
    supabase/           server, browser, admin and proxy clients; generated database types
  proxy.ts              refreshes Supabase sessions on application routes
supabase/
  migrations/           schema, RLS policies and SQL functions, in order
  templates/            auth email templates
  config.toml           local stack configuration
scripts/seed.ts         local demo account
tests/                  unit/, components/, db/, e2e/
docs/                   this documentation
```

## Cheminement des requêtes

**Lectures.** Les pages sont des React Server Components. Elles appellent `requireStore()` (qui vérifie le jeton de
session et charge l'organisation, le rôle, les droits d'accès et la boutique active), puis un modèle de lecture dans
`src/lib/data`. Les modèles de lecture interrogent Supabase **avec la session de l'utilisateur**, de sorte que la RLS
s'applique, et l'essentiel de l'agrégation se fait dans des fonctions SQL de reporting (`report_daily_totals`,
`report_product_catalog`, `report_campaign_breakdown`, …). Les pages reçoivent des totaux, pas des lignes brutes :
aucune requête ne charge un jeu de données non borné. Les listes (produits, commandes, remboursements, dépenses) sont
paginées en SQL.

**Écritures.** Les formulaires appellent des server actions (`src/lib/<feature>/actions.ts`). Chaque action résout
l'espace de travail, vérifie le rôle et les droits d'accès, valide ses données d'entrée avec zod, consomme une limite
de débit le cas échéant, écrit via la session de l'utilisateur (RLS), puis appelle `refresh()` afin que la page soit
de nouveau rendue avec des données à jour. Les événements d'audit et d'analyse sont écrits après la réponse avec
`after()`, de sorte qu'ils ne ralentissent ni ne font jamais échouer l'action.

**Chemins privilégiés.** Le webhook Stripe, la suppression de compte, les écritures d'audit et d'analyse, la limitation
de débit et la création de la boutique d'exemple utilisent le client service-role (`src/lib/supabase/admin.ts`).
Chacun d'eux commence par autoriser l'appelant.

**Rendu.** Les pages marketing sont prérendues. Les pages de l'application sont dynamiques (elles dépendent du cookie
de session) ; leur enveloppe statique est prérendue et les sections de données arrivent en streaming derrière des
squelettes Suspense. `app/app/error.tsx` intercepte les échecs inattendus avec un bouton pour réessayer ; les analyses
mises en pause (offre expirée) affichent un avis dédié au lieu d'une erreur. Les réponses authentifiées sont envoyées
avec `Cache-Control: private, no-store`.

## Modèle de données

```
auth.users ─┬─ profiles
            └─ organization_members ── organizations ─┬─ subscriptions, billing_customers   (Stripe state, webhook-written)
                                                      ├─ audit_events, product_events, feedback
                                                      └─ stores ─┬─ products
                                                                 ├─ orders ─┬─ order_items ── products
                                                                 │          └─ refunds
                                                                 ├─ expenses
                                                                 ├─ ad_campaigns ── ad_spend_daily   (campaign may link to one product)
                                                                 └─ import_jobs ── import_rows
billing_events (Stripe event log, service role only)       private.rate_limits
```

- **Propriété.** Chaque table métier possède une colonne `organization_id` ; les tables au niveau de la boutique ont
  aussi une colonne `store_id` (les lignes de commande et les lignes d'import appartiennent à la boutique de leur
  commande ou de leur tâche). Des clés étrangères composites maintiennent les enfants dans l'organisation de leur
  parent ; des triggers maintiennent les références croisées dans la même boutique.
- **Boutiques.** Devise (avec son nombre de décimales), fuseau horaire de reporting, inclusion ou non de la taxe dans
  les prix, règle de frais de paiement (points de base + frais fixe), coût d'expédition par défaut, et `is_demo` pour
  la boutique d'exemple, qui n'est jamais mélangée aux boutiques réelles dans aucune vue ni aucun rapport.
- Les **commandes** stockent les montants hors taxe en unités mineures (centimes), avec, en option, le coût
  d'expédition et les frais enregistrés. Les **lignes de commande** conservent un instantané du coût
  (`unit_cost_e4`) pris au moment de l'enregistrement de la ligne.
- **Provenance.** Les enregistrements portent `source` (`manual`, `csv`, `demo`, et des valeurs réservées aux futures
  intégrations) et `import_job_id`, ce qui rend l'annulation possible et prépare les intégrations de plateformes.
- Les **droits d'accès** sont calculés, jamais stockés : la vue `organization_entitlements` déduit le niveau d'accès
  des dates d'essai et du dernier abonnement.

Les types TypeScript générés pour le schéma se trouvent dans `src/lib/supabase/database.types.ts`
(`npm run db:types`).

## Où se trouvent les règles

| Sujet | Module |
| --- | --- |
| Formules et définitions des indicateurs | `src/lib/finance/metrics.ts` (voir [METRICS.md](METRICS.md)) |
| Agrégation (SQL) et sa référence | `supabase/migrations/*reporting.sql`, `*app_queries.sql`, `src/lib/analytics/reference.ts` |
| Validation des imports et doublons | `src/lib/imports/normalize.ts`, `public.import_finalize` (voir [IMPORTS.md](IMPORTS.md)) |
| Niveaux d'accès et limites | `private.org_access`, `src/lib/billing/entitlements.ts`, `src/config/plans.ts` (voir [BILLING.md](BILLING.md)) |
| Isolation des clients (multi-tenant) | Politiques RLS dans les migrations (voir [SECURITY.md](SECURITY.md)) |

## Évolutions

- **Intégrations de plateformes** (Shopify Admin API, Meta, Google Ads) : écrire les enregistrements via des tâches
  d'import ayant leur propre `source`, afin que la détection des doublons, l'annulation et l'historique fonctionnent
  sans modification. Stocker les jetons OAuth dans une table accessible uniquement côté serveur, sans politique
  exposée aux utilisateurs. Lancer les synchronisations depuis une tâche planifiée, pas depuis les requêtes de pages.
- **Nouveaux indicateurs :** ajouter le champ à `PeriodTotals`, à l'implémentation de référence et aux fonctions SQL ;
  le test de parité de la base de données échouera tant que les trois ne concorderont pas.
- **Nouvelles limites d'offre :** les ajouter à `PlanLimits` dans `src/config/plans.ts` et les faire respecter côté
  serveur.
