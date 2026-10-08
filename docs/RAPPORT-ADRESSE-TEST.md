# Rapport de réconciliation — adresse de test

Adresse `0x0054027f89eb523717d92c911a7fc8bee9dc59ff` · capture du 2026-10-08T16:31:01.066Z (soldes lus juste après les transferts on-chain).
Généré par `node tools/rapport.mjs` à partir des fixtures : aucun chiffre n'est saisi à la main.

## Statut global : ✓ aucun écart non expliqué

| Contrôle | Statut | Attendu | Obtenu | Écart |
|---|---|---|---|---|
| Équation de flux pUSD : Σ flux = solde on-chain | ok | 0.162856 | 0.162856 | 0 |
| Équation de flux USDC.e : Σ flux = solde on-chain | ok | 0 | 0 | 0 |
| Équation de flux USDC : Σ flux = solde on-chain | ok | 1500 | 1500 | 0 |
| Volume en parts (achats + ventes) = /v2/user-volume.volume | ok | 457887.097495 | 457887.097495 | 0 |
| Notionnel Σ parts × prix = /v2/user-volume.volume_usdc | ok | 214550.605018 | 214550.605018 | 0 |
| Nombre de trades = /v2/user-volume.trade_count | ok | 832 | 832 | 0 |
| Espèces : montant API = mouvement pUSD on-chain, pour chaque transaction | ok | 0 | 0 | 0 |
| Parts : solde calculé = somme des transferts ERC-1155 on-chain, pour chaque position | ok | 0 | 0 | 0 |
| Parts détenues : calcul = /v2/positions et /v2/positions/combos (tolérance 0,0001 part, arrondi de l'API) | explique | 0 | 5 | 5 |
| Marchés distincts tradés (comparé à /v2/user-stats.trades) | info | 629 | 635 | 6 |
| Frais implicites (espèces − notionnel) comparés à /v2/user-stats fees_paid | info | 3568.76209 | 3585.54807 | 16.78598 |
| Événements non classés (INCONNU) | ok | 0 | 0 | 0 |
| Anomalies de niveau « erreur » | ok | 0 | 0 | 0 |

- **Parts détenues : calcul = /v2/positions et /v2/positions/combos (tolérance 0,0001 part, arrondi de l'API)** — Reliquats de moins de 0,01 part détenus on-chain mais absents de l'API Polymarket (5). La quantité on-chain fait foi.
- **Marchés distincts tradés (comparé à /v2/user-stats.trades)** — Information : la définition exacte de Polymarket (marchés, combinés) n'est pas documentée.
- **Frais implicites (espèces − notionnel) comparés à /v2/user-stats fees_paid** — Information : Polymarket publie ce total à un instant d'observation (source_block) qui peut précéder la capture.

## Équation de flux pUSD

| Catégorie | Opérations | Flux net (pUSD) |
|---|---|---|
| Achat | 651 | -148713.810595 |
| Vente | 181 | 69156.110093 |
| Rachat gagnant | 129 | 69438.205076 |
| Remise (rebate) | 10 | 23.185100 |
| Dépôt | 194 | 30711.473182 |
| Retrait | 21 | -20615.000000 |
| **Solde calculé** | | **0.162856** |
| **Solde on-chain** | | **0.162856** |
| **Écart** | | **0.000000** |

## Couverture

- 1192 événements, du 2026-06-23 22:49:20 au 2026-10-08 14:53:08 UTC ; par origine : api+onchain 1188, onchain 4.
- 1188 lignes Data API lues ; doublons retirés : 0 ; réintégrés : 0.
- 6 transactions on-chain sans ligne Data API (dont 4 devenues des événements, les autres sans effet net).
- Anomalies : 0 erreur(s), 0 alerte(s), 2 information(s).
  - info · tx_sans_effet · Transaction on-chain sans ligne d'API et sans effet net (transferts de montant nul) 0x9ef098e469862c33a3ca2314af6bdc9ff7d062e56a9669c9d2254a18bfebbf09
  - info · tx_sans_effet · Transaction on-chain sans ligne d'API et sans effet net (transferts de montant nul) 0x1bfbe857963ec4786aaf594206c7c318cd44a36e9d932af3357ee68f5b0d5a42

## Volumes

| Définition | Valeur | Polymarket |
|---|---|---|
| Parts échangées (achats + ventes) | 457887.097495 parts | 457887.097495 (`/v2/user-volume.volume`) |
| Notionnel Σ parts × prix | 214550.605018 $ | 214550.605018 (`volume_usdc`) |
| Espèces achats + ventes, frais compris | 217869.920688 $ | — |
| Espèces + rachats gagnants | 287308.125764 $ | — |
| Nombre de trades | 832 | 832 |
| Frais implicites | 3585.548070 $ | -3568.76209 (`fees_paid`) |

## Résultat

| Rubrique | Cet outil | Polymarket (`/v2/user-stats`, relevé du 2026-10-08 15:44:54 UTC) |
|---|---|---|
| Réalisé par opérations | 60967.28 $ | |
| Positions résolues non rachetées | -71031.08 $ | |
| Réalisé total | -10063.81 $ | realized_pnl -7968.133978 |
| dont marchés simples | -3750.17 $ | realized_market_pnl -3398.336064 |
| dont combinés | -6313.64 $ | realized_combo_pnl -4569.797914 |
| Latent | -22.03 $ | unrealized_pnl -276.577544 |
| Remises | 23.19 $ | wallet_income 16.9515 |
| **Total** | **-10062.65 $** | economic_pnl -8227.760022 |

Contrôle indépendant : dépôts pUSD 30711.473182 − retraits 20615.000000 − solde pUSD 0.162856 = **10096.310326 $ sortis de l'activité**, à comparer au total ci-dessus diminué de la valeur des parts encore détenues (33.657094 $).

## Récapitulatif 2026 (heure de Paris, taux BCE du jour)

| Rubrique | USD | EUR |
|---|---|---|
| Réalisé par opérations | 60967.28 | 53037.75 |
| Positions résolues non rachetées | -71031.08 | -61897.78 |
| Remises | 23.19 | 20.32 |
| **Total** | **-10040.62** | **-8839.71** |
| Frais (déjà inclus) | 3585.55 | 3125.19 |

333 opérations datées d'un jour sans fixing BCE ont reçu le dernier taux antérieur. Année en cours au moment de la capture : chiffres provisoires.
