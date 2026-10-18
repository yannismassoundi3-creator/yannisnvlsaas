[English](../SECURITY.md) · **Français**

# Sécurité et confidentialité

Ce document décrit les contrôles présents dans le code, la manière dont ils ont été vérifiés et les lacunes qui
subsistent. Il ne s'agit pas d'une certification : aucun audit externe ni test d'intrusion n'a été réalisé.

## Isolation des données entre clients et autorisations

- **Appartenance à une organisation.** Chaque enregistrement métier (boutiques, produits, commandes, lignes de
  commande, remboursements, dépenses, campagnes, dépenses publicitaires, imports) porte un `organization_id`. Les
  utilisateurs n'accèdent aux données que via `organization_members` (rôles `owner`, `admin`, `member`).
- **RLS (Row Level Security) sur chaque table publique**, vérifiée dans la base de données :
  - les lectures exigent l'appartenance (`private.is_org_member`) ;
  - les insertions et mises à jour exigent en outre un essai ou un abonnement actif (`private.org_can_write`), de
    sorte qu'un compte expiré est en lecture seule, même via l'API ;
  - `billing_customers`, `billing_events` et `product_events` n'ont aucune politique : seul le rôle de service peut
    les lire ou y écrire ;
  - `inbound_emails` (e-mails de vente transférés) peut être lue par les membres et modifiée uniquement sur `status`
    et `order_id` (valider ou ignorer) ; seul le rôle de service y insère des lignes, après vérification des
    identifiants du webhook entrant, et personne ne les supprime via l'API ;
  - `ai_usage` (annonces rédigées par l'IA, par organisation et par mois) peut être lue par les membres ; personne
    n'y écrit via l'API : seules `reserve_listing_analysis` (membres ayant le droit d'écrire) et
    `release_listing_analysis` (rôle de service) la modifient ;
  - les miniatures d'articles sont dans le bucket Storage privé `item-photos`, sous `<organization_id>/<product_id>/…` :
    les politiques de `storage.objects` permettent aux membres de lire et supprimer les fichiers de leur organisation,
    et d'en envoyer seulement avec un essai ou un abonnement actif, dans un article existant de leur organisation ;
    `products.photo_path` doit pointer dans ce même dossier ;
  - des clés étrangères composites maintiennent les lignes enfants dans l'organisation de leur parent, et des
    déclencheurs les maintiennent dans la même boutique (une ligne de commande ne peut pas pointer vers le produit
    d'un autre client (locataire) ou d'une autre boutique).
- **Les fonctions SQL** utilisées par l'application (`report_*`, `import_*`) sont `SECURITY INVOKER`, de sorte que la
  RLS s'applique à l'intérieur. Les quelques fonctions `SECURITY DEFINER` (contrôles d'accès, création d'espace de
  travail, limite de requêtes, maintenance) ont un `search_path` fixe et vide et valident leur appelant ; les
  fonctions de maintenance ne sont exécutables que par le rôle de service.
- **Contrôles côté serveur.** Chaque page, server action et route handler identifie l'appelant avec
  `requireUser` / `requireWorkspace` / `requireStore` (`src/lib/auth/workspace.ts`) avant toute opération, et les
  actions réservées au propriétaire (facturation, suppression de boutique et de compte) vérifient le rôle. La
  redirection des visiteurs déconnectés par le proxy est une commodité ; la sécurité ne repose pas sur elle.
- **Les limites de l'offre** sont appliquées côté serveur : le nombre de boutiques par un déclencheur, la taille des
  imports dans les actions d'import, les exports et rapports dans leurs routes, l'accès aux analyses dans les fonctions
  de rapport (`private.assert_report_request`).
- **Clé privilégiée.** `SUPABASE_SECRET_KEY` contourne la RLS. Elle n'est utilisée que dans des modules serveur
  marqués `import "server-only"`, pour : les webhooks Stripe vérifiés, le webhook d'e-mails entrants authentifié, la suppression de compte et de boutique, les
  événements d'audit et d'analyse, les limites de requêtes, le remboursement d'une analyse IA échouée, la suppression des
  photos d'articles d'un compte, la création de la boutique d'exemple et la lecture de l'identifiant client Stripe. Chaque appelant autorise d'abord l'utilisateur.

Vérifié par `tests/db/tenancy.test.ts` (les lectures, écritures et appels de fonctions entre clients sont refusés pour
chaque table, les comptes expirés ne peuvent pas écrire), `tests/db/integrity.test.ts` (les références entre clients
sont rejetées) et `tests/db/stores.test.ts` (limites de boutiques).

## Authentification et sessions

- Supabase Auth avec e-mail et mot de passe. La confirmation de l'e-mail est exigée avant la première connexion ; les
  mots de passe doivent comporter au moins 10 caractères avec des lettres et des chiffres (`supabase/config.toml` ;
  définissez les mêmes règles sur le projet hébergé).
- Les sessions sont stockées dans des cookies HTTP-only gérés par `@supabase/ssr`. Le proxy les rafraîchit sur les
  routes de l'application. Le code serveur vérifie le jeton d'accès (signature et expiration) avec `auth.getClaims()`
  à chaque requête.
- Les jetons d'accès expirent au bout d'une heure. Une session déconnectée ailleurs peut rester valide jusque-là ; un
  utilisateur supprimé perd immédiatement tout accès aux données, car ses appartenances sont supprimées.
- La réinitialisation du mot de passe et le changement d'e-mail utilisent des liens à usage unique vérifiés côté
  serveur (`/auth/confirm`, `verifyOtp`).
- Le paramètre `next` après connexion n'accepte que des chemins relatifs du même site (`src/lib/auth/redirect.ts`,
  couvert par des tests unitaires contre `//evil.com`, les barres obliques inverses, les URL encodées et absolues).
- Les points de terminaison d'authentification sont soumis à des limites de requêtes appliquées par Supabase Auth
  lui-même (par IP : inscriptions et connexions, rafraîchissements de jeton, vérifications, e-mails par heure).
  Configurez les mêmes limites sur le projet hébergé (Authentication → Rate Limits).

## Traitement des entrées

- Chaque server action valide ses entrées avec zod ; les identifiants doivent être des UUID ; les montants sont
  analysés comme des décimaux exacts et bornés. La base de données reprend les contrôles essentiels sous forme de
  contraintes (longueurs, signes, énumérations, codes de devise).
- Les fichiers importés ne sont pas considérés comme fiables : analysés dans le navigateur, revalidés côté serveur avec
  les options enregistrées de la tâche, limités en taille, en colonnes et en longueur de cellule (voir
  [IMPORTS.md](IMPORTS.md)).
- React échappe tout le texte affiché ; l'application n'affiche jamais de contenu utilisateur sous forme de HTML.
- **Injection CSV :** chaque CSV produit par l'application neutralise les cellules commençant par `=`, `+`, `-`, `@`,
  une tabulation ou un retour chariot (`src/lib/csv.ts`, couvert par des tests unitaires, y compris un produit nommé
  `=cmd|' /C calc'!A0`).

## Limites de requêtes

Fenêtres fixes stockées en base de données (`public.consume_rate_limit`, `private.rate_limits`), indexées par
utilisateur :

| Action | Limite |
| --- | --- |
| Création d'espace de travail | 10 / heure |
| Création de boutique d'exemple | 5 / heure |
| Création / annulation de tâche d'import | 30 / heure chacune |
| Envoi des lignes d'import | 1 200 blocs / 10 minutes |
| Modifications de produits, de transactions et de dépenses publicitaires | 300 / heure par famille |
| Exports CSV et rapports | 60 / heure |
| Export complet des données | 5 / heure |
| Checkout / portail de facturation | 10 / 20 par heure |
| Changement de mot de passe, changement d'e-mail, suppression de compte | 5 / heure chacun |
| Suppression de boutique | 10 / heure |
| Messages de retour | 10 / heure |
| E-mails de vente entrants | 120 / heure par boutique |
| Validation ou rejet des e-mails entrants | 300 / heure |
| Changement de l'adresse de réception | 10 / heure |
| Annonces rédigées par l'IA | 10 / 10 minutes par utilisateur, et 50 / mois par organisation (`LISTING_AI_MONTHLY_LIMIT`) |

Les fenêtres expirées sont purgées chaque jour par `/api/cron/maintenance`.

## En-têtes de sécurité HTTP

Définis pour chaque route dans `next.config.ts` :

- `Content-Security-Policy` : `default-src 'self'` ; scripts et styles depuis self avec `'unsafe-inline'` ; images
  depuis self, `data:` et `blob:` ; polices depuis self ; connexions vers self et le projet Supabase ;
  `object-src 'none'` ; `base-uri 'self'` ; `form-action 'self'` plus Stripe Checkout et le portail de facturation ;
  `frame-ancestors 'none'` ; `upgrade-insecure-requests` lorsque l'URL du site est en HTTPS.
- `Strict-Transport-Security` (2 ans, sous-domaines, preload) en production, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, une `Permissions-Policy` restrictive.
- `Cache-Control: private, no-store` sur `/app`, `/onboarding` et `/api`, afin que les caches partagés ne stockent
  jamais les pages authentifiées ni les exports.

**Pourquoi `'unsafe-inline'` pour les scripts :** une CSP fondée sur des nonces oblige chaque page à être rendue
dynamiquement, ce qui transformerait les pages marketing statiques en rendus à chaque requête. Le risque est atténué
car l'application ne comporte aucun point d'injection HTML (échappement par React, pas de `dangerouslySetInnerHTML`
avec des données utilisateur) et ne charge aucun script tiers. Passer aux nonces (`proxy.ts` + `headers()`) est une
mesure de durcissement envisageable si l'application devait un jour utiliser des scripts tiers.

Les server actions sont protégées contre les requêtes intersites par Next.js (comparaison Origin/Host). Les seuls
route handlers qui modifient un état sont le webhook Stripe (signature), la tâche de maintenance (secret bearer
comparé en temps constant) et le webhook d'e-mails entrants (authentification HTTP basique comparée en temps
constant).

