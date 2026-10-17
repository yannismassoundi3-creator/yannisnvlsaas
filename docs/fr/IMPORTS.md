[English](../IMPORTS.md) · **Français**

# Imports CSV

L'import CSV est la première intégration de données de Narixia. Il couvre quatre types de données, chacun avec un
modèle téléchargeable (Imports → New import → « … template ») :

| Type | Une ligne par | Exports reconnus | Colonnes obligatoires |
| --- | --- | --- | --- |
| Commandes | ligne de commande | Export des commandes Shopify | Order number, Order date, Product name, Quantity, Unit price |
| Produits et coûts | produit ou variante | Export des produits Shopify (variantes nommées à partir du handle et des options) | Product name |
| Dépenses publicitaires | campagne et jour | Rapports Meta, Google Ads et TikTok avec ventilation quotidienne | Day, Campaign, Spend |
| Dépenses | dépense | — | Date, Amount |

Chaque champ, sa description et les noms d'en-têtes reconnus automatiquement sont définis dans
`src/lib/imports/schema.ts`. La correspondance des en-têtes ignore la casse, les accents, la ponctuation et le texte
entre parenthèses (« Amount spent (EUR) » correspond à « amount spent »), et inclut les en-têtes français courants.

Les modèles suivent la langue de l'interface. Les modèles français utilisent des en-têtes français (tous reconnus
automatiquement), des dates jour/mois/année, la virgule décimale et le point-virgule comme séparateur : Excel en
français les ouvre donc en colonnes. Les modèles anglais utilisent la virgule et le point décimal. Tous sont en UTF-8
avec BOM et fins de ligne CRLF, et le type de dépense est lu dans les deux langues (« fixed »/« variable »,
« fixe »/« variable »).

## Le pipeline

| # | Étape | Où | Ce qui se passe |
| --- | --- | --- | --- |
| 1 | Sélection du fichier | Navigateur | Glisser-déposer ou sélecteur de fichier, `.csv` uniquement. |
| 2 | Validation du type et de la taille | Navigateur | Les fichiers vides, les fichiers de plus de 25 Mo, les fichiers binaires (par exemple `.xlsx`), les guillemets non fermés et plus de 300 colonnes sont refusés avec une explication. L'UTF-8 est essayé en premier, puis le Windows-1252 (fichiers enregistrés par Excel). Les titres de rapport situés au-dessus de la ligne d'en-tête (Google Ads) sont ignorés. |
| 3 | Aperçu | Navigateur | Les premières lignes sont affichées avec le délimiteur et l'encodage détectés. |
| 4 | Correspondance des colonnes | Navigateur | Les colonnes sont associées automatiquement aux champs ; l'utilisateur peut modifier n'importe quelle correspondance. Les champs obligatoires doivent être associés. |
| 5 | Normalisation | Navigateur, puis serveur | Format de date (YYYY-MM-DD, DD/MM/YYYY ou MM/DD/YYYY), séparateur décimal, fuseau horaire (décalage indiqué dans le fichier, sinon celui de la boutique), prix toutes taxes comprises, vérification de la devise. |
| 6 | Validation des champs obligatoires | Navigateur, puis serveur | Les valeurs manquantes ou illisibles deviennent des erreurs de ligne. Rien n'est deviné ni complété. |
| 7 | Détection des doublons | Base de données | Au sein du fichier et par rapport aux enregistrements existants (règles ci-dessous). |
| 8 | Erreurs par ligne | Page de vérification | Chaque ligne invalide ou en double est listée avec son numéro de ligne, le champ et la raison, et la liste peut être téléchargée en CSV (`/api/imports/[id]/issues`). |
| 9 | Confirmation | Page de vérification | « Nothing has been saved yet » (rien n'a encore été enregistré) : nombre de lignes à ajouter, mettre à jour, ignorer et corriger. L'utilisateur confirme explicitement. |
| 10 | Historique des imports | Page Imports | Chaque import avec sa date, son type, son nom de fichier, son statut et ses compteurs, ainsi que l'utilisation mensuelle par rapport à la limite de l'offre. |
| 11 | Annulation | Page de l'import | Le dernier import terminé d'une boutique peut être annulé (règles ci-dessous). Les enregistrements créés par un import sont supprimés ; les enregistrements qu'il a remplacés sont restaurés. |
| 12 | Réimport | Base de données | Réimporter le même fichier n'ajoute rien par défaut (« Skip existing », ignorer les existants), ou remplace les enregistrements existants (« Update existing », mettre à jour les existants). |

### Confidentialité dès la conception

Le fichier est lu dans le navigateur. Seules les cellules des colonnes que l'utilisateur associe sont envoyées au
serveur ; les noms, e-mails et adresses des clients présents dans un export Shopify ne quittent jamais l'ordinateur
de l'utilisateur sauf s'ils sont associés (et aucun champ ne les demande).

### Validation côté serveur

Le serveur ne fait jamais confiance à la validation du navigateur :

- La tâche est d'abord créée avec la correspondance, les options et le nombre de lignes attendu ; les options
  stockées sur la tâche sont celles utilisées pour toutes les étapes suivantes, quoi que le navigateur envoie
  ensuite.
- Les lignes arrivent par lots de 500 (`stageImportRows`) et sont à nouveau validées avec le même code de
  normalisation (`src/lib/imports/normalize.ts`) avant d'être écrites dans `import_rows` avec le statut `valid` ou
  `invalid`.
- Les limites de l'offre (lignes par fichier, lignes par mois) sont vérifiées à la création de la tâche, puis de
  nouveau avant la validation définitive.
- Chaque écriture passe par la propre session de l'utilisateur, de sorte que la sécurité au niveau des lignes (Row
  Level Security) s'applique à chaque ligne.

