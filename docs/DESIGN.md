**English** · [Français](fr/DESIGN.md)

# Design system

Narixia should read like a carefully made financial product: calm, precise and legible. Figures come first, and
every visual decision has to help someone understand their margins.

**Principles**

- Restraint: warm ivory, deep navy and one emerald accent. Colour carries meaning (positive, negative, caution,
  information) and is never decorative.
- Honesty: estimates, missing data and demo data are always labelled; nothing is shown as more certain than it is.
- Hierarchy through size and spacing rather than weight: two weights only (regular and semibold).
- No generic "AI SaaS" look: no purple gradients, glassmorphism, glows, emoji icons or invented social proof.

All tokens live in `src/app/globals.css` (`@theme`). Tailwind's default palette is removed, so only design-system
colours exist; add a token instead of an ad-hoc value.

## Colour

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `ivory` | `#F8F7F4` | Page background | — |
| `surface` | `#FFFFFF` | Cards, inputs, popovers | — |
| `sunken` / `hover` | `#F2F0EB` / `#F5F3EF` | Table headers, insets / row hover | — |
| `ink` (= `navy-800`) | `#172033` | Primary text, brand navy | 15.2:1 on ivory |
| `ink-2` | `#464E60` | Secondary text | 7.8:1 on ivory |
| `ink-3` | `#5D6474` | Muted text | 5.5:1 on ivory, 5.2:1 on sunken |
| `ink-4` | `#6E7482` | Placeholders, on white only | 4.7:1 on white |
| `control` | `#948F88` | Form control borders | 3.2:1 on white (non-text 3:1) |
| `emerald-500` | `#21866B` | Brand accent: graphics, focus ring | 4.2:1 on ivory (non-text) |
| `emerald-600` | `#1C7A60` | Fills behind white text | 5.3:1 |
| `emerald-700` | `#1A6E57` | Emerald text, positive deltas | 5.8:1 on ivory |
| `negative-700` | `#A63A2C` | Losses, destructive actions | 6.0:1 on ivory |
| `caution-700` | `#865A06` | Estimated or incomplete data | 5.6:1 on ivory |
| `info-700` | `#2D4673` | Neutral notices | 8.8:1 on ivory |

Every text/background pair used in the interface meets WCAG 2.2 AA (4.5:1 for text, 3:1 for large text, controls
and graphics). Automated axe checks run in the end-to-end tests on the public pages, the dashboard and the import
review. Every application and authentication page (27 routes, on the sample store) was also checked with the
same rules before this release, with no violations.

**Deltas:** a change is coloured only when one direction is clearly better (contribution margin up = emerald,
refund rate up = red). Neutral metrics such as discounts or ad spend stay grey. The arrow and an "Up"/"Down" text for
screen readers always carry the meaning, so colour is never the only signal.

## Charts

- Categorical palette in fixed slot order, never cycled: `#3E5C99`, `#1B8A6B`, `#C28A2C`, `#C65A84`, `#3D93C2`,
  `#CC5F45`, `#8C5BAF`, `#7D8B2E`. Validated on white: lightness within OKLCH L 0.43–0.77, chroma ≥ 0.10, worst
  adjacent colour-vision-deficiency ΔE 9.9, normal-vision ΔE 17.7, all ≥ 3:1 against the card surface.
- Diverging pair for values above and below zero: `#1B8A6B` / `#C2503A`. Previous-period context series: `#A8A39A`.
- Recharts needs literal colours, so `src/components/charts/chart-theme.ts` mirrors the tokens; keep both in sync.
- Every chart has a title and a sentence of context, axis labels in the store currency, a legend when there is more
  than one series, tooltips with exact values, and an empty state that says what data is missing.
- Incomplete periods (the current week or month, or a bucket cut by the selected range) are drawn lighter and
  labelled "partial" so a short bucket is not mistaken for a drop.
- Charts sit next to the figures they summarise (KPI tiles, the profit breakdown, campaign and product tables), so
  the numbers are always available as text.

## Typography

- **Instrument Sans** (SIL Open Font License, self-hosted in `src/app/fonts`), with system fallbacks. Two weights.
- Financial figures use tabular numerals (`tabular` utility = `font-variant-numeric: tabular-nums`) and align right
  in tables.
- Scale (rem): 0.6875 / 0.75 / 0.8125 / **0.875 (body)** / 0.9375 / 1.0625 / 1.25 / 1.5 / 1.875 / 2.5 / 3.25 / 4,
  with slightly negative tracking on headings and balanced wrapping for headings.
- PDF reports embed the same font, with ligatures disabled and tabular digits, so figures line up in print.

## Space, shape and elevation

- 4 px base grid. Cards use 20 px horizontal padding; table cells 12 px, with 20 px at the row edges and hairline
  separators (`line`).
- Radii are restrained: 3, 5, 7, 10 and 14 px. Large rounded cards are not repeated across every section.
- Shadows are soft and navy-tinted (`shadow-xs` to `shadow-lg`), never glowing.

## Components

`src/components/ui` holds the reusable primitives, built on Radix UI for behaviour and accessibility:

| Component | File | Notes |
| --- | --- | --- |
| Button | `button.tsx` | Primary (navy), secondary, ghost, danger, danger-ghost, link; sizes; the loading state keeps the label, adds a spinner and `aria-busy` |
| Input, Select, Textarea, Field | `input.tsx`, `controls.tsx`, `field.tsx` | Labels always visible; errors linked with `aria-describedby`; leading currency symbols |
| Table | `table.tsx` | Numeric columns right-aligned with tabular numerals; sortable headers expose `aria-sort` |
| Card, PageHeader | `card.tsx`, `page-header.tsx` | Page title, description and actions in one consistent block |
| Dialog, ConfirmDialog | `dialog.tsx` | Destructive actions always confirm, and say what will be lost |
| Menu, Popover, Tooltip, TermTip | `menu.tsx`, `overlay.tsx` | TermTip explains financial terms from the shared definitions |
| Badge | `badge.tsx` | Neutral, positive, negative, caution, info |
| Alert, Skeleton, EmptyState | `feedback.tsx` | Empty states say what to do next; skeletons match the final layout |
| Toaster | `toaster.tsx` | Short confirmations; errors that need action stay on the page |

Icons are Lucide, 16 px in text and controls, with `aria-hidden` when decorative.

## Layout and responsiveness

- Desktop: compact 240 px left sidebar (store switcher, the sections, user menu) and a content column up to 1,240 px.
- Below 1,024 px the sidebar becomes a top bar with a navigation sheet. Tables scroll horizontally inside their card;
  the page itself never scrolls sideways (checked with an overflow script at a 390 px phone width and on desktop).

## Motion

Short transitions (about 150 ms) on hover, focus, popovers and dialogs. No decorative animation. Everything is
reduced to near zero when the user prefers reduced motion.

## Accessibility checklist

- Keyboard: every action is reachable and visible focus is consistent (2 px emerald outline, 2 px offset).
- Names: icon-only buttons have labels; visible text is part of every accessible name (WCAG 2.5.3).
- Live regions announce import progress, save confirmations and errors.
- Forms validate on submit, keep the user's input, and put the error next to the field.
- Language and landmarks are set on every page; headings are in order.

## Content

- Plain, precise language. Financial terms link to their definition.
- Demo data is labelled wherever it appears ("Sample store", "Demo data", "SAMPLE DATA" in PDFs).
- No testimonials, logos, customer counts or results that do not exist.
