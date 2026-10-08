/* normalisation.js — traduction des données brutes Polymarket vers le format normalisé.

   Principe : chaque ligne de la Data API v2 est rapprochée des mouvements on-chain de
   la même transaction (pUSD et parts ERC-1155). Les parts reprises dans l'événement
   sont celles qui ont réellement bougé on-chain : la Data API ne les donne pas toujours
   (un REDEEM de marché simple a un token_id vide et un champ size égal au paiement,
   pas aux parts détruites). Les transactions on-chain sans ligne d'API deviennent des
   événements d'origine « onchain », jamais des oublis silencieux.

   Constats à l'origine de ces règles : docs/CONSTATS.md. */
import { Dec, somme } from "../../decimal.js";
import { evenement, anomalie, STABLES } from "../../modele.js";
import { JETONS, REGISTRES_PARTS, CONTRATS, ADRESSE_NULLE } from "./contrats.js";

const CONNECTEUR = "polymarket-polygon";
const BASE = { connecteur: CONNECTEUR, chaine: "polygon", protocole: "polymarket" };

/** Actif d'une part : préfixe du registre + identifiant ERC-1155. */
export const actifPart = (registre, tokenId) => `${registre}:${tokenId}`;
const estPart = actif => actif.startsWith("ctf:") || actif.startsWith("v2:");

/** Clé de déduplication d'une ligne d'activité (multiensemble). */
export function cleLigne(r) {
  return [r.transaction_hash, r.type, r.token_id, r.side, String(r.size), String(r.usdc_size),
    String(r.price), r.timestamp, r.condition_id, Boolean(r.is_combo)].join("|");
}

/** Montant Data API → Dec, avec contrôle de précision (le pUSD a 6 décimales). */
function montant(v, champ, ref, anomalies) {
  if (typeof v !== "number" && typeof v !== "string") {
    anomalies.push(anomalie("erreur", "champ_manquant", `Champ ${champ} absent ou invalide`, [ref]));
    return Dec.ZERO;
  }
  const x = Dec.de(v);
  if (champ !== "price" && x.decimales() > 6) {
    anomalies.push(anomalie("alerte", "precision", `${champ} = ${x} porte plus de 6 décimales`, [ref]));
  }
  return x;
}

/** Regroupe les transferts on-chain par transaction. */
function indexerOnchain(onchain, adresse) {
  const parTx = new Map();
  const tx = h => {
    if (!parTx.has(h)) parTx.set(h, { especes: new Map(), parts: new Map(), transferts: [], bloc: null, horodatage: null, tiers: [] });
    return parTx.get(h);
  };
  if (!onchain) return parTx;
  for (const [actif, liste] of Object.entries(onchain.erc20 || {})) {
    const dec = JETONS[actif].decimales;
    for (const t of liste) {
      const e = tx(t.hash);
      const v = Dec.deUnites(t.value, dec);
      const entrant = t.to.toLowerCase() === adresse, sortant = t.from.toLowerCase() === adresse;
      const net = (entrant ? v : Dec.ZERO).moins(sortant ? v : Dec.ZERO);
      e.especes.set(actif, (e.especes.get(actif) || Dec.ZERO).plus(net));
      e.transferts.push({ actif, de: t.from.toLowerCase(), vers: t.to.toLowerCase(), valeur: v });
      e.bloc = Number(t.blockNumber); e.horodatage = Number(t.timeStamp);
    }
  }
  for (const t of onchain.erc1155 || []) {
    const e = tx(t.hash);
    const registre = REGISTRES_PARTS[t.contractAddress.toLowerCase()];
    e.bloc = Number(t.blockNumber); e.horodatage = Number(t.timeStamp);
    if (!registre) { e.tiers.push(t); continue; }        // jeton ERC-1155 étranger à Polymarket
    const actif = actifPart(registre, t.tokenID);
    const v = Dec.deUnites(t.tokenValue, 6);
    const entrant = t.to.toLowerCase() === adresse, sortant = t.from.toLowerCase() === adresse;
    const net = (entrant ? v : Dec.ZERO).moins(sortant ? v : Dec.ZERO);
    e.parts.set(actif, (e.parts.get(actif) || Dec.ZERO).plus(net));
    e.transferts.push({ actif, de: t.from.toLowerCase(), vers: t.to.toLowerCase(), valeur: v });
  }
  return parTx;
}

