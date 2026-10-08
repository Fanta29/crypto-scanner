# Intégration dans le site Formation Finance & Fiscalité

Objectif : faire de l'outil un simulateur de l'onglet « Simulateurs » du site, sans refonte.
L'outil a été conçu pour ce transfert : mêmes conventions (HTML + CSS + modules ES natifs,
aucun build, aucune dépendance npm, déploiement Vercel « Other »), même feuille de style de base,
logique métier isolée.

## 1. Ce qui se transfère tel quel

| Élément de l'outil | Destination dans le site | Remarque |
|---|---|---|
| `assets/js/scanner/**` | `assets/js/scanner/**` | logique métier pure, sans DOM ; aucune modification |
| `assets/js/ui/*.js` sauf `chrome.js` | `assets/js/scanner-ui/` | composants autonomes |
| `assets/css/scanner.css` | `assets/css/scanner.css` ou fin de `app.css` | classes `cs-`, variables du site uniquement |
| `api/etherscan.js` | `api/etherscan.js` | première fonction serveur du site (voir § 3) |
| `tests/` | `tools/` ou `tests/` du site | `node --test` ; fixtures hors dépôt |

`assets/css/app.css` de l'outil est une copie de celle du site : **ne pas la copier en retour**.
`ui/chrome.js` est remplacé par `chrome()` de `ui.js` du site.

## 2. Étapes

1. Copier les dossiers du § 1, en adaptant les chemins d'import des composants
   (`../scanner/…` reste valable si `scanner-ui/` est voisin de `scanner/`).
2. Créer `crypto.html` sur le modèle de `outils.html` (même `<head>`, polices, `app.css`), en
   ajoutant `assets/css/scanner.css` et le script de page `assets/js/crypto.js` — copie de
   `assets/js/scanner.js` où `import { chrome } from "./ui/chrome.js"` devient
   `import { chrome } from "./ui.js"`.
3. Ajouter l'entrée dans `PAGES` de `ui.js` (navigation) et une tuile sur `outils.html`.
4. Ajouter les nouveaux fichiers à `SOCLE` dans `sw.js` **et incrémenter `VERSION`** (CLAUDE.md
   du site, § 6). Exclure du cache hors ligne les réponses d'API (le `fetch` du service worker
   ne gère que l'origine du site : Data API, BCE et Etherscan ne sont pas concernés).
5. Lancer `bash tools/verifier-tout.sh` du site : l'audit vérifie que toute classe CSS employée
   existe dans la feuille — `scanner.css` doit donc être déclarée là où l'audit la lit (ou
   fusionnée en fin de `app.css`).
6. Vercel : ajouter `ETHERSCAN_API_KEY` (Production et Preview) dans le projet du site.

## 3. Points de vigilance

- **Première fonction serveur du site.** Le site n'a aujourd'hui aucun serveur. `api/` ajoute
  des fonctions Vercel ; `.vercelignore` du site ne doit pas l'exclure, et `vercel.json` peut
  garder ses en-têtes (ajouter `Cache-Control: no-store` sur `/api/(.*)`, comme ici).
- **Paramètres fiscaux.** Le site centralise tout chiffre fiscal dans `params.js`, avec
  `exiger()`. L'outil n'utilise aujourd'hui **aucun paramètre fiscal** (il ne calcule pas d'impôt,
  seulement des montants convertis). Si un calcul d'impôt est ajouté (voir `ROADMAP.md`, 2086),
  ses paramètres (seuil, taux) devront entrer dans `params.js` avec leur base légale et passer
  par `exiger()`.
- **Mentions légales.** Le site promet « aucune donnée ne quitte l'appareil ». L'outil envoie
  l'adresse saisie à la Data API Polymarket, à la BCE (dates seulement) et, via la fonction
  serveur, à Etherscan. `mentions-legales.html` devra le dire.
- **Ton et limites.** Les avertissements de l'outil (« aide au calcul, pas un conseil fiscal »,
  limites de la valorisation) suivent la règle du site : ne pas les raccourcir.
- **Couleurs.** `chrome.js` et `graphique.js` lisent les variables CSS ; les couleurs de branche
  restent celles de `BRANCHES` (pyramide) : l'outil relève de la branche « simulateurs » (ambre).
