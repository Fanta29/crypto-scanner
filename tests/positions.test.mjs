import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerPositions } from "../assets/js/scanner/positions.js";
import { evenement } from "../assets/js/scanner/modele.js";

let n = 0;
const ev = (categorie, entrees, sorties, o = {}) => evenement({ id: "t" + (++n), connecteur: "test", chaine: "test", protocole: "test",
  adresse: "0xaa", horodatage: 1000 + n, hash: "0x" + n, categorie, entrees, sorties, ...o });
const P = (a, q) => ({ actif: a, quantite: q });

test("coût moyen pondéré, vente partielle, puis solde : réalisé = reçu − payé", () => {
  const c = calculerPositions([
    ev("ACHAT", [P("x:1", "100")], [P("pUSD", "40")]),
    ev("ACHAT", [P("x:1", "100")], [P("pUSD", "60")]),       // coût moyen : 100 / 200 = 0,5
    ev("VENTE", [P("pUSD", "35")], [P("x:1", "50")]),        // coût sorti 25 → réalisé +10
    ev("REDEEM_GAGNANT", [P("pUSD", "150")], [P("x:1", "150")])   // coût sorti 75 → réalisé +75
  ]);
  const p = c.positions[0];
  assert.equal(c.realisations[0].realise.toString(), "10");
  assert.equal(c.realisations[1].realise.toString(), "75");
  assert.equal(p.realise.toString(), "85");
  assert.equal(p.recu.moins(p.paye).toString(), "85");
  assert.equal(p.quantite.toString(), "0");
  assert.equal(c.ouvertes.length, 0);
});

test("position partiellement vendue : reste ouvert avec son coût", () => {
  const c = calculerPositions([ev("ACHAT", [P("x:2", "10")], [P("pUSD", "3")]), ev("VENTE", [P("pUSD", "2")], [P("x:2", "4")])]);
  assert.equal(c.ouvertes[0].quantite.toString(), "6");
  assert.equal(c.ouvertes[0].cout.toString(), "1.8");
  assert.equal(c.realiseTotal.toString(), "0.8");
});

test("rachat qui détruit les deux issues : paiement à l'issue gagnante (allocation)", () => {
  const c = calculerPositions([
    ev("ACHAT", [P("x:oui", "10")], [P("pUSD", "4")]),
    ev("ACHAT", [P("x:non", "10")], [P("pUSD", "6")]),
    ev("REDEEM_GAGNANT", [P("pUSD", "10")], [P("x:oui", "10"), P("x:non", "10")], { position: { allocation: { "x:oui": "1" } } })
  ]);
  const oui = c.positions.find(p => p.actif === "x:oui"), non = c.positions.find(p => p.actif === "x:non");
  assert.equal(oui.realise.toString(), "6");
  assert.equal(non.realise.toString(), "-6");
  assert.equal(c.realiseTotal.toString(), "0");
});

test("split : coût réparti à parts égales entre les issues (faute de prix de marché)", () => {
  const c = calculerPositions([ev("SPLIT", [P("x:a", "10"), P("x:b", "10")], [P("pUSD", "10")])]);
  assert.deepEqual(c.positions.map(p => p.cout.toString()), ["5", "5"]);
});

test("conversion / migration : le coût passe aux nouvelles parts, rien n'est réalisé", () => {
  const c = calculerPositions([ev("ACHAT", [P("ctf:1", "10")], [P("pUSD", "7")]), ev("MIGRATION", [P("v2:1", "10")], [P("ctf:1", "10")])]);
  assert.equal(c.positions.find(p => p.actif === "v2:1").cout.toString(), "7");
  assert.equal(c.realiseTotal.toString(), "0");
});

test("survente : anomalie, jamais silencieuse", () => {
  const c = calculerPositions([ev("ACHAT", [P("x:3", "1")], [P("pUSD", "1")]), ev("VENTE", [P("pUSD", "2")], [P("x:3", "2")])]);
  assert.ok(c.anomalies.some(a => a.code === "survente"));
});

test("revenus et dépôts sans parts : aucun effet sur les positions", () => {
  const c = calculerPositions([ev("REBATE", [P("pUSD", "1")], []), ev("DEPOT", [P("pUSD", "100")], [])]);
  assert.equal(c.positions.length, 0);
});

test("valorisation à une date : rejoue jusqu'à cette date, n'invente aucune valeur", async () => {
  const { evaluerAu } = await import("../assets/js/scanner/evaluation.js");
  const evts = [
    ev("ACHAT", [P("x:a", "10")], [P("pUSD", "4")]),
    ev("ACHAT", [P("x:b", "10")], [P("pUSD", "6")]),
    ev("VENTE", [P("pUSD", "5")], [P("x:a", "10")])         // après la date de valorisation
  ];
  const date = evts[1].horodatage;
  const { Dec } = await import("../assets/js/scanner/decimal.js");
  const r = await evaluerAu(evts, date, async actifs => new Map(actifs.filter(a => a === "x:a").map(a => [a, { valeurUnitaire: Dec.de("0.5"), source: "test" }])));
  assert.equal(r.lignes.length, 2);                          // la vente postérieure n'est pas prise
  assert.equal(r.valeur.toString(), "5");
  assert.equal(r.ecart.toString(), "1");
  assert.equal(r.nonValorisees[0].actif, "x:b");
  assert.equal(r.coutNonValorise.toString(), "6");
});
