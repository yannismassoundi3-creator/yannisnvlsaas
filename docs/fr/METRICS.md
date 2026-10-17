[English](../METRICS.md) · **Français**

# Indicateurs et règles de calcul

Narixia est un outil d'analyse et d'aide à la décision, pas un logiciel de comptabilité. Ce document est la version
lisible par un humain des règles implémentées dans :

| Ensemble de règles | Source de référence |
| --- | --- |
| Formules au niveau de la boutique et textes du glossaire | `src/lib/finance/metrics.ts` (`deriveMetrics`, `DEFINITIONS`) |
| Règles d'agrégation (dates, coûts, estimations, répartition par produit) | `src/lib/analytics/reference.ts` (référence TypeScript) et les fonctions SQL `report_*` dans `supabase/migrations/20261016100400_reporting.sql` et `…100500_app_queries.sql` |
| Prix toutes taxes comprises | `src/lib/finance/tax.ts` |
| Représentation des montants et arrondis | `src/lib/finance/money.ts`, `src/lib/finance/decimal.ts` |
| Calculateur et prix au seuil de rentabilité | `src/lib/finance/calculator.ts` |
| Analyses (insights) | `src/lib/finance/insights.ts` |

Les fonctions SQL et la référence TypeScript doivent concorder exactement : `tests/db/reporting.test.ts` charge un
jeu de données généré dans Postgres et compare chaque total, chaque série journalière, chaque ligne produit et chaque
ligne de campagne avec l'implémentation de référence.

## Montants

- Les montants sont des entiers exprimés dans l'unité mineure (centimes) de la devise (`1999` EUR = 19,99 €, `1999`
  JPY = 1 999 ¥). Les devises à 0, 2 ou 3 décimales sont prises en charge grâce aux données de devises d'`Intl`.
- Les coûts unitaires sont des entiers mis à l'échelle par 10⁴ de l'unité principale (« e4 ») : 0,0450 € est stocké
  sous la forme `450`. Les coûts d'achat en gros ont souvent une précision inférieure au centime ; les arrondir au
  centime fausserait le coût des marchandises vendues (COGS) sur de gros volumes.
- L'arrondi se fait partout au demi le plus éloigné de zéro, comme la fonction `round(numeric)` de PostgreSQL, afin
  que l'application, la base de données, les exports CSV et les rapports PDF concordent à l'unité mineure près.
- Les saisies décimales sont analysées de manière exacte (BigInt), jamais en virgule flottante. La notation
  scientifique, les signes multiples et les valeurs supérieures à 10 milliards sont refusés.
- Les répartitions proportionnelles utilisent la méthode du plus fort reste, de sorte que la somme des parts réparties
  est toujours égale au total.

## Indicateurs au niveau de la boutique

