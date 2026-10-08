# Constats sur l'adresse de test

Adresse : `0x0054027F89EB523717D92C911a7fC8beE9dC59Ff` · captures du 2026-10-08 (Data API v2,
Etherscan V2). Calculs refaits en décimal exact (Python `Decimal`) à partir des fixtures ;
scripts de capture : `tools/capture-fixtures.mjs`, `tools/capture-onchain.mjs`.
Ces chiffres sont un **relevé exploratoire** pour valider le plan, pas encore la sortie de l'outil.

## 1. Historique récupéré

- **1 188 événements**, du 2026-06-23 22:49:20 UTC au 2026-10-08 14:53:08 UTC.
- Parcours complet en ordre décroissant **et** croissant : les deux ensembles sont
  **identiques** (même multiensemble de lignes), aucun doublon, aucune ligne identique répétée.
- Aucune transaction ne porte plus d'une ligne d'activité.

| Type | Côté | Combiné | Nombre |
|---|---|---|---|
| TRADE | BUY | non | 354 |
| TRADE | BUY | oui | 297 |
| TRADE | SELL | non | 139 |
| TRADE | SELL | oui | 42 |
| REDEEM | — | non | 73 (dont 2 à 0) |
| REDEEM | — | oui | 58 |
| DEPOSIT | — | — | 194 |
| WITHDRAWAL | — | — | 21 |
| TAKER_REBATE | — | — | 10 |

Aucun SPLIT, MERGE, CONVERSION, REWARD, YIELD, TIP ni MIGRATION sur cette adresse : ces cas
devront être testés sur d'autres adresses ou par des données construites.

## 2. Volumes

| Définition | Valeur |
|---|---|
| Parts achetées + parts vendues | **457 887,097495** parts |
| Notionnel Σ parts × prix (achats + ventes) | **214 550,605018 $** |
| Espèces versées aux achats + reçues aux ventes (frais compris) | **217 869,920688 $** |
| Idem + redeems gagnants (69 438,205076 $) | 287 308,125764 $ |

- `/v2/user-volume` renvoie `volume = 457887.097495`, `volume_usdc = 214550.605018`,
  `trade_count = 832` : **égalité exacte** avec les deux premières lignes et avec le nombre
  de trades (651 + 181). Polymarket définit son volume en **parts, deux côtés**, et son
  « volume_usdc » comme le **notionnel hors frais**.
- **Les 389,9 K $ du profil** sont donc des **parts**, pas des dollars. Le cumul des parts
  franchit 389,9 K le **29 septembre 2026** (un achat de 974,48 parts à 13:24:24 UTC le fait
  passer de 389 725,03 à 390 699,51) ; la série journalière de Polymarket passe de 379 847
  (29/09) à 391 864 (30/09). Le chiffre noté dans le cahier des charges correspond à un
  relevé de ces jours-là ; il vaut 457,9 K au 8 octobre.
- L'étiquette « $ » du profil est donc trompeuse : en dollars, le volume échangé est
  d'environ 214,6 K (notionnel) ou 217,9 K (espèces).

## 3. Frais

`usdc_size` d'un trade est l'**espèce réellement déplacée** : notionnel + frais à l'achat,
notionnel − frais à la vente. Frais implicites ainsi mesurés : **3 585,548070 $**
(achats simples 1 382,1725 ; achats combinés 2 070,25937 ; ventes simples 36,66226 ;
ventes combinées 96,45394). Polymarket affiche `fees_paid = −3 568,76209` : **écart de
16,79 $ non expliqué à ce stade** (pistes : remboursements, arrondis, frais de combinés
comptés autrement). L'événement on-chain `FeeCharged` permettra de trancher.

## 4. Réconciliation des espèces

- Équation de flux, Data API seule : 30 711,473182 (dépôts) − 20 615 (retraits)
  + 69 156,110093 (ventes) + 69 438,205076 (redeems) + 23,1851 (rebates)
  − 148 713,810595 (achats) = **0,162856**.
- Solde pUSD on-chain (`tokenbalance`) : **162 856** unités = **0,162856 pUSD**. Écart : **0**.
- Rapprochement **transaction par transaction** : pour chacune des 1 188 transactions, le
  mouvement net de pUSD on-chain égale le montant de la Data API. **0 écart.**
- 3 transactions on-chain sans ligne Data API : mints de **0 pUSD** (16/07, 18/07, 23/09) —
  sans effet, à lister dans le rapport.
- 28 sorties pUSD vers des adresses tierces (3 363,03 $) se trouvent toutes **à l'intérieur de
  transactions de trade** : ce sont des jambes de règlement, pas des retraits cachés.

## 5. Dépôts, retraits, fonds hors Polymarket

