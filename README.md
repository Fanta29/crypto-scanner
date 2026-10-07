# Crypto Scanner

Analyse en **lecture seule** d'adresses crypto : historique complet par protocole,
réconciliation des flux et récapitulatif annuel orienté déclaration fiscale française.
L'outil ne demande jamais de clé privée, de signature ni de connexion de wallet.

**État : phase 1 (Polymarket sur Polygon) en conception.** Voir `docs/PLAN.md`.

## Principes

- Même socle technique que le site Formation Finance & Fiscalité : HTML + CSS + modules ES
  natifs, aucune étape de build, aucune dépendance npm.
- Logique métier (connecteurs, classification, calculs, réconciliation) dans
  `assets/js/scanner/`, sans DOM, testable en Node.
- Clés d'API uniquement côté serveur (`api/`, fonctions Vercel), lues dans les variables
  d'environnement.

## Développement local

```bash
python3 -m http.server 8000      # pages statiques seules
npx vercel dev                   # pages + fonctions api/ (nécessite la CLI Vercel)
npm test                         # tests (node:test, sans dépendance)
```

## Variables d'environnement

| Variable | Rôle | Obligatoire |
|---|---|---|
| `ETHERSCAN_API_KEY` | Etherscan API V2 (multichaîne, `chainid=137` pour Polygon) | oui, pour la vérification on-chain |
| `POLYGON_RPC_URL` | RPC Polygon (lecture de soldes et de journaux d'événements) | non |

`/api/sante` indique si chaque variable est présente, sans jamais en révéler la valeur.
