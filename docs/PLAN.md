# Plan — phase 1 : Polymarket sur Polygon

> **Statut : brouillon soumis à validation, rien n'est implémenté.**
> La documentation Polymarket et les API n'ont **pas encore pu être consultées
> directement** : la politique réseau de l'environnement les bloque (voir
> `docs/SOURCES.md`). Tout ce qui dépend d'un nom d'endpoint, d'un paramètre, d'une limite
> ou d'une adresse de contrat est marqué **[à vérifier]**. Ces points seront confirmés sur
> la documentation et sur des réponses réelles (échantillons dans `fixtures/`) avant d'être
> codés. Le plan sera corrigé là où la réalité diffère.

## 0. Ce que la recherche préliminaire a déjà changé

Trois éléments, connus seulement par des résumés de recherche, modifient le cahier des
charges s'ils se confirment :

1. **Migration des contrats.** Polymarket aurait une génération V2 de contrats d'échange
   avec un nouveau collatéral, **pUSD**, qui remplace USDC.e. L'adresse de test a été créée
   en juin 2026 : il faut établir si son historique est entièrement en pUSD, entièrement en
   USDC.e, ou s'il chevauche la migration. Les deux collatéraux et les deux générations de
   contrats sont donc prévus.
2. **Data API v2.** Une route `/v2/activity` paginée par curseur (sans `offset`) coexisterait
   avec l'ancienne `/activity` (offset ≤ 5 000). Si elle existe, la v2 est la source
   principale ; la v1 sert de contrôle.
3. **Combinés.** Ils auraient un endpoint propre (`/v1/activity/combos`), un exchange dédié
   (« v3 ») et un rachat par identifiant de combiné. Dans `/activity`, une ligne `isCombo`
   ne décrit donc probablement pas une position classique.

## 1. Architecture

Même socle que le site de formation : HTML + CSS + modules ES natifs, aucun build, aucune
dépendance npm, déploiement Vercel « Other ».

```
index.html                      interface (une page)
assets/css/app.css              copie conforme de la feuille du site de formation
assets/css/scanner.css          ajouts propres à l'outil, uniquement des variables existantes
assets/js/scanner/              logique métier, sans DOM, testable en Node
  decimal.js                    décimal exact (BigInt, échelle fixe)
  modele.js                     format d'événement normalisé, catégories, validation
  connecteurs/index.js          registre des connecteurs
  connecteurs/polymarket-polygon.js
  pagination.js                 pagination fiable (fenêtres, chevauchement, dédoublonnage)
  positions.js                  positions et PnL (coût moyen pondéré)
  volumes.js  agregats.js
  reconciliation.js             rapport de contrôle
  fiscal.js                     conversion EUR (BCE), récapitulatif annuel
  export-csv.js  export-xlsx.js (XLSX écrit à la main : ZIP « stored » + CRC32, sans dépendance)
assets/js/ui/                   composants d'interface autonomes (un fichier par composant)
assets/js/store.js              cache local (IndexedDB) — seul point de contact avec le stockage
api/                            fonctions Vercel : seules à connaître les clés
  etherscan.js                  relais vers Etherscan V2, liste blanche module/action, ajoute la clé
  rpc.js                        relais RPC, liste blanche (eth_call, eth_getLogs, eth_blockNumber)
  polymarket.js                 relais Data API (liste blanche de chemins) — seulement si CORS l'impose
  bce.js                        relais des taux BCE (CORS, cache)
tests/  fixtures/  docs/
```

Le navigateur pilote la pagination page par page : chaque appel serveur reste court, ce qui
évite les limites de durée des fonctions Vercel. Les relais n'acceptent que des requêtes en
liste blanche et ne renvoient jamais la clé.

## 2. Sources de données

