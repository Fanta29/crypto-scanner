/* etherscan.js — client Etherscan API V2 (Polygon, chainid 137).
   Dans le navigateur, il passe par le relais /api/etherscan, seul à connaître la clé.
   Dans les outils Node, il peut appeler Etherscan directement avec une clé fournie.
   Fenêtre de résultats Etherscan : page × offset ≤ 10 000. Au-delà, la récupération
   reprend au dernier bloc atteint, en écartant les transferts de ce bloc (qui peuvent
   être incomplets) puis en les relisant en entier : rien n'est perdu ni doublé. */
import { getJson, pause } from "./http.js";
import { Dec } from "../decimal.js";

const TAILLE = 1000, PAGES_MAX = 10;

export function clientEtherscan({ base = "/api/etherscan", cle = null, transport, signal, intervalle = 360, chainid = "137" } = {}) {
  let dernier = 0;
  async function appel(params) {
    for (let essai = 0; essai < 6; essai++) {
      const attente = dernier + intervalle - Date.now();
      if (attente > 0) await pause(attente, signal);
      dernier = Date.now();
      const q = new URLSearchParams({ chainid, ...params });
      if (cle) q.set("apikey", cle);
      const { json } = await getJson(`${base}?${q}`, { transport, signal });
      if (json?.erreur) throw new Error(`Relais Etherscan : ${json.erreur}`);
      if (json.status === "1") return json.result;
      if (json.status === "0" && /no transactions found/i.test(json.message || "")) return [];
      if (typeof json.result === "string" && /rate limit/i.test(json.result)) { await pause(1100 * (essai + 1), signal); continue; }
      throw new Error(`Etherscan : ${json.message || "erreur"} — ${typeof json.result === "string" ? json.result : ""}`);
    }
    throw new Error("Etherscan : limite de débit persistante");
  }

  /** Parcours complet d'une liste de transferts, par blocs croissants. */
  async function liste(action, params, progression) {
    const acquis = [];
    let debut = 0, fenetres = 0;
    for (;;) {
      const lot = [];
      let complet = false;
      for (let page = 1; page <= PAGES_MAX; page++) {
        const r = await appel({ module: "account", action, ...params, startblock: String(debut),
          page: String(page), offset: String(TAILLE), sort: "asc" });
        lot.push(...r);
        progression?.({ action, transferts: acquis.length + lot.length });
        if (r.length < TAILLE) { complet = true; break; }
      }
      fenetres++;
      if (complet) { acquis.push(...lot); return { transferts: acquis, fenetres }; }
      const bord = Number(lot.at(-1).blockNumber);
      const sur = lot.filter(t => Number(t.blockNumber) < bord);
      if (sur.length === 0) throw new Error(`Plus de ${TAILLE * PAGES_MAX} transferts dans le seul bloc ${bord}`);
      acquis.push(...sur);
      debut = bord;        // chevauchement : le bloc de bord est relu en entier
    }
  }

  return {
    appel,
    transfertsErc20: (adresse, contrat, p) => liste("tokentx", { address: adresse, contractaddress: contrat }, p),
    transfertsErc1155: (adresse, p) => liste("token1155tx", { address: adresse }, p),
    async solde(adresse, contrat, decimales = 6) {
      const r = await appel({ module: "account", action: "tokenbalance", address: adresse, contractaddress: contrat, tag: "latest" });
      return { brut: String(r), valeur: Dec.deUnites(r, decimales) };
    }
  };
}
