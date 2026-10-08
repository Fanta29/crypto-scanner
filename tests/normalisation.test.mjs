import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliser } from "../assets/js/scanner/connecteurs/polymarket-polygon/normalisation.js";
import { MOI, EXCHANGE, CTF, PUSD, USDCE, NULLE, ligne, pusd, parts, bruts, hashDe } from "./aides/construire.mjs";

const YES = "111", NO = "222", COND = "0x" + "c".repeat(64);
const achat = n => ligne(n, { type: "TRADE", side: "BUY", size: 100, usdc_size: 41.2, price: 0.4, token_id: YES, condition_id: COND, outcome: "Oui", outcome_index: 0, title: "Marché A", event_slug: "cs2-a-b" });

test("ACHAT : espèces frais compris, notionnel, frais implicites, parts on-chain", () => {
  const n = normaliser(bruts({ activite: [achat(1)], pusd: [pusd(1, MOI, EXCHANGE, 41200000)], erc1155: [parts(1, EXCHANGE, MOI, YES, 100000000)] }));
  const e = n.evenements[0];
  assert.equal(e.categorie, "ACHAT");
  assert.equal(e.montantUsd.toString(), "41.2");
  assert.equal(e.notionnelUsd.toString(), "40");
  assert.equal(e.fraisUsd.toString(), "1.2");
  assert.deepEqual(e.entrees.map(m => [m.actif, m.quantite.toString()]), [["ctf:111", "100"]]);
  assert.deepEqual(e.sorties.map(m => [m.actif, m.quantite.toString()]), [["pUSD", "41.2"]]);
  assert.equal(n.anomalies.filter(a => a.niveau === "erreur").length, 0);
});

test("écart d'espèces sur une transaction : anomalie bloquante", () => {
  const n = normaliser(bruts({ activite: [achat(1)], pusd: [pusd(1, MOI, EXCHANGE, 41000000)], erc1155: [parts(1, EXCHANGE, MOI, YES, 100000000)] }));
  assert.ok(n.anomalies.some(a => a.code === "ecart_tx"));
});

test("écart de parts entre l'API et la chaîne : anomalie bloquante", () => {
  const n = normaliser(bruts({ activite: [achat(1)], pusd: [pusd(1, MOI, EXCHANGE, 41200000)], erc1155: [parts(1, EXCHANGE, MOI, YES, 99000000)] }));
  assert.ok(n.anomalies.some(a => a.code === "parts_ecart"));
});

test("REDEEM de marché simple : token_id vide, size = paiement ; parts détruites prises on-chain, paiement à l'issue gagnante", () => {
  const r = ligne(2, { type: "REDEEM", size: 100, usdc_size: 100, condition_id: COND, outcome: "Oui", title: "Marché A" });
  const n = normaliser(bruts({ activite: [achat(1), r],
    pusd: [pusd(1, MOI, EXCHANGE, 41200000), pusd(2, NULLE, MOI, 100000000)],
    erc1155: [parts(1, EXCHANGE, MOI, YES, 100000000), parts(2, MOI, "0xa1200000d0002264c9a1698e001292d00e1b00af", YES, 100000000), parts(2, MOI, "0xa1200000d0002264c9a1698e001292d00e1b00af", NO, 0)] }));
  const e = n.evenements.find(x => x.categorie === "REDEEM_GAGNANT");
  assert.deepEqual(e.sorties.filter(m => m.actif.startsWith("ctf")).map(m => [m.actif, m.quantite.toString()]), [["ctf:111", "100"]]);
  assert.deepEqual(e.position.allocation, { "ctf:111": "1" });
});

test("REDEEM à 0 → REDEEM_PERDANT ; rachat présent on-chain seulement → REDEEM_PERDANT d'origine onchain", () => {
  const r0 = ligne(3, { type: "REDEEM", size: 0, usdc_size: 0, condition_id: COND, outcome: "Oui" });
  const n = normaliser(bruts({ activite: [r0], erc1155: [
    parts(3, MOI, "0xa1200000d0002264c9a1698e001292d00e1b00af", NO, 5000000),
    parts(9, MOI, "0xada100db00ca00073811820692005400218fce1f", YES, 7000000)] }));
  assert.equal(n.evenements.find(e => e.hash === hashDe(3)).categorie, "REDEEM_PERDANT");
  const oc = n.evenements.find(e => e.hash === hashDe(9));
  assert.equal(oc.categorie, "REDEEM_PERDANT");
  assert.equal(oc.origine, "onchain");
});