## Secrets

- Les identifiants réels ne se trouvent que dans l'environnement de l'hébergeur ou dans `.env.local`, ignoré par Git.
  `.env.example` ne contient aucune valeur secrète, et les tests lisent même les clés locales de la CLI Supabase depuis
  l'environnement.
- Seules les valeurs `NEXT_PUBLIC_*` parviennent au navigateur, et aucune n'est secrète. Les secrets serveur sont lus
  via `serverEnv()` dans des modules qui importent `server-only`, ce qui fait échouer le build si un composant client
  les importe. La sortie du build de production a été parcourue à la recherche des valeurs secrètes configurées, sans
  aucune correspondance (la seule chaîne `sb_secret_` dans le code client est la vérification du format de clé propre à
  supabase-js).

## Journalisation

Les journaux contiennent des types d'événements, des codes d'erreur et des identifiants, jamais de montants, de
contenus de fichiers, de noms de produits, de contenus d'e-mails, de mots de passe, de jetons ni de clés. Les événements d'analyse
(`product_events`) sont internes (first-party), n'utilisent aucun cookie et suppriment toute propriété dont le nom
évoque de l'argent ou des données personnelles (`src/lib/analytics/track.ts`).

## Journal d'audit

`audit_events` enregistre les actions pertinentes pour la sécurité avec l'auteur, l'organisation et la cible : boutique
créée, modifiée ou supprimée ; boutique d'exemple créée ; import validé, annulé ou retiré de l'historique ; données
exportées ; Checkout démarré ; portail de facturation ouvert. Les membres peuvent lire les événements de leur
organisation ; personne ne peut les modifier via l'API. Les événements Stripe sont conservés dans `billing_events`.

