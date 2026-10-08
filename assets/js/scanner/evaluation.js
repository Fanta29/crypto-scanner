/* evaluation.js — valorisation des positions encore détenues.
   Trois cas, toujours présentés séparément du réalisé par opérations :
   - résolue non rachetée : le marché est tranché, la valeur unitaire est connue
     (0 pour une issue perdante) ; le résultat est « constaté » à la date de résolution ;
   - ouverte : marché non tranché, valorisée au prix courant publié par Polymarket
     (résultat latent, non réalisé) ;
   - non valorisée : ni résolution ni prix connus. */
import { Dec, somme } from "./decimal.js";

export function evaluer(calc, { etats = new Map(), prix = new Map() } = {}) {
  const lignes = calc.ouvertes.map(p => {
    const etat = etats.get(p.actif);
    if (etat?.resolu && etat.valeurUnitaire) {
      const valeur = p.quantite.fois(etat.valeurUnitaire);
      return { ...p, etat: "resolue_non_rachetee", valeurUnitaire: etat.valeurUnitaire, valeur, resultat: valeur.moins(p.cout),
        date: etat.resoluLe, source: etat.source };
    }
    const px = prix.get(p.actif);
    if (px) {
      const valeur = p.quantite.fois(px);
      return { ...p, etat: "ouverte", valeurUnitaire: px, valeur, resultat: valeur.moins(p.cout), date: null, source: "data-api/v2/positions current_price" };
    }
    return { ...p, etat: "non_valorisee", valeurUnitaire: null, valeur: null, resultat: null, date: null, source: null };
  });
  const de = e => lignes.filter(l => l.etat === e);
  return {
    lignes,
    resolues: de("resolue_non_rachetee"),
    ouvertes: de("ouverte"),
    nonValorisees: de("non_valorisee"),
    constate: somme(de("resolue_non_rachetee"), l => l.resultat),
    latent: somme(de("ouverte"), l => l.resultat),
    valeurOuvertes: somme(de("ouverte"), l => l.valeur),
    coutNonValorise: somme(de("non_valorisee"), l => l.cout)
  };
}

/**
 * Valorisation des positions détenues à un instant donné (fin d'année, ou toute date).
 * evenements : événements normalisés ; horodatage : instant de valorisation (inclus) ;
 * valeurs : Map actif → { valeurUnitaire: Dec, source, observeLe } fournie par le connecteur.
 * Une position sans valeur connue est listée « non valorisée » avec son coût restant :
 * aucune valeur n'est inventée.
 */
export async function evaluerAu(evenements, horodatage, valeursPour) {
  const { calculerPositions } = await import("./positions.js");
  const calc = calculerPositions(evenements.filter(e => e.horodatage <= horodatage));
  const valeurs = await valeursPour(calc.ouvertes.map(p => p.actif), horodatage);
  const lignes = calc.ouvertes.map(p => {
    const v = valeurs.get(p.actif);
    if (!v) return { ...p, etat: "non_valorisee", valeurUnitaire: null, valeur: null, ecart: null, source: null, observeLe: null };
    const valeur = p.quantite.fois(v.valeurUnitaire);
    return { ...p, etat: "valorisee", valeurUnitaire: v.valeurUnitaire, valeur, ecart: valeur.moins(p.cout), source: v.source, observeLe: v.observeLe ?? null };
  });
  const val = lignes.filter(l => l.etat === "valorisee"), non = lignes.filter(l => l.etat === "non_valorisee");
  return { horodatage, lignes, valorisees: val, nonValorisees: non,
    valeur: somme(val, l => l.valeur), cout: somme(val, l => l.cout), ecart: somme(val, l => l.ecart),
    coutNonValorise: somme(non, l => l.cout), realiseJusque: calc.realiseTotal };
}
