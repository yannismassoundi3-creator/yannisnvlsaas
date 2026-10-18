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
   requêtes expirées et supprime les lignes en attente (staging) des imports abandonnés depuis plus de deux jours, ainsi que les e-mails de
   vente transférés (validés ou ignorés depuis 30 jours, en attente depuis 90 jours). Sur
   un autre hébergeur, appelez le point de terminaison chaque jour avec `Authorization: Bearer $CRON_SECRET`.

### Alternative : Render

`render.yaml` est un Blueprint Render avec le service web (Francfort, instance Starter, `next start`) et la tâche
quotidienne de maintenance. Dans Render : **New → Blueprint**, choisissez le dépôt, puis renseignez les valeurs
marquées `sync: false` (les mêmes que sur Vercel ; `APP_URL` et `NEXT_PUBLIC_SITE_URL` sont l'adresse publique, par
ex. `https://narixia.onrender.com` ou votre domaine). Mesuré sur ce code : le serveur utilise environ 150 Mo en
fonctionnement (l'instance Starter en a 512) ; `next build` a atteint environ 1,1 Go en local : si un build échoue
faute de mémoire sur Render, utilisez une instance plus grande pour le build ou réduisez le nombre de workers. Après
le changement d'hébergeur, mettez à jour la **Site URL** et les **Redirect URLs** de Supabase, créez un endpoint de
webhook Stripe pour la nouvelle adresse (et son secret dans `STRIPE_WEBHOOK_SECRET`), puis faites le test de fumée
ci-dessous. Gardez un seul hébergeur actif pour le webhook Stripe et la tâche quotidienne.

## 3. Stripe

Suivez [BILLING.md](BILLING.md) : produit et prix, portail client, point de terminaison du webhook
`https://<your-domain>/api/stripe/webhook`, et la liste de contrôle de lancement avant d'accepter des paiements réels.

## 4. E-mails entrants (facultatif) : ventes reçues par e-mail

En mode revendeur, les vendeurs peuvent transférer leurs propres e-mails de notification de vente (Vinted, Leboncoin,
eBay, Vestiaire Collective) à une adresse privée ; chaque e-mail devient une entrée en attente qu'ils valident en un
geste. Narixia n'aspire (scraping) ni n'appelle jamais ces plateformes. Le prestataire documenté est **Postmark
(inbound)**, qui fonctionne sans posséder de nom de domaine. Sans les variables ci-dessous, la fonction affiche
« bientôt disponible » et `/api/inbound/email` répond 503.

1. Créez un compte Postmark, puis **Servers → Create server** (par exemple « Narixia inbound »).
2. Dans ce serveur, ouvrez **Message Streams → Default Inbound Stream** (le flux entrant existe par défaut).
3. Générez un secret : `openssl rand -hex 32`. Dans les **Settings** du flux entrant, renseignez la **Webhook URL**
   `https://narixia:<secret>@<your-domain>/api/inbound/email` (authentification HTTP basique : utilisateur `narixia`,
   mot de passe le secret ; si votre écran Postmark propose des champs d'authentification séparés, utilisez-les avec
   l'URL simple). Les noms des menus de Postmark peuvent varier légèrement. Laissez « Include raw email content in JSON payload » décoché.
4. Copiez l'adresse entrante du flux (`<inboundhash>@inbound.postmarkapp.com`) et définissez
   `INBOUND_EMAIL_ADDRESS_TEMPLATE=<inboundhash>+{token}@inbound.postmarkapp.com`. L'adresse de chaque boutique place
   son jeton privé après le `+` ; Postmark le transmet dans `MailboxHash`.
5. Définissez `INBOUND_WEBHOOK_SECRET=<secret>` dans Vercel, ainsi que `NEXT_PUBLIC_INBOUND_EMAIL_PROVIDER` /
   `NEXT_PUBLIC_INBOUND_EMAIL_REGION` pour la politique de confidentialité (Postmark traite les données aux
   États-Unis : gardez la région exacte). Redéployez.
6. Vérifiez : le bouton **Check** du webhook dans Postmark reçoit `200 {"ok":true}` (aucune boutique ne correspond,
   rien n'est enregistré). Envoyez ensuite un e-mail à l'adresse d'une boutique (Paramètres → Boutique, en mode
   revendeur) et retrouvez-le dans « Ventes reçues par e-mail ».

Domaine personnel (facultatif) : faites pointer un enregistrement MX d'un sous-domaine vers `inbound.postmarkapp.com`,
déclarez-le comme domaine entrant du serveur dans Postmark et définissez `INBOUND_EMAIL_DOMAIN=<sous-domaine>` à la
place du modèle (les adresses deviennent `ventes+<jeton>@<sous-domaine>`).

Ce que fait le point de terminaison : vérification des identifiants en temps constant (401 sinon), corps limité à
5 Mo, recherche de la boutique par jeton (un jeton inconnu reçoit la même réponse qu'un message enregistré),
120 messages par boutique et par heure, idempotence par `MessageID`, aucun contenu d'e-mail dans les journaux. Les
extraits sont limités à 2 000 caractères et purgés par la maintenance quotidienne (voir [SECURITY.md](SECURITY.md)).

## 4b. Photos d'articles et annonces rédigées par l'IA (mode revendeur)

L'amélioration des photos (lumière, couleurs, cadrage) se fait dans le navigateur et ne coûte rien. Les miniatures
utilisent Supabase Storage (offre gratuite : 1 Go ; une miniature fait environ 30 à 60 Ko, soit environ 20 000
articles par Go). La rédaction d'annonces avec Claude est **désactivée** tant qu'aucune clé n'est définie : le bouton
« Créer l'annonce avec l'IA » affiche alors « Bientôt disponible » et rien n'est envoyé nulle part.

1. Exécutez `supabase/migrations/20261018110000_item_photos_ai.sql` dans l'éditeur SQL de Supabase (ou
   `npx supabase db push`). Il ajoute `products.photo_path`, le bucket privé `item-photos` (300 Ko, JPEG/WebP) et ses
   politiques de stockage, la table `ai_usage` et les fonctions `reserve_listing_analysis` /
   `release_listing_analysis`. Il peut être relancé sans risque. Tant qu'il n'est pas exécuté, l'application continue
   de fonctionner : aucune miniature n'est enregistrée ni affichée et le bouton IA affiche « Bientôt disponible ».
2. Facultatif, seulement quand la demande est confirmée : définissez `ANTHROPIC_API_KEY` (Console Anthropic → API keys)
   dans Vercel et redéployez. `LISTING_AI_MODEL` (par défaut `claude-opus-5-5`) et `LISTING_AI_MONTHLY_LIMIT` (par
   défaut 50 analyses par organisation et par mois civil, en UTC) sont facultatifs. Le remboursement des analyses
   échouées utilise `SUPABASE_SECRET_KEY`, déjà nécessaire en production. Fixez aussi une limite de dépense mensuelle
   dans la Console Anthropic, comme second filet de sécurité.
3. Vérifiez : ajoutez un article avec une photo ; la miniature apparaît dans « Mes articles ». Avec une clé,
   « Créer l'annonce avec l'IA » affiche « 50 analyses restantes ce mois-ci » puis une annonce en 10 à 30 secondes.

**Coût par analyse (estimation).** Le navigateur envoie jusqu'à 3 photos de 1 024 px sur le plus grand côté. Claude
compte environ largeur × hauteur / 750 jetons par image : jusqu'à environ 1 400 jetons pour une photo carrée de
1 024 × 1 024 (environ 1 050 en 4:3). Avec les instructions et le schéma JSON (environ 1 000 jetons), l'entrée fait
au plus environ 5 200 jetons : 0,021 $ à 4 $ le million de jetons d'entrée (Claude Opus 5.5). La sortie (l'annonce et
le court raisonnement du modèle en effort « low ») fait en général 1 000 à 2 500 jetons, soit 0,02 à 0,05 $ à 20 $ le
million, plafonnée par `max_tokens` 4 000 (0,08 $). Donc **environ 0,03 à 0,07 $ par analyse, 0,10 $ au plus**. Au
plafond par défaut de 50 analyses par mois, un client très actif coûte environ **1,50 à 3,50 $ par mois, 5 $ au
plus**. Le coût réel dépend du nombre et du format des photos et de la longueur de la réponse ; une demande refusée par
le modèle puis relancée sur le modèle de repli est facturée même si l'analyse du vendeur lui est rendue. Suivez l'usage
réel dans la Console Anthropic (l'application journalise le nombre de jetons de chaque analyse sous `[listing-ai]`,
jamais les photos ni le texte).

Amélioration possible plus tard : le détourage (suppression du fond). Il n'est volontairement pas inclus (licences des
modèles et poids des modèles exécutés dans le navigateur) ; un fond blanc ou neutre à la prise de vue apporte
l'essentiel du bénéfice.

