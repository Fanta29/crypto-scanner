/* agregats.js — totaux par période (jour, mois, année civile) et par catégorie de marché. */
import { Dec, somme } from "./decimal.js";
import { CATEGORIES, dateDans } from "./modele.js";
import { volumes } from "./volumes.js";

export function cleDePeriode(horodatage, maille, fuseau = "Europe/Paris") {
  const d = dateDans(horodatage, fuseau);
  return maille === "jour" ? d : maille === "mois" ? d.slice(0, 7) : d.slice(0, 4);
}

/** Totaux par période : volumes, montants par catégorie, réalisé. */
export function parPeriode(evts, realisations, maille = "mois", fuseau = "Europe/Paris") {
  const groupes = new Map();
  const g = k => {
    if (!groupes.has(k)) groupes.set(k, { periode: k, evts: [], realise: Dec.ZERO });
    return groupes.get(k);
  };
  for (const e of evts) g(cleDePeriode(e.horodatage, maille, fuseau)).evts.push(e);
  for (const r of realisations) { const x = g(cleDePeriode(r.horodatage, maille, fuseau)); x.realise = x.realise.plus(r.realise); }
  return [...groupes.values()].sort((a, b) => (a.periode < b.periode ? -1 : 1)).map(x => ({
    periode: x.periode,
    nombre: x.evts.length,
    volumes: volumes(x.evts),
    parCategorie: Object.fromEntries(Object.keys(CATEGORIES).map(c => [c, somme(x.evts.filter(e => e.categorie === c), e => e.montantUsd)])),
    realise: x.realise
  }));
}

/**
 * Catégorie de marché : préfixe du slug d'événement Polymarket (« cs2 », « val », « mlb »…).
 * C'est une heuristique, affichée comme telle : Polymarket ne publie pas de catégorie
 * dans les lignes d'activité. Les combinés forment leur propre groupe.
 */
export function categorieMarche(e) {
  if (!e.position) return "hors marché";
  if (e.position.combine) return "combinés";
  const s = e.position.evenement || e.position.slug || "";
  return s ? s.split("-")[0] : "inconnue";
}

export function parCategorieMarche(evts, realisations) {
  const parId = new Map(evts.map(e => [e.id, e]));
  const m = new Map();
  const g = k => { if (!m.has(k)) m.set(k, { categorie: k, evts: [], realise: Dec.ZERO }); return m.get(k); };
  for (const e of evts) if (e.position) g(categorieMarche(e)).evts.push(e);
  for (const r of realisations) { const e = parId.get(r.evenement); if (e) g(categorieMarche(e)).realise = g(categorieMarche(e)).realise.plus(r.realise); }
  return [...m.values()].map(x => ({ categorie: x.categorie, nombre: x.evts.length, volumes: volumes(x.evts), realise: x.realise }))
    .sort((a, b) => b.volumes.especes.cmp(a.volumes.especes));
}
