/* api/etherscan.js — relais serveur vers Etherscan API V2.
   Seul endroit qui connaît la clé (variable d'environnement ETHERSCAN_API_KEY).
   N'accepte qu'une liste fermée d'actions et de paramètres, tous validés ; ne renvoie
   jamais la clé, ni dans la réponse ni dans un message d'erreur. Lecture seule. */

const ACTIONS = new Set(["account.tokentx", "account.token1155tx", "account.tokenbalance"]);
const CHAINES = new Set(["137"]);                       // Polygon ; d'autres chaînes EVM plus tard
const ADRESSE = /^0x[0-9a-fA-F]{40}$/;
const ENTIER = /^\d{1,12}$/;
const PARAMS = {
  address: v => ADRESSE.test(v),
  contractaddress: v => ADRESSE.test(v),
  page: v => ENTIER.test(v) && Number(v) >= 1 && Number(v) <= 10000,
  offset: v => ENTIER.test(v) && Number(v) >= 1 && Number(v) <= 10000,
  startblock: v => ENTIER.test(v),
  endblock: v => ENTIER.test(v),
  sort: v => v === "asc" || v === "desc",
  tag: v => v === "latest"
};

const pause = ms => new Promise(ok => setTimeout(ok, ms));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ erreur: "Méthode non autorisée" });
  const cle = process.env.ETHERSCAN_API_KEY;
  if (!cle) return res.status(503).json({ erreur: "ETHERSCAN_API_KEY absente de la configuration du serveur" });

  const q = req.query || {};
  const chainid = String(q.chainid ?? "137");
  const action = `${q.module}.${q.action}`;
  if (!CHAINES.has(chainid)) return res.status(400).json({ erreur: `chainid non autorisé : ${chainid}` });
  if (!ACTIONS.has(action)) return res.status(400).json({ erreur: `action non autorisée : ${action}` });

  const sortie = new URLSearchParams({ chainid, module: q.module, action: q.action });
  for (const [k, v] of Object.entries(q)) {
    if (k === "module" || k === "action" || k === "chainid") continue;
    const ok = PARAMS[k];
    if (!ok) return res.status(400).json({ erreur: `paramètre non autorisé : ${k}` });
    if (typeof v !== "string" || !ok(v)) return res.status(400).json({ erreur: `valeur invalide pour ${k}` });
    sortie.set(k, v);
  }
  if (!sortie.has("address")) return res.status(400).json({ erreur: "address obligatoire" });
  sortie.set("apikey", cle);

  // L'offre gratuite limite à 3 appels par seconde et par clé : reprise courte si dépassement.
  for (let essai = 0; essai < 5; essai++) {
    let texte;
    try {
      const r = await fetch(`https://api.etherscan.io/v2/api?${sortie}`);
      texte = await r.text();
      if (r.status >= 500 || r.status === 429) { await pause(1100 * (essai + 1)); continue; }
    } catch {
      await pause(1100 * (essai + 1)); continue;
    }
    let j;
    try { j = JSON.parse(texte); } catch { return res.status(502).json({ erreur: "Réponse Etherscan illisible" }); }
    if (j.status === "0" && typeof j.result === "string" && /rate limit/i.test(j.result)) { await pause(1100 * (essai + 1)); continue; }
    return res.status(200).json(j);
  }
  return res.status(503).json({ erreur: "Etherscan indisponible ou limite de débit atteinte, réessayer plus tard" });
}
