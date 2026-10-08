/* index.js — connecteur Polymarket × Polygon.
   Interface commune à tous les connecteurs : voir docs/CONNECTORS.md. */
import * as dataApi from "../../sources/data-api.js";
import { clientEtherscan } from "../../sources/etherscan.js";
import { Dec } from "../../decimal.js";
import { anomalie } from "../../modele.js";
import { JETONS } from "./contrats.js";
import { normaliser } from "./normalisation.js";
import { controler } from "./controles.js";

export const id = "polymarket-polygon";
export const libelle = "Polymarket (Polygon)";
export const famille = "evm";
export const chaines = ["polygon"];

/**
 * Récupère toutes les données brutes d'une adresse.
 * options : transport (fetch), etherscan (client, ou null pour s'en passer), signal,
 *           progression({ etape, detail }), cache ({ activite, depuis } pour l'incrémental)
 */
export async function recuperer(adresse, { transport, etherscan = clientEtherscan({ transport }), signal, progression = () => {}, cache = null } = {}) {
  const user = adresse.toLowerCase();
  const o = { transport, signal };
  const anomalies = [];
  const bruts = { adresse: user, recupereLe: new Date().toISOString() };

  // 1. Activité (incrémentale si un cache est fourni : on relit au moins la marge récente).
  const depuis = cache?.depuis ?? null;
  const act = await dataApi.activite(user, { ...o, depuis,
    progression: p => progression({ etape: "activite", detail: p }),
    surReprise: r => progression({ etape: "reprise", detail: r }) });
  if (cache && depuis !== null) {
    const recents = act.lignes.filter(r => r.timestamp >= depuis);
    bruts.activite = [...recents, ...cache.activite.filter(r => r.timestamp < depuis)];
    bruts.incremental = { depuis, relues: recents.length, conservees: bruts.activite.length - recents.length };
  } else {
    bruts.activite = act.lignes;
  }
  bruts.pagination = act.pages;

  // 2. Données d'appui : positions, combinés, chiffres affichés par Polymarket.
  progression({ etape: "positions" });
  bruts.positions = {};
  for (const s of ["OPEN", "CLOSED"]) bruts.positions[s] = (await dataApi.positions(user, s, o)).lignes;
  bruts.positionsCombos = (await dataApi.positionsCombos(user, o)).lignes;
  bruts.volume = await dataApi.volumeUtilisateur(user, o);
  bruts.stats = await dataApi.statsUtilisateur(user, o);
  bruts.valeur = await dataApi.valeurPortefeuille(user, o);

  // 3. Résolutions des marchés simples (20 conditions par appel).
  progression({ etape: "resolutions" });
  const conds = [...new Set(bruts.activite.filter(r => r.condition_id && !r.is_combo).map(r => r.condition_id))].sort();
  bruts.resolutions = [];
  for (let i = 0; i < conds.length; i += 20) bruts.resolutions.push(...(await dataApi.resolutions(conds.slice(i, i + 20), o) || []));

  // 4. On-chain (via le relais serveur). Sans lui, l'outil fonctionne en mode dégradé, signalé.
  bruts.onchain = null; bruts.soldes = null;
  if (etherscan) {
    try {
      const erc20 = {};
      for (const [nom, j] of Object.entries(JETONS)) {
        progression({ etape: "onchain", detail: { jeton: nom } });
        erc20[nom] = (await etherscan.transfertsErc20(user, j.adresse, p => progression({ etape: "onchain", detail: { jeton: nom, ...p } }))).transferts;
      }
      progression({ etape: "onchain", detail: { jeton: "parts ERC-1155" } });
      const erc1155 = (await etherscan.transfertsErc1155(user, p => progression({ etape: "onchain", detail: { jeton: "parts", ...p } }))).transferts;
      bruts.onchain = { erc20, erc1155 };
      bruts.soldes = { capturesLe: new Date().toISOString() };
      for (const [nom, j] of Object.entries(JETONS)) bruts.soldes[nom] = (await etherscan.solde(user, j.adresse, j.decimales)).brut;
    } catch (e) {
      anomalies.push(anomalie("erreur", "onchain_indisponible", `Données on-chain indisponibles : ${e.message}`));
      bruts.onchain = null; bruts.soldes = null;
    }
  }
  bruts.anomaliesRecuperation = anomalies;
  return bruts;
}