/** Signe du flux d'espèces d'une ligne d'API, vu du wallet : +1 entrée, −1 sortie. */
function sensEspeces(r) {
  switch (r.type) {
    case "TRADE": return r.side === "BUY" ? -1 : r.side === "SELL" ? 1 : 0;
    case "SPLIT": return -1;
    case "WITHDRAWAL": return -1;
    case "TIP": return r.side === "OUT" ? -1 : r.side === "IN" ? 1 : 0;
    case "MIGRATION": return 0;
    case "MERGE": case "REDEEM": case "CONVERSION": case "DEPOSIT":
    case "REWARD": case "REFERRAL_REWARD": case "YIELD": case "MAKER_REBATE": case "TAKER_REBATE": return 1;
    default: return 0;
  }
}

function categorie(r, usdc) {
  switch (r.type) {
    case "TRADE": return r.side === "BUY" ? ["ACHAT"] : r.side === "SELL" ? ["VENTE"] : ["INCONNU", "TRADE sans côté"];
    case "REDEEM": return usdc.signe() > 0 ? ["REDEEM_GAGNANT"] : ["REDEEM_PERDANT"];
    case "SPLIT": return ["SPLIT"];
    case "MERGE": return ["MERGE"];
    case "CONVERSION": return ["CONVERSION"];
    case "MIGRATION": return ["MIGRATION"];
    case "MAKER_REBATE": return ["REBATE", "MAKER_REBATE"];
    case "TAKER_REBATE": return ["REBATE", "TAKER_REBATE"];
    case "REWARD": return ["REWARD"];
    case "REFERRAL_REWARD": return ["REWARD", "REFERRAL_REWARD"];
    case "YIELD": return ["REWARD", "YIELD"];
    case "DEPOSIT": return ["DEPOT"];
    case "WITHDRAWAL": return ["RETRAIT"];
    case "TIP": return r.side === "IN" ? ["DEPOT", "TIP"] : r.side === "OUT" ? ["RETRAIT", "TIP"] : ["INCONNU", "TIP sans sens"];
    default: return ["INCONNU", r.type || "type absent"];
  }
}

/**
 * Normalise les données brutes d'une adresse.
 * bruts : { adresse, activite: [...], onchain: { erc20: {pUSD, "USDC.e", USDC}, erc1155 } | null }
 * contexte : { mesAdresses: Set<string> }
 * Renvoie { evenements, anomalies, dedoublonnage, rapprochementTx, libelles }.
 */