| Besoin | Source principale | Contrôle croisé |
|---|---|---|
| Historique d'activité | Data API v2 `/v2/activity` **[à vérifier]**, sinon v1 `/activity` | l'autre version, puis on-chain |
| Combinés | `/v1/activity/combos` **[à vérifier]** | journaux de l'exchange des combinés |
| Positions actuelles | `/positions` (+ positions combinées) **[à vérifier]** | soldes ERC-1155 du CTF |
| Dépôts / retraits | transferts ERC-20 pUSD et USDC.e (`tokentx` Etherscan V2) | types DEPOSIT / WITHDRAWAL de la Data API |
| Trades | — | événements `OrderFilled` des exchanges V1 et V2 **[à vérifier]** |
| Redeems | — | `PayoutRedemption` du CTF et de l'adaptateur NegRisk **[à vérifier]** |
| Solde actuel | `balanceOf` pUSD + USDC.e (RPC ou Etherscan) | — |
| Taux USD/EUR | BCE `EXR/D.USD.EUR.SP00.A` | — |
| Chiffres du profil | endpoints volume / PnL / valeur **[à vérifier]** | servent de point de comparaison, pas de vérité |

## 3. Modèle de données

### 3.1 Adresses

`{ adresse, famille: "evm" | "solana" | "bitcoin", chaines: ["polygon", …], libelle }`.
Une adresse EVM vaut pour toutes les chaînes EVM ; l'ensemble des adresses d'un utilisateur
sert à repérer les transferts internes.

### 3.2 Événement normalisé (seul format connu des calculs)

```js
{
  id,              // clé stable, unique (voir § 4.3)
  connecteur,      // "polymarket-polygon"
  chaine, protocole, adresse,
  horodatage,      // secondes UTC (entier) ; affichage UTC et Europe/Paris dérivé
  bloc, hash, indexLog,          // indexLog null si la source ne le donne pas
  categorie,       // une seule, voir § 4
  entrees: [{ actif, quantite }],  // vers l'adresse
  sorties: [{ actif, quantite }],  // depuis l'adresse
  valeurUsd,       // décimal en chaîne
  frais: [{ actif, quantite }],
  position: { marche, conditionId, issue, tokenId, combine } | null,
  parts, prix,     // décimaux en chaîne, null si sans objet
  contrepartie,    // adresse de provenance / destination pour DEPOT / RETRAIT
  interne,         // vrai si contrepartie ∈ mes adresses
  sourceBrute      // référence vers l'enregistrement brut conservé
}
```

Les quantités et montants sont des **chaînes décimales** manipulées par `decimal.js`
(BigInt, échelle fixe). Les montants Data API arrivent en nombres JSON : ils sont convertis
une seule fois, à 6 décimales, avec signalement si une valeur porte davantage de précision.
Les montants on-chain (entiers bruts, 6 décimales) sont exacts par construction.

### 3.3 Connecteur

```js
{ id, chaines, protocole,
  recuperer(adresse, { depuis, signal, progression }) → { bruts, couverture, anomalies },
  normaliser(bruts, contexte) → evenements[],
  controles(adresse, evenements) → verifications[] }   // contrôles propres à la source
```

Les calculs, la réconciliation générique, les exports et le récap fiscal ne lisent que des
événements normalisés. Interface détaillée dans `docs/CONNECTORS.md` (à rédiger).

## 4. Classification

### 4.1 Table de correspondance

| Donnée source | Catégorie | Montant retenu |
|---|---|---|
| TRADE, side BUY | ACHAT | USDC payé |
| TRADE, side SELL | VENTE | USDC reçu |
| REDEEM, paiement > 0 | REDEEM_GAGNANT | USDC reçu |
| REDEEM, paiement = 0 | REDEEM_PERDANT | 0 |
| SPLIT / MERGE / CONVERSION | SPLIT / MERGE / CONVERSION | USDC engagé / rendu |
| MAKER_REBATE, TAKER_REBATE | REBATE | USDC reçu |
| REWARD | REWARD | USDC reçu |
| YIELD **[à vérifier : nature exacte]** | **question ouverte** (REWARD ou INCONNU) | — |
| transfert pUSD / USDC.e entrant depuis l'extérieur | DEPOT | montant |
| transfert sortant vers l'extérieur | RETRAIT | montant |
| transfert depuis / vers une autre de mes adresses | TRANSFERT_INTERNE | montant, exclu du consolidé |
| tout autre type ou combinaison inattendue | INCONNU | affiché et compté à part |

