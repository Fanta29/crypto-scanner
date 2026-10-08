/* reconciliation.js — rapport de contrôle générique (indépendant du protocole).
   Le connecteur ajoute ses propres contrôles ; ici : équation de flux par actif espèces,
   couverture temporelle et synthèse des anomalies. Aucun arrondi avant comparaison. */
import { Dec, somme } from "./decimal.js";
import { CATEGORIES, STABLES } from "./modele.js";

/** Flux net d'un actif sur un événement (+ entrée, − sortie). */
const flux = (e, actif) => somme(e.entrees.filter(m => m.actif === actif), m => m.quantite)
  .moins(somme(e.sorties.filter(m => m.actif === actif), m => m.quantite));

/**
 * Équation de flux d'un actif : Σ des flux par catégorie = solde observé.
 * Les transferts internes sont comptés dans le flux (ils changent le solde de l'adresse)
 * mais isolés sur leur propre ligne et exclus du consolidé multi-adresses.
 */
export function equationDeFlux(evts, actif, soldeObserve, { seuil = Dec.ZERO } = {}) {
  const lignes = Object.keys(CATEGORIES).map(c => {
    const es = evts.filter(e => e.categorie === c);
    const v = somme(es, e => flux(e, actif));
    return { categorie: c, libelle: CATEGORIES[c].libelle, montant: v, nombre: es.filter(e => !flux(e, actif).estZero()).length };
  }).filter(l => !l.montant.estZero() || l.nombre > 0);
  const calcule = somme(lignes, l => l.montant);
  if (soldeObserve === null || soldeObserve === undefined) return { actif, lignes, calcule, observe: null, ecart: null, statut: "non_fait" };
  const observe = Dec.de(soldeObserve), ecart = calcule.moins(observe);
  return { actif, lignes, calcule, observe, ecart,
    ecartRelatif: observe.estZero() ? null : ecart.divise(observe).fois(100),
    statut: ecart.abs().sup(seuil) ? "ecart" : "ok" };
}

export function couverture(evts, { dedoublonnage, pagination, onchainSeul } = {}) {
  const ts = evts.map(e => e.horodatage);
  const parOrigine = {};
  for (const e of evts) parOrigine[e.origine] = (parOrigine[e.origine] || 0) + 1;
  return {
    premier: ts.length ? Math.min(...ts) : null,
    dernier: ts.length ? Math.max(...ts) : null,
    nombre: evts.length,
    parOrigine,
    pages: pagination?.length ?? null,
    lignesLues: dedoublonnage?.lus ?? null,
    doublonsRetires: dedoublonnage?.retires ?? 0,
    doublonsReintegres: dedoublonnage?.reintegres ?? 0,
    onchainSeul: onchainSeul?.length ?? 0,
    inconnus: evts.filter(e => e.categorie === "INCONNU").length
  };
}

/** Rapport complet. soldes : { actif: Dec|chaîne (valeur en unités, pas en unités de base) } */
export function rapport({ evts, soldes, controlesConnecteur = [], anomalies = [], couv, seuil = Dec.ZERO }) {
  const actifs = new Set([...Object.keys(soldes || {}).filter(a => STABLES.has(a))]);
  for (const e of evts) for (const m of [...e.entrees, ...e.sorties]) if (STABLES.has(m.actif)) actifs.add(m.actif);
  const equations = [...actifs].map(a => equationDeFlux(evts, a, soldes ? (soldes[a] ?? Dec.ZERO) : null, { seuil }));
  const niveaux = { erreur: 0, alerte: 0, info: 0 };
  for (const a of anomalies) niveaux[a.niveau] = (niveaux[a.niveau] || 0) + 1;
  const controles = [
    ...equations.map(eq => ({ id: `flux_${eq.actif}`, libelle: `Équation de flux ${eq.actif} : Σ flux = solde on-chain`,
      statut: eq.statut, attendu: eq.observe?.toString() ?? null, obtenu: eq.calcule.toString(), ecart: eq.ecart?.toString() ?? null,
      ecartRelatif: eq.ecartRelatif ? eq.ecartRelatif.aFixe(4) + " %" : null, detail: "", refs: [] })),
    ...controlesConnecteur,
    { id: "inconnus", libelle: "Événements non classés (INCONNU)", statut: couv.inconnus ? "ecart" : "ok", attendu: "0", obtenu: String(couv.inconnus), ecart: String(couv.inconnus), detail: "Jamais écartés : listés dans le détail.", refs: [] },
    { id: "anomalies_erreur", libelle: "Anomalies de niveau « erreur »", statut: niveaux.erreur ? "ecart" : "ok", attendu: "0", obtenu: String(niveaux.erreur), ecart: String(niveaux.erreur), detail: "", refs: [] }
  ];
  const ko = controles.filter(c => c.statut === "ecart").length;
  return { equations, controles, couverture: couv, anomalies, niveaux, statut: ko ? "ecart" : "ok", nombreEcarts: ko, seuil };
}
