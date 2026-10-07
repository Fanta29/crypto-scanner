# Identité visuelle — extraite du site Formation Finance & Fiscalité

> **Statut : soumis à validation, non appliqué.**
> Source analysée en lecture seule : dépôt `Fanta29/formation-finance`, fichiers
> `assets/css/app.css` (339 lignes), `assets/js/ui.js`, `assets/icone.svg`, pages HTML.
> Aucun fichier de ce dépôt n'a été modifié.

## 1. Direction

« Contemporaine sombre » (en-tête de `app.css`) : fond graphite, texte à fort contraste,
un seul accent lumineux (indigo), cartes sans bordure dure, typographie serrée, chiffres en
chasse fixe. **Pas de framework ni de bibliothèque de composants** : une feuille unique dont
toutes les valeurs sont des variables CSS de `:root`. Le site est **sombre uniquement** :
pas de bascule clair/sombre. Seule exception : le mode lecture des chapitres, une feuille
claire « comme un document imprimé ».

## 2. Palette (variables de `:root`)

| Rôle | Variable | Valeur |
|---|---|---|
| Fond de page | `--bg` | `#0B0D11` |
| Fond secondaire (bandeaux, pied, champs) | `--bg-2` | `#101319` |
| Surface (cartes) | `--surface` | `#161A21` |
| Surface survolée / ligne de total | `--surface-2` | `#1D222B` |
| Surface 3 | `--surface-3` | `#252B36` |
| Texte principal | `--ink` | `#F2F4F8` |
| Texte secondaire | `--ink-2` | `#C3CAD6` |
| Texte atténué | `--muted` | `#8892A2` |
| Filet | `--line` | `#232935` |
| Filet appuyé | `--line-2` | `#323A48` |
| Accent | `--accent` | `#7C8CFF` |
| Accent clair (liens, valeurs) | `--accent-2` | `#A5B0FF` |
| Halo d'accent | `--accent-glow` | `rgba(124,140,255,.16)` |
| Succès | `--ok` / `--ok-bg` | `#4ADE9B` / `rgba(74,222,155,.12)` |
| Avertissement | `--warn` / `--warn-bg` | `#F5B84A` / `rgba(245,184,74,.12)` |
| Erreur | `--ko` / `--ko-bg` | `#FF7A6B` / `rgba(255,122,107,.12)` |

Couleurs de branche (logo, pyramide) : cours indigo `#7C8CFF`, QCM menthe `#4ADE9B`,
simulateurs ambre `#F5B84A`. Valeurs en dur relevées dans la source, hors variables :
`#fff` (survol des liens), `#0B0D11` (texte des boutons, sélection), palette claire du mode
lecture (`#FBFBFC`, `#14171D`, `#5B6AD6`…), `rgba(11,13,17,.78)` (bandeau translucide).

## 3. Typographie

- **Instrument Sans** (400, 500, 600, 700, italique 400) : titres et interface ; repli
  `system-ui, -apple-system, sans-serif`.
- **JetBrains Mono** (400, 500, 600) : données, montants, sur-titres, puces, chronomètre.
- Chargement Google Fonts, `display=swap`.
- Corps 16 px, interligne 1,6, lissage antialiasé.
- Titres : graisse 600, interlettrage −0,028 em, interligne 1,12 ; `h2` `clamp(24px,3vw,32px)`,
  `h3` 20 px, `h4` 15 px en `--ink-2`.
- Sur-titre `.eyebrow` : mono 10,5 px, capitales, interlettrage 0,18 em, `--muted`.
- Grand chiffre de résultat : 32 px, 600, −0,03 em. Valeurs de tableau : mono 500.

## 4. Espacements, rayons, ombres

- Conteneur : `--wrap` 1 120 px (lecture 760 px), marges latérales 24 px, bas 90 px.
- Cartes : padding 24 × 26 px, marge verticale 18 px ; grilles de formulaire, écart 16 px.
- Rayons : `--r` 14 px (cartes, résultats), `--r-s` 9 px (champs, encadrés), 99 px (boutons,
  pastilles, filtres : forme « pilule »).
- Ombres : **quasi absentes** ; la profondeur vient des surfaces étagées et des filets. Seule
  ombre : la feuille de lecture `0 24px 60px rgba(0,0,0,.4)`. Bandeau : flou d'arrière-plan
  14 px.

## 5. Composants

- **Bandeau** collant, translucide, logo médaillon + titre + sous-titre mono + pastille
  « Millésime » + navigation en pilules (`aria-current` = page active). Sous le bandeau, une
  ligne d'avertissement (`.avert`) « Contenu pédagogique… ».