## Confidentialité (préparation au RGPD)

- **Minimisation des données :** les imports n'envoient que les colonnes mappées ; aucun champ ne demande de noms,
  d'e-mails ou d'adresses de clients.
- **Export (accès et portabilité) :** Settings → Data → « Download all data » (télécharger toutes les données) diffuse
  un fichier JSON contenant le profil, l'organisation, les boutiques et chaque enregistrement (`/api/account/export`).
  Disponible même après l'expiration de l'essai.
- **Suppression (effacement) :** Settings → Data → « Delete account » (supprimer le compte) résilie les abonnements
  Stripe, supprime l'organisation (en cascade sur chaque enregistrement) et l'identifiant de connexion. Les
  propriétaires peuvent également supprimer une seule boutique.
- **Cookies :** uniquement des cookies strictement nécessaires (session Supabase, boutique active). Aucun cookie
  d'analyse ou publicitaire, donc aucun bandeau de consentement n'est requis à leur égard au titre des règles
  ePrivacy ; ajoutez-en un avant d'introduire tout traceur non essentiel.
- **Les sous-traitants** sont listés dans la politique de confidentialité à partir de `src/config/site.ts` (Supabase,
  Stripe, hébergeur, prestataire d'e-mails du compte, prestataire d'e-mails entrants et Anthropic). Anthropic est
  listé même tant que `ANTHROPIC_API_KEY` n'est pas défini, avec la finalité « si vous utilisez la fonction » : la
  politique de confidentialité est une page pré-rendue, donc une liste dépendant d'un secret serveur pourrait omettre
  sans bruit un sous-traitant réellement utilisé, alors que le lister à l'avance ne fait qu'informer davantage.