- Dépôts : pUSD **frappés** (mint depuis l'adresse nulle) sur le wallet ; la provenance réelle
  n'est donc pas lisible sur le transfert pUSD lui-même.
- Retraits : pUSD rendu au contrat pUSD, USDC.e reçu de `0xc417…9db1` puis renvoyé à
  `0x4cd0…bc31` (21 fois, 20 615 $) — chemin de sortie par pont, destination finale sur une
  autre chaîne à établir.
- **1 500 USDC natifs** (pas pUSD) reçus en 3 × 500 (27/07, 28/07, 03/08) depuis
  `0xd15f…80e3` par `disperseToken`, jamais convertis : invisibles dans les chiffres
  Polymarket, présents sur le wallet. **Nature à préciser par l'utilisateur.**

## 6. Positions et parts

Premier relevé (avant implémentation) : parts achetées − vendues − rachetées selon l'API,
comparées à `/v2/positions`, ne concordaient que pour 124 positions sur 635. Toutes les causes
ont été identifiées ; avec les règles qui en découlent, **711 positions sur 711 concordent avec
les transferts ERC-1155 on-chain** :

1. **Un REDEEM de marché simple a un `token_id` vide** (71 lignes sur 131) : il ne porte que
   `condition_id` et le libellé de l'issue gagnante, alors que la transaction détruit toutes les
   parts de la condition (issue perdante comprise, souvent pour 0).
2. **Le `size` d'un REDEEM est le paiement, pas les parts détruites** : égal à `usdc_size` dans
   129 cas sur 131 ; un combiné à paiement partiel (0,5 par part) détruit 453,93 parts pour un
   `size` de 226,97. Les parts détruites sont donc prises on-chain.
3. **Un rachat perdant manque dans la Data API** : transaction `0x328264a5…` (18/07), 532,14
   parts remises au `CtfCollateralAdapter` sans paiement. Recréé depuis la chaîne
   (REDEEM_PERDANT, origine « onchain »). Deux autres transactions on-chain sans ligne d'API ne
   déplacent que des montants nuls : listées, sans effet.
4. **Positions perdantes jamais rachetées** : 201 combinés et 126 positions simples restent sur
   le wallet à valeur 0. Elles ne sont « soldées » par aucune opération ; leur perte est
   constatée à la date de résolution (§ 8).
5. **`/v2/positions` arrondit `current_size` à 4 décimales**, range les reliquats en `CLOSED`, et
   **omet 5 reliquats** de quelques millièmes de part pourtant détenus on-chain. Les filtres de
   statut se recouvrent (OPEN contient les REDEEMABLE).
6. **Résolutions UMA** : pour 18 marchés, `/v2/resolutions` renvoie un champ `price` (échelle non
   documentée) au lieu du vecteur `payouts`. Il n'est pas interprété ; la valeur retenue est le
   prix publié par `/v2/positions`, signalé comme tel.

Marchés distincts : 635 jetons tradés (338 simples, 297 combinés), contre 629 « trades » dans
`/v2/user-stats` : écart de 6 non expliqué, la définition de Polymarket n'étant pas documentée.

## 7. Retard d'agrégation des chiffres Polymarket

En direct (8 octobre, 18 h 45 heure de Paris), un trade du jour même (16:45:03 UTC) figurait dans
`/v2/activity` mais pas encore dans `/v2/user-volume` (833 trades contre 832). L'outil cherche
alors si l'écart correspond exactement aux *k* trades les plus récents : c'était le cas (k = 1),
le contrôle est marqué « expliqué » avec la transaction en cause, jamais « conforme ».

## 8. Résultat (PnL) et écart avec Polymarket

Résultat calculé par l'outil sur la capture du 8 octobre (16 h 31 UTC), détail dans
`docs/RAPPORT-ADRESSE-TEST.md` :

| Rubrique | Outil | Polymarket (`/v2/user-stats`, 15 h 44 UTC) |
|---|---|---|
| Réalisé par opérations | +60 967,28 $ | — |
| Positions résolues non rachetées | −71 031,08 $ | — |
| Réalisé total | −10 063,81 $ | `realized_pnl` −7 968,13 $ |
| dont marchés simples | −3 750,17 $ | `realized_market_pnl` −3 398,34 $ |
| dont combinés | −6 313,64 $ | `realized_combo_pnl` −4 569,80 $ |
| Latent | −22,03 $ | `unrealized_pnl` −276,58 $ |
| Remises | +23,19 $ | `wallet_income` +16,95 $ |
| **Total** | **−10 062,65 $** | `economic_pnl` −8 227,76 $ |

**Pourquoi le chiffre de l'outil est retenu** : il se vérifie par une identité comptable
indépendante de toute méthode. Dépôts pUSD (30 711,47 $) − retraits (20 615,00 $) − solde pUSD
(0,16 $) = **10 096,31 $ sortis de l'activité** ; augmentés de la valeur des parts encore
détenues (33,66 $), on obtient exactement −10 062,65 $. Pour les combinés, tous résolus, le
résultat est simplement les espèces nettes : 65 310,06 $ payés, 20 897,48 $ de ventes et
38 098,94 $ de rachats, soit −6 313,64 $, chaque montant étant rapproché on-chain.

**L'écart avec Polymarket** (environ 1 835 $ au total, dont 1 744 $ sur les combinés) n'est pas
attribuable à une cause unique prouvée : Polymarket ne documente pas la composition de ses
rubriques. Le **−2 760,88 $ du cahier des charges** ne correspond à aucune combinaison de la
série journalière de Polymarket autour du 29–30 septembre ; c'était probablement un relevé
intrajournalier. Il n'est pas expliqué de façon prouvée.

Les frais implicites (3 585,55 $) dépassent de 16,79 $ le `fees_paid` de Polymarket ; écart non
expliqué, sans effet sur le résultat de l'outil qui repose sur les espèces réellement déplacées.
