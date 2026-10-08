/* consolidation.js — vue consolidée de plusieurs adresses du même utilisateur.
   Produit un objet de même forme qu'une analyse d'adresse (voir analyse.js) : toutes les
   vues et tous les exports s'appliquent sans changement.

   Règles :
   - les événements de chaque adresse sont repris tels quels, identifiants préfixés par
     l'adresse (une même transaction peut concerner deux de vos adresses) ;
   - un transfert entre deux adresses analysées apparaît des deux côtés : ses deux jambes
     s'annulent dans les soldes et il n'est compté ni en dépôt ni en retrait (catégorie
     TRANSFERT_INTERNE) ; des parts transférées gardent leur coût ;
   - positions et résultat sont recalculés sur l'ensemble (coût moyen pondéré commun à
     toutes les adresses pour une même position) ;
   - l'équation de flux consolidée compare la somme des flux à la somme des soldes ;
     chaque adresse garde son propre rapport de contrôle. */
import { Dec, somme } from "./decimal.js";
import { evenement } from "./modele.js";
import { calculerPositions } from "./positions.js";
import { evaluer } from "./evaluation.js";
import { volumes } from "./volumes.js";
import { parPeriode, parCategorieMarche } from "./agregats.js";
import { rapport, couverture } from "./reconciliation.js";

export function consolider(connecteur, analyses, brutsListe, { seuil = "0" } = {}) {
  const evts = analyses.flatMap(a => a.evenements.map(e => evenement({ ...e, id: `${a.adresse}:${e.id}` })));
  const calc = calculerPositions(evts);
  const fusion = connecteur.fusionner(brutsListe);
  const evalue = evaluer(calc, { etats: connecteur.etatsResolution(fusion), prix: connecteur.prixCourants(fusion) });
  const vol = volumes(evts);
  const revenus = somme(evts.filter(e => e.categorie === "REBATE" || e.categorie === "REWARD"), e => e.montantUsd);

  // Soldes : somme des soldes lus pour chaque adresse (absents si une adresse n'en a pas).
  const toutesLues = analyses.every(a => a.soldes);
  const soldes = toutesLues ? {} : null;
  if (toutesLues) for (const a of analyses) for (const [k, v] of Object.entries(a.soldes)) soldes[k] = (soldes[k] || Dec.ZERO).plus(v);

  const anomalies = [...analyses.flatMap(a => a.controle.anomalies.map(x => ({ ...x, message: `[${a.adresse.slice(0, 8)}…] ${x.message}` }))), ...calc.anomalies];
  const couv = couverture(evts, {});
  const parAdresse = analyses.map(a => ({
    id: `adresse_${a.adresse}`, libelle: `Rapport de l'adresse ${a.adresse}`,
    statut: a.controle.statut, attendu: "0", obtenu: String(a.controle.nombreEcarts), ecart: String(a.controle.nombreEcarts),
    detail: `${a.evenements.length} événements ; ${a.controle.nombreEcarts} contrôle(s) en écart (détail dans la vue de l'adresse).`, refs: []
  }));
  const internes = evts.filter(e => e.categorie === "TRANSFERT_INTERNE");
  const controle = rapport({ evts, soldes, controlesConnecteur: [...parAdresse,
    { id: "transferts_internes", libelle: "Transferts internes entre adresses analysées (exclus des dépôts et retraits)", statut: "info",
      attendu: null, obtenu: String(internes.length), ecart: null, detail: `${internes.length} jambe(s) de transfert interne.`, refs: internes.map(e => e.hash) }],
    anomalies, couv, seuil: Dec.de(seuil) });

  return {
    adresse: analyses.map(a => a.adresse).join(" + "), adresses: analyses.map(a => a.adresse), consolide: true,
    recupereLe: analyses.map(a => a.recupereLe).filter(Boolean).sort()[0] ?? null,
    soldesLe: analyses.map(a => a.soldesLe).filter(Boolean).sort()[0] ?? null,
    evenements: evts, positions: calc, evaluation: evalue, volumes: vol,
    pnl: { realiseOperations: calc.realiseTotal, constateResolu: evalue.constate, revenus,
      global: calc.realiseTotal.plus(evalue.constate).plus(revenus), latent: evalue.latent, frais: vol.frais },
    mensuel: parPeriode(evts, calc.realisations, "mois", "Europe/Paris", evalue.resolues),
    annuel: parPeriode(evts, calc.realisations, "annee", "Europe/Paris", evalue.resolues),
    parMarche: parCategorieMarche(evts, calc.realisations, evalue.resolues),
    controle, soldes,
    reference: { volume: null, stats: null, valeur: null }
  };
}
