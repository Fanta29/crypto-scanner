import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lireCsvBce, tauxPour } from "../assets/js/scanner/sources/bce.js";
import { recapAnnee } from "../assets/js/scanner/fiscal.js";
import { dateDans } from "../assets/js/scanner/modele.js";
import { evenement } from "../assets/js/scanner/modele.js";
import { calculerPositions } from "../assets/js/scanner/positions.js";
import { evaluer } from "../assets/js/scanner/evaluation.js";

// Taux BCE réels, téléchargés le 2026-10-08 depuis data-api.ecb.europa.eu (série EXR D.USD.EUR.SP00.A).
const taux = lireCsvBce(readFileSync("tests/donnees/bce-usd-eur-2026-06-01_2026-10-08.csv", "utf8"));

test("taux BCE : fixing du jour, sinon dernier fixing antérieur (substitution tracée)", () => {
  assert.equal(tauxPour(taux, "2026-06-26").taux.toString(), "1.1401");
  const samedi = tauxPour(taux, "2026-06-27");
  assert.equal(samedi.dateFixing, "2026-06-26");
  assert.equal(samedi.substitue, true);
  assert.equal(tauxPour(taux, "2026-01-01"), null);     // avant la série : pas d'invention
});

test("année civile en heure de Paris : le 31/12 à 23:30 UTC appartient à l'année suivante", () => {
  assert.equal(dateDans(Date.parse("2026-12-31T23:30:00Z") / 1000), "2027-01-01");
  assert.equal(dateDans(Date.parse("2026-12-31T22:59:59Z") / 1000), "2026-12-31");
  assert.equal(dateDans(Date.parse("2026-06-30T22:30:00Z") / 1000), "2026-07-01");   // heure d'été : UTC+2
});

test("récapitulatif : conversion opération par opération, valeurs recalculées en Python Decimal", () => {
  let n = 0;
  const ev = (categorie, ts, entrees, sorties, montant) => evenement({ id: "f" + (++n), connecteur: "t", chaine: "t", protocole: "t",
    adresse: "0xaa", horodatage: ts, hash: "0x" + n, categorie, entrees, sorties, montantUsd: montant });
  const evts = [
    ev("ACHAT", 1782561600, [{ actif: "x:1", quantite: "100" }], [{ actif: "pUSD", quantite: "100" }], "100"),   // samedi 27/06 → taux du 26/06
    ev("VENTE", 1782720000, [{ actif: "pUSD", quantite: "41.2" }], [{ actif: "x:1", quantite: "40" }], "41.2")   // lundi 29/06
  ];
  const calc = calculerPositions(evts);
  const analyse = { evenements: evts, positions: calc, evaluation: evaluer(calc) };
  const r = recapAnnee(analyse, taux, "2026", 1791500000);
  const achat = r.lignes[0], vente = r.lignes[1];
  // Attendus calculés hors de l'outil : Decimal(100)/Decimal("1.1401"), Decimal("41.2")/Decimal("1.1406")
  assert.equal(achat.eur.toString(), "87.71160424524164547");
  assert.equal(achat.substitue, true);
  assert.equal(vente.eur.toString(), "36.1213396458004559");
  assert.equal(r.substitutions, 1);
  // Réalisé : vente de 40 parts à coût moyen 1 → +1,2 USD, converti au taux du 29/06
  assert.equal(r.resultat.realiseOperationsUsd.toString(), "1.2");
  assert.equal(r.anneeTerminee, false);
  assert.ok(r.avertissement.includes("pas un conseil fiscal"));
  assert.ok(r.pointsAVerifier.some(p => p.includes("3916")));
});

test("fin de journée à Paris : heure d'hiver et heure d'été", async () => {
  const { finDeJourneeParis } = await import("../assets/js/ui/fiscal-vue.js");
  assert.equal(new Date(finDeJourneeParis("2026-12-31") * 1000).toISOString(), "2026-12-31T22:59:59.000Z");   // UTC+1
  assert.equal(new Date(finDeJourneeParis("2026-09-30") * 1000).toISOString(), "2026-09-30T21:59:59.000Z");   // UTC+2
});
