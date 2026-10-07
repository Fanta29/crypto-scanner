/* api/sante.js — contrôle de configuration du déploiement.
   Indique seulement si chaque variable d'environnement est présente.
   N'en renvoie jamais la valeur, ni même un extrait. */
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    variables: {
      ETHERSCAN_API_KEY: Boolean(process.env.ETHERSCAN_API_KEY),
      POLYGON_RPC_URL: Boolean(process.env.POLYGON_RPC_URL)
    },
    environnement: process.env.VERCEL_ENV || "local"
  });
}
