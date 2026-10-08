/* modele.js — format d'événement normalisé, commun à tous les connecteurs.
   Les calculs, la réconciliation, les exports et le récapitulatif fiscal ne lisent
   que ce format. Un connecteur traduit ses données brutes vers lui, rien d'autre. */
import { Dec } from "./decimal.js";

/** Catégories. Chaque événement en reçoit exactement une. */
export const CATEGORIES = {
  ACHAT:             { libelle: "Achat",                  famille: "trade" },
  VENTE:             { libelle: "Vente",                  famille: "trade" },
  REDEEM_GAGNANT:    { libelle: "Rachat gagnant",         famille: "resolution" },
  REDEEM_PERDANT:    { libelle: "Rachat perdant",         famille: "resolution" },
  SPLIT:             { libelle: "Split",                  famille: "technique" },
  MERGE:             { libelle: "Merge",                  famille: "technique" },
  CONVERSION:        { libelle: "Conversion",             famille: "technique" },
  MIGRATION:         { libelle: "Migration",              famille: "technique" },
  REBATE:            { libelle: "Remise (rebate)",        famille: "revenu" },
  REWARD:            { libelle: "Récompense",             famille: "revenu" },
  DEPOT:             { libelle: "Dépôt",                  famille: "flux" },
  RETRAIT:           { libelle: "Retrait",                famille: "flux" },
  TRANSFERT_INTERNE: { libelle: "Transfert interne",      famille: "flux" },
  INCONNU:           { libelle: "Inconnu",                famille: "inconnu" }
};

/** Actifs « espèces » valorisés à 1 USD (hypothèse affichée partout où elle sert). */
export const STABLES = new Set(["pUSD", "USDC", "USDC.e"]);

const OBLIGATOIRES = ["id", "connecteur", "chaine", "protocole", "adresse", "horodatage", "hash", "categorie"];

/**
 * Construit un événement normalisé et le valide. Les montants sont convertis en Dec.
 * Lève une erreur si la forme est invalide : une erreur de construction est un bug du
 * connecteur, pas une donnée à laisser passer.
 */
export function evenement(e) {
  for (const k of OBLIGATOIRES) {
    if (e[k] === undefined || e[k] === null || e[k] === "") throw new Error(`Événement incomplet : champ « ${k} » manquant (${e.id || "?"})`);
  }
  if (!CATEGORIES[e.categorie]) throw new Error(`Catégorie inconnue « ${e.categorie} »`);
  if (!Number.isInteger(e.horodatage)) throw new Error(`Horodatage non entier (${e.id})`);
  const mouvements = l => (l || []).map(m => {
    const q = Dec.de(m.quantite);
    if (q.signe() < 0) throw new Error(`Quantité négative dans ${e.id}`);
    return Object.freeze({ actif: m.actif, quantite: q, ...(m.libelle ? { libelle: m.libelle } : {}) });
  });
  const dec = v => (v === null || v === undefined ? null : Dec.de(v));
  return Object.freeze({
    id: e.id,
    connecteur: e.connecteur, chaine: e.chaine, protocole: e.protocole,
    adresse: e.adresse.toLowerCase(),
    horodatage: e.horodatage,
    bloc: e.bloc ?? null, hash: e.hash, indexLog: e.indexLog ?? null,
    categorie: e.categorie,
    sousType: e.sousType ?? null,
    entrees: Object.freeze(mouvements(e.entrees)),
    sorties: Object.freeze(mouvements(e.sorties)),
    montantUsd: dec(e.montantUsd) ?? Dec.ZERO,
    notionnelUsd: dec(e.notionnelUsd),
    fraisUsd: dec(e.fraisUsd) ?? Dec.ZERO,
    position: e.position ? Object.freeze({ ...e.position }) : null,
    parts: dec(e.parts),
    prix: dec(e.prix),
    contrepartie: e.contrepartie ?? null,
    interne: Boolean(e.interne),
    origine: e.origine || "api",              // "api", "onchain" ou "api+onchain"
    sourceBrute: e.sourceBrute ?? null,
    notes: Object.freeze([...(e.notes || [])])
  });
}

/** Ordre total et stable des événements : horodatage, bloc, index de journal, identifiant. */
export function trier(evts) {
  return [...evts].sort((a, b) =>
    a.horodatage - b.horodatage
    || (a.bloc ?? 0) - (b.bloc ?? 0)
    || (a.indexLog ?? 0) - (b.indexLog ?? 0)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Date civile d'un horodatage dans un fuseau donné, au format AAAA-MM-JJ. */
export function dateDans(horodatage, fuseau = "Europe/Paris") {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(horodatage * 1000));
  const v = t => p.find(x => x.type === t).value;
  return `${v("year")}-${v("month")}-${v("day")}`;
}

/** Date et heure lisibles dans un fuseau donné : « 2026-09-29 15:24:24 ». */
export function dateHeureDans(horodatage, fuseau = "Europe/Paris") {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(horodatage * 1000));
  const v = t => p.find(x => x.type === t).value;
  return `${v("year")}-${v("month")}-${v("day")} ${v("hour")}:${v("minute")}:${v("second")}`;
}

/** Anomalie : tout ce qui mérite l'attention sans bloquer le calcul. */
export function anomalie(niveau, code, message, refs = []) {
  return Object.freeze({ niveau, code, message, refs: Object.freeze([...refs]) });
}
