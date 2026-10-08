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

## 6. Positions

- 635 jetons distincts tradés (338 marchés simples, 297 combinés) ; `/v2/user-stats` annonce
  629 marchés distincts : **écart de 6 non expliqué**.
- Parts achetées − vendues − rachetées comparées à `/v2/positions` : 124 cohérentes,
  511 non. Causes déjà identifiées : `current_size` arrondi à 4 décimales ; positions combinées
  servies par un autre endpoint ; positions perdantes jamais rachetées. Le contrôle sera fait
  contre les **soldes ERC-1155 on-chain**, pas contre l'API.

## 7. PnL

Polymarket (`/v2/user-stats`, 2026-10-08) : réalisé marchés −3 398,34 ; réalisé combinés
−4 569,80 ; non réalisé −276,58 ; frais −3 568,76 ; rebates +16,95 ; « economic PnL »
−8 227,76. Le **−2 760,88** du cahier des charges ne correspond à aucune composition de la
série journalière autour du 29–30 septembre (recherche systématique sur 1 à 3 champs) :
probablement un relevé intrajournalier ou une période filtrée sur le profil. **Non expliqué
de façon prouvée** ; il sera comparé au PnL calculé par l'outil, champ par champ.
