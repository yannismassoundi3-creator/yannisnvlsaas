[English](../DEPLOYMENT.md) · **Français**

# Déploiement et exploitation

Le déploiement de référence repose sur **Vercel** (application et tâche cron quotidienne), un **projet Supabase
hébergé** et **Stripe**. Tout hébergeur Node.js capable d'exécuter `next start` convient, à condition de fournir un point
de terminaison HTTPS, les variables d'environnement et un planificateur quotidien pour la tâche de maintenance.

Prérequis : Node.js 20.9 ou ultérieur (développé sous Node 22), npm, la CLI Supabase (installée comme dépendance de
développement, exécutée avec `npx supabase`) et la CLI Stripe pour tester les webhooks en local.

## 1. Supabase

1. Créez un projet dans une région de l'UE si vos clients sont en Europe (la région est publiée dans la politique de
   confidentialité via `NEXT_PUBLIC_DATA_REGION`). Choisissez un mot de passe de base de données robuste et
   conservez-le dans un gestionnaire de mots de passe.
2. Appliquez les migrations depuis votre machine :
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push          # applies supabase/migrations in order
   ```
3. **Clés d'API** (Project Settings → API Keys) : copiez la clé publiable dans `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   créez une clé secrète pour `SUPABASE_SECRET_KEY` et copiez l'URL du projet dans `NEXT_PUBLIC_SUPABASE_URL`.
   Privilégiez les clés de signature JWT asymétriques (Project Settings → JWT Keys) afin que les sessions soient
   vérifiées sans appel réseau.
4. **Authentication → URL configuration :** Site URL `https://<your-domain>` ; redirect URLs `https://<your-domain>/**`
   (n'ajoutez les URL de prévisualisation que si vous testez l'authentification sur les prévisualisations).
5. **Authentication → Providers → Email :** activez l'inscription par e-mail, exigez la confirmation de l'e-mail,
   activez le changement d'e-mail sécurisé, fixez la longueur minimale du mot de passe à 10 et exigez « letters and
   digits » (lettres et chiffres). Activez la protection contre les mots de passe divulgués si votre offre la propose.
6. **E-mails :** configurez un fournisseur SMTP personnalisé (Authentication → Emails → SMTP). L'expéditeur intégré de
   Supabase est réservé aux tests et fortement limité en nombre de requêtes. Collez ensuite les trois modèles de
   `supabase/templates` dans Authentication → Email Templates avec les objets suivants :
   | Modèle | Objet | Fichier |
   | --- | --- | --- |
   | Confirm signup | Confirm your Narixia account | `confirmation.html` |
   | Reset password | Reset your Narixia password | `recovery.html` |
   | Change email address | Confirm your new email address | `email_change.html` |
   Les modèles pointent vers `{{ .SiteURL }}/auth/confirm?token_hash=…`, qui vérifie le jeton côté serveur.
7. **Authentication → Rate limits :** conservez ou durcissez les valeurs par défaut (inscriptions/connexions par IP,
   e-mails par heure). Envisagez d'activer un CAPTCHA (Turnstile) dans Authentication → Attack Protection.
8. **Data API :** limitez les schémas exposés à `public` et `graphql_public`, et le nombre maximal de lignes à 1 000.

## 2. Vercel

1. Importez le dépôt GitHub (préréglage de framework : Next.js ; commande de build `npm run build`).
2. Définissez les variables d'environnement de `.env.example` pour **Production** (et Preview si vous l'utilisez,
   idéalement avec un projet Supabase distinct et des clés de test Stripe). Les valeurs `NEXT_PUBLIC_*` sont intégrées
   au moment du build : redéployez après les avoir modifiées.
