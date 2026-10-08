# Crypto Scanner

Analyse en **lecture seule** d'une adresse crypto : historique complet, classement de chaque
opération, rapprochement avec la blockchain, volumes, résultats et récapitulatif annuel en euros
orienté déclaration française. Aucune clé privée, signature ni connexion de wallet.

**Phase 1 : Polymarket sur Polygon.** Les phases suivantes sont analysées dans `docs/ROADMAP.md`.

> Aide au calcul, pas un conseil fiscal. L'outil ne choisit pas le régime d'imposition des gains
> sur marchés prédictifs ; il fournit des données propres, sourcées et vérifiées.

## Ce que fait l'outil

1. Récupère tout l'historique de l'adresse sur la Data API Polymarket **v2** (la v1 est retirée le
   24 octobre 2026), y compris dépôts, retraits et tips, exclus par défaut par l'API.
2. Récupère les transferts on-chain (pUSD, USDC.e, USDC natif, parts ERC-1155) via Etherscan V2.
3. Rapproche **chaque transaction** : montant de l'API = mouvement de pUSD on-chain ; parts de
   l'API = parts transférées on-chain. Les mouvements absents de l'API deviennent des événements.
4. Classe chaque événement dans une catégorie unique, calcule les positions au coût moyen pondéré,
   les volumes, le résultat, et produit un **rapport de réconciliation** (vert, ou chaque écart
   listé et expliqué).
5. Convertit chaque montant en euros au taux BCE du jour et produit un récapitulatif par année
   civile (heure de Paris), imprimable en PDF, avec exports CSV et XLSX.

## Installation et développement local

Aucune dépendance, aucune étape de build.

```bash
npm test                                   # 47 tests (node:test)
ETHERSCAN_API_KEY=… node tools/serveur-dev.mjs 8000   # pages + fonctions api/ → http://localhost:8000
# ou : npx vercel dev
```

Les modules ES et `fetch` imposent un serveur HTTP : ouvrir `index.html` en `file://` ne
fonctionne pas. Sans relais `api/` (simple `python3 -m http.server`), l'outil fonctionne en mode
dégradé, signalé en rouge : pas de vérification on-chain.

Fixtures réelles (hors dépôt, voir `.gitignore`) :

```bash
node tools/capture-fixtures.mjs 0x…        # Data API v2 → fixtures/<adresse>/
node tools/capture-onchain.mjs 0x…         # Etherscan → fixtures/onchain/<adresse>/ (clé requise)
node tools/rapport.mjs > docs/RAPPORT-ADRESSE-TEST.md
```

Dans un environnement à proxy, `fetch` de Node exige `NODE_USE_ENV_PROXY=1`.

## Variables d'environnement