export function normaliser(bruts, { mesAdresses = new Set() } = {}) {
  const adresse = bruts.adresse.toLowerCase();
  const anomalies = [];
  const onchain = indexerOnchain(bruts.onchain, adresse);
  const avecOnchain = Boolean(bruts.onchain);

  // 1. Dédoublonnage des lignes d'API (multiensemble). Un doublon exact n'est retiré que
  //    si le rapprochement on-chain de sa transaction le confirme (étape 3).
  const vus = new Map(), lignes = [], retires = [];
  for (const r of bruts.activite) {
    const k = cleLigne(r);
    if (vus.has(k)) { retires.push(r); continue; }
    vus.set(k, true); lignes.push(r);
  }

  // Libellé de chaque part, appris des trades (sert à attribuer le paiement d'un rachat).
  const libelles = new Map();
  for (const r of lignes) if (r.token_id && r.outcome) libelles.set(r.token_id, r.outcome);

  const parTx = new Map();
  for (const r of lignes) {
    if (!parTx.has(r.transaction_hash)) parTx.set(r.transaction_hash, []);
    parTx.get(r.transaction_hash).push(r);
  }

  // 2. Rapprochement des espèces transaction par transaction (pUSD, en unités exactes).
  const rapprochementTx = [];
  for (const [h, rs] of parTx) {
    const api = somme(rs, r => Dec.de(r.usdc_size).fois(sensEspeces(r)));
    const oc = onchain.get(h)?.especes.get("pUSD") ?? Dec.ZERO;
    rapprochementTx.push({ hash: h, api, onchain: oc, ecart: api.moins(oc), present: onchain.has(h) });
  }
  // 3. Un doublon retiré dont la transaction ne concorde plus est réintégré.
  const reintegres = [];
  if (avecOnchain) {
    for (const r of retires) {
      const rt = rapprochementTx.find(x => x.hash === r.transaction_hash);
      const delta = Dec.de(r.usdc_size).fois(sensEspeces(r));
      if (rt && !rt.ecart.estZero() && rt.ecart.plus(delta).estZero()) {
        parTx.get(r.transaction_hash).push(r); reintegres.push(r);
        rt.api = rt.api.plus(delta); rt.ecart = rt.api.moins(rt.onchain);
      }
    }
  }
  const dedoublonnage = { lus: bruts.activite.length, retires: retires.length - reintegres.length, reintegres: reintegres.length,
    exemples: retires.filter(r => !reintegres.includes(r)).slice(0, 20).map(r => r.transaction_hash) };
  for (const rt of rapprochementTx) {
    if (avecOnchain && !rt.ecart.estZero()) {
      anomalies.push(anomalie("erreur", "ecart_tx", `Transaction ${rt.hash} : API ${rt.api} pUSD, on-chain ${rt.onchain} pUSD`, [rt.hash]));
    }
  }

  // 4. Événements issus de l'API, complétés par les parts on-chain.
  const evenements = [];
  const occurrences = new Map();
  for (const [h, rs] of parTx) {
    const oc = onchain.get(h);
    const partsRestantes = new Map(oc ? oc.parts : []);
    // Les lignes qui ont un token_id prennent d'abord leurs propres parts.
    const ordre = [...rs].sort((a, b) => (b.token_id ? 1 : 0) - (a.token_id ? 1 : 0));
    const sansPart = ordre.filter(r => !r.token_id && r.condition_id);
    for (const r of ordre) {
      const ref = `${h}/${r.type}`;
      const usdc = montant(r.usdc_size, "usdc_size", ref, anomalies);
      const size = montant(r.size, "size", ref, anomalies);
      const prix = r.type === "TRADE" ? montant(r.price, "price", ref, anomalies) : null;
      const [cat, sousType] = categorie(r, usdc);
      const notes = [];
      if (cat === "INCONNU") anomalies.push(anomalie("alerte", "type_inconnu", `Type « ${r.type} » non reconnu (${sousType})`, [h]));

      const entrees = [], sorties = [];
      const sens = sensEspeces(r);
      if (!usdc.estZero() && sens !== 0) (sens > 0 ? entrees : sorties).push({ actif: "pUSD", quantite: usdc });

      // Parts : celles qui ont bougé on-chain dans cette transaction.
      let registre = null;
      const prendre = actif => {
        const q = partsRestantes.get(actif);
        if (q === undefined) return;
        partsRestantes.delete(actif);
        if (q.signe() > 0) entrees.push({ actif, quantite: q, libelle: libelles.get(actif.split(":")[1]) });
        if (q.signe() < 0) sorties.push({ actif, quantite: q.abs(), libelle: libelles.get(actif.split(":")[1]) });
        registre = actif.split(":")[0];
      };
      if (oc) {
        if (r.token_id) {
          for (const reg of ["ctf", "v2"]) prendre(actifPart(reg, r.token_id));
          if (r.type === "TRADE") {
            const q = [...entrees, ...sorties].find(m => estPart(m.actif) && m.actif.endsWith(":" + r.token_id));
            if (!q) anomalies.push(anomalie("erreur", "parts_absentes", `Trade sans mouvement de parts on-chain (${r.token_id.slice(0, 12)}…)`, [h]));
            else if (!q.quantite.egal(size)) anomalies.push(anomalie("erreur", "parts_ecart", `Trade : ${size} parts selon l'API, ${q.quantite} on-chain`, [h]));
          }
        }
        // Une ligne sans token_id (rachat de marché simple…) prend les parts restantes de la transaction.
        if (!r.token_id && sansPart.length === 1 && sansPart[0] === r) for (const actif of [...partsRestantes.keys()]) prendre(actif);
      } else if (r.token_id && r.type === "TRADE") {
        // Sans données on-chain : parts selon l'API (registre inconnu, noté « api »).
        (r.side === "BUY" ? entrees : sorties).push({ actif: actifPart("api", r.token_id), quantite: size, libelle: r.outcome });
        registre = "api";
      }

      // Rachat : le paiement va à la part dont le libellé est l'issue gagnante.
      let allocation = null;
      if (r.type === "REDEEM") {
        const sortiesParts = sorties.filter(m => estPart(m.actif));
        const gagnante = sortiesParts.find(m => m.libelle && m.libelle === r.outcome);
        if (gagnante) allocation = { [gagnante.actif]: "1" };
        if (!oc && !r.token_id) notes.push("Parts détruites inconnues sans données on-chain : solde complet de la condition présumé.");
      }

      let notionnel = null, frais = Dec.ZERO;
      if (r.type === "TRADE" && prix) {
        notionnel = size.fois(prix).arrondi(6);
        frais = r.side === "BUY" ? usdc.moins(notionnel) : notionnel.moins(usdc);
        if (frais.inf("-0.01")) anomalies.push(anomalie("alerte", "frais_negatifs", `Frais implicites négatifs (${frais})`, [h]));
      }

      // Contrepartie des flux avec l'extérieur.
      let contrepartie = null;
      if (["DEPOSIT", "WITHDRAWAL", "TIP"].includes(r.type) && oc) {
        const autres = oc.transferts.filter(t => STABLES.has(t.actif));
        if (r.type === "WITHDRAWAL") {
          // Destination : premier transfert sortant du wallet vers une adresse qui n'est pas un
          // contrat Polymarket (le pUSD part vers le contrat pUSD, l'USDC.e vers le pont).
          const sortie = autres.find(t => t.de === adresse && t.actif !== "pUSD" && !CONTRATS[t.vers])
            ?? autres.find(t => t.de === adresse && !CONTRATS[t.vers]);
          contrepartie = sortie?.vers ?? null;
          notes.push("Contrepartie : adresse de sortie sur Polygon (souvent un pont) ; la destination finale sur une autre chaîne n'est pas établie.");
        } else if (r.type === "DEPOSIT") {
          const entree = autres.find(t => t.vers === adresse && t.de !== ADRESSE_NULLE && !CONTRATS[t.de]);
          contrepartie = entree?.de ?? null;
          if (!contrepartie) notes.push("Provenance non lisible sur Polygon : pUSD frappé directement sur le wallet (dépôt via le pont ou l'onramp Polymarket).");
        } else {
          const t = autres.find(t => t.actif === "pUSD" && (t.de === adresse ? !CONTRATS[t.vers] : !CONTRATS[t.de]));
          contrepartie = t ? (t.de === adresse ? t.vers : t.de) : null;
        }
      }
      const interne = contrepartie !== null && mesAdresses.has(contrepartie);

      const base = `pm:${h}:${r.type}:${r.token_id || r.condition_id || "-"}`;
      const n = (occurrences.get(base) || 0); occurrences.set(base, n + 1);
      evenements.push(evenement({
        ...BASE, id: n ? `${base}:${n}` : base, adresse,
        horodatage: r.timestamp, bloc: oc?.bloc ?? null, hash: h,
        categorie: interne && (cat === "DEPOT" || cat === "RETRAIT") ? "TRANSFERT_INTERNE" : cat,
        sousType: sousType ?? (r.is_combo ? "COMBINE" : null),
        entrees, sorties,
        montantUsd: usdc, notionnelUsd: notionnel, fraisUsd: frais,
        position: r.condition_id ? {
          marche: r.title || null, conditionId: r.condition_id, tokenId: r.token_id || null,
          issue: r.outcome || null, combine: Boolean(r.is_combo), registre,
          slug: r.slug || null, evenement: r.event_slug || null, allocation,
          solderCondition: !oc && r.type === "REDEEM" && !r.token_id ? r.condition_id : null
        } : null,
        parts: r.type === "TRADE" ? size : null,
        prix,
        contrepartie, interne,
        origine: oc ? "api+onchain" : "api",
        sourceBrute: { source: "data-api/v2/activity", cle: cleLigne(r) },
        notes
      }));
    }
    // Parts on-chain non attribuées à une ligne de la transaction.
    for (const [actif, q] of partsRestantes) {
      if (q.estZero()) continue;
      anomalies.push(anomalie("erreur", "parts_non_attribuees", `${q} parts ${actif.slice(0, 18)}… non rattachées à une ligne d'API`, [h]));
      evenements.push(evenement({
        ...BASE, id: `oc:${h}:parts:${actif}`, adresse, horodatage: oc.horodatage, bloc: oc.bloc, hash: h,
        categorie: "INCONNU", sousType: "PARTS_NON_RATTACHEES",
        entrees: q.signe() > 0 ? [{ actif, quantite: q }] : [], sorties: q.signe() < 0 ? [{ actif, quantite: q.abs() }] : [],
        origine: "onchain", notes: ["Mouvement de parts présent on-chain, absent de la Data API pour cette transaction."]
      }));
    }
  }

  // 5. Transactions présentes on-chain seulement.
  const onchainSeul = [];
  for (const [h, oc] of onchain) {
    for (const t of oc.tiers) {
      anomalies.push(anomalie("info", "erc1155_tiers", `Jeton ERC-1155 étranger à Polymarket reçu ou envoyé (${t.contractAddress}) — possible spam, ignoré dans les calculs`, [h]));
    }
    if (parTx.has(h)) {
      // Actifs non-pUSD dans une transaction d'API : ils doivent s'annuler (ex. chemin de retrait par USDC.e).
      for (const [actif, q] of oc.especes) {
        if (actif !== "pUSD" && !q.estZero()) {
          anomalies.push(anomalie("alerte", "actif_hors_collateral", `${q} ${actif} net dans une transaction Polymarket`, [h]));
        }
      }
      continue;
    }
    const parts = [...oc.parts].filter(([, q]) => !q.estZero());
    const especes = [...oc.especes].filter(([, q]) => !q.estZero());
    onchainSeul.push({ hash: h, parts: parts.length, especes: especes.length });
    if (parts.length === 0 && especes.length === 0) {
      anomalies.push(anomalie("info", "tx_sans_effet", "Transaction on-chain sans ligne d'API et sans effet net (transferts de montant nul)", [h]));
      continue;
    }
    const entrees = [], sorties = [];
    for (const [actif, q] of [...parts, ...especes]) (q.signe() > 0 ? entrees : sorties).push({ actif, quantite: q.abs(), libelle: libelles.get(actif.split(":")[1]) });
    const sortiesParts = sorties.filter(m => estPart(m.actif));
    const vers = new Set(oc.transferts.filter(t => estPart(t.actif) && t.de === adresse).map(t => t.vers));
    const versProtocole = [...vers].every(v => CONTRATS[v]);
    let cat = "INCONNU", sousType = "ONCHAIN_SEUL", notes = ["Transaction présente on-chain, absente de la Data API."];
    let contrepartie = null, montantUsd = Dec.ZERO;
    if (sortiesParts.length > 0 && entrees.length === 0 && especes.length === 0 && versProtocole) {
      cat = "REDEEM_PERDANT"; sousType = "ONCHAIN_SEUL";
      notes.push("Parts remises à un contrat Polymarket sans paiement : traité comme un rachat à 0 (position perdante soldée).");
    } else if (parts.length === 0 && especes.length > 0) {
      const ext = oc.transferts.filter(t => STABLES.has(t.actif) && !CONTRATS[t.de === adresse ? t.vers : t.de]);
      if (ext.length > 0) {
        const t = ext[0];
        const entrant = t.vers === adresse;
        contrepartie = entrant ? t.de : t.vers;
        cat = mesAdresses.has(contrepartie) ? "TRANSFERT_INTERNE" : entrant ? "DEPOT" : "RETRAIT";
        sousType = especes.some(([a]) => a !== "pUSD") ? "HORS_COLLATERAL" : "ONCHAIN_SEUL";
        montantUsd = somme(especes, ([, q]) => q.abs());
        if (sousType === "HORS_COLLATERAL") notes.push("Stablecoin autre que pUSD : hors du solde Polymarket tant qu'il n'est pas converti.");
      }
    }
    if (cat === "INCONNU") anomalies.push(anomalie("alerte", "onchain_inexplique", "Transaction on-chain sans ligne d'API, non classable automatiquement", [h]));
    evenements.push(evenement({
      ...BASE, id: `oc:${h}`, adresse, horodatage: oc.horodatage, bloc: oc.bloc, hash: h,
      categorie: cat, sousType, entrees, sorties, montantUsd, contrepartie,
      interne: cat === "TRANSFERT_INTERNE",
      position: sortiesParts.length ? { marche: null, conditionId: null, tokenId: sortiesParts[0].actif.split(":")[1], issue: sortiesParts[0].libelle ?? null, combine: false, registre: sortiesParts[0].actif.split(":")[0] } : null,
      origine: "onchain", sourceBrute: { source: "etherscan", hash: h }, notes
    }));
  }

  if (!avecOnchain) anomalies.push(anomalie("alerte", "sans_onchain", "Données on-chain absentes : parts et espèces non vérifiées, rachats de marchés simples estimés."));
  return { evenements, anomalies, dedoublonnage, rapprochementTx, onchainSeul, libelles };
}
