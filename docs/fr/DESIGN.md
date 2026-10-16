[English](../DESIGN.md) · **Français**

# Design system

Narixia doit donner l'impression d'un produit financier soigneusement conçu : calme, précis et lisible. Les chiffres
passent en premier, et chaque décision visuelle doit aider quelqu'un à comprendre ses marges.

**Principes**

- Sobriété : ivoire chaud, bleu marine profond et un seul accent émeraude. La couleur porte un sens (positif, négatif,
  prudence, information) et n'est jamais décorative.
- Honnêteté : les estimations, les données manquantes et les données de démonstration sont toujours signalées ; rien
  n'est présenté comme plus certain qu'il ne l'est.
- Hiérarchie par la taille et l'espacement plutôt que par la graisse : deux graisses seulement (regular et semibold).
- Pas de look générique « SaaS IA » : pas de dégradés violets, de glassmorphism, de halos lumineux, d'icônes emoji ni
  de preuve sociale inventée.

Tous les tokens se trouvent dans `src/app/globals.css` (`@theme`). La palette par défaut de Tailwind est supprimée,
de sorte que seules les couleurs du design system existent ; ajoutez un token plutôt qu'une valeur ponctuelle.

## Couleur

| Token | Valeur | Usage | Contraste |
| --- | --- | --- | --- |
| `ivory` | `#F8F7F4` | Fond de page | — |
| `surface` | `#FFFFFF` | Cartes, champs de saisie, popovers | — |
| `sunken` / `hover` | `#F2F0EB` / `#F5F3EF` | En-têtes de tableau, encarts / survol de ligne | — |
| `ink` (= `navy-800`) | `#172033` | Texte principal, bleu marine de la marque | 15,2:1 sur ivory |
| `ink-2` | `#464E60` | Texte secondaire | 7,8:1 sur ivory |
| `ink-3` | `#5D6474` | Texte atténué | 5,5:1 sur ivory, 5,2:1 sur sunken |
| `ink-4` | `#6E7482` | Textes indicatifs (placeholders), sur blanc uniquement | 4,7:1 sur blanc |
| `control` | `#948F88` | Bordures des contrôles de formulaire | 3,2:1 sur blanc (non textuel 3:1) |
| `emerald-500` | `#21866B` | Accent de la marque : graphiques, anneau de focus | 4,2:1 sur ivory (non textuel) |
| `emerald-600` | `#1C7A60` | Aplats derrière du texte blanc | 5,3:1 |
| `emerald-700` | `#1A6E57` | Texte émeraude, variations positives | 5,8:1 sur ivory |
| `negative-700` | `#A63A2C` | Pertes, actions destructrices | 6,0:1 sur ivory |
| `caution-700` | `#865A06` | Données estimées ou incomplètes | 5,6:1 sur ivory |
| `info-700` | `#2D4673` | Avis neutres | 8,8:1 sur ivory |

Chaque paire texte/fond utilisée dans l'interface respecte le niveau AA des WCAG 2.2 (4,5:1 pour le texte, 3:1 pour
le texte de grande taille, les contrôles et les graphiques). Des vérifications axe automatisées s'exécutent dans les
tests de bout en bout sur les pages publiques, le tableau de bord et la vérification des imports. Chaque page de
l'application et d'authentification (27 routes, sur la boutique d'exemple) a également été vérifiée avec les mêmes
règles avant cette version, sans aucune violation.

**Variations :** une évolution n'est colorée que lorsqu'un sens est clairement meilleur (marge sur coûts variables en
hausse = émeraude, taux de remboursement en hausse = rouge). Les indicateurs neutres comme les remises ou les dépenses
publicitaires restent gris. La flèche et un texte « Up »/« Down » (hausse/baisse) destiné aux lecteurs d'écran portent
toujours le sens, de sorte que la couleur n'est jamais le seul signal.

## Graphiques

- Palette catégorielle dans un ordre d'emplacements fixe, jamais réutilisée en boucle : `#3E5C99`, `#1B8A6B`,
  `#C28A2C`, `#C65A84`, `#3D93C2`, `#CC5F45`, `#8C5BAF`, `#7D8B2E`. Validée sur blanc : luminosité comprise dans
  OKLCH L 0,43–0,77, chroma ≥ 0,10, pire ΔE entre couleurs adjacentes en cas de déficience de la vision des couleurs
  9,9, ΔE en vision normale 17,7, toutes ≥ 3:1 par rapport à la surface des cartes.
- Paire divergente pour les valeurs au-dessus et au-dessous de zéro : `#1B8A6B` / `#C2503A`. Série de contexte de la
  période précédente : `#A8A39A`.
- Recharts a besoin de couleurs littérales, donc `src/components/charts/chart-theme.ts` reproduit les tokens ;
  gardez les deux synchronisés.
- Chaque graphique a un titre et une phrase de contexte, des libellés d'axes dans la devise de la boutique, une
  légende lorsqu'il y a plus d'une série, des infobulles avec les valeurs exactes, et un état vide qui indique quelles
  données manquent.
- Les périodes incomplètes (la semaine ou le mois en cours, ou un intervalle tronqué par la plage sélectionnée) sont
  dessinées plus claires et étiquetées « partial » (partiel), afin qu'un intervalle court ne soit pas pris pour une
  baisse.
- Les graphiques sont placés à côté des chiffres qu'ils résument (tuiles d'indicateurs clés, décomposition de la
  marge, tableaux des campagnes et des produits), de sorte que les nombres sont toujours disponibles sous forme de
  texte.

