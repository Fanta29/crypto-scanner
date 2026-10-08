# Plan — phase 1 : Polymarket sur Polygon

> **Statut : version 2, soumise à validation. Rien n'est encore implémenté.**
> Établi après lecture de la documentation officielle et d'appels réels (voir
> `docs/SOURCES.md` et `docs/CONSTATS.md`). Les faisabilités clés sont **démontrées sur
> l'adresse de test** : historique complet, volume Polymarket recalculé à l'unité près,
> équation de flux et rapprochement transaction par transaction à **0 écart**.

## 1. Ce que les sources ont changé par rapport au cahier des charges

1. **Data API v1 retirée le 24 octobre 2026** : l'outil est construit sur la **v2** seule
   (`/v2/activity`, pagination par curseur, champs `snake_case`).
2. **pUSD** remplace USDC.e comme collatéral ; deux systèmes de positions coexistent (CTF et
   PositionManager V2) ; les combinés passent par un exchange dédié et un `AutoRedeemer`.
3. Trois **pièges de paramètres** de `/v2/activity` : historique tronqué à trois ans sans
   `start=1` ; dépôts et retraits **exclus par défaut** ; `TIP` jamais renvoyé sauf s'il est
   demandé. Les trois sont neutralisés explicitement.
4. Le « volume » du profil est en **parts** (achats + ventes), pas en dollars.
5. Les **frais** sont importants (≈ 3 586 $ sur l'adresse de test) et inclus dans les
   montants USDC des trades.

## 2. Architecture

Même socle que le site de formation : HTML + CSS + modules ES natifs, aucun build, aucune
dépendance npm, déploiement Vercel « Other ».

```
index.html                      interface (une page)
assets/css/app.css              copie conforme de la feuille du site de formation
assets/css/scanner.css          ajouts propres à l'outil (préfixe cs-, variables existantes seulement)
assets/js/scanner/              logique métier, sans DOM, testable en Node
  decimal.js                    décimal exact (BigInt, échelle fixe)
  modele.js                     événement normalisé, catégories, validation
  connecteurs/index.js          registre des connecteurs
  connecteurs/polymarket-polygon/  recuperation.js · normalisation.js · controles.js · contrats.js
  sources/data-api.js           client Data API v2 (pagination, reprises)
  sources/etherscan.js          client du relais api/etherscan
  sources/bce.js                taux BCE
  positions.js  volumes.js  agregats.js  reconciliation.js  fiscal.js
  export-csv.js  export-xlsx.js (XLSX écrit à la main : ZIP « stored » + CRC32)
  checksum.js                   EIP-55 (Keccak-256 local, testé sur vecteurs publiés)
assets/js/ui/                   composants d'interface autonomes, un fichier par composant
assets/js/store.js              cache IndexedDB — seul point de contact avec le stockage
api/etherscan.js                relais serveur : liste blanche module/action, ajoute la clé
api/sante.js                    présence des variables, jamais leur valeur
tests/  fixtures/  tools/  docs/
```

- **Data API et BCE : appelées directement depuis le navigateur** (CORS ouvert, pas de clé).
- **Etherscan : uniquement via `api/etherscan.js`**, qui n'accepte qu'une liste fermée
  d'actions (`tokentx`, `token1155tx`, `tokenbalance`, `getLogs`, `txlist`) et ne renvoie
  jamais la clé. `POLYGON_RPC_URL` devient inutile en phase 1.
- Le navigateur pilote la pagination page par page : chaque appel serveur reste court.

## 3. Sources de données

| Besoin | Source principale | Contrôle |
|---|---|---|
| Historique | `/v2/activity?start=1&exclude_deposits_withdrawals=false&type=<tous, TIP compris>&limit=1000` | transferts pUSD on-chain, transaction par transaction |
| Combinés | lignes `is_combo` de `/v2/activity` + `/v2/activity/combos` (détail des jambes, `id = tx-log`) | idem |
| Positions | soldes ERC-1155 on-chain (`token1155tx` sur CTF et PositionManager) | `/v2/positions`, `/v2/positions/combos` (arrondis à 4 décimales) |
| Dépôts / retraits | lignes DEPOSIT / WITHDRAWAL | mint / burn pUSD et transferts USDC.e de la même transaction |
| Solde | `tokenbalance` pUSD (+ USDC.e, USDC natif signalés à part) | — |
| Chiffres Polymarket | `/v2/user-volume`, `/v2/user-stats`, `/v2/user-pnl` | point de comparaison, jamais vérité |
| Taux USD/EUR | BCE `EXR/D.USD.EUR.SP00.A` | — |

## 4. Modèle de données

### 4.1 Adresses

`{ adresse, famille: "evm" | "solana" | "bitcoin", chaines: [...], libelle }`. Une adresse EVM
vaut pour toutes les chaînes EVM ; l'ensemble des adresses de l'utilisateur sert à
reconnaître les transferts internes.

### 4.2 Événement normalisé (seul format connu des calculs)

```js
{
  id,            // clé stable et unique (§ 6)
  connecteur, chaine, protocole, adresse,
  horodatage,    // secondes UTC ; affichage UTC et Europe/Paris dérivé
  bloc, hash, indexLog,          // indexLog null si la source ne le fournit pas
  categorie,     // une seule (§ 5)
  entrees: [{ actif, quantite }], sorties: [{ actif, quantite }],
  montantUsd,    // espèces réellement déplacées, frais compris, chaîne décimale
  notionnelUsd,  // parts × prix, hors frais (trades), sinon null
  fraisUsd,      // montantUsd − notionnelUsd en valeur absolue (trades), sinon 0
  position: { marche, conditionId, tokenId, issue, combine, systeme: "ctf" | "v2" } | null,
  parts, prix,
  contrepartie, interne,
  sourceBrute    // référence de l'enregistrement brut conservé
}
```

Montants en **chaînes décimales** manipulées par `decimal.js` (BigInt). Les montants de la
Data API arrivent en flottants JSON : ils sont convertis une fois, par leur représentation
décimale la plus courte, arrondis à 6 décimales (précision du pUSD), avec anomalie si une
valeur porte une précision supérieure non nulle. Le rapprochement on-chain, en entiers
exacts, contrôle ensuite chaque montant.

### 4.3 Connecteur

```js
{ id, chaines, protocole,
  recuperer(adresse, { depuis, signal, progression }) → { bruts, couverture, anomalies },
  normaliser(bruts, contexte) → evenements[],
  controles(adresse, evenements, bruts) → verifications[] }
```

Détail et guide d'ajout : `docs/CONNECTORS.md` (à rédiger à l'étape 8).

