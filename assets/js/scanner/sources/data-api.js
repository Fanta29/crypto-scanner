/* data-api.js — client de la Data API Polymarket v2 (https://data-api.polymarket.com).
   Sources : https://docs.polymarket.com/migrate/data-api-v1-to-v2.md et
   https://data-api.polymarket.com/v2/openapi.json (consultés le 2026-10-08).
   La v1 est retirée le 24 octobre 2026 : elle n'est pas utilisée. */
import { getJson } from "./http.js";

export const BASE_DATA_API = "https://data-api.polymarket.com";

/** Tous les types acceptés par /v2/activity. TIP n'est renvoyé que s'il est nommé. */
export const TYPES_ACTIVITE = ["TRADE", "SPLIT", "MERGE", "REDEEM", "REWARD", "CONVERSION", "MIGRATION",
  "MAKER_REBATE", "TAKER_REBATE", "REFERRAL_REWARD", "YIELD", "DEPOSIT", "WITHDRAWAL", "TIP"];

/**
 * Parcourt une route paginée par curseur jusqu'à `next_cursor = null`.
 * arreter(page) : renvoie vrai pour cesser avant la fin (mise à jour incrémentale).
 */
export async function parcourir(chemin, params, { base = BASE_DATA_API, transport, signal, progression, arreter, surReprise } = {}) {
  const lignes = [], pages = [];
  let curseur = null;
  for (let n = 0; ; n++) {
    const q = new URLSearchParams(params);
    if (curseur) q.set("cursor", curseur);
    const url = `${base}${chemin}?${q}`;
    const { json } = await getJson(url, { transport, signal, surReprise });
    if (!json || !Array.isArray(json.data)) throw new Error(`Réponse inattendue de ${chemin} : « data » absent ou non tableau`);
    const pg = json.pagination || {};
    lignes.push(...json.data);
    pages.push({ n, lignes: json.data.length, has_more: pg.has_more ?? null, curseurSuivant: pg.next_cursor ?? null });
    progression?.({ chemin, pages: n + 1, lignes: lignes.length, derniere: json.data.at(-1) ?? null });
    curseur = pg.next_cursor ?? null;
    // Cohérence du protocole de pagination : has_more est « exact » d'après la doc.
    if (pg.has_more === true && !curseur) throw new Error(`${chemin} : has_more vrai sans next_cursor (page ${n})`);
    if (!curseur) break;
    if (arreter?.(json.data)) break;
  }
  return { lignes, pages };
}

/**
 * Historique d'activité complet d'un utilisateur.
 * Trois paramètres neutralisent des valeurs par défaut piégeuses de /v2/activity :
 *   start=1                            sinon l'historique s'arrête à trois ans
 *   exclude_deposits_withdrawals=false sinon dépôts et retraits sont absents
 *   type=<liste complète, TIP compris> sinon les TIP ne sont jamais renvoyés
 * depuis (horodatage) : arrête la descente dès qu'une page passe sous cette date.
 */
export function activite(user, { depuis = null, sens = "DESC", ...o } = {}) {
  const params = { user, limit: "1000", start: "1", type: TYPES_ACTIVITE.join(","),
    exclude_deposits_withdrawals: "false", sort_direction: sens };
  const arreter = depuis !== null && sens === "DESC"
    ? page => page.length > 0 && page.at(-1).timestamp < depuis
    : undefined;
  return parcourir("/v2/activity", params, { ...o, arreter });
}

export const activiteCombos = (user, o) => parcourir("/v2/activity/combos", { user, limit: "1000" }, o);
export const positionsCombos = (user, o) => parcourir("/v2/positions/combos", { user, limit: "500" }, o);

/** Positions par statut. Les statuts se recouvrent (OPEN contient les REDEEMABLE). */
export const positions = (user, statut, o) => parcourir("/v2/positions", { user, status: statut, limit: "500" }, o);

async function unique(chemin, params, { base = BASE_DATA_API, transport, signal } = {}) {
  const { json } = await getJson(`${base}${chemin}?${new URLSearchParams(params)}`, { transport, signal });
  return json?.data ?? null;
}

/** { volume (parts, deux côtés), volume_usdc (notionnel), trade_count } */
export const volumeUtilisateur = (user, o) => unique("/v2/user-volume", { user }, o);
/** { trades (marchés distincts), all_time_pnl{…}, join_date… } ou null */
export const statsUtilisateur = (user, o) => unique("/v2/user-stats", { user }, o);
export const valeurPortefeuille = (user, o) => unique("/v2/value", { user }, o);
/** Prix d'une issue à un instant (dernier point ≤ as_of). */
export const prixA = (tokenId, horodatage, o) => unique("/v2/prices-history", { token_id: tokenId, as_of: String(horodatage) }, o);
/** États de résolution (au plus 20 conditions par appel). payouts en parties par million. */
export const resolutions = (conditions, o) => unique("/v2/resolutions", { condition: conditions.join(",") }, o);