Tous les montants sont **hors taxe sur les ventes / TVA** (voir [Prix toutes taxes comprises](#prix-toutes-taxes-comprises)).

| Indicateur | Formule |
| --- | --- |
| Ventes brutes | Prix unitaire × quantité, additionné sur toutes les lignes de commande |
| Remises | Remises sur les lignes + remises sur les commandes |
| Remboursements | Montants remboursés, hors taxe |
| **Ventes nettes** | Ventes brutes − Remises − Remboursements |
| Frais de port facturés | Frais de port payés par les clients |
| **Chiffre d'affaires net** | Ventes nettes + Frais de port facturés (la base de tous les pourcentages de marge) |
| Coût des marchandises vendues (COGS) | Coût unitaire × quantité vendue, pour les lignes dont le coût est connu |
| Marge brute | Chiffre d'affaires net − COGS |
| Expédition et préparation des commandes | Coûts d'expédition enregistrés + estimations issues de la règle par défaut de la boutique + dépenses d'expédition/de préparation des commandes |
| Frais de paiement | Frais enregistrés + estimations issues de la règle de frais de la boutique + dépenses de frais de paiement |
| Publicité | Dépenses quotidiennes des campagnes |
| Autres coûts variables | Dépenses marquées comme variables dans les autres catégories (emballage, commissions des places de marché…) |
| **Marge sur coûts variables** (contribution margin) | Marge brute − Expédition − Frais de paiement − Publicité − Autres coûts variables |
| Marge sur coûts variables en % | Marge sur coûts variables ÷ Chiffre d'affaires net |
| Coûts fixes | Dépenses marquées comme fixes (logiciels, loyer, salaires…) |
| Résultat d'exploitation (estimation) | Marge sur coûts variables − Coûts fixes enregistrés dans Narixia |
| Commandes | Nombre de commandes passées sur la période |
| Panier moyen | (Ventes brutes − Remises) ÷ Commandes |
| Taux de remboursement | Remboursements ÷ Ventes brutes |
| ROAS global (blended ROAS) | Chiffre d'affaires net ÷ Dépenses publicitaires |
| ROAS au seuil de rentabilité (break-even ROAS) | 1 ÷ (Marge sur coûts variables avant publicité ÷ Chiffre d'affaires net) |
| ROAS plateforme (platform ROAS) | Valeur de conversion déclarée par la plateforme ÷ Dépenses publicitaires (attribution de la plateforme, qui surestime souvent) |

Narixia **ne présente jamais la marge sur coûts variables comme un bénéfice net**. L'outil ne calcule ni le bénéfice
net, ni la trésorerie (cash flow), ni le ROI ; le glossaire (`/glossary`) explique pourquoi et ce que chacun
nécessiterait.

Un ratio dont le dénominateur est nul est affiché sous la forme « — », jamais comme 0 % ou l'infini.

## Règles d'agrégation

- **Dates.** Les commandes sont comptées à la date locale (fuseau horaire de la boutique) à laquelle elles ont été
  passées. Les remboursements sont comptés à leur propre date locale lorsqu'elle est connue ; sinon à la date de la
  commande, signalés comme estimés.
- **COGS.** L'instantané du coût de la ligne de commande (le coût enregistré lors de l'import ou de la saisie de la
  commande) est utilisé en priorité, afin que les modifications ultérieures du coût ne réécrivent pas l'historique ;
  à défaut, le coût unitaire actuel du produit. Les lignes qui n'ont ni l'un ni l'autre sont signalées comme
  **coût manquant** : elles ne sont jamais considérées comme gratuites.
- **Coût d'expédition.** Valeur enregistrée, sinon le coût d'expédition par défaut de la boutique (estimé), sinon
  manquant.
- **Frais de paiement.** Valeur enregistrée, sinon la règle de frais de la boutique (pourcentage du montant payé par
  le client TTC, plus un frais fixe par commande ; estimé), sinon manquant.
- **Dépenses.** Les dépenses variables de la catégorie expédition/préparation des commandes s'ajoutent aux coûts
  d'expédition, celles de la catégorie frais de paiement s'ajoutent aux frais de paiement, les autres dépenses
  variables vont dans les autres coûts variables, et les dépenses fixes vont dans les coûts fixes.
- **Comparaison.** La période précédente compte le même nombre de jours et se termine la veille du début de la
  période sélectionnée. Lorsqu'elle sort de la fenêtre d'historique de l'offre, aucune comparaison n'est affichée.

### Complétude

Chaque famille de coûts porte un état de complétude affiché à côté du chiffre et dans les rapports :

| État | Signification |
| --- | --- |
| complete (complet) | Chaque commande ou ligne a une valeur enregistrée |
| estimated (estimé) | Des valeurs existent pour chaque commande, certaines issues des règles de la boutique |
| partial (partiel) | Certaines commandes ou lignes n'ont aucune valeur |
| missing (manquant) | Aucune commande ni ligne n'a de valeur |
| not applicable (sans objet) | Aucune commande sur la période |

Lorsque le COGS est partiel, le tableau de bord indique combien de lignes n'ont pas de coût et la part des ventes de
produits qu'elles représentent, avec un lien vers la liste des produits filtrée.

## Indicateurs au niveau du produit

Sur la page Products (Produits) et dans les rapports par produit :

- Les montants au niveau de la commande (frais de port facturés, coût d'expédition, frais de paiement et
  remboursements au niveau de la commande) sont répartis entre les lignes de la commande **au prorata des ventes
  nettes de chaque ligne**, selon la méthode du plus fort reste (en cas d'égalité, la ligne la plus ancienne
  l'emporte).
- La publicité n'est attribuée à un produit **que par l'intermédiaire des campagnes que le marchand a liées à ce
  produit** (Advertising → Campaigns → sélecteur de produit, dont la valeur par défaut est « Several products /
  store-wide » (plusieurs produits / toute la boutique)). Toutes les autres dépenses restent au niveau de la boutique,
  et la page Advertising (Publicité) indique quelle part des dépenses est liée. Narixia ne répartit pas les dépenses
  à l'échelle de la boutique entre les produits selon le chiffre d'affaires ou les unités : cela inventerait une
  relation que les données ne montrent pas.
- La marge sur coûts variables d'un produit est affichée sous la forme « — » dès qu'une de ses lignes vendues n'a pas
  de coût.

## Mode revendeur

Les boutiques en mode revendeur suivent les mêmes règles ; seuls leurs écrans les présentent autrement.

- **« Ce qui vous reste »** est la marge sur coûts variables de la période (le même chiffre et la même définition que
  partout ailleurs, jamais présenté comme un bénéfice net). **Ventes** correspond au chiffre d'affaires net ;
  **articles vendus** au nombre d'unités vendues.
- **Frais.** Les boutiques en mode revendeur démarrent avec une règle de frais nulle et un coût d'expédition par défaut
  nul, car Vinted et Leboncoin facturent l'acheteur. Des frais ou un coût d'envoi saisis sur une vente sont enregistrés
  sur cette commande ; laissés vides, la règle de la boutique s'applique et la valeur est signalée comme estimation
  (zéro sauf si le vendeur modifie la règle).
- **Le stock** est l'ensemble des articles sans ligne de commande. L'« argent immobilisé » est la somme de leurs prix
  d'achat ; les articles sans prix d'achat sont comptés à part, jamais considérés comme gratuits. Les « articles qui
  traînent » sont en stock depuis plus de 60 jours, à compter de la date d'achat, à défaut de la date d'ajout.
- **Par article** (Mes articles), la marge d'une vente n'est affichée que si la commande ne compte qu'une ligne :
  prix de vente + port facturé − remboursements − prix d'achat − coût d'envoi − frais, avec les mêmes règles
  (enregistré ou estimé) que les rapports. Elle vaut « — » si le prix d'achat est inconnu.
- **Par plateforme**, ventes et marges sont additionnées à partir des mêmes valeurs par commande que les totaux
  quotidiens ; les remboursements comptent à leur propre date, sous la plateforme de leur commande. Les dépenses
  variables et la publicité restent au niveau de la boutique : elles sont déduites du total « Ce qui vous reste » mais
  jamais réparties entre plateformes ou articles.

## Prix toutes taxes comprises

Les boutiques dont les prix incluent la TVA (`prices_include_tax`) stockent chaque montant hors taxe. Pour chaque
commande :

```
factor = (total charged − tax) / total charged
```

ce facteur est appliqué aux ventes des lignes, aux remises, aux frais de port facturés et aux remboursements. Le
reliquat d'arrondi (quelques unités mineures au plus) est affecté à la ligne la plus importante, de sorte que la somme
des composantes converties soit exactement égale au total hors taxe.

**Limite :** lorsqu'une même commande comporte plusieurs taux de taxe (par exemple 20 % et 5,5 %), la répartition
entre les lignes est approximative ; le total de la commande est exact. Une commande dont la taxe dépasse le total, ou
dont le total n'est pas positif, est refusée à l'import avec une explication.

Les remboursements exportés par Shopify incluent la taxe même lorsque les prix ne l'incluent pas ; l'option d'import
« Refunded amounts include tax » (les montants remboursés incluent la taxe), activée par défaut, la retire en
appliquant le taux effectif de la commande.

## Calculateur et prix au seuil de rentabilité

Le calculateur (`/app/calculator` et la page publique `/tools/profit-margin-calculator`) utilise le même modèle de
montants.

```
Gross sales          = Selling price × Quantity
Discounts            = Gross sales × discount %       (or a fixed amount)
Refunds              = Gross sales × refund %         (or a fixed amount)
Net sales            = Gross sales − Discounts − Refunds
COGS                 = Unit cost × Quantity
Payment fees         = (Gross sales − Discounts) × fee % + Fixed fee × Orders
Contribution margin  = Net sales − COGS − Payment fees − Shipping − Advertising − Other variable costs
Contribution margin %= Contribution margin ÷ Net sales
```

Les frais de paiement sont prélevés sur le montant payé et ne sont pas restitués lorsqu'une commande est remboursée.

**Prix de vente au seuil de rentabilité :** le prix unitaire le plus bas, arrondi à l'unité mineure supérieure de la
devise, pour lequel la marge sur coûts variables est nulle ou positive, en supposant que la quantité, le coût
unitaire, l'expédition, la publicité, les autres coûts et les montants fixes restent inchangés tandis que les remises,
remboursements et frais exprimés en pourcentage évoluent avec le prix. Il est résolu de manière exacte avec des
entiers mis à l'échelle. Lorsqu'aucun prix ne permet d'atteindre le seuil de rentabilité (les pourcentages totalisent
100 % ou plus), le calculateur l'indique au lieu d'afficher un chiffre.

Exclus du calculateur : la TVA, les coûts d'exploitation fixes, les impôts sur les bénéfices, les intérêts et les
amortissements.

## Analyses (insights)

Les analyses sont des règles déterministes (`buildInsights`). Chacune liste les chiffres sur lesquels elle s'appuie
et décrit ce qui a évolué simultanément ; aucune n'affirme qu'un changement en a causé un autre. Les seuils
(`INSIGHT_THRESHOLDS`) sont prudents afin d'éviter le bruit sur les petites boutiques.

| Analyse | Se déclenche lorsque |
| --- | --- |
| Negative contribution margin (marge sur coûts variables négative) | Chiffre d'affaires net > 0 et marge sur coûts variables < 0 |
| Missing costs (coûts manquants) | Les lignes sans coût représentent ≥ 5 % des ventes de produits (niveau « attention » à partir de 10 %) |
| Ad spend outpacing revenue (dépenses publicitaires plus rapides que le chiffre d'affaires) | Les dépenses publicitaires ont augmenté de ≥ 5 % et d'au moins 10 points de plus que le chiffre d'affaires net, avec des dépenses publicitaires ≥ 2 % du chiffre d'affaires |
| Refund rate up (taux de remboursement en hausse) | Le taux de remboursement a augmenté de ≥ 1,5 point, avec des remboursements ≥ 0,5 % des ventes brutes |
| Discounts up (remises en hausse) | La part des remises dans les ventes brutes a augmenté de ≥ 3 points |
| Product margin down (marge produit en baisse) | Un produit représentant ≥ 5 % du chiffre d'affaires net sur les deux périodes a perdu ≥ 5 points de marge sur coûts variables en % ; liste ce qui a évolué en même temps (remises, remboursements, dépenses publicitaires liées) |
| Campaigns below break-even (campagnes sous le seuil de rentabilité) | Campagnes représentant ≥ 5 % des dépenses dont le ROAS plateforme est inférieur au ROAS au seuil de rentabilité de la boutique |
| Estimated values (valeurs estimées) | Les coûts d'expédition ou les frais de paiement incluent des estimations issues des règles de la boutique |

## Limites de calcul connues

- Une seule devise par boutique, sans conversion de devises. Un fichier dont la colonne de devise diffère de la devise
  de la boutique est refusé ligne par ligne.
- Les taux de taxe multiples au sein d'une même commande sont répartis approximativement entre les lignes (les totaux
  des commandes sont exacts).
- Les versements, rétrofacturations (chargebacks) et frais de conversion de devises ne sont pas modélisés ; Narixia
  mesure les ventes au moment où les commandes sont passées, pas les encaissements.
- Le ROAS plateforme est repris tel que déclaré ; Narixia ne dédoublonne pas les conversions entre plateformes.