test("chaque type documenté reçoit sa catégorie ; un type inconnu devient INCONNU, jamais écarté", () => {
  const cas = [["SPLIT", "SPLIT"], ["MERGE", "MERGE"], ["CONVERSION", "CONVERSION"], ["MIGRATION", "MIGRATION"],
    ["MAKER_REBATE", "REBATE"], ["TAKER_REBATE", "REBATE"], ["REWARD", "REWARD"], ["REFERRAL_REWARD", "REWARD"],
    ["YIELD", "REWARD"], ["DEPOSIT", "DEPOT"], ["WITHDRAWAL", "RETRAIT"], ["NOUVEAU_TYPE", "INCONNU"]];
  const lignes = cas.map(([t], i) => ligne(10 + i, { type: t, usdc_size: 1, size: 1, condition_id: t === "SPLIT" || t === "MERGE" ? COND : "" }));
  const n = normaliser(bruts({ activite: lignes, onchain: false }));
  cas.forEach(([t, c], i) => assert.equal(n.evenements.find(e => e.hash === hashDe(10 + i)).categorie, c, t));
  assert.equal(n.evenements.find(e => e.hash === hashDe(18)).sousType, "YIELD");
  assert.ok(n.anomalies.some(a => a.code === "type_inconnu"));
  assert.equal(n.evenements.length, cas.length);
});

test("TIP : sens IN/OUT ; transfert vers une de mes adresses → TRANSFERT_INTERNE", () => {
  const autre = "0x00000000000000000000000000000000000000bb";
  const n = normaliser(bruts({ activite: [ligne(30, { type: "TIP", side: "OUT", size: 5, usdc_size: 5 }), ligne(31, { type: "TIP", side: "IN", size: 2, usdc_size: 2 })],
    pusd: [pusd(30, MOI, autre, 5000000), pusd(31, "0x00000000000000000000000000000000000000cc", MOI, 2000000)] }), { mesAdresses: new Set([autre]) });
  const [a, b] = [n.evenements.find(e => e.hash === hashDe(30)), n.evenements.find(e => e.hash === hashDe(31))];
  assert.equal(a.categorie, "TRANSFERT_INTERNE"); assert.equal(a.contrepartie, autre); assert.equal(a.interne, true);
  assert.equal(b.categorie, "DEPOT"); assert.equal(b.sousType, "TIP");
});

test("RETRAIT : contrepartie = destination de l'USDC.e, pas son émetteur", () => {
  const offramp = "0xc417fd8e9661c0d2120b64a04bb3278c17e99db1", pont = "0x4cd00e387622c35bddb9b4c962c136462338bc31";
  const n = normaliser(bruts({ activite: [ligne(40, { type: "WITHDRAWAL", size: 50, usdc_size: 50 })],
    pusd: [pusd(40, MOI, PUSD, 50000000)],
    usdce: [{ ...pusd(40, offramp, MOI, 50000000), contractAddress: USDCE }, { ...pusd(40, MOI, pont, 50000000), contractAddress: USDCE }] }));
  assert.equal(n.evenements[0].contrepartie, pont);
});

test("stablecoin hors collatéral reçu hors Polymarket : DEPOT signalé HORS_COLLATERAL", () => {
  const n = normaliser(bruts({ usdc: [{ ...pusd(50, "0x00000000000000000000000000000000000000dd", MOI, 500000000), contractAddress: "0x3c49" }] }));
  assert.equal(n.evenements[0].categorie, "DEPOT");
  assert.equal(n.evenements[0].sousType, "HORS_COLLATERAL");
  assert.equal(n.evenements[0].montantUsd.toString(), "500");
});

test("doublon exact retiré et compté ; réintégré si le rapprochement on-chain prouve qu'il était réel", () => {
  const a = achat(60);
  // Cas 1 : la chaîne ne montre qu'un achat → doublon retiré.
  let n = normaliser(bruts({ activite: [a, a], pusd: [pusd(60, MOI, EXCHANGE, 41200000)], erc1155: [parts(60, EXCHANGE, MOI, YES, 100000000)] }));
  assert.equal(n.dedoublonnage.retires, 1);
  assert.equal(n.evenements.filter(e => e.categorie === "ACHAT").length, 1);
  // Cas 2 : la chaîne montre deux paiements identiques → la seconde ligne est réintégrée.
  n = normaliser(bruts({ activite: [a, a], pusd: [pusd(60, MOI, EXCHANGE, 41200000), pusd(60, MOI, EXCHANGE, 41200000)], erc1155: [parts(60, EXCHANGE, MOI, YES, 200000000)] }));
  assert.equal(n.dedoublonnage.reintegres, 1);
  assert.equal(n.anomalies.filter(x => x.code === "ecart_tx").length, 0);
});

test("jeton ERC-1155 étranger : signalé, sans effet sur les positions", () => {
  const n = normaliser(bruts({ erc1155: [parts(70, "0x00000000000000000000000000000000000000ee", MOI, "999", 1, "0x00000000000000000000000000000000000000f1")] }));
  assert.ok(n.anomalies.some(a => a.code === "erc1155_tiers"));
  assert.equal(n.evenements.length, 0);
});

test("sans données on-chain : mode dégradé signalé, parts du trade prises dans l'API", () => {
  const n = normaliser(bruts({ activite: [achat(80)], onchain: false }));
  assert.ok(n.anomalies.some(a => a.code === "sans_onchain"));
  assert.equal(n.evenements[0].entrees[0].actif, "api:111");
});
