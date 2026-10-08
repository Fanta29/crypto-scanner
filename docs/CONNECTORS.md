# Connecteurs

Un connecteur traduit une source (un protocole sur une chaîne) vers le **format d'événement
normalisé**. Tout le reste — positions, volumes, réconciliation, fiscal, exports, interface —
ne lit que ce format. Ajouter une plateforme, c'est écrire un connecteur, sans toucher au reste.

Premier connecteur : `assets/js/scanner/connecteurs/polymarket-polygon/`.

## 1. Interface

Un connecteur est un module ES qui exporte :

| Export | Type | Rôle |
|---|---|---|
| `id` | chaîne | identifiant stable, `protocole-chaine` (ex. `polymarket-polygon`) ; sert de clé de cache |
| `libelle` | chaîne | nom affiché |
| `famille` | `"evm"` \| `"solana"` \| `"bitcoin"` \| `"cex"` | format d'adresse accepté |
| `chaines` | tableau | chaînes couvertes |
| `recuperer(adresse, options)` | `async` → `bruts` | récupère toutes les données brutes ; **seule fonction qui fait du réseau** |
| `normaliser(bruts, { mesAdresses })` | → `{ evenements, anomalies, dedoublonnage, rapprochementTx, onchainSeul }` | traduction pure, sans réseau ni DOM |
| `controler(bruts, norm, calc)` | → `controle[]` | contrôles propres à la source (rapprochements, chiffres publiés par la plateforme) |
| `etatsResolution(bruts)` | → `Map<actif, etat>` | facultatif : valeur de résolution des positions (marchés tranchés) |
| `prixCourants(bruts)` | → `Map<actif, Dec>` | facultatif : prix courant des positions ouvertes |
| `valoriseur(bruts, options)` | → `async (actifs, horodatage) → Map<actif, { valeurUnitaire, source, observeLe }>` | facultatif : valeur à une date passée (31 décembre…) ; ne renvoie rien pour un actif sans valeur connue |
| `fusionner(brutsListe)` | → `bruts` | requis pour la vue consolidée : réunit ce dont `etatsResolution`, `prixCourants` et `valoriseur` ont besoin |

`options` de `recuperer` : `transport` (fonction `fetch`, injectable pour les tests), `signal`
(`AbortSignal`), `progression({ etape, detail })`, `cache` (pour l'incrémental), et les clients
de sources nécessaires (ex. `etherscan`).

`bruts` doit contenir au minimum `adresse`, et `soldes` (`{ actif: unités de base, capturesLe }`)
si la source permet de lire des soldes : ils alimentent l'équation de flux. Les bruts sont
sérialisables en JSON (ils sont mis en cache tels quels dans IndexedDB).

## 2. Événement normalisé

Construit **uniquement** par `evenement()` (`assets/js/scanner/modele.js`), qui valide la forme et
convertit les montants en `Dec` :

```js
{
  id,            // unique et stable : préfixe du connecteur + hash + type + discriminant
  connecteur, chaine, protocole, adresse,
  horodatage,    // secondes UTC, entier
  bloc, hash, indexLog,
  categorie,     // une clé de CATEGORIES, exactement une
  sousType,      // précision libre (ex. TAKER_REBATE, COMBINE, HORS_COLLATERAL)
  entrees: [{ actif, quantite, libelle? }],   // vers l'adresse ; quantités ≥ 0
  sorties: [{ actif, quantite, libelle? }],   // depuis l'adresse
  montantUsd,    // espèces réellement déplacées, frais compris
  notionnelUsd,  // parts × prix hors frais (trades), sinon null
  fraisUsd,
  position: { marche, conditionId, tokenId, issue, combine, registre, allocation?, solderCondition? } | null,
  parts, prix,
  contrepartie,  // adresse externe pour DEPOT / RETRAIT / TRANSFERT_INTERNE
  interne,       // contrepartie ∈ adresses de l'utilisateur
  origine,       // "api", "onchain" ou "api+onchain"
  sourceBrute,   // référence de l'enregistrement d'origine
  notes: []      // réserves lisibles, affichées dans le détail
}
```

Règles :

- **Actifs.** Les espèces portent leur symbole (`pUSD`, `USDC`, `USDC.e` — voir `STABLES`) ; une
  position porte un identifiant préfixé par son registre (`ctf:<id>`, `v2:<id>`). Le moteur de
  positions traite tout actif hors `STABLES` comme une position au coût moyen pondéré.
- **Allocation.** Quand plusieurs parts sortent contre des espèces (rachat qui détruit les deux
  issues), `position.allocation = { actif: poids }` indique à qui revient le produit. Sans
  allocation, répartition au prorata des quantités.
- **Transferts internes.** Catégorie `TRANSFERT_INTERNE`, `interne: true` : comptés dans le flux de
  l'adresse (son solde change), exclus des dépôts et retraits du consolidé multi-adresses. Des
  parts transférées entre adresses gardent leur coût : le moteur rapproche la sortie et l'entrée
  par le hash de la transaction (`consolidation.js`).
- **Jamais d'oubli silencieux.** Une donnée non reconnue devient un événement `INCONNU` ou une
  anomalie. Un mouvement on-chain absent de l'API devient un événement d'origine `onchain`.
- **Montants exacts.** Aucun flottant pour l'argent : `Dec` partout ; les nombres JSON sont lus par
  leur écriture décimale la plus courte (`Dec.deNombre`).

## 3. Contrôles

Un contrôle a la forme
`{ id, libelle, statut, attendu, obtenu, ecart, ecartRelatif?, detail, explication?, refs[] }`,
avec `statut` ∈ `ok`, `ecart`, `explique` (écart dont la cause est démontrée, avec
`explication` obligatoire), `info`, `non_fait`. `refs` liste les hash ou identifiants en cause.
Le rapport générique (`reconciliation.js`) ajoute l'équation de flux de chaque actif espèces, la
couverture et la synthèse des anomalies.

## 4. Ajouter un connecteur — pas à pas

1. **Lire la documentation officielle** de la source et l'inscrire dans `docs/SOURCES.md` (statut
   de chaque fait). Ne rien coder de mémoire.