- **Boutons** `.btn` : pilule pleine accent, texte foncé, 14,5 px 600 ; variante `.ghost`
  transparente bordée `--line-2`.
- **Cartes** `.card` ; **en-tête de page** `.lede` (dégradé surface → bg-2).
- **Champs** : fond `--bg-2`, bordure `--line-2`, rayon 9 px, police mono 14,5 px ; focus
  bordure accent. Contour de focus visible 2 px accent.
- **Résultat** `.result` : en-tête à halo d'accent (libellé mono + grand chiffre), puis liste
  `.steps` en lignes libellé / valeur mono, ligne `.total` sur `--surface-2`.
- **Alerte** `.alerte` (ambre), **cartouche de source** `.source-tag`, **puces** `.chip.ok`,
  `.chip.warn`, `.chip.todo`.
- **Filtres** `.filtres` : pilules, l'active inversée (fond `--ink`, texte `--bg`).
- **Tableaux** (registre des paramètres) : bordures horizontales `--line` seulement, en-têtes
  11 px capitales interlettrées en `--muted`, dernière colonne en mono ; conteneur `.tbl`
  à défilement horizontal.
- **Barre de progression** `.bar` : 2 px, remplissage accent, transition 0,3 s.
- **Graphiques** : le site n'en a pas (la pyramide de l'accueil est un objet 3D, pas un
  graphique de données). Proposition ci-dessous.
- **Logo** : médaillon rond `--surface`, triangle en dégradé indigo → menthe → ambre.
- **Accessibilité** : `prefers-reduced-motion` respecté ; focus visible.
- **Responsive** : grilles `auto-fit/minmax` ; un point de rupture à 900 px (accueil) et un à
  640 px (lecture).

## 6. Application proposée à l'outil

1. **Base inchangée** : `assets/css/app.css` copié tel quel depuis le site. Les classes
   existantes (`.card`, `.lede`, `.btn`, `.result`, `.steps`, `.alerte`, `.chip`, `.filtres`,
   `.form-grid`, `.bar`, `.source-tag`) sont réutilisées, pas réécrites.
2. **Ajouts** dans `assets/css/scanner.css`, préfixés `cs-` pour éviter toute collision à
   l'intégration, construits **uniquement** sur les variables existantes. Nouveaux jetons
   sémantiques, alias des existants :

   ```css
   :root{
     --gain: var(--ok);   --gain-bg: var(--ok-bg);
     --perte: var(--ko);  --perte-bg: var(--ko-bg);
     --ecart: var(--warn); --ecart-bg: var(--warn-bg);
     --serie-1: var(--accent); --serie-2: var(--ok); --serie-3: var(--warn);
   }
   ```
3. **Gains, pertes, écarts — jamais la couleur seule** : signe explicite (`+ 1 234,56 $`,
   `− 812,00 $` avec le vrai signe moins U+2212), icône (▲ gain, ▼ perte, ⚠ écart, ✓ contrôle
   réussi) et libellé texte dans les rapports. Le couple menthe / corail reste distinguable
   en luminance pour la plupart des daltonismes ; les signes et icônes couvrent le reste.
4. **Graphiques** en SVG écrit à la main (aucune bibliothèque), couleurs lues dans les
   variables CSS : barres mensuelles (volume en accent ; PnL en `--gain` au-dessus de zéro,
   `--perte` en dessous, avec motif hachuré pour les barres négatives), axes en `--line`,
   étiquettes mono `--muted`.
5. **Mobile d'abord** : tableaux transformés en cartes empilées sous 640 px ; actions
   principales pleine largeur ; marges 16 px.
6. **Logo** : même médaillon que le site, pour l'intégration future dans l'onglet
   « Simulations ». Le bandeau est simplifié : pas de pastille « Millésime » fiscal, à la
   place l'avertissement « Outil en lecture seule — aide au calcul, pas un conseil fiscal ».
7. **Corrections de cohérence** (dans `scanner.css` seulement, le site n'est pas touché) :
   pas de couleur en dur dans le JavaScript ou le HTML de l'outil ; les valeurs en dur
   relevées au § 2 ne sont pas reprises.

## 7. Questions

1. Le site n'a **pas de mode clair**. L'outil reste-t-il sombre uniquement, comme le site,
   ou faut-il prévoir un thème clair (par exemple pour la page imprimable, qui serait de
   toute façon claire, sur le modèle du mode lecture) ?
2. Pour la page imprimable du récap fiscal : reprendre la feuille claire du mode lecture
   des chapitres (`article.chapitre`) ?