Toute donnée qui ne correspond à aucune ligne est classée INCONNU, jamais écartée.
Une erreur de forme (champ manquant, montant négatif inattendu) produit une anomalie
visible.

### 4.2 Dépôts : éviter le double comptage

Les types DEPOSIT / WITHDRAWAL de la Data API et les transferts ERC-20 on-chain décrivent
peut-être les mêmes mouvements. Règle : **l'on-chain fait foi** pour DEPOT / RETRAIT ; les
lignes Data API correspondantes sont rapprochées par hash et servent de contrôle. Les
transferts de collatéral entre le wallet et les contrats Polymarket (exchanges, CTF,
adaptateurs) ne sont pas des dépôts : ce sont les jambes en espèces des trades, splits,
merges et redeems.

### 4.3 Clé de déduplication

La Data API ne fournit pas d'index de journal. Une même transaction peut légitimement
contenir plusieurs événements (plusieurs remplissages d'un ordre, plusieurs issues
rachetées). Proposition, à confronter aux données réelles :

`transactionHash + type + asset + side + size + usdcSize + price + timestamp`

et, surtout, une pagination qui **n'a pas besoin de deviner** (§ 5) : la clé sert alors de
contrôle (doublons comptés et listés), pas de seul rempart. Si deux événements réels
identiques sur tous ces champs existent dans une même transaction, l'outil les conserve
tous deux (multiplicité par réponse), et le contrôle on-chain, qui dispose de l'index de
journal, tranche.

## 5. Pagination

**Si la v2 à curseur existe** : suivre `next_cursor` jusqu'à `null`, puis contrôler par un
second passage v1 sur une fenêtre récente.

**Sinon (v1, offset ≤ 5 000)** — fenêtres glissantes vers le passé, tri par horodatage
décroissant :

1. Requête `end = E`, `offset = 0`, `limit = max`.
2. Soit `T` l'horodatage le plus ancien de la page. Les événements de la page **à T** sont
   écartés (ils peuvent être incomplets) ; les autres sont acquis.
3. Requête suivante avec `end = T` (chevauchement inclusif, jamais `T − 1`) : elle renvoie
   à nouveau **tous** les événements à T.
4. Si une seule seconde contient plus d'une page d'événements, elle est lue à part
   (`start = end = T`, offset croissant).
5. Arrêt quand une page est incomplète ; le premier événement est alors atteint.

Ainsi les événements d'un horodatage donné proviennent toujours d'**une seule** réponse non
tronquée : aucune perte, aucun doublon à deviner. La clé du § 4.3 compte néanmoins les
doublons observés entre pages (attendus dans le chevauchement) et signale tout doublon
inattendu.

Robustesse : 429 et 5xx → nouvelle tentative avec attente exponentielle plafonnée et
respect de `Retry-After` ; erreur 400 sur offset → bascule en fenêtre plus étroite ;
progression affichée (événements, période couverte). Les limites exactes sont **[à vérifier]**
et seront mesurées.

## 6. Calculs

- **Volumes**, affichés séparément et nommés : (a) échangé = Σ ACHAT + Σ VENTE en USDC ;
  (b) a + Σ REDEEM_GAGNANT ; (c) en parts échangées ; (d) en parts, en comptant les deux
  côtés si c'est la définition Polymarket. Comparaison chiffrée avec le profil (≈ 389,9 K $)
  et les endpoints de volume. Les résumés de documentation évoquent un volume « both-sides »
  exprimé en **parts** : hypothèse à tester en priorité.
- **Position** = (marché, issue), identifiée par `tokenId` ; un combiné = une position.
- **PnL réalisé** : méthode du **coût moyen pondéré** par position. Une vente réalise
  `produit − coût moyen × parts vendues` ; un redeem réalise `paiement − coût moyen × parts`.
  Pour une position soldée, le résultat égale exactement « total reçu − total payé ». Les
  positions encore ouvertes sont listées à part, avec coût restant et valeur actuelle
  (non réalisée).
- **SPLIT / MERGE / CONVERSION** : un split de X crée X parts de chaque issue. Répartition
  du coût entre issues : **question ouverte** (proposition : au prorata du prix de marché
  si disponible, sinon à parts égales, méthode affichée).