| Variable | Rôle | Où |
|---|---|---|
| `ETHERSCAN_API_KEY` | Etherscan API V2 (clé multichaîne ; une clé Polygonscan V1 n'est pas valide). L'offre gratuite couvre Polygon (vérifié le 2026-10-08). | Vercel → Settings → Environment Variables → **Production et Preview** |
| `POLYGON_RPC_URL` | Non utilisée en phase 1. | — |

La clé n'est lue que par `api/etherscan.js`, qui n'accepte qu'une liste fermée d'actions et ne la
renvoie jamais. `/api/sante` indique si la variable est présente, sans sa valeur.

## Déploiement

Vercel, framework « Other », commande de build et répertoire de sortie vides. `vercel.json`
fixe les en-têtes ; `.vercelignore` écarte `docs/`, `tests/`, `fixtures/`, `tools/`.

## Définitions retenues

**Volumes** — quatre définitions, affichées séparément :

| Nom | Définition | Correspondance Polymarket |
|---|---|---|
| Parts échangées | Σ parts achetées + Σ parts vendues | **= le « volume » du profil** (`/v2/user-volume.volume`), en parts et non en dollars |
| Notionnel | Σ parts × prix, hors frais | = `volume_usdc` |
| Espèces échangées | Σ ACHAT + Σ VENTE en USDC, frais compris | — |
| Espèces + rachats | Espèces échangées + Σ REDEEM_GAGNANT | — |

**Méthode de coût** — coût moyen pondéré par position (une issue d'un marché, ou un combiné) ;
frais inclus dans le coût d'achat et déduits du produit de vente. Une vente ou un rachat réalise
`produit − coût moyen × parts`. Pour une position soldée, le réalisé égale exactement « total
reçu − total payé ». Un rachat qui détruit les deux issues attribue le paiement à l'issue
gagnante.

**Résultat** — trois lignes, jamais mélangées :
réalisé par opérations (ventes, rachats) ; **positions résolues non rachetées** (marché tranché,
parts encore détenues, valeur de résolution — 0 pour une issue perdante — moins coût restant,
datées de la résolution) ; latent des positions ouvertes (prix courant Polymarket, non réalisé).
Plus les remises et récompenses.

**Fiscal** — année civile en heure de Paris ; taux BCE du jour de l'opération (dernier fixing
antérieur les jours sans fixing, signalé) ; hypothèse 1 pUSD = 1 USDC = 1 USD ; euros calculés
sans arrondi intermédiaire.

## Limites connues

- **Régime fiscal** non choisi (jeux, BNC, actifs numériques…) : à décider avec un professionnel.
- **Positions à une date** (31 décembre d'une année close, ou toute date) : valeur de résolution
  si le marché était tranché, sinon dernier prix publié à cette date (`/v2/prices-history`,
  `as_of`). Les **combinés n'ont pas d'historique de prix** : non tranchés à la date choisie, ils
  restent « non valorisés », avec leur coût restant affiché.
- **Provenance des dépôts** : les dépôts Polymarket arrivent en pUSD frappé sur le wallet ; leur
  origine (plateforme, compte) n'est pas lisible sur Polygon. Pour un retrait, la contrepartie est
  l'adresse de sortie sur Polygon (souvent un pont), pas la destination finale.
- **Résolutions UMA** sans vecteur de paiement : la valeur retenue est le prix publié par
  `/v2/positions`, signalé comme tel (le champ `price` de la réponse UMA n'est pas interprété,
  son échelle n'étant pas documentée).
- **Split** : coût réparti à parts égales entre issues (prix de marché non chargé). Aucune adresse
  de test ne contient de split, merge, conversion ou migration : ces chemins sont testés sur des
  données construites seulement.
- **Combinés** : traités comme une position chacun, valeur 0 ou 1 à la résolution ; un paiement
  partiel (jambe annulée) est pris tel que réglé on-chain.
- **Chiffres Polymarket** (`/v2/user-stats`) : définitions non documentées ; ils servent de point
  de comparaison. Leur PnL diffère du résultat calculé ici (voir `docs/CONSTATS.md`, § 8).
- **Plusieurs adresses** : saisies ensemble (séparées par une virgule ou un espace), elles donnent
  une vue par adresse et une vue consolidée. Un transfert entre deux de vos adresses (pUSD ou parts)
  n'est ni un dépôt, ni un retrait, ni une vente : les parts gardent leur coût. Si l'adresse
  d'origine n'est pas analysée, le coût des parts reçues est inconnu (retenu à 0, signalé).
- **Débit Etherscan** : offre gratuite limitée à quelques appels par seconde et par clé, partagée
  entre tous les utilisateurs du déploiement.
- **XLSX** : un tableur lit les nombres en flottant (15 chiffres significatifs) ; le CSV fait foi.

## Documentation

`docs/PLAN.md` (plan validé) · `docs/SOURCES.md` (chaque fait et sa source) ·
`docs/CONSTATS.md` (ce que les données réelles ont montré) · `docs/RAPPORT-ADRESSE-TEST.md` ·
`docs/DESIGN.md` · `docs/CONNECTORS.md` · `docs/ROADMAP.md` · `docs/INTEGRATION.md`