## 5. Test de fumée après chaque déploiement en production

1. `/`, `/pricing` et `/privacy` se chargent ; les en-têtes de réponse incluent `content-security-policy` et
   `strict-transport-security`.
2. Inscrivez-vous avec une vraie boîte de réception, confirmez l'e-mail, terminez l'onboarding, créez la boutique
   d'exemple.
3. Importez `tests/e2e/fixtures/shopify-orders.csv` dans la vraie boutique, confirmez, vérifiez la vue d'ensemble,
   annulez l'import.
4. La facturation affiche le prix et le mode attendus (test ou live) et ouvre Checkout.
5. `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/maintenance` renvoie `{"ok":true,…}`.
6. Si les e-mails entrants sont configurés : `curl -u narixia:$INBOUND_WEBHOOK_SECRET -H 'content-type: application/json'
   -d '{}' https://<your-domain>/api/inbound/email` renvoie `{"ok":true}`, et la même requête sans `-u` renvoie 401.
7. Ajoutez un article avec une photo dans une boutique en mode revendeur : la miniature apparaît dans
   « Mes articles » (nécessite la migration des photos).
8. Supprimez le compte de test depuis Settings → Data.

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
du webhook ; générez un nouveau `CRON_SECRET` et un nouveau `INBOUND_WEBHOOK_SECRET` (mettez aussi à jour l'URL du webhook
dans Postmark). Mettez à jour l'environnement de l'hébergeur et redéployez. Les sessions
ne sont pas affectées par ces rotations.

**Demandes des utilisateurs :** l'export et la suppression du compte sont en libre-service dans Settings → Data. Pour
une demande reçue par e-mail, vérifiez que le demandeur contrôle l'adresse e-mail du compte avant d'agir.