2. **Capturer des réponses réelles** dans `fixtures/` (script dans `tools/`), sur une adresse de
   test, et les étudier avant d'écrire la normalisation : forme exacte, pagination, doublons,
   champs vides, unités.
3. Créer `assets/js/scanner/connecteurs/<protocole>-<chaine>/` avec `index.js` (exports du § 1),
   `contrats.js` (adresses et constantes, sourcées), `normalisation.js`, `controles.js`.
4. Réutiliser les sources existantes (`sources/http.js`, `sources/etherscan.js`) ; une nouvelle
   source va dans `sources/`. Toute clé d'API passe par une fonction `api/` en liste blanche.
5. Classer chaque type de la source vers une catégorie de `CATEGORIES`. Si une catégorie manque,
   l'ajouter dans `modele.js` (et son traitement fiscal dans `fiscal.js`) — c'est le seul cas où
   le cœur change.
6. Écrire au moins un contrôle qui rapproche la source d'une seconde source indépendante
   (on-chain, ou chiffres publiés par la plateforme).
7. Tests (`tests/`) : classification de chaque type (y compris inconnu), cas construits au format
   réel (`tests/aides/construire.mjs`), intégration sur fixtures réelles.
8. Brancher le connecteur dans l'interface (aujourd'hui `assets/js/scanner.js` importe le
   connecteur Polymarket ; un registre `connecteurs/index.js` prendra le relais quand il y en
   aura plusieurs).

## 5. Le connecteur Polymarket × Polygon

- **Sources** : Data API v2 (`/v2/activity` complet, positions, combinés, résolutions, chiffres de
  profil) et Etherscan V2 (transferts pUSD, USDC.e, USDC natif et ERC-1155, soldes).
- **Rapprochement** : chaque ligne d'activité reçoit les mouvements on-chain de sa transaction ;
  les parts reprises sont celles qui ont réellement bougé (un REDEEM de marché simple a un
  `token_id` vide et un `size` égal au paiement).
- **Spécificités** documentées dans `docs/CONSTATS.md` : volume en parts, frais inclus dans
  `usdc_size`, retard d'agrégation des chiffres Polymarket, reliquats absents de l'API,
  résolutions UMA sans vecteur de paiement, rachats perdants absents de l'API.