## 5. Classification

| Donnée source | Catégorie |
|---|---|
| TRADE BUY / SELL (combiné ou non, indicateur conservé) | ACHAT / VENTE |
| REDEEM, montant > 0 / = 0 | REDEEM_GAGNANT / REDEEM_PERDANT |
| SPLIT, MERGE, CONVERSION ; combinés : CONVERT, COMPRESS, WRAP, UNWRAP | SPLIT / MERGE / CONVERSION (sous-type conservé) |
| MIGRATION (CTF → V2, sans espèces) | **MIGRATION** (technique, proposé) |
| MAKER_REBATE, TAKER_REBATE | REBATE |
| REWARD, REFERRAL_REWARD | REWARD (sous-type conservé) |
| YIELD | **question 1** |
| TIP (transfert pUSD entre utilisateurs, `side` IN / OUT) | **question 2** |
| DEPOSIT / WITHDRAWAL depuis ou vers l'extérieur | DEPOT / RETRAIT |
| idem, contrepartie ∈ mes adresses | TRANSFERT_INTERNE (exclu du consolidé) |
| type inconnu, champ manquant, combinaison inattendue | INCONNU — affiché et compté, jamais écarté |
| mouvement on-chain sans ligne Data API | INCONNU si montant ≠ 0 ; listé en « on-chain seul » si nul |

## 6. Pagination et déduplication

- `/v2/activity` est paginé par **curseur sur `(block_timestamp, sequence_id)`** : le piège des
  horodatages identiques en bord de page n'existe plus côté client. Parcours jusqu'à
  `next_cursor = null`, `has_more` contrôlé.
