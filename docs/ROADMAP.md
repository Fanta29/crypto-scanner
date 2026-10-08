# Feuille de route — phases suivantes (analyse, rien n'est implémenté)

Phase 1 livrée : Polymarket sur Polygon. Ce document analyse la suite sans la mettre en
chantier. Les faits techniques ou fiscaux cités ici **n'ont pas été vérifiés à la source** sauf
mention contraire : chaque phase commencera par une `SOURCES.md` à jour, comme la phase 1.

## 1. Ce que l'architecture permet déjà

- **Format normalisé** (`modele.js`) : entrées et sorties d'actifs, montant en espèces, frais,
  contrepartie, origine. Un swap, un prêt, une ouverture de position perpétuelle s'y décrivent.
- **Moteur de positions générique** au coût moyen pondéré : tout actif hors stablecoins est une
  position. Valable pour des jetons ERC-20, des parts de pool, des NFT (quantité 1).
- **Relais Etherscan** multichaîne par `chainid` (liste blanche à étendre), **réconciliation par
  équation de flux** par actif, **transferts internes** entre adresses de l'utilisateur.
- **Limite actuelle** : les stablecoins valent 1 USD par hypothèse. Dès qu'un actif volatil entre
  dans les flux, il faut des **prix historiques** (§ 3.1).

## 2. Sources envisageables par chaîne

| Chaîne / source | Données | Pistes (à vérifier) | Difficultés prévisibles |
|---|---|---|---|
| EVM (Ethereum, Arbitrum, Base, Polygon, Optimism…) | transferts ERC-20/721/1155, transactions, journaux | Etherscan API V2 (une clé, `chainid`) ; RPC (`eth_getLogs`) ; indexeurs (The Graph, Dune, Alchemy/Covalent) | couverture de l'offre gratuite Etherscan selon la chaîne (déjà incertaine pour certaines) ; limites de `eth_getLogs` par plage de blocs ; transactions internes (traces) non couvertes par `tokentx` |
| Protocoles EVM (DEX, lending, perps, bridges) | événements propres (Swap, Deposit, Borrow, Liquidation…) | ABI officielles des protocoles ; sous-graphes ; API des protocoles | un connecteur par protocole et par version ; routeurs et agrégateurs (un swap = plusieurs transferts) ; jetons de dette et aTokens à solde croissant |
| Solana | transactions, transferts SPL, comptes associés | RPC (`getSignaturesForAddress` + `getTransaction`), API d'indexeurs (Helius…) | comptes de jetons associés (une adresse « propriétaire », plusieurs comptes) ; instructions internes ; volume de transactions des bots |
| Bitcoin | UTXO | API d'explorateurs (mempool.space, Blockstream), nœud | adresses multiples d'un même portefeuille (xpub, adresses de change) ; frais par transaction, pas par transfert |
| Plateformes centralisées | dépôts, retraits, ordres, conversions | exports CSV ; API en lecture seule avec clé de l'utilisateur | formats changeants ; clé à stocker côté serveur ou jamais (préférer l'import CSV) ; rapprochement des dépôts/retraits avec la blockchain |

## 3. Difficultés transverses

1. **Prix historiques.** Valoriser en euros un actif non stable à la date d'une opération exige
   une source de prix datée, citée et stable dans le temps (agrégateurs de cours, cours des
   plateformes, prix implicite du swap lui-même). Choix à documenter par actif ; signaler les
   actifs sans prix plutôt que d'en inventer.
2. **Opérations complexes.** Un swap multi-saut, un remboursement de prêt avec intérêts, une
   liquidation, une fourniture de liquidité (jeton de pool) se décomposent en plusieurs
   mouvements qu'il faut regrouper en une opération économique. La transaction (hash) est le bon
   grain de regroupement, comme en phase 1.
3. **Jetons indésirables (spam).** Envois non sollicités de jetons sans valeur ou d'arnaque (déjà
   repérés en phase 1 pour les ERC-1155 étrangers : signalés, exclus des calculs). Il faut une
   liste d'exclusion explicite, visible et modifiable par l'utilisateur, jamais un filtre muet.
4. **Identité des adresses.** Proxy wallets, comptes à abstraction (ERC-4337 : la phase 1 a vu
   des `handleOps`), wallets multisignatures : l'adresse qui détient n'est pas toujours celle qui
   signe.
5. **Ponts.** Un retrait par pont part sur une chaîne et arrive sur une autre : sans les deux
   côtés, c'est un retrait ; avec les deux, un transfert interne. Le rapprochement passe par les
   identifiants de message des ponts.
6. **Réorganisations et finalité.** Ne retenir que des blocs finalisés pour les rapports figés.

## 4. Volet fiscal français : plus-values sur actifs numériques (formulaire 2086)

> Analyse préalable. Le texte (CGI art. 150 VH bis) et la doctrine (BOFiP) n'ont pas pu être lus
> directement depuis l'environnement de développement (accès bloqué) ; les éléments ci-dessous
> viennent du texte de l'article reproduit par des sources secondaires et devront être vérifiés
> sur Légifrance et le BOFiP avant toute implémentation. Aucun taux ni seuil n'est retenu ici.