/** États de résolution par actif : { resolu, valeurUnitaire (Dec|null), resoluLe, source }. */
export function etatsResolution(bruts) {
  const etats = new Map();
  const idxIssue = new Map();      // token_id → outcome_index (appris de l'activité)
  for (const r of bruts.activite) if (r.token_id && Number.isInteger(r.outcome_index) && r.outcome_index !== 999) idxIssue.set(r.token_id, r.outcome_index);
  const parCondition = new Map((bruts.resolutions || []).map(r => [r.condition_id, r]));
  const tokensParCondition = new Map();
  for (const r of bruts.activite) if (r.token_id && r.condition_id && !r.is_combo) {
    if (!tokensParCondition.has(r.condition_id)) tokensParCondition.set(r.condition_id, new Set());
    tokensParCondition.get(r.condition_id).add(r.token_id);
  }
  // Prix publiés par /v2/positions (OPEN et CLOSED), repli pour les résolutions sans vecteur de paiement.
  const prixPositions = new Map();
  for (const s of ["OPEN", "CLOSED"]) for (const r of bruts.positions?.[s] || []) if (typeof r.current_price === "number") prixPositions.set(r.token_id, r.current_price);
  for (const [cond, toks] of tokensParCondition) {
    const res = parCondition.get(cond);
    for (const t of toks) {
      const etat = { resolu: false, valeurUnitaire: null, resoluLe: null, source: "data-api/v2/resolutions" };
      if (res && res.status === "resolved" && Array.isArray(res.payouts) && idxIssue.has(t)) {
        const num = res.payouts[idxIssue.get(t)];
        if (num !== undefined) {
          etat.resolu = true;
          etat.valeurUnitaire = Dec.de(String(num)).divise("1000000");   // résultats en parties par million
          etat.resoluLe = res.resolved_at ? Math.floor(Date.parse(res.resolved_at) / 1000) : null;
        }
      } else if (res && res.status === "resolved" && prixPositions.has(t)) {
        // Résolution au format UMA (champ « price » dont l'échelle n'est pas documentée) :
        // on ne l'interprète pas ; on retient le prix publié par /v2/positions, et on le dit.
        etat.resolu = true;
        etat.valeurUnitaire = Dec.de(prixPositions.get(t));
        const lu = Number(res.last_update_timestamp);
        etat.resoluLe = Number.isFinite(lu) && lu > 0 ? lu : null;
        etat.source = "data-api/v2/positions current_price (résolution UMA sans vecteur de paiement)";
      }
      for (const reg of ["ctf", "v2"]) etats.set(`${reg}:${t}`, etat);
    }
  }
  for (const c of bruts.positionsCombos || []) {
    const st = String(c.status || "");
    const etat = { resolu: false, valeurUnitaire: null, resoluLe: c.resolved_at ? Math.floor(Date.parse(c.resolved_at) / 1000) : null, source: "data-api/v2/positions/combos" };
    if (st === "RESOLVED_LOSS") { etat.resolu = true; etat.valeurUnitaire = Dec.ZERO; }
    else if (st === "RESOLVED_WIN") { etat.resolu = true; etat.valeurUnitaire = Dec.de("1"); }
    for (const reg of ["ctf", "v2"]) etats.set(`${reg}:${c.combo_position_id}`, etat);
  }
  return etats;
}

/** Prix courant des positions non résolues (Polymarket, /v2/positions). */
export function prixCourants(bruts) {
  const prix = new Map();
  for (const r of bruts.positions?.OPEN || []) {
    if (typeof r.current_price === "number") for (const reg of ["ctf", "v2"]) prix.set(`${reg}:${r.token_id}`, Dec.de(r.current_price));
  }
  return prix;
}

export { normaliser, controler };

/**
 * Valeur unitaire de chaque actif à un instant : valeur de résolution si le marché était déjà
 * tranché à cet instant, sinon dernier prix publié à cet instant ou avant (/v2/prices-history,
 * paramètre as_of). Les combinés n'ont pas d'historique de prix : ils restent sans valeur
 * (affichés au coût restant, comme le fait /v2/value pour les combinés non résolus).
 */
export function valoriseur(bruts, { transport, signal, parallele = 4 } = {}) {
  const etats = etatsResolution(bruts);
  return async (actifs, horodatage) => {
    const resultat = new Map(), aDemander = [];
    for (const a of actifs) {
      const e = etats.get(a);
      if (e?.resolu && e.valeurUnitaire && e.resoluLe !== null && e.resoluLe <= horodatage) {
        resultat.set(a, { valeurUnitaire: e.valeurUnitaire, source: "valeur de résolution", observeLe: e.resoluLe });
      } else if (a.startsWith("ctf:") || a.startsWith("v2:")) aDemander.push(a);
    }
    let i = 0;
    const travail = async () => {
      while (i < aDemander.length) {
        const a = aDemander[i++];
        const pts = await dataApi.prixA(a.split(":")[1], horodatage, { transport, signal });
        const p = Array.isArray(pts) ? pts.filter(x => x.timestamp <= horodatage).at(-1) : null;
        if (p && typeof p.price === "number") resultat.set(a, { valeurUnitaire: Dec.de(p.price), source: "data-api/v2/prices-history (as_of)", observeLe: p.timestamp });
      }
    };
    await Promise.all(Array.from({ length: parallele }, travail));
    return resultat;
  };
}
