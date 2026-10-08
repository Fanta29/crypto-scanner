/* analyse.js — chaîne complète, sans DOM : données brutes → rapport.
   Point d'entrée unique de l'interface et des tests. Le connecteur est un paramètre :
   rien ici ne dépend de Polymarket. */
import { Dec } from "./decimal.js";
import { calculerPositions } from "./positions.js";
import { evaluer } from "./evaluation.js";
import { volumes } from "./volumes.js";
import { parPeriode, parCategorieMarche } from "./agregats.js";
import { rapport, couverture } from "./reconciliation.js";
import { somme } from "./decimal.js";

export function analyser(connecteur, bruts, { mesAdresses = new Set(), seuil = "0" } = {}) {
  const norm = connecteur.normaliser(bruts, { mesAdresses });
  const evts = norm.evenements;
  const calc = calculerPositions(evts);
  const evalue = evaluer(calc, { etats: connecteur.etatsResolution?.(bruts), prix: connecteur.prixCourants?.(bruts) });
  const vol = volumes(evts);
  const revenus = somme(evts.filter(e => e.categorie === "REBATE" || e.categorie === "REWARD"), e => e.montantUsd);
  const pnl = {
    realiseOperations: calc.realiseTotal,
    constateResolu: evalue.constate,
    revenus,
    global: calc.realiseTotal.plus(evalue.constate).plus(revenus),
    latent: evalue.latent,
    frais: vol.frais
  };
  const soldes = bruts.soldes
    ? Object.fromEntries(Object.entries(bruts.soldes).filter(([k]) => k !== "capturesLe").map(([k, v]) => [k, Dec.deUnites(v, 6)]))
    : null;
  const anomalies = [...(bruts.anomaliesRecuperation || []), ...norm.anomalies, ...calc.anomalies];
  const couv = couverture(evts, { dedoublonnage: norm.dedoublonnage, pagination: bruts.pagination, onchainSeul: norm.onchainSeul });
  const controle = rapport({ evts, soldes, controlesConnecteur: connecteur.controler(bruts, norm, calc), anomalies, couv, seuil: Dec.de(seuil) });
  return {
    adresse: bruts.adresse, recupereLe: bruts.recupereLe ?? null, soldesLe: bruts.soldes?.capturesLe ?? null,
    evenements: evts, positions: calc, evaluation: evalue, volumes: vol, pnl,
    mensuel: parPeriode(evts, calc.realisations, "mois"),
    annuel: parPeriode(evts, calc.realisations, "annee"),
    parMarche: parCategorieMarche(evts, calc.realisations),
    controle, soldes,
    reference: { volume: bruts.volume ?? null, stats: bruts.stats ?? null, valeur: bruts.valeur ?? null }
  };
}
