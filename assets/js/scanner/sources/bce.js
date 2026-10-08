/* bce.js — taux de référence de la BCE, USD pour 1 EUR (série EXR D.USD.EUR.SP00.A).
   Source : https://data.ecb.europa.eu/help/api/data — CORS ouvert, pas de clé.
   Les jours sans fixing (week-ends, jours fériés TARGET) n'ont pas de valeur : on
   retient le dernier fixing publié antérieur, et cette substitution est tracée. */
import { Dec } from "../decimal.js";

export const SERIE_BCE = "EXR/D.USD.EUR.SP00.A";
export const URL_BCE = "https://data-api.ecb.europa.eu/service/data/" + SERIE_BCE;

/** Lit le CSV « csvdata » de la BCE : Map date (AAAA-MM-JJ) → Dec (USD pour 1 EUR). */
export function lireCsvBce(texte) {
  const lignes = texte.replace(/\r/g, "").split("\n").filter(Boolean);
  const entete = lignes.shift().split(",");
  const iD = entete.indexOf("TIME_PERIOD"), iV = entete.indexOf("OBS_VALUE");
  if (iD < 0 || iV < 0) throw new Error("CSV BCE : colonnes TIME_PERIOD / OBS_VALUE absentes");
  const taux = new Map();
  for (const l of lignes) {
    const c = l.split(",");
    if (c[iV] === "" || c[iV] === "NaN") continue;
    taux.set(c[iD], Dec.de(c[iV]));
  }
  return taux;
}

/** Télécharge les taux entre deux dates (avec une marge de 10 jours avant le début). */
export async function chargerTaux(debut, fin, { transport = globalThis.fetch, signal } = {}) {
  const avant = new Date(Date.parse(debut + "T00:00:00Z") - 10 * 86400e3).toISOString().slice(0, 10);
  const url = `${URL_BCE}?format=csvdata&detail=dataonly&startPeriod=${avant}&endPeriod=${fin}`;
  const rep = await transport(url, { signal });
  if (!rep.ok) throw new Error(`BCE : HTTP ${rep.status}`);
  return { taux: lireCsvBce(await rep.text()), url };
}

/** Taux applicable à une date : fixing du jour, sinon dernier fixing antérieur. */
export function tauxPour(taux, date) {
  if (taux.has(date)) return { taux: taux.get(date), dateFixing: date, substitue: false };
  let meilleur = null;
  for (const k of taux.keys()) if (k < date && (meilleur === null || k > meilleur)) meilleur = k;
  if (meilleur === null) return null;
  return { taux: taux.get(meilleur), dateFixing: meilleur, substitue: true };
}