- **PnL global** = réalisé + rebates + rewards, comparé au PnL du profil (−2 760,88 $),
  écart expliqué (non réalisé, frais, méthode).
- **Agrégations** par jour, mois, année civile (Europe/Paris et UTC, au choix affiché),
  catégorie de marché.

## 7. Réconciliation

1. **Équation de flux** : dépôts − retraits + ventes + redeems + rebates + rewards + merges
   − achats − splits ± conversions **=** solde collatéral on-chain (pUSD + USDC.e). Les
   splits et merges, absents de la formule initiale, sont ajoutés car ils déplacent des
   espèces. Écart en valeur absolue et relative.
2. **Positions** : achetées − vendues − rachetées ± split/merge/conversion = détenues
   (endpoint positions et solde ERC-1155).
3. **Data API vs on-chain** : rapprochement par hash des trades et redeems ; liste des
   événements présents d'un seul côté.
4. **Couverture** : premier et dernier événement, nombre de pages, doublons supprimés,
   fenêtres relues, anomalies.

Seuil configurable (défaut proposé : 0,01 USDC en absolu). Au-delà : ligne rouge, signe et
icône, opérations en cause listées. Aucun arrondi avant la comparaison.

## 8. Récapitulatif fiscal

Par année civile : conversion de chaque opération au taux BCE du jour (repli sur le dernier
taux publié antérieur les jours sans fixing, règle affichée) ; hypothèse 1 USDC = 1 pUSD =
1 USD signalée ; taux et date conservés dans l'export ; totaux par catégorie en USD et EUR ;
PnL réalisé de l'année ; dépôts et retraits datés avec contreparties ; positions ouvertes au
31 décembre valorisées à part ; points à vérifier avec un professionnel (régime applicable,
3916 / 3916-bis, stablecoins) ; mention « aide au calcul, pas un conseil fiscal ». L'outil
ne choisit aucun régime.

## 9. Exports et interface

CSV (une ligne par événement, hash inclus), XLSX (détail, positions, synthèse annuelle,
réconciliation), page imprimable (`@media print`) pour le PDF. Interface : champ adresse
(format + checksum EIP-55, implémenté sans dépendance avec Keccak-256 écrit localement et
testé sur vecteurs publiés), barre de progression, tableau de bord, rapport de
réconciliation en tête, filtres, recherche, graphiques mensuels en SVG. Cache IndexedDB ;
un rescan relit une marge récente (proposé : 7 jours) pour capter les événements tardifs.

## 10. Tests

`node:test`, sans dépendance : classification, décimal, pagination (dont horodatages
identiques en bord de page, seconde contenant plus d'une page), dédoublonnage, PnL (ventes
partielles, positions ouvertes), conversion EUR (jours sans fixing), checksum. Test
d'intégration sur l'adresse de test à partir des fixtures réelles.

## 11. Ordre de travail proposé

1. Accès réseau → lecture de la doc, appels réels, fixtures, `SOURCES.md` confirmé, plan corrigé.
2. `decimal.js`, `modele.js` et tests.
3. Connecteur Polymarket (Data API), pagination et tests.
4. On-chain (relais `api/`), rapprochements.
5. Positions, PnL, volumes, réconciliation → premier rapport sur l'adresse de test.
6. Fiscal, exports.
7. Interface (après validation de `DESIGN.md`).
8. `CONNECTORS.md`, `ROADMAP.md`, `INTEGRATION.md`, README complet.

## 12. Questions à trancher

1. **YIELD** : à classer en REWARD (revenu versé par la plateforme) ou en INCONNU tant que
   sa nature n'est pas documentée ?
2. **Coût d'un SPLIT** entre issues : prorata du prix de marché ou parts égales ?
3. **Catégorie TRANSFERT_INTERNE** ajoutée à la liste : d'accord ?
4. **Etherscan** : l'offre gratuite pourrait ne pas couvrir Polygon. Disposez-vous d'une
   clé payante, ou préférez-vous un fournisseur RPC (Alchemy, Infura…) comme source on-chain
   principale ?
5. **Fuseau des agrégations annuelles** : Europe/Paris par défaut pour le récap fiscal ?
