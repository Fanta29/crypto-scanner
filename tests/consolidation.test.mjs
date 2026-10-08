import { test } from "node:test";
import assert from "node:assert/strict";
import * as pm from "../assets/js/scanner/connecteurs/polymarket-polygon/index.js";
import { analyser } from "../assets/js/scanner/analyse.js";
import { consolider } from "../assets/js/scanner/consolidation.js";
import { ligne, pusd, parts, hashDe, EXCHANGE, CTF } from "./aides/construire.mjs";

// Deux adresses de l'utilisateur : A achète 10 parts pour 4 pUSD et les transfère à B,
// qui les vend 6 pUSD. A envoie aussi 1 pUSD à B (TIP).
const A = "0x00000000000000000000000000000000000000a1", B = "0x00000000000000000000000000000000000000b2";
const COND = "0x" + "e".repeat(64), TOK = "777";
const base = (adresse, activite, p, e) => ({ adresse, activite, onchain: { erc20: { pUSD: p, "USDC.e": [], USDC: [] }, erc1155: e },
  resolutions: [], positions: { OPEN: [], CLOSED: [] }, positionsCombos: [], soldes: null });
const achatA = ligne(1, { proxy_wallet: A, type: "TRADE", side: "BUY", size: 10, usdc_size: 4, price: 0.4, token_id: TOK, condition_id: COND, outcome: "Oui", outcome_index: 0, title: "M" });
const venteB = ligne(3, { proxy_wallet: B, type: "TRADE", side: "SELL", size: 10, usdc_size: 6, price: 0.6, token_id: TOK, condition_id: COND, outcome: "Oui", outcome_index: 0, title: "M" });
const tipA = ligne(4, { proxy_wallet: A, type: "TIP", side: "OUT", size: 1, usdc_size: 1 });
const tipB = ligne(4, { proxy_wallet: B, type: "TIP", side: "IN", size: 1, usdc_size: 1 });
const bA = base(A, [achatA, tipA], [pusd(1, A, EXCHANGE, 4000000), pusd(4, A, B, 1000000)], [parts(1, EXCHANGE, A, TOK, 10000000), parts(2, A, B, TOK, 10000000)]);
const bB = base(B, [venteB, tipB], [pusd(3, EXCHANGE, B, 6000000), pusd(4, A, B, 1000000)], [parts(2, A, B, TOK, 10000000), parts(3, B, EXCHANGE, TOK, 10000000)]);
bA.soldes = { pUSD: "-5000000", "USDC.e": "0", USDC: "0" };     // soldes fictifs cohérents avec les flux (−4 −1)
bB.soldes = { pUSD: "7000000", "USDC.e": "0", USDC: "0" };      // (+6 +1)
const mes = new Set([A, B]);

test("par adresse : le transfert de parts n'est ni une vente ni un achat ; coût inconnu côté destinataire signalé", () => {
  const a = analyser(pm, bA, { mesAdresses: mes }), b = analyser(pm, bB, { mesAdresses: mes });
  const tA = a.evenements.find(e => e.hash === hashDe(2));
  assert.equal(tA.categorie, "TRANSFERT_INTERNE");
  assert.equal(a.pnl.realiseOperations.toString(), "0");          // A n'a rien réalisé
  assert.equal(a.evenements.find(e => e.hash === hashDe(4)).categorie, "TRANSFERT_INTERNE");
  assert.ok(b.positions.anomalies.some(x => x.code === "cout_transfert_inconnu"));
});

test("consolidé : le coût suit les parts, résultat = 6 − 4, transferts exclus des dépôts et retraits, flux = Σ soldes", () => {
  const a = analyser(pm, bA, { mesAdresses: mes }), b = analyser(pm, bB, { mesAdresses: mes });
  const c = consolider(pm, [a, b], [bA, bB]);
  assert.equal(c.pnl.realiseOperations.toString(), "2");
  assert.equal(c.positions.anomalies.length, 0);
  assert.equal(c.evenements.filter(e => e.categorie === "DEPOT" || e.categorie === "RETRAIT").length, 0);
  const flux = c.controle.equations.find(e => e.actif === "pUSD");
  assert.equal(flux.calcule.toString(), "2");
  assert.equal(flux.observe.toString(), "2");
  assert.equal(flux.statut, "ok");
  assert.equal(new Set(c.evenements.map(e => e.id)).size, c.evenements.length);   // identifiants uniques
});
