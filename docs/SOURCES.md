# Sources consultées

Chaque fait technique utilisé par l'outil est rattaché ici à sa source. Statuts :

- **confirmé** : lu sur la source officielle **et** observé sur une réponse réelle ;
- **doc** : lu sur la source officielle, pas encore observé ;
- **observé** : constaté sur les données réelles, sans texte officiel qui le dise ;
- **à vérifier** : non établi. Rien n'est codé sur cette base.

Consultation : 2026-10-08. Documentation lue en Markdown brut (`docs.polymarket.com/<page>.md`),
spécification lue sur `https://data-api.polymarket.com/v2/openapi.json`.
Échantillons réels : `fixtures/` (adresse de test `0x0054027F…59Ff`).

## Polymarket — Data API

| Fait | Source | Statut |
|---|---|---|
| **La Data API v1 est retirée le 24 octobre 2026.** v1 et v2 servies sur `https://data-api.polymarket.com`, v2 sous `/v2`. L'outil n'utilise que la v2. | [Migrate v1 → v2](https://docs.polymarket.com/migrate/data-api-v1-to-v2.md) | doc |
| Enveloppe v2 `{ data, pagination }` ; champs en `snake_case` | idem ; réponses réelles | confirmé |
| `GET /v2/activity` : `user` requis ; `limit` défaut 100, **max 1 000**, au-delà refusé ; `cursor` opaque ; ordre `(block_timestamp, sequence_id)` DESC par défaut, `sort_direction=ASC` possible | [openapi v2](https://data-api.polymarket.com/v2/openapi.json) | confirmé |
| **`start` omis ou 0 = trois ans en arrière** ; `start=1` pour l'historique complet | idem | doc |
| **`exclude_deposits_withdrawals` vaut `true` par défaut** : sans `false`, DEPOSIT et WITHDRAWAL sont absents | idem ; vérifié (194 dépôts, 21 retraits n'apparaissent qu'avec `false`) | confirmé |
| **`TIP` (transfert pUSD entre utilisateurs) n'est jamais renvoyé sauf s'il est nommé dans `type`** | idem | doc |
| Types acceptés par `type` : TRADE, SPLIT, MERGE, REDEEM, REWARD, CONVERSION, MIGRATION, MAKER_REBATE, TAKER_REBATE, REFERRAL_REWARD, YIELD, DEPOSIT, WITHDRAWAL, TIP. Un type inconnu renvoie 400 `unknown activity type` | [Wallet Activity](https://docs.polymarket.com/trading/wallet-activity.md) (union `Activity`) ; appel réel | confirmé |
| Le SDK Python prévoit aussi `ComboTradeActivity` et `UnknownActivity` : d'autres formes existent ou peuvent apparaître | Wallet Activity | doc |
| `pagination.has_more` exact (sondé, jamais déduit) ; `next_cursor` `null` en dernière page ; `offset` purement indicatif | openapi v2 | confirmé |
| Ligne d'activité : `timestamp` (s), `transaction_hash`, `condition_id`, `token_id`, `type`, `side` (BUY/SELL, vide sinon), `size` (parts), `usdc_size` (USDC), `price`, `outcome`, `outcome_index` (999 = non étiquetée), `is_combo` (présent seulement sur les lignes combinées), `title`, `slug`… Montants en **nombres JSON** (flottants) | openapi v2 ; réponses réelles | confirmé |
| `usdc_size` d'un TRADE = **espèces effectivement versées ou reçues, frais compris** (achat : notionnel + frais ; vente : notionnel − frais) | observé : Σ `size × price` = `volume_usdc` exactement ; rapprochement on-chain transaction par transaction exact | observé |
| `GET /v2/activity/combos` : cycle de vie des combinés (SPLIT, MERGE, CONVERT, COMPRESS, WRAP, UNWRAP, REDEEM), clé `id = tx_hash-log_index`, ordre `(block_number, log_index)`, `amount_usdc`, `payout_usdc`, `legs[]` | openapi v2 | doc |
| `GET /v2/resolutions?condition=` (20 au plus) : `status`, `payouts` en parties par million, `resolved_at` ; pour certains marchés UMA, forme différente (`price`, `proposed_price`, sans `payouts`) | openapi v2 ; 338 réponses réelles | confirmé |
| `GET /v2/prices-history` : `token_id` + `as_of` (dernier point ≤ instant) ou fenêtre ; `data: [{ timestamp, price }]` ; vide avant la création du marché | openapi v2 ; appel réel | confirmé |
| REDEEM de marché simple : **`token_id` vide**, `size` = paiement (pas les parts détruites) | observé (71 lignes sur 131) | observé |
| `GET /v2/positions` : `status` ∈ OPEN, REDEEMABLE, REDEEMABLE_LOST, MERGEABLE, CLOSED. **Les filtres se recouvrent** (OPEN contient les REDEEMABLE). `current_size` **arrondi à 4 décimales** | [Migrate v1 → v2](https://docs.polymarket.com/migrate/data-api-v1-to-v2.md) ; observé | confirmé |
| `GET /v2/positions/combos` : positions combinées, avec `entry_cost_usdc`, `entry_fees_usdc`, `realized_payout_usdc`, `legs` | openapi v2 ; réponse réelle (201 positions) | confirmé |
| `GET /v2/user-volume` : `volume` = **parts, deux côtés (achats + ventes)** ; `volume_usdc` = même mesure en USD ; `trade_count` ; jours UTC entiers | openapi v2 ; recalcul exact (§ CONSTATS) | confirmé |
| `GET /v2/user-stats` : `trades` = nombre de **marchés distincts** ; `all_time_pnl` = dernier point de `/v2/user-pnl` | openapi v2 | confirmé |
| `GET /v2/user-pnl` : série cumulée (`realized_market_pnl`, `realized_combo_pnl`, `unrealized_pnl`, `fees_paid`, `taker_rebate`…), maille minimale 1 h, `interval` jusqu'à `all` | openapi v2 ; réponse réelle (108 points journaliers) | confirmé |
| `GET /v2/value` : positions simples au prix de marché + combinés non résolus **au coût** | openapi v2 | doc |
| CORS ouvert : `access-control-allow-origin: *`, en-tête `retry-after` exposé | en-têtes réels | confirmé |
| Limite Data API : 1 000 requêtes / 10 s par IP (Cloudflare : requêtes **ralenties** plutôt que rejetées) | [Rate limits](https://docs.polymarket.com/api-reference/rate-limits.md) | doc |
| Frais : `fee = C × feeRate × p × (1 − p)`, taker seulement, taux par catégorie (0 pour géopolitique) | [Fees](https://docs.polymarket.com/trading/fees.md) | doc |

## Polymarket — contrats Polygon (chainid 137)

Source : [Contracts](https://docs.polymarket.com/resources/contracts.md),
[Onchain Position Data](https://docs.polymarket.com/resources/onchain-position-data.md),
[pUSD](https://docs.polymarket.com/concepts/pusd.md). Deux systèmes de positions coexistent :
**CTF** (Conditional Tokens, marchés « v1 ») et **Polymarket Protocol V2** (PositionManager).

| Contrat | Adresse | Statut |
|---|---|---|
| pUSD (collatéral, 6 décimales, adossé à USDC) | `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` | confirmé (transferts réels) |
| CollateralOnramp / Offramp | `0x93070a84…F5B8ee` / `0x2957922E…dC5854` | doc |
| CTF Exchange (domaine EIP-712 « 2 ») | `0xE111180000d2663C0091e4f400237545B87B996B` | confirmé |
| Neg Risk CTF Exchange | `0xe2222d279d744050d28e00520010520000310F59` | confirmé |
| Exchange V2/V3 (domaine « 3 », combinés) | `0xe3333700cA9d93003F00f0F71f8515005F6c00Aa` | confirmé |
| Conditional Tokens (CTF) | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | doc |
| PositionManager (ERC-1155 V2) | `0x006F54F7f9A22e0000CC2AB60031000000ae9fEF` | doc |
| Router · BinaryModule · NegRiskModule · CombinatorialModule | `0x12121212…372600` · `0x1000008d…E0dA00Ba` · `0x20000090…028933` · `0x30000034…c031A8` | doc |
| AutoRedeemer | `0xa1200000d0002264C9a1698e001292D00E1b00af` | confirmé |
| CtfCollateralAdapter · NegRiskCtfCollateralAdapter | `0xAdA100Db…218FcE1f` · `0xadA20056…bDB6eAab` (la divergence signalée par une source tierce est tranchée par la doc officielle) | doc |
| Neg Risk Adapter (CLOB v1, déprécié) | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` | doc |
| USDC.e (Polygon) | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | confirmé |
| USDC natif (Polygon) | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | observé |

Événements utiles (doc « Onchain Position Data ») : soldes par `TransferSingle` / `TransferBatch`
(source canonique, ne jamais compter en plus l'événement de cycle de vie) ; `OrderFilled`,
`OrdersMatched`, `FeeCharged` sur les exchanges ; `PayoutRedemption` (CTF), `PositionRedeemed`
(V2), `BinaryRedemption` / `NegRiskRedemption` / `Redemption` (AutoRedeemer) ; migration CTF → V2 :
`PositionMigrated`, `MigrationConditionRegistered`, `LegacyCollateralSettled`.

## Polygon / Etherscan

| Fait | Source | Statut |
|---|---|---|
| Etherscan API V2, `chainid=137` : fonctionne avec une clé gratuite (`tokentx`, `tokenbalance`, `proxy`) | appels réels | confirmé |
| `tokentx` : `page` × `offset` ≤ 10 000 résultats par requête — au-delà, découper par blocs (`startblock` / `endblock`) | [Etherscan docs](https://docs.etherscan.io/) | à vérifier |
| Pas de CORS utile et clé secrète : passage obligatoire par une fonction serveur | — | choix |

## Taux de change

| Fait | Source | Statut |
|---|---|---|
| BCE `https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&detail=dataonly&startPeriod=…&endPeriod=…` ; colonnes `TIME_PERIOD`, `OBS_VALUE` (USD pour 1 EUR, 4 décimales) ; pas de valeur les jours sans fixing ; CORS ouvert | [ECB Data Portal API](https://data.ecb.europa.eu/help/api/data) ; appel réel | confirmé |

## Environnement de développement

Node : `fetch` natif n'emprunte le proxy de l'environnement qu'avec `NODE_USE_ENV_PROXY=1`.
