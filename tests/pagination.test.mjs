import { test } from "node:test";
import assert from "node:assert/strict";
import { activite, parcourir } from "../assets/js/scanner/sources/data-api.js";
import { clientEtherscan } from "../assets/js/scanner/sources/etherscan.js";
import { fauxTransport } from "./aides/transport.mjs";

// Serveur simulé paginé par clé (horodatage, séquence), comme /v2/activity :
// le curseur désigne la dernière clé servie.
function serveurActivite(lignes, taille) {
  const tri = [...lignes].sort((a, b) => b.timestamp - a.timestamp || b.seq - a.seq);
  return fauxTransport(u => {
    const c = u.searchParams.get("cursor");
    const debut = c ? tri.findIndex(r => `${r.timestamp}:${r.seq}` === c) + 1 : 0;
    const page = tri.slice(debut, debut + taille);
    const plus = debut + taille < tri.length;
    return { body: { data: page.map(({ seq, ...r }) => r), pagination: { limit: taille, offset: debut, has_more: plus, next_cursor: plus ? `${page.at(-1).timestamp}:${page.at(-1).seq}` : null } } };
  });
}

test("activité : paramètres qui neutralisent les valeurs par défaut piégeuses", async () => {
  const t = serveurActivite([], 10);
  await activite("0xabc", { transport: t });
  const q = t.appels[0].searchParams;
  assert.equal(q.get("start"), "1");
  assert.equal(q.get("exclude_deposits_withdrawals"), "false");
  assert.ok(q.get("type").split(",").includes("TIP"));
  assert.equal(q.get("limit"), "1000");
});

test("pagination : horodatages identiques à cheval sur une limite de page, rien perdu ni doublé", async () => {
  // 25 lignes dont 12 partagent le même horodatage, avec des pages de 5 : la seconde
  // « 1000 » est coupée par plusieurs limites de page.
  const lignes = [];
  for (let i = 0; i < 25; i++) lignes.push({ timestamp: i >= 6 && i < 18 ? 1000 : 900 + i, seq: i, transaction_hash: "0x" + String(i).padStart(64, "0"), type: "TRADE" });
  const t = serveurActivite(lignes, 5);
  const r = await activite("0xabc", { transport: t });
  assert.equal(r.lignes.length, 25);
  assert.equal(new Set(r.lignes.map(l => l.transaction_hash)).size, 25);
  assert.equal(r.pages.length, 5);
});

test("pagination : arrêt anticipé pour la mise à jour incrémentale", async () => {
  const lignes = Array.from({ length: 30 }, (_, i) => ({ timestamp: 100 + i, seq: i, transaction_hash: "0x" + i }));
  const t = serveurActivite(lignes, 10);
  const r = await activite("0xabc", { transport: t, depuis: 125 });
  assert.equal(t.appels.length, 1);                    // la 1re page (129…120) passe déjà sous 125
  assert.ok(r.lignes.every(l => l.timestamp >= 120));
});

test("pagination : has_more vrai sans curseur est une erreur, jamais une fin silencieuse", async () => {
  const t = fauxTransport(() => ({ body: { data: [{}], pagination: { has_more: true, next_cursor: null } } }));
  await assert.rejects(parcourir("/v2/activity", {}, { transport: t }), /has_more vrai sans next_cursor/);
});

test("reprise après 429 en respectant Retry-After", async () => {
  let n = 0;
  const t = fauxTransport(() => (++n === 1 ? { status: 429, headers: { "retry-after": "0.01" }, body: "lent" } : { body: { data: [], pagination: { has_more: false, next_cursor: null } } }));
  const reprises = [];
  const r = await parcourir("/v2/activity", {}, { transport: t, surReprise: x => reprises.push(x) });
  assert.equal(r.lignes.length, 0);
  assert.equal(reprises.length, 1);
  assert.equal(reprises[0].attente, 10);
});

test("Etherscan : fenêtre de 10 000 résultats contournée par blocs, bloc de bord relu en entier", async () => {
  // 23 500 transferts ; les blocs ont 7 transferts chacun, donc chaque fenêtre de 10 000
  // coupe un bloc en deux. Le client doit tout récupérer, sans doublon.
  const tous = Array.from({ length: 23500 }, (_, i) => ({ blockNumber: String(Math.floor(i / 7)), hash: "0x" + i, value: "1" }));
  const t = fauxTransport(u => {
    const debut = Number(u.searchParams.get("startblock")), page = Number(u.searchParams.get("page")), taille = Number(u.searchParams.get("offset"));
    if (page * taille > 10000) return { body: { status: "0", message: "Result window is too large", result: null } };
    const filtres = tous.filter(x => Number(x.blockNumber) >= debut);
    const r = filtres.slice((page - 1) * taille, page * taille);
    return { body: r.length ? { status: "1", message: "OK", result: r } : { status: "0", message: "No transactions found", result: [] } };
  });
  const c = clientEtherscan({ base: "https://exemple.invalid/api", transport: t, intervalle: 0 });
  const r = await c.transfertsErc20("0xabc", "0xdef");
  assert.equal(r.transferts.length, 23500);
  assert.equal(new Set(r.transferts.map(x => x.hash)).size, 23500);
  assert.ok(r.fenetres >= 3);
});