## Typographie

- **Instrument Sans** (SIL Open Font License, auto-hébergée dans `src/app/fonts`), avec des polices système de
  repli. Deux graisses.
- Les chiffres financiers utilisent des chiffres tabulaires (utilitaire `tabular` =
  `font-variant-numeric: tabular-nums`) et sont alignés à droite dans les tableaux.
- Échelle (rem) : 0,6875 / 0,75 / 0,8125 / **0,875 (corps de texte)** / 0,9375 / 1,0625 / 1,25 / 1,5 / 1,875 / 2,5 /
  3,25 / 4, avec un interlettrage légèrement négatif sur les titres et un retour à la ligne équilibré pour les titres.
- Les rapports PDF intègrent la même police, avec les ligatures désactivées et des chiffres tabulaires, afin que les
  chiffres soient alignés à l'impression.

## Espace, forme et élévation

- Grille de base de 4 px. Les cartes utilisent une marge intérieure horizontale de 20 px ; les cellules de tableau
  12 px, avec 20 px aux extrémités des lignes et des séparateurs très fins (`line`).
- Les rayons d'arrondi sont mesurés : 3, 5, 7, 10 et 14 px. Les grandes cartes arrondies ne sont pas répétées dans
  chaque section.
- Les ombres sont douces et teintées de bleu marine (`shadow-xs` à `shadow-lg`), jamais lumineuses.

## Composants

`src/components/ui` contient les primitives réutilisables, construites sur Radix UI pour le comportement et
l'accessibilité :

| Composant | Fichier | Remarques |
| --- | --- | --- |
| Button | `button.tsx` | Primary (bleu marine), secondary, ghost, danger, danger-ghost, link ; tailles ; l'état de chargement conserve le libellé, ajoute un indicateur de chargement et `aria-busy` |
| Input, Select, Textarea, Field | `input.tsx`, `controls.tsx`, `field.tsx` | Libellés toujours visibles ; erreurs liées avec `aria-describedby` ; symboles monétaires en début de champ |
| Table | `table.tsx` | Colonnes numériques alignées à droite avec des chiffres tabulaires ; les en-têtes triables exposent `aria-sort` |
| Card, PageHeader | `card.tsx`, `page-header.tsx` | Titre de page, description et actions dans un bloc unique et cohérent |
| Dialog, ConfirmDialog | `dialog.tsx` | Les actions destructrices demandent toujours confirmation et indiquent ce qui sera perdu |
| Menu, Popover, Tooltip, TermTip | `menu.tsx`, `overlay.tsx` | TermTip explique les termes financiers à partir des définitions partagées |
| Badge | `badge.tsx` | Neutral, positive, negative, caution, info |
| Alert, Skeleton, EmptyState | `feedback.tsx` | Les états vides indiquent quoi faire ensuite ; les squelettes reproduisent la mise en page finale |
| Toaster | `toaster.tsx` | Confirmations courtes ; les erreurs qui nécessitent une action restent sur la page |

Les icônes sont des icônes Lucide, de 16 px dans le texte et les contrôles, avec `aria-hidden` lorsqu'elles sont
décoratives.

## Mise en page et adaptation aux écrans

- Ordinateur : barre latérale gauche compacte de 240 px (sélecteur de boutique, sections, menu utilisateur) et une
  colonne de contenu jusqu'à 1 240 px.
- En dessous de 1 024 px, la barre latérale devient une barre supérieure avec un panneau de navigation. Les tableaux
  défilent horizontalement à l'intérieur de leur carte ; la page elle-même ne défile jamais latéralement (vérifié avec
  un script de détection de débordement sur une largeur de téléphone de 390 px et sur ordinateur).

## Animations

Transitions courtes (environ 150 ms) au survol, au focus, sur les popovers et les boîtes de dialogue. Aucune animation
décorative. Tout est réduit quasiment à zéro lorsque l'utilisateur préfère des animations réduites.

## Liste de contrôle de l'accessibilité

- Clavier : chaque action est accessible et le focus visible est cohérent (contour émeraude de 2 px, décalage de
  2 px).
- Noms : les boutons ne comportant qu'une icône ont un libellé ; le texte visible fait partie de chaque nom accessible
  (WCAG 2.5.3).
- Des régions live annoncent la progression des imports, les confirmations d'enregistrement et les erreurs.
- Les formulaires sont validés à la soumission, conservent la saisie de l'utilisateur et placent l'erreur à côté du
  champ.
- La langue et les points de repère (landmarks) sont définis sur chaque page ; les titres sont hiérarchisés dans
  l'ordre.

## Contenu

- Langage simple et précis. Les termes financiers renvoient à leur définition.
- Les données de démonstration sont signalées partout où elles apparaissent (« Sample store », « Demo data »,
  « SAMPLE DATA » dans les PDF).
- Aucun témoignage, logo, nombre de clients ou résultat qui n'existe pas.
