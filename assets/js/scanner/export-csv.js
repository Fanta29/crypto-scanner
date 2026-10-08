/* export-csv.js — une ligne par événement, toutes colonnes, hash inclus.
   Format : RFC 4180, séparateur virgule, point décimal, UTF-8 avec BOM (lisible par
   les tableurs et par les programmes). Montants non arrondis (précision source). */
import { dateHeureDans, dateDans } from "./modele.js";
import { tauxPour } from "./sources/bce.js";

const echapper = v => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const COLONNES = ["id", "date_utc", "date_paris", "categorie", "sous_type", "marche", "issue", "combine",
  "token_id", "condition_id", "parts", "prix", "montant_usd", "notionnel_usd", "frais_usd",
  "taux_bce_usd_pour_1_eur", "date_fixing_bce", "taux_substitue", "montant_eur",
  "entrees", "sorties", "contrepartie", "interne", "origine", "hash", "lien_polygonscan", "notes"];

export function lignesExport(evts, taux = null) {
  return evts.map(e => {
    const t = taux ? tauxPour(taux, dateDans(e.horodatage)) : null;
    const mv = l => l.map(m => `${m.quantite} ${m.actif}`).join(" ; ");
    return {
      id: e.id, date_utc: dateHeureDans(e.horodatage, "UTC"), date_paris: dateHeureDans(e.horodatage, "Europe/Paris"),
      categorie: e.categorie, sous_type: e.sousType ?? "", marche: e.position?.marche ?? "", issue: e.position?.issue ?? "",
      combine: e.position ? (e.position.combine ? "oui" : "non") : "", token_id: e.position?.tokenId ?? "", condition_id: e.position?.conditionId ?? "",
      parts: e.parts?.toString() ?? "", prix: e.prix?.toString() ?? "", montant_usd: e.montantUsd.toString(),
      notionnel_usd: e.notionnelUsd?.toString() ?? "", frais_usd: e.fraisUsd.toString(),
      taux_bce_usd_pour_1_eur: t?.taux.toString() ?? "", date_fixing_bce: t?.dateFixing ?? "", taux_substitue: t ? (t.substitue ? "oui" : "non") : "",
      montant_eur: t ? e.montantUsd.divise(t.taux).toString() : "",
      entrees: mv(e.entrees), sorties: mv(e.sorties), contrepartie: e.contrepartie ?? "", interne: e.interne ? "oui" : "non",
      origine: e.origine, hash: e.hash, lien_polygonscan: `https://polygonscan.com/tx/${e.hash}`, notes: e.notes.join(" ")
    };
  });
}

export function versCsv(lignes, colonnes = COLONNES) {
  return "﻿" + [colonnes.join(","), ...lignes.map(l => colonnes.map(c => echapper(l[c])).join(","))].join("\r\n") + "\r\n";
}