3. Choisissez une région de fonctions proche de la région Supabase (par exemple Paris ou Francfort pour un projet
   dans l'UE).
4. Ajoutez votre domaine et définissez `NEXT_PUBLIC_SITE_URL` sur `https://<your-domain>`. HSTS et
   `upgrade-insecure-requests` sont envoyés automatiquement en HTTPS.
5. **Cron :** `vercel.json` planifie `GET /api/cron/maintenance` chaque jour à 03:17 UTC. Définissez `CRON_SECRET`
   (par exemple `openssl rand -hex 32`) ; Vercel l'envoie comme jeton bearer. La tâche purge les fenêtres de limite de
   requêtes expirées et supprime les lignes en attente (staging) des imports abandonnés depuis plus de deux jours. Sur
   un autre hébergeur, appelez le point de terminaison chaque jour avec `Authorization: Bearer $CRON_SECRET`.

## 3. Stripe

Suivez [BILLING.md](BILLING.md) : produit et prix, portail client, point de terminaison du webhook
`https://<your-domain>/api/stripe/webhook`, et la liste de contrôle de lancement avant d'accepter des paiements réels.

## 4. Test de fumée après chaque déploiement en production

1. `/`, `/pricing` et `/privacy` se chargent ; les en-têtes de réponse incluent `content-security-policy` et
   `strict-transport-security`.
2. Inscrivez-vous avec une vraie boîte de réception, confirmez l'e-mail, terminez l'onboarding, créez la boutique
   d'exemple.
3. Importez `tests/e2e/fixtures/shopify-orders.csv` dans la vraie boutique, confirmez, vérifiez la vue d'ensemble,
   annulez l'import.
4. La facturation affiche le prix et le mode attendus (test ou live) et ouvre Checkout.
5. `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/maintenance` renvoie `{"ok":true,…}`.
6. Supprimez le compte de test depuis Settings → Data.

## Migrations de base de données

- Les migrations se trouvent dans `supabase/migrations` et sont appliquées dans l'ordre des noms de fichiers. Ne
  modifiez jamais une migration déjà appliquée en production ; ajoutez-en une nouvelle :
  `npx supabase migration new <name>`.
- Testez en local avant de pousser : `npm run db:reset` (recrée la base locale à partir de toutes les migrations),
  puis `npm run test:db`, puis `npm run db:types` pour régénérer `src/lib/supabase/database.types.ts`.
- Ordre de déploiement pour un changement de schéma incompatible : livrez une migration compatible avec le code
  actuel, déployez le code, puis supprimez ce qui n'est plus utilisé dans une migration ultérieure.
- `npx supabase db push` refuse de s'exécuter si l'historique distant diverge des fichiers locaux ; examinez la
  situation avec `npx supabase migration list` au lieu de forcer l'opération.

## Sauvegardes et reprise

**Ce qui doit être protégé :** la base Postgres (données métier, utilisateurs `auth`, état de la facturation, journal
d'audit). L'application elle-même est sans état et peut être redéployée depuis Git. Les fichiers importés ne sont
jamais stockés.

**Sauvegardes**

- Supabase effectue des sauvegardes quotidiennes sur les offres payantes (la durée de conservation dépend de l'offre)
  et propose la restauration à un instant donné (Point-in-Time Recovery) en option. Vérifiez ce que comprend votre
  offre ; l'offre gratuite ne convient pas aux données clients.
- Conservez également une sauvegarde logique indépendante, par exemple une tâche planifiée (GitHub Actions ou un petit
  serveur) exécutant
  ```bash
  npx supabase db dump --db-url "$PRODUCTION_DB_URL" -f roles.sql --role-only
  npx supabase db dump --db-url "$PRODUCTION_DB_URL" -f schema.sql
  npx supabase db dump --db-url "$PRODUCTION_DB_URL" -f data.sql --use-copy --data-only
  ```
  et stockant les fichiers chiffrés (par exemple avec `age` ou GPG) dans un espace de stockage que vous contrôlez, avec
  une politique de conservation conforme à votre politique de confidentialité. Restreignez l'accès en lecture : ces
  fichiers contiennent les données financières de vos clients.
- Objectifs suggérés pour un petit SaaS : point de reprise inférieur à 24 heures (quelques minutes avec PITR), délai de
  reprise inférieur à une journée.

**Restauration**

1. Restaurez dans un **nouveau** projet (ou utilisez PITR vers un horodatage) plutôt que d'écraser la seule copie.
2. Si le projet restauré est nouveau, faites pointer `NEXT_PUBLIC_SUPABASE_URL`, les clés d'API et les paramètres
   d'authentification vers lui, puis redéployez.
3. Après une restauration à un point antérieur, la facturation peut être en retard sur Stripe : renvoyez les
   événements webhook depuis ce point à partir du Stripe Dashboard (Developers → Events). Le traitement est idempotent
   et les événements obsolètes sont ignorés.
4. Les comptes supprimés après le point de sauvegarde réapparaissent lors d'une restauration : effectuez de nouveau ces
   suppressions (conservez une trace des demandes de suppression en dehors de la base, par exemple dans votre boîte de
   support) avant de rouvrir le service.
5. Testez une restauration au moins une fois par trimestre, y compris la connexion et l'ouverture d'un tableau de bord
   sur les données restaurées.

## Exploitation

**Où regarder**

| Signal | Emplacement |
| --- | --- |
| Erreurs applicatives | Vercel → Logs (les messages sont préfixés, par exemple `[stripe-webhook]`, `[imports]`, `[reports]`) |
| Erreurs de base de données, d'authentification et d'API | Supabase → Logs |
| Échecs de livraison des webhooks | Stripe → Developers → Webhooks → point de terminaison ; et la requête ci-dessous |
| Exécutions du cron | Vercel → Cron Jobs |

**Requêtes utiles** (éditeur SQL, en tant qu'administrateur) :

```sql
-- Stripe events that failed processing (Stripe retries them; investigate the error)
select id, type, error, received_at from public.billing_events where status = 'failed' order by received_at desc;

-- Imports stuck while committing for more than an hour (the user can resume them from the import page)
select id, organization_id, kind, updated_at from public.import_jobs
where status = 'committing' and updated_at < now() - interval '1 hour';

-- Product funnel over the last 30 days
select event, count(*) from public.product_events where created_at > now() - interval '30 days' group by event order by 2 desc;
```

**Rotation des identifiants** (après une fuite présumée, ou lorsqu'une personne disposant d'un accès s'en va) : créez
une nouvelle clé secrète Supabase et révoquez l'ancienne ; renouvelez la clé secrète Stripe et le secret de signature
du webhook ; générez un nouveau `CRON_SECRET`. Mettez à jour l'environnement de l'hébergeur et redéployez. Les sessions
ne sont pas affectées par ces rotations.

**Demandes des utilisateurs :** l'export et la suppression du compte sont en libre-service dans Settings → Data. Pour
une demande reçue par e-mail, vérifiez que le demandeur contrôle l'adresse e-mail du compte avant d'agir.
