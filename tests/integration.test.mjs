// Test d'intégration sur l'adresse de test, à partir des fixtures réelles (hors dépôt).
// Recréer les fixtures : NODE_USE_ENV_PROXY=1 node tools/capture-fixtures.mjs <adresse>
//                        puis node tools/capture-onchain.mjs <adresse> (ETHERSCAN_API_KEY requise)
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerFixtures } from "./aides/fixtures.mjs";
import * as pm from "../assets/js/scanner/connecteurs/polymarket-polygon/index.js";
import { analyser } from "../assets/js/scanner/analyse.js";
import { cleLigne } from "../assets/js/scanner/connecteurs/polymarket-polygon/normalisation.js";
import { Dec, somme } from "../assets/js/scanner/decimal.js";

const f = chargerFixtures();
const ignorer = f ? false : "fixtures réelles absentes (voir en-tête du fichier)";

test("parcours décroissant et croissant : même multiensemble de lignes", { skip: ignorer }, () => {
  const compte = l => { const m = new Map(); for (const r of l) m.set(cleLigne(r), (m.get(cleLigne(r)) || 0) + 1); return m; };
  assert.deepEqual(compte(f.activite), compte(f.activiteAsc));
});

test("rapport de réconciliation : aucun écart non expliqué", { skip: ignorer }, () => {
  const a = analyser(pm, f);
  const ko = a.controle.controles.filter(c => c.statut === "ecart");
  assert.deepEqual(ko.map(c => `${c.libelle} : ${c.ecart}`), []);
  for (const c of a.controle.controles.filter(c => c.statut === "explique")) assert.ok(c.explication, c.libelle);
  const flux = a.controle.equations.find(e => e.actif === "pUSD");
  assert.equal(flux.ecart.toString(), "0");
  assert.equal(a.controle.niveaux.erreur, 0);
  assert.equal(a.controle.couverture.inconnus, 0);
});

test("volume : recalcul exact du chiffre Polymarket (parts, deux côtés)", { skip: ignorer }, () => {
  const a = analyser(pm, f);
  assert.equal(a.volumes.parts.toString(), Dec.de(f.volume.volume).toString());
  assert.equal(a.volumes.notionnel.toString(), Dec.de(f.volume.volume_usdc).toString());
  assert.equal(a.volumes.nombreTrades, f.volume.trade_count);
});

test("identité comptable : résultat total = espèces nettes de l'activité + valeur des parts détenues", { skip: ignorer }, () => {
  const a = analyser(pm, f);
  const horsFlux = a.evenements.filter(e => !["DEPOT", "RETRAIT", "TRANSFERT_INTERNE"].includes(e.categorie));
  const especes = somme(horsFlux, e => somme(e.entrees.filter(m => m.actif === "pUSD"), m => m.quantite).moins(somme(e.sorties.filter(m => m.actif === "pUSD"), m => m.quantite)));
  const valeur = somme(a.evaluation.lignes.filter(l => l.valeur), l => l.valeur);
  const gauche = a.pnl.global.plus(a.pnl.latent);
  const droite = especes.plus(valeur).plus(a.evaluation.coutNonValorise);
  assert.ok(gauche.moins(droite).abs().inf("0.000000001"), `${gauche} ≠ ${droite}`);
});

test("chaque événement porte un hash, une date, une catégorie ; chaque position soldée vérifie réalisé = reçu − payé", { skip: ignorer }, () => {
  const a = analyser(pm, f);
  for (const e of a.evenements) assert.ok(/^0x[0-9a-f]{64}$/.test(e.hash) && Number.isInteger(e.horodatage) && e.categorie, e.id);
  const fermees = a.positions.soldees.filter(p => !p.evenements.some(id => /MIGRATION|CONVERSION/.test(id)));
  for (const p of fermees) assert.ok(p.realise.moins(p.recu.moins(p.paye)).abs().inf("0.000000001"), p.actif);
});

test("consolidé d'une seule adresse = analyse de cette adresse (non-régression)", { skip: ignorer }, async () => {
  const { consolider } = await import("../assets/js/scanner/consolidation.js");
  const a = analyser(pm, f);
  const c = consolider(pm, [a], [f]);
  for (const k of ["realiseOperations", "constateResolu", "revenus", "global", "latent", "frais"]) assert.equal(c.pnl[k].toString(), a.pnl[k].toString(), k);
  assert.equal(c.volumes.parts.toString(), a.volumes.parts.toString());
  assert.equal(c.controle.equations.find(e => e.actif === "pUSD").ecart.toString(), "0");
});