### Ventes reçues par e-mail

Les vendeurs peuvent transférer leurs propres e-mails de notification de vente à une adresse privée
(`<hash>+<jeton>@inbound.postmarkapp.com`) ; Postmark transmet chaque message à `/api/inbound/email`. Rien n'est
aspiré (scraping) et aucun compte de plateforme n'est consulté.

- **Adresse.** Chaque boutique possède un jeton aléatoire de 32 caractères (`stores.inbound_token`, 122 bits
  aléatoires). Les membres peuvent le lire pour afficher l'adresse ; les propriétaires et administrateurs peuvent le
  remplacer (`regenerate_inbound_token`), ce qui désactive aussitôt l'ancienne adresse. Quiconque connaît une adresse
  ne peut créer que des entrées *en attente* pour cette boutique : rien n'est enregistré comme vente sans la
  validation d'un membre.
- **Point de terminaison.** Authentification HTTP basique (utilisateur `narixia`, mot de passe
  `INBOUND_WEBHOOK_SECRET`) comparée en temps constant, corps limité à 5 Mo, jetons inconnus traités comme des
  messages acceptés (pas d'énumération), 120 messages par boutique et par heure, idempotence par identifiant de
  message. Sans configuration, il répond 503 et l'interface affiche « bientôt disponible ».
- **Ce qui est stocké** (`inbound_emails`) : date de réception, identifiant du message chez le prestataire, adresse
  de l'expéditeur d'origine, objet, plateforme, montant et titre d'article détectés, pour les confirmations Gmail le
  code et le lien, un extrait de 2 000 caractères au plus dont les adresses e-mail, numéros de téléphone et lignes
  d'adresse postale sont retirés, le statut et la commande créée. L'e-mail complet, les pièces jointes et les en-têtes
  ne sont pas conservés.
- **Conservation.** La maintenance quotidienne supprime les e-mails validés ou ignorés au bout de 30 jours, et ceux
  en attente au bout de 90 jours. Ils figurent dans l'export du compte et sont supprimés avec la boutique ou le compte.
- **Sous-traitant.** Postmark (nom et région configurables : `NEXT_PUBLIC_INBOUND_EMAIL_PROVIDER`,
  `NEXT_PUBLIC_INBOUND_EMAIL_REGION`) reçoit les e-mails, aux États-Unis par défaut.

### Photos d'articles et annonces rédigées par l'IA

- **Sur l'appareil.** Les photos sont prises ou choisies dans le navigateur, décodées et améliorées avec Canvas 2D
  (`src/lib/photos`) : niveaux, exposition, balance des blancs « monde gris » bornée, léger contraste et netteté,
  cadrage carré ou d'origine, JPEG de 1 600 px. Seuls la lumière, les couleurs et le cadrage changent ; rien n'est
  effacé ni retouché, et l'interface le dit. Télécharger ou partager une photo ne la fait pas quitter l'appareil
  (le partage Web la confie au téléphone).
- **Ce qui est conservé.** Une miniature carrée JPEG de 480 px par article (environ 30 à 60 Ko, limite du bucket
  300 Ko, JPEG ou WebP reconnu à ses octets), envoyée par une server action avec la session de l'utilisateur, donc
  soumise aux politiques de Storage. Les pages l'affichent par des URL signées valables 15 minutes. Supprimer un
  article supprime son fichier, supprimer une boutique ceux de ses articles, supprimer le compte tout le dossier de
  l'organisation (rôle de service). L'export des données liste chaque miniature avec son chemin et un lien de
  téléchargement valable une heure.
- **Envoyé à Anthropic seulement sur demande.** Rien n'est envoyé tant que `ANTHROPIC_API_KEY` n'est pas défini et que
  le vendeur n'appuie pas sur « Créer l'annonce avec l'IA » ; le bouton indique que les photos partent chez Claude
  (Anthropic). Le navigateur envoie au plus 3 copies de 1 024 px (JPEG 0,8). La route (`/api/listing`) vérifie la
  session et le droit d'écrire, limite le corps à 5 Mo et chaque image à 1,5 Mo décodée, n'accepte que JPEG, PNG ou
  WebP reconnus à leurs octets magiques, limite le débit par utilisateur, puis réserve une analyse de façon atomique
  dans la base avant d'appeler Claude, et la rend si l'appel échoue (refus, réponse tronquée ou illisible, erreur de
  l'API, annulation). Ni les photos ni le texte généré ne sont conservés ou journalisés par Narixia ; les journaux ne
  contiennent que des nombres, l'usage de jetons, la raison d'arrêt et le modèle.
- **Résultat honnête.** Le prompt demande uniquement ce qui est visible, les attributs incertains signalés, aucune
  marque, taille ou matière inventée, les défauts visibles mentionnés. La réponse est un JSON structuré validé par
  zod ; le prix est présenté comme « Estimation de l'IA, sans données de marché — à vérifier », et rien n'est
  enregistré tant que le vendeur n'enregistre pas l'article.
- **Mode test.** `LISTING_AI_FAKE=1` renvoie une annonce préparée marquée « données de test » et est ignoré quand
  `NODE_ENV=production` ; les tests n'appellent jamais la vraie API.

Ces fonctionnalités préparent la conformité au RGPD ; elles ne rendent pas à elles seules le service conforme. Voir les
points juridiques dans [LAUNCH.md](LAUNCH.md).

## Dépendances

`npm audit --omit=dev` signale **0** vulnérabilité dans les dépendances de production (octobre 2026). L'audit complet
signale un avis de gravité élevée dans `braces` (via `micromatch` → `fast-glob` → `@next/eslint-plugin-next`), utilisé
uniquement par le linter sur les propres fichiers du dépôt ; le seul correctif automatique rétrograde
`eslint-config-next` en 14.x, ce risque est donc accepté jusqu'à la publication d'un correctif en amont.

## Lacunes connues

- Pas d'authentification multifacteur ni de CAPTCHA à l'inscription ou à la réinitialisation du mot de passe
  (Supabase prend en charge les deux : activez la MFA TOTP et Turnstile/hCaptcha avant de développer les inscriptions
  à grande échelle).
- La protection contre les mots de passe divulgués dépend de l'offre Supabase (vérification HaveIBeenPwned) ;
  activez-la si elle est disponible.
- La fenêtre d'historique de l'offre (90 jours pendant l'essai) est appliquée par l'application, pas par la base de
  données : un utilisateur en essai appelant directement l'API de la base de données pourrait lire ses propres données
  plus anciennes. L'isolation des données entre clients n'est pas affectée.
- Aucune durée de conservation n'est encore appliquée à `audit_events`, `product_events` et `billing_events` ;
  définissez-en une et ajoutez-la à la tâche de maintenance.
- Pas d'analyse antimalware automatisée des fichiers importés (les fichiers sont analysés comme du texte dans le
  navigateur et ne sont jamais stockés ; les miniatures sont ré-encodées par le navigateur et vérifiées par leurs
  octets magiques et leur taille, pas analysées).
- Les photos envoyées pour une annonce IA sont traitées par Anthropic aux États-Unis selon ses conditions d'API (pas
  d'entraînement sur les données de l'API par défaut) ; Narixia ne maîtrise pas leur conservation chez lui.
- Un membre peut consommer le quota IA mensuel de son organisation en appelant directement la fonction de réservation
  (elle ne fait que compter ; aucune analyse n'a lieu sans le serveur). Le quota est un plafond de coût, pas une
  frontière de sécurité.
- Pas de test d'intrusion externe.
- Les e-mails transférés passent par le prestataire d'e-mails entrants (Postmark, aux États-Unis par défaut) avant
  d'arriver chez Narixia ; les vendeurs les transfèrent par choix et la politique de confidentialité mentionne ce
  prestataire. Le filtrage de l'extrait est heuristique : une adresse au format inhabituel pourrait subsister dans un
  extrait jusqu'à la purge à 30 ou 90 jours.