### 4.1 Mécanisme (art. 150 VH bis, selon le texte reproduit)

- **Fait générateur** : la cession d'actifs numériques contre de la monnaie ayant cours légal, ou
  contre un bien ou service autre qu'un actif numérique. Les échanges entre actifs numériques sans
  soulte sont en principe neutres (report d'imposition).
- **Méthode du portefeuille global** : à chaque cession imposable,
  `plus-value = prix de cession − prix total d'acquisition × (prix de cession ÷ valeur globale du portefeuille)`.
  La valeur globale du portefeuille est appréciée **au moment de la cession**, tous actifs
  numériques confondus (pas par actif, pas en FIFO). Le prix total d'acquisition est diminué, à
  chaque cession, de la fraction déjà imputée.
- **Frais** : le prix de cession peut être diminué, sur justificatifs, des frais de cession.
- **Seuil annuel** de cessions en deçà duquel les plus-values sont exonérées (305 € selon le texte
  reproduit ; **à vérifier**), sans dispense de déclaration selon plusieurs sources.
- **Taux** : prélèvement forfaitaire et prélèvements sociaux, avec option possible pour le barème
  progressif. **Divergence relevée** : les sources secondaires consultées ne s'accordent pas sur
  le taux de prélèvements sociaux applicable selon l'année des cessions (17,2 % ou 18,6 % après la
  hausse de CSG annoncée pour 2026). À trancher sur le texte de la LFSS et la notice 2086.

### 4.2 Ce que cela impliquerait pour l'outil

1. **Une seule vue de portefeuille, toutes plateformes et chaînes confondues** : le calcul exige
   la valeur globale de *tous* les actifs numériques détenus à l'instant de chaque cession. C'est
   l'argument principal du consolidé multi-adresses et des transferts internes.
2. **Valorisation à l'instant de chaque cession** : prix historiques de chaque actif détenu (§ 3.1),
   pas seulement de l'actif cédé. Coût de calcul et de données significatif.
3. **Identification des cessions imposables** : seules les sorties vers les euros (ou vers des
   biens et services) déclenchent le calcul ; un échange crypto-crypto, y compris vers un
   stablecoin, est en principe neutre — **la qualification des stablecoins et des jetons propres
   à une plateforme (pUSD) est à vérifier**.
4. **Prix total d'acquisition** : somme des euros versés pour acquérir des actifs numériques
   (dépôts en euros sur une plateforme, achats par carte), y compris avant la période analysée :
   l'historique doit remonter au premier achat, ou l'utilisateur doit saisir un report.
5. **Marchés prédictifs** : la question préalable n'est pas résolue — un gain sur Polymarket
   relève-t-il de ce régime (les parts sont-elles des actifs numériques ?), des gains de jeux, ou
   des bénéfices non commerciaux ? L'outil de phase 1 fournit les flux et les résultats sans
   trancher ; un calcul 2086 ne serait pertinent que si le régime retenu est celui des actifs
   numériques, et devrait alors être une option explicite.
6. **Paramètres** : seuil, taux et dates d'effet dans un registre sourcé et daté (modèle de
   `params.js` du site de formation, avec statut « à vérifier » tant qu'ils ne le sont pas).
7. **Livrable** : un tableau cession par cession reprenant les lignes du formulaire 2086 (date,
   valeur globale du portefeuille, prix de cession, frais, prix total d'acquisition, fraction
   imputée, plus ou moins-value), plus les obligations 3916-bis (comptes d'actifs numériques à
   l'étranger) — sans jamais remplir à la place de l'utilisateur.

## 5. Ordre proposé

1. Consolidé multi-adresses (plusieurs adresses EVM, transferts internes) — peu coûteux.
2. Autres protocoles EVM les plus utilisés par l'utilisateur, un par un.
3. Source de prix historiques, avec registre de provenance.
4. Solana, puis Bitcoin.
5. Imports de plateformes centralisées (CSV d'abord).
6. Module 2086, seulement si le régime « actifs numériques » est retenu pour les actifs concernés.

## Sources consultées pour cette analyse (secondaires, à confirmer)

- Texte de l'art. 150 VH bis reproduit : [thetradehub.eu](https://www.thetradehub.eu/es/reglementation/france/codes-nationaux/cgi-art-150-vh-bis)
- Amendement d'origine (PLF 2019) : [Sénat, amendement I-810](https://www.senat.fr/enseance/2018-2019/146/Amdt_I-810.html)
- Formulaire officiel : [impots.gouv.fr, formulaire 2086](https://www.impots.gouv.fr/formulaire/2086/declaration-des-plus-ou-moins-values-de-cessions-dactifs-numeriques)
- Hausse de CSG 2026, sources secondaires divergentes : [Que Choisir](https://www.quechoisir.org/actualite-hausse-de-la-csg-vos-revenus-sont-ils-concernes-n173786/), [francetransactions.com](https://www.francetransactions.com/actus/actualites-fiscales/hausse-prelevements-sociaux-2026.html)