- **Garde-fous conservés** : (1) contrôle d'un parcours croissant contre le parcours
  décroissant sur demande (démontré identique sur l'adresse de test) ; (2) déduplication par
  multiensemble sur la clé `transaction_hash + type + token_id + side + size + usdc_size +
  price + timestamp + condition_id + is_combo`, doublons comptés et listés ; (3) rapprochement
  on-chain transaction par transaction, qui détecte toute ligne perdue ou en trop.
- 429 / 5xx : reprise avec attente exponentielle plafonnée, respect de `Retry-After`
  (exposé par CORS). Limite documentée : 1 000 requêtes / 10 s.
- Mise à jour incrémentale : rescan depuis le dernier horodatage en cache **moins une marge**
  (7 jours proposés), fusion par clé.

## 7. Calculs

- **Volumes**, chacun nommé : parts (définition Polymarket) ; notionnel (= `volume_usdc`
  Polymarket) ; espèces frais compris (définition du cahier des charges) ; espèces + redeems.
  Chaque définition est rapprochée de `/v2/user-volume`.
- **PnL par position** (`tokenId`) au **coût moyen pondéré**, frais inclus dans le coût
  d'achat et déduits du produit de vente (espèces réelles). Pour une position soldée, le
  résultat égale « total reçu − total payé ». Les frais sont aussi totalisés à part, pour
  comparaison avec le PnL Polymarket, qui les présente séparément.
- Positions ouvertes listées à part (coût restant, valeur au prix actuel, non réalisé).
- **PnL global** = réalisé + rebates + rewards, rapproché champ par champ de
  `/v2/user-stats` (réalisé marchés, réalisé combinés, frais, rebates).
- Agrégations par jour, mois, année civile, catégorie de marché.

## 8. Réconciliation (rapport automatique)

1. **Équation de flux** : dépôts − retraits + ventes + redeems + rebates + rewards + merges
   − achats − splits ± conversions ± tips = solde pUSD on-chain. Démontré à 0 écart.
2. **Transaction par transaction** : mouvement net pUSD on-chain = montant Data API. Démontré
   à 0 écart sur 1 188 transactions.
3. **Positions** : parts achetées − vendues − rachetées ± techniques = solde ERC-1155 on-chain.
4. **Volumes** : recalcul = `/v2/user-volume`.
5. **Couverture** : premier et dernier événement, pages, doublons, transactions on-chain sans
   ligne API, fonds non-pUSD présents sur le wallet (USDC natif, USDC.e).

Seuil configurable, **0 par défaut** (les montants sont exacts au micro-dollar). Tout écart :
ligne rouge, signe, icône, transactions en cause listées.

## 9. Récapitulatif fiscal

Par année civile (Europe/Paris) : chaque opération convertie au taux BCE du jour (dernier
fixing antérieur les jours sans fixing, règle affichée) ; hypothèse 1 pUSD = 1 USDC = 1 USD
signalée ; taux, date et source conservés dans l'export ; totaux par catégorie en USD et EUR ;
PnL réalisé de l'année ; frais de l'année ; dépôts et retraits datés avec contreparties
lisibles sur Polygon ; positions ouvertes au 31 décembre ; fonds hors Polymarket signalés ;
points à voir avec un professionnel (régime, 3916 / 3916-bis, stablecoins) ; mention « aide
au calcul, pas un conseil fiscal ». L'outil ne choisit aucun régime.

## 10. Exports et interface

CSV (une ligne par événement, hash inclus), XLSX (détail, positions, synthèse annuelle,
réconciliation), page imprimable (`@media print`). Interface : champ adresse (format +
checksum EIP-55), progression, tableau de bord, rapport de réconciliation en tête, filtres,
recherche, graphiques mensuels SVG, cache IndexedDB.

## 11. Tests

`node:test`, sans dépendance : décimal ; conversion des flottants Data API ; classification
(tous les types, y compris inconnus) ; pagination par curseur (fin, `has_more`, reprise
après 429) ; déduplication ; rapprochement transaction par transaction ; PnL (ventes
partielles, positions ouvertes, frais) ; conversion EUR (jours sans fixing) ; checksum.
Test d'intégration sur les fixtures de l'adresse de test : flux et transactions à 0 écart,
volume = `/v2/user-volume`.

## 12. Ordre de travail

1. ~~Accès réseau, doc, appels réels, fixtures~~ — fait.
2. `decimal.js`, `modele.js`, tests.
3. Connecteur Polymarket : Data API v2, normalisation, tests.
4. Relais `api/etherscan.js` ; rapprochements on-chain (pUSD, ERC-1155).
5. Positions, PnL, volumes, réconciliation → rapport sur l'adresse de test.
6. Fiscal, exports.
7. Interface (après validation de `DESIGN.md`).
8. `CONNECTORS.md`, `ROADMAP.md`, `INTEGRATION.md`, README complet.

## 13. Questions à trancher

1. **YIELD** : intérêts versés en pUSD par Polymarket (champ `yield_income`). Classer en
   REWARD, ou en catégorie propre RENDEMENT ?
2. **TIP** : transfert pUSD entre utilisateurs. DEPOT / RETRAIT avec contrepartie (proposé),
   ou catégorie propre ?
3. **Coût d'un SPLIT** entre issues : prorata du prix de marché, ou parts égales ?
4. **Catégories ajoutées** TRANSFERT_INTERNE et MIGRATION : d'accord ?
5. **Fuseau du récap annuel** : Europe/Paris ?
6. **1 500 USDC natifs** reçus en 3 × 500 via `disperseToken` : de quoi s'agit-il ? L'outil les
   signalera dans tous les cas.
7. **Confidentialité des fixtures** : le dépôt `crypto-scanner` est **public**. Les fixtures
   contiennent l'historique complet de l'adresse de test et son pseudonyme. Les publier dans
   le dépôt (tests reproductibles), ou les garder hors dépôt (non commitées pour l'instant) ?
