# Sources consultées

Chaque fait technique utilisé par l'outil (endpoint, paramètre, limite, adresse de contrat,
type d'événement) est rattaché ici à sa source. Statuts :

- **confirmé** : lu sur la source officielle **et** observé sur une réponse réelle ;
- **doc seule** : lu sur la source officielle, pas encore observé ;
- **à vérifier** : connu seulement par un résumé de recherche ou une source tierce. Rien
  n'est codé sur cette base.

> **État au 2026-10-07.** La politique réseau de l'environnement de développement bloque
> `docs.polymarket.com`, `data-api.polymarket.com`, `api.etherscan.io`, `polygon-rpc.com`
> et `data-api.ecb.europa.eu`. Seuls des **résumés de moteur de recherche** ont pu être
> lus : **toutes les lignes ci-dessous sont donc « à vérifier »**. Aucun appel réel n'a
> encore été fait et `fixtures/` est vide.

## Polymarket — Data API

| Fait | Source | Statut |
|---|---|---|
| Base `https://data-api.polymarket.com` | [get-user-activity](https://docs.polymarket.com/api-reference/core/get-user-activity) | à vérifier |
| `GET /activity` (v1, dit « legacy ») : `user` requis, `limit` 100 par défaut, max 500 (au-delà : ramené à 500) | idem | à vérifier |
| `offset` max 5 000 ; au-delà erreur 400, sans troncature silencieuse ; contournement par fenêtres `start`/`end`, chacune ayant son propre budget d'offset | idem | à vérifier |
| Filtre `type` (liste) : TRADE, SPLIT, MERGE, REDEEM, REWARD, CONVERSION, DEPOSIT, WITHDRAWAL, YIELD, MAKER_REBATE, TAKER_REBATE | idem | à vérifier |
| Autres paramètres : `market` / `eventId` (mutuellement exclusifs), `start`, `end`, `side`, `sortBy`, `sortDirection` | idem ; [jsr @dicedhq/data](https://jsr.io/@dicedhq/data/doc) (tiers) | à vérifier |
| Existence d'une Data API v2 (`/v2/activity`), pagination par curseur seul (`pagination.next_cursor` jusqu'à `null`), `offset` refusé (400), parcours « keyset » stable | [Data API v2 overview](https://docs.polymarket.com/api-reference/data-api/overview), [v2 docs](https://data-api.polymarket.com/v2/docs) | à vérifier |
| Activité des combinés : `GET /v1/activity/combos`, champs `amount_usdc`, `payout_usdc`, `tx_hash`, `block_number`, `legs[]` ; l'identifiant du combiné = `conditionId` des lignes `isCombo` de `/activity` | [get-user-combo-activity](https://docs.polymarket.com/api-reference/core/get-user-combo-activity), [Combos](https://docs.polymarket.com/market-makers/combos) | à vérifier |
| Volume par wallet : `volume` (en **parts**) et `volume_usdc`, jours UTC entiers ; volume du classement v2 = « both-sides traded volume » en parts | [get-a-users-trading-volume](https://docs.polymarket.com/api-reference/wallet/get-a-users-trading-volume), [leaderboard](https://docs.polymarket.com/api-reference/core/get-trader-leaderboard-rankings) | à vérifier |
| PnL : endpoint dédié, positions avec `realized_pnl` / `unrealized_pnl` | [get-pnl](https://docs.polymarket.com/api-reference/get-pnl) | à vérifier |

## Polymarket — contrats Polygon (chainid 137)

Les résumés indiquent une **migration** : une génération V2 de contrats avec un nouveau
collatéral **pUSD** remplaçant USDC.e. Un historique qui chevauche la migration doit donc
suivre les deux générations.

| Contrat | Adresse annoncée | Source | Statut |
|---|---|---|---|
| CTF Exchange V2 | `0xE111180000d2663C0091e4f400237545B87B996B` | [Contracts](https://docs.polymarket.com/resources/contracts) | à vérifier |
| Neg Risk CTF Exchange V2 | `0xe2222d279d744050d28e00520010520000310F59` | idem | à vérifier |
| Conditional Tokens (CTF) | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | idem | à vérifier |
| pUSD (collatéral V2) | `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` | idem | à vérifier |
| CtfCollateralAdapter | `0xAdA100Db00Ca00073811820692005400218FcE1f` (une source tierce donne une autre adresse) | idem ; [dev.to](https://dev.to/casatrick/polymarket-protocol-versions-v1-v2-v3-and-what-trading-bots-need-to-know-37ej) | à vérifier — **divergence** |
| NegRiskCtfCollateralAdapter | `0xadA2005600Dec949baf300f4C6120000bDB6eAab` (idem, divergence) | idem | à vérifier — **divergence** |
| NegRiskModule V2 | `0x200000900045e3B6259600682756002200028933` | idem | à vérifier |
| CTF Exchange V1 | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` | [Polygonscan](https://polygonscan.com/address/0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e) | à vérifier |
| Neg Risk CTF Exchange V1 | `0xC5d563A36AE78145C45a50134d48A1215220f80a` | [Polygonscan](https://polygonscan.com/address/0xc5d563a36ae78145c45a50134d48a1215220f80a) | à vérifier |
| Neg Risk Adapter V1 (déprécié) | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` | Contracts | à vérifier |
| USDC.e (collatéral V1) | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | tiers | à vérifier |
| Exchange « v3 » des combinés | inconnue | [Dune combo_trades](https://docs.dune.com/data-catalog/curated/prediction-markets/polymarket/combo_trades) (tiers) | à vérifier |

## Polygon / Etherscan

| Fait | Source | Statut |
|---|---|---|
| Etherscan API V2 multichaîne, `chainid=137` ; une clé Polygonscan V1 n'est pas valide en V2 | [supported-chains](https://docs.etherscan.io/etherscan-v2/supported-chains), [erreurs](https://docs.etherscan.io/resources/common-error-messages) | à vérifier |
| Offre gratuite : 3 appels/s, 100 000/jour, **chaînes « sélectionnées » seulement** — l'inclusion de Polygon dans l'offre gratuite n'est pas établie | [plans](https://etherscan.io/apis), [rate-limits](https://docs.etherscan.io/etherscan-v2/rate-limits) | à vérifier — **point bloquant possible** |

## Taux de change

| Fait | Source | Statut |
|---|---|---|
| Taux de référence BCE USD/EUR quotidien : `https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata` (`startPeriod`, `endPeriod`) ; colonnes `TIME_PERIOD`, `OBS_VALUE` | [ECB Data Portal API](https://data.ecb.europa.eu/help/api/data) | à vérifier |
