/* controles.js — contrôles propres au connecteur Polymarket, rendus au format commun
   { id, libelle, statut: "ok" | "ecart" | "info" | "non_fait", attendu, obtenu, ecart, detail, refs }. */
import { Dec, somme } from "../../decimal.js";
import { REGISTRES_PARTS } from "./contrats.js";

const TOLERANCE_POSITIONS_API = Dec.de("0.0001");   // /v2/positions arrondit current_size à 4 décimales

function verif(id, libelle, attendu, obtenu, { tolerance = Dec.ZERO, detail = "", refs = [], info = false } = {}) {
  if (attendu === null || attendu === undefined) return { id, libelle, statut: "non_fait", attendu: null, obtenu: obtenu?.toString() ?? null, ecart: null, detail, refs };
  const a = Dec.de(attendu), o = Dec.de(obtenu), e = o.moins(a);
  const statut = info ? "info" : e.abs().sup(tolerance) ? "ecart" : "ok";
  return { id, libelle, statut, attendu: a.toString(), obtenu: o.toString(), ecart: e.toString(),
    ecartRelatif: a.estZero() ? null : e.divise(a).fois(100).aFixe(4) + " %", detail, refs };
}

export function controler(bruts, norm, calc) {
  const v = [];
  const trades = norm.evenements.filter(e => e.categorie === "ACHAT" || e.categorie === "VENTE");

  // Volume : notre recalcul contre /v2/user-volume.
  const parts = somme(trades, e => e.parts ?? 0);
  const notionnel = somme(trades, e => e.notionnelUsd ?? 0);
  v.push(verif("volume_parts", "Volume en parts (achats + ventes) = /v2/user-volume.volume", bruts.volume?.volume ?? null, parts,
    { detail: "Définition Polymarket du volume affiché sur le profil : parts, deux côtés." }));
  v.push(verif("volume_notionnel", "Notionnel Σ parts × prix = /v2/user-volume.volume_usdc", bruts.volume?.volume_usdc ?? null, notionnel,
    { tolerance: Dec.de("0.000001").fois(trades.length || 1), detail: "Écart toléré : arrondi à 6 décimales de chaque produit parts × prix." }));
  v.push(verif("nombre_trades", "Nombre de trades = /v2/user-volume.trade_count", bruts.volume?.trade_count ?? null, trades.length));

  // Espèces, transaction par transaction.
  if (bruts.onchain) {
    const ecarts = norm.rapprochementTx.filter(r => !r.ecart.estZero());
    v.push({ id: "tx_par_tx", libelle: "Espèces : montant API = mouvement pUSD on-chain, pour chaque transaction",
      statut: ecarts.length ? "ecart" : "ok", attendu: "0", obtenu: String(ecarts.length), ecart: String(ecarts.length),
      detail: `${norm.rapprochementTx.length} transactions rapprochées ; ${ecarts.length} en écart.`, refs: ecarts.map(r => r.hash) });
  } else {
    v.push({ id: "tx_par_tx", libelle: "Espèces transaction par transaction", statut: "non_fait", detail: "Données on-chain indisponibles.", refs: [] });
  }

  // Parts : solde de chaque position (moteur) contre la somme brute des transferts ERC-1155.
  if (bruts.onchain) {
    const brut = new Map(), adr = bruts.adresse;
    for (const t of bruts.onchain.erc1155) {
      const reg = REGISTRES_PARTS[t.contractAddress.toLowerCase()];
      if (!reg) continue;
      const k = `${reg}:${t.tokenID}`, q = Dec.deUnites(t.tokenValue, 6);
      brut.set(k, (brut.get(k) || Dec.ZERO).plus(t.to.toLowerCase() === adr ? q : Dec.ZERO).moins(t.from.toLowerCase() === adr ? q : Dec.ZERO));
    }
    const moteur = new Map(calc.positions.map(p => [p.actif, p.quantite]));
    const cles = new Set([...brut.keys(), ...moteur.keys()].filter(k => !k.startsWith("api:")));
    const ko = [...cles].filter(k => !(brut.get(k) ?? Dec.ZERO).egal(moteur.get(k) ?? Dec.ZERO));
    v.push({ id: "parts_onchain", libelle: "Parts : solde calculé = somme des transferts ERC-1155 on-chain, pour chaque position",
      statut: ko.length ? "ecart" : "ok", attendu: "0", obtenu: String(ko.length), ecart: String(ko.length),
      detail: `${cles.size} positions comparées ; ${ko.length} en écart.`, refs: ko.slice(0, 50) });
  }

  // Parts détenues : moteur contre l'API des positions (arrondie à 4 décimales).
  const api = new Map();
  // OPEN puis CLOSED : l'API range en CLOSED les reliquats (« dust ») encore détenus.
  for (const s of ["CLOSED", "OPEN"]) for (const r of bruts.positions?.[s] || []) api.set(r.token_id, Dec.de(r.current_size));
  for (const r of bruts.positionsCombos || []) api.set(r.combo_position_id, Dec.de(r.current_size));
  const nos = calc.positions.filter(p => p.quantite.signe() > 0);
  const koApi = [];
  for (const p of nos) {
    const t = p.actif.split(":")[1];
    const a = api.get(t);
    if (a === undefined) { if (p.quantite.sup(TOLERANCE_POSITIONS_API)) koApi.push({ t, nous: p.quantite.toString(), api: "absente" }); continue; }
    if (p.quantite.moins(a).abs().sup(TOLERANCE_POSITIONS_API)) koApi.push({ t, nous: p.quantite.toString(), api: a.toString() });
  }
  for (const [t, a] of api) if (a.signe() > 0 && !nos.some(p => p.actif.endsWith(":" + t))) koApi.push({ t, nous: "0", api: a.toString() });
  // Constat (docs/CONSTATS.md) : l'API omet certains reliquats de quelques millièmes de part
  // pourtant détenus on-chain. Un écart limité à ce cas est « expliqué », pas « conforme ».
  const SEUIL_RELIQUAT = Dec.de("0.01");
  const seulementReliquats = koApi.length > 0 && koApi.every(x => x.api === "absente" && Dec.de(x.nous).inf(SEUIL_RELIQUAT));
  v.push({ id: "parts_api", libelle: "Parts détenues : calcul = /v2/positions et /v2/positions/combos (tolérance 0,0001 part, arrondi de l'API)",
    statut: koApi.length ? (seulementReliquats ? "explique" : "ecart") : "ok",
    explication: seulementReliquats ? `Reliquats de moins de 0,01 part détenus on-chain mais absents de l'API Polymarket (${koApi.length}). La quantité on-chain fait foi.` : null, attendu: "0", obtenu: String(koApi.length), ecart: String(koApi.length),
    detail: `${nos.length} positions détenues ; ${koApi.length} écarts au-delà de la tolérance. Les reliquats de moins de 0,0001 part sont ignorés par l'API.`,
    refs: koApi.slice(0, 50).map(x => `${x.t.slice(0, 16)}… nous ${x.nous} / API ${x.api}`) });

  // Marchés distincts et frais : comparaisons informatives.
  const marches = new Set(trades.map(e => e.position?.conditionId).filter(Boolean)).size;
  v.push(verif("marches_distincts", "Marchés distincts tradés (comparé à /v2/user-stats.trades)", bruts.stats?.trades ?? null, marches,
    { info: true, detail: "Information : la définition exacte de Polymarket (marchés, combinés) n'est pas documentée." }));
  const frais = somme(trades, e => e.fraisUsd);
  const fp = bruts.stats?.all_time_pnl?.fees_paid;
  v.push(verif("frais", "Frais implicites (espèces − notionnel) comparés à /v2/user-stats fees_paid", fp === undefined || fp === null ? null : Dec.de(fp).neg(), frais,
    { info: true, detail: "Information : Polymarket publie ce total à un instant d'observation (source_block) qui peut précéder la capture." }));
  return v;
}