### Règles de doublons (`public.import_finalize`)

| Type | Identité | Au sein du fichier | Déjà présent dans la boutique |
| --- | --- | --- | --- |
| Commandes | Numéro de commande | Toutes les lignes d'une commande doivent se trouver dans le même lot d'envoi (l'assistant les garde ensemble). Si une ligne d'une commande comporte une erreur, toute la commande est retenue : une commande partielle sous-estimerait les ventes. | Ignorée, ou remplacée en totalité avec « Update existing » |
| Produits | SKU, sinon le nom du produit | La première occurrence l'emporte ; les répétitions sont signalées | Ignoré, ou mis à jour |
| Dépenses publicitaires | Plateforme + campagne (ID, sinon nom) + jour | La première occurrence l'emporte | Ignorée, ou les dépenses du jour sont remplacées |
| Dépenses | Date + montant + catégorie + nature + description | Les lignes identiques sont conservées mais signalées (deux achats identiques peuvent être réels) | Toujours ignorée |

### Validation définitive

`public.import_commit_batch` valide jusqu'à 500 lignes valides par appel, sous un verrou consultatif (advisory lock)
par boutique, de sorte qu'un import volumineux ne dépasse jamais le délai d'exécution d'une requête et que deux
imports dans la même boutique ne peuvent pas s'entremêler. Le navigateur l'appelle jusqu'à ce qu'il ne reste plus de
lignes valides ; si l'onglet est fermé, la page de l'import propose « Resume import » (reprendre l'import), et les
lignes déjà importées ne sont pas importées deux fois. Si un lot échoue de manière inattendue, l'import est marqué
comme échoué et annulé, de sorte qu'un import échoué ne laisse jamais de données partielles. Chaque ligne est validée
dans son propre bloc d'exception : une ligne qui échoue au moment de la validation (par exemple une contrainte violée
par une modification concurrente) est marquée invalide avec la raison donnée par la base de données, au lieu
d'interrompre le lot.

Les lignes de commande sont associées aux produits par SKU, puis par nom. Les produits inconnus sont créés
automatiquement, sans coût, et apparaissent dans le filtre « Missing cost » (coût manquant) de la page Products
(Produits). Un coût unitaire présent dans le fichier des commandes est stocké sur la ligne (un instantané), de sorte
que les modifications ultérieures du coût du produit ne réécrivent pas cette commande.

### Annulation (`public.import_rollback`)

- Seul l'import terminé **le plus récent** d'une boutique peut être annulé. Annuler un import plus ancien pourrait
  restaurer des enregistrements qu'un import ultérieur a remplacés ; l'opération est donc refusée avec une
  explication.
- Les enregistrements créés par l'import sont supprimés ; les enregistrements qu'il a remplacés sont restaurés à
  partir de la copie conservée au moment de la validation.
- Les produits créés automatiquement par l'import ne sont supprimés que s'ils n'ont ni coût ni autres lignes de
  commande ; les campagnes, seulement s'il ne leur reste aucune dépense.
- Les envois qui n'ont pas été confirmés peuvent être annulés. Tout import terminé peut être retiré de l'historique ;
  pour un import terminé avec succès, les données restent, mais il ne peut plus être annulé. Les lignes en attente des
  envois abandonnés depuis plus de deux jours sont supprimées par la tâche de maintenance.

## Limites

| Limite | Essai | Pro |
| --- | --- | --- |
| Lignes par fichier | 5 000 | 100 000 |
| Lignes importées par mois calendaire | 20 000 | 1 000 000 |

Indépendamment de l'offre : 25 Mo par fichier, 300 colonnes, 2 000 caractères par cellule, 500 lignes par commande.
Les limites des offres sont configurées dans `src/config/plans.ts`.

## Exports et injection de formules

Le texte importé n'est pas fiable. Chaque fichier CSV produit par Narixia (exports, rapports, listes d'anomalies)
passe par `escapeCsvCell` (`src/lib/csv.ts`) : une cellule commençant par `=`, `+`, `-`, `@`, une tabulation ou un
retour chariot est préfixée par `'`, de sorte que le tableur l'affiche comme du texte au lieu d'évaluer une formule.
Les colonnes numériques sont écrites comme de simples nombres (les montants négatifs sont des nombres, pas du texte).
Les fichiers sont en UTF-8 avec une marque d'ordre des octets (BOM) et des fins de ligne CRLF, afin qu'Excel affiche
correctement les accents.

## Ajouter une nouvelle source ultérieurement

Les intégrations de plateformes (API Shopify, Meta, Google Ads) devront réutiliser les mêmes tables et la même
normalisation : produire des lignes ayant la forme de la sortie de `normalize.ts`, les placer en attente dans une
tâche d'import dont le champ `source` désigne l'intégration, et laisser `import_finalize` / `import_commit_batch`
appliquer les règles de doublons et l'annulation. Les enregistrements comportent déjà les colonnes `source` et
`import_job_id` à cet effet.
