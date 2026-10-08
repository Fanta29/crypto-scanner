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
