[English](../LAUNCH.md) · **Français**

# Checklist de lancement, limitations et ce qui n'est pas encore construit

## Checklist de lancement

Traitez ces points dans l'ordre. Les points marqués **(juridique)** nécessitent un professionnel qualifié ; ce dépôt ne
peut pas les régler.

### Éligibilité et entreprise

- [ ] **(juridique)** La personne qui exploite le service est majeure et a la capacité de contracter (18 ans dans la
      plupart des pays). Sinon, un adulte ou une société représentée par un adulte doit détenir les comptes (Stripe,
      Supabase, Vercel, nom de domaine) et signer les contrats. Voir « Avant d'accepter de vrais paiements » dans
      [BILLING.md](BILLING.md).
- [ ] **(juridique)** Une entreprise immatriculée, habilitée à vendre des abonnements (par exemple une
      micro-entreprise ou une société en France), avec un compte bancaire à son nom.
- [ ] Informations sur l'entreprise renseignées : `NEXT_PUBLIC_COMPANY_LEGAL_NAME`, `…_ADDRESS`, `…_REGISTRATION`,
      `…_COUNTRY`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_PRIVACY_EMAIL`. D'ici là, les pages légales indiquent que
      ces informations ne sont pas configurées.

### Juridique et confidentialité

- [ ] **(juridique)** Conditions d'utilisation, politique de confidentialité et mentions légales (`/terms`, `/privacy`,
      `/legal`) revues et adaptées par un avocat. Ce sont des brouillons rédigés pour ce produit, pas un conseil
      juridique. Mettez à jour `legalLastUpdated` dans `src/config/site.ts` lorsqu'elles changent.
- [ ] **(juridique)** Accords de traitement des données (DPA) acceptés avec Supabase, Stripe et l'hébergeur (tous trois
      proposent des DPA standard) ; les sous-traitants et les régions indiqués dans `src/config/site.ts` correspondent
      au déploiement réel.
- [ ] **(juridique)** Narixia agit en tant que sous-traitant pour les données de boutique que les marchands importent,
      et en tant que responsable de traitement pour les données de compte : proposez un DPA aux clients professionnels
      qui en demandent un.
- [ ] Registre des activités de traitement rédigé ; durées de conservation décidées (comptes, événements d'audit et
      d'analyse, sauvegardes) et mises en œuvre dans la tâche de maintenance.
- [ ] Seuls des cookies strictement nécessaires sont utilisés aujourd'hui, donc aucun bandeau de consentement n'est
      requis. Revérifiez avant d'ajouter tout script d'analyse, de chat ou de publicité.
- [ ] **(juridique)** Situation au regard de la TVA confirmée (seuil de franchise ou immatriculation, OSS pour les
      consommateurs de l'UE, autoliquidation pour les entreprises) et mentions de facture configurées dans Stripe.
- [ ] **(juridique)** Droit de rétractation des consommateurs pris en charge si vous acceptez des consommateurs (UE :
      14 jours pour les services numériques, sauf renonciation au démarrage du service).

### Infrastructure

- [ ] Projet Supabase sur une offre payante avec sauvegardes (PITR recommandé), région UE, SMTP personnalisé, modèles
      d'e-mail, réglages d'authentification et limites de débit comme dans [DEPLOYMENT.md](DEPLOYMENT.md).
- [ ] Variables d'environnement de production Vercel, nom de domaine en HTTPS, cron avec `CRON_SECRET`.
- [ ] Sauvegarde chiffrée et indépendante de la base de données planifiée, et une restauration testée.
- [ ] CAPTCHA et protection contre les mots de passe divulgués activés dans Supabase Auth ; MFA envisagée pour vos
      propres comptes d'administration (Supabase, Stripe, Vercel, GitHub, registraire de domaine, e-mail).
- [ ] Alertes en cas d'erreur : au minimum, les notifications Vercel et Supabase par e-mail ; éventuellement un outil
      de suivi des erreurs.

### Paiements

- [ ] Compte Stripe vérifié (identité, entreprise, compte bancaire), produit et prix créés en mode production.
- [ ] Test de bout en bout en mode test sur le déploiement de production ([BILLING.md](BILLING.md)), puis clés de
      production, webhook de production, `STRIPE_LIVE_ENABLED=true`, un achat réel et son remboursement.
- [ ] Le prix affiché (`NEXT_PUBLIC_PRO_PRICE_MINOR`) est égal au Price Stripe ; la mention « TVA incluse/hors TVA »
      correspond à votre configuration fiscale.

### Produit

- [ ] Le test de fumée de [DEPLOYMENT.md](DEPLOYMENT.md) passe en production.
- [ ] `npm run check`, `npm run test:db`, `npm run test:e2e` et `npm run build` au vert sur le commit de la version.
- [ ] Boîte de support surveillée ; retours envoyés depuis l'application lus régulièrement
      (`select * from public.feedback order by created_at desc`).

## Limitations connues

**Données et calculs**

- Import CSV et saisie manuelle uniquement : pas encore de connexion directe à Shopify ni aux plateformes
  publicitaires.
- Une seule devise par boutique et aucune conversion de devises ; les entreprises multidevises ont besoin d'une
  boutique par devise.
- Les commandes comportant plusieurs taux de TVA sont réparties entre les lignes de façon approximative (les totaux
  des commandes sont exacts).
- Narixia mesure les ventes au moment où les commandes sont passées. Il ne modélise pas les versements, les
  rétrofacturations (chargebacks), les frais de conversion de devises ni la trésorerie, et ne calcule pas le bénéfice
  net.
- La publicité n'est imputée aux marges des produits qu'au travers de campagnes associées manuellement à un seul
  produit ; il n'y a ni pixel, ni UTM, ni attribution au niveau des commandes.
- Les modifications ne sont pas versionnées : seuls les imports peuvent être annulés, et uniquement le dernier par
  boutique.
- Les fichiers doivent être au format CSV (pas de XLSX), jusqu'à 25 Mo, analysés dans la mémoire du navigateur.

**Produit**

- Interface en anglais uniquement (dates au format britannique) ; les en-têtes d'import sont également reconnus en
  français.
- Pas encore d'invitations d'équipe : la base de données gère des organisations avec plusieurs membres et rôles, mais
  il n'existe aucune interface pour inviter quelqu'un.
- Les avis de fin d'essai gratuit et d'échec de paiement sont des bandeaux dans l'application ; Narixia n'envoie aucun
  e-mail en dehors des e-mails d'authentification de Supabase (Stripe peut envoyer des e-mails de facturation si
  vous l'activez).
- Les événements d'analyse produit sont stockés, mais il n'y a pas de tableau de bord d'administration ; utilisez SQL.
- Pas de back-office d'administration : les tâches de support passent par les tableaux de bord Supabase et Stripe.

**Sécurité et exploitation** — voir « Lacunes connues » dans [SECURITY.md](SECURITY.md) : pas encore de MFA ni de
CAPTCHA, la fenêtre d'historique de l'offre est appliquée dans la couche applicative, pas de politique de conservation
pour les tables d'événements, pas d'audit externe.

## Incomplet ou non vérifié

| Élément | État | Ce qu'il reste à faire |
| --- | --- | --- |
| Facturation Stripe | Implémentée, testée en tests unitaires et de base de données avec de vraies signatures | Exécuter sur un vrai compte Stripe de test, puis en production (nécessite des identifiants et la vérification du compte) |
| E-mails transactionnels | Modèles rédigés, testés avec la boîte de réception locale | SMTP personnalisé sur le projet hébergé et vérification de la délivrabilité (SPF, DKIM, DMARC sur votre domaine) |
| Pages légales | Brouillons avec informations sur l'entreprise configurables | Revue juridique, informations sur l'entreprise, DPA |
| Déploiement en production | Build de production et exécution en production locale testés | Projet Supabase hébergé, projet Vercel, nom de domaine, secret du cron |
| Sauvegardes | Procédure documentée | Offre Supabase payante ou exports planifiés, et une restauration testée |
| Intégrations de plateformes | Modèle de données prêt (`source`, `import_job_id`, plateforme de la boutique) | Connecteurs Shopify, Meta et Google Ads |

## Phase 7 : prochaines fonctionnalités, uniquement quand les utilisateurs les demandent

Le cahier des charges demande des fonctionnalités justifiées par de vrais retours. Il n'y a encore aucun retour
d'utilisateur, donc aucune n'a été construite. Candidates, avec le signal qui justifierait chacune :

| Candidate | La construire quand |
| --- | --- |
| Connexion Shopify (commandes, produits, coûts) | Plusieurs utilisateurs en essai gratuit importent des CSV Shopify plus d'une fois par semaine |
| Connexion Meta / Google Ads | Les utilisateurs associent des campagnes à des produits et réimportent régulièrement leurs dépenses publicitaires |
| Invitations d'équipe | Les utilisateurs demandent à partager l'accès avec un associé, un comptable ou un salarié |
| Rappels par e-mail (fin d'essai gratuit, échec de paiement, synthèse hebdomadaire) | Des essais gratuits expirent sans que les utilisateurs le remarquent, ou les utilisateurs demandent une synthèse |
| Planification de rapports enregistrés | Les utilisateurs Pro téléchargent le même rapport chaque mois |
| Boutiques multidevises | Des utilisateurs gèrent une boutique dans plusieurs devises |
| Interface en français | Une part significative des inscrits est francophone |

Recueillez le signal avec le formulaire de retour intégré à l'application, l'entonnoir dans `product_events`
(inscription → prise en main → premier import → premier résultat dans le tableau de bord → paiement Checkout), et des
échanges avec les premiers utilisateurs.
