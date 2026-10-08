/* exports.js — assemble les exports à partir d'une analyse (sans DOM). */
import { lignesExport, versCsv, COLONNES } from "./export-csv.js";
import { classeur, nombre } from "./export-xlsx.js";
import { dateHeureDans } from "./modele.js";
import { DEFINITIONS_VOLUME } from "./volumes.js";

const s = v => (v === null || v === undefined ? "" : v.toString());

export function csvDetaille(analyse, taux) {
  return versCsv(lignesExport(analyse.evenements, taux));
}

export function xlsxComplet(analyse, recaps, taux) {
  const detail = lignesExport(analyse.evenements, taux);
  const numeriques = new Set(["parts", "prix", "montant_usd", "notionnel_usd", "frais_usd", "taux_bce_usd_pour_1_eur", "montant_eur"]);
  const ongletDetail = [COLONNES, ...detail.map(l => COLONNES.map(c => (numeriques.has(c) ? nombre(l[c]) : l[c])))];

  const etatDe = new Map(analyse.evaluation.lignes.map(l => [l.actif, l]));
  const ongletPositions = [["actif", "marche", "issue", "combine", "quantite_detenue", "cout_restant_usd", "paye_usd", "recu_usd",
    "realise_usd", "frais_usd", "etat", "valeur_unitaire", "valeur_usd", "resultat_non_realise_ou_constate_usd", "premier_mouvement_paris", "cloture_paris"],
  ...analyse.positions.positions.map(p => {
    const ev = etatDe.get(p.actif);
    return [p.actif, p.marche ?? "", p.issue ?? "", p.combine ? "oui" : "non", nombre(s(p.quantite)), nombre(s(p.cout)), nombre(s(p.paye)), nombre(s(p.recu)),
      nombre(s(p.realise)), nombre(s(p.frais)), ev ? ev.etat : "soldee", nombre(s(ev?.valeurUnitaire)), nombre(s(ev?.valeur)), nombre(s(ev?.resultat)),
      dateHeureDans(p.premier), p.cloture ? dateHeureDans(p.cloture) : ""];
  })];

  const ongletSynthese = [["annee", "rubrique", "usd", "eur", "precision"]];
  for (const r of recaps) {
    for (const c of r.parCategorie) ongletSynthese.push([r.annee, `Total ${c.libelle} (${c.nombre})`, nombre(s(c.usd)), nombre(s(c.eur)), "somme des montants de la catégorie"]);
    ongletSynthese.push([r.annee, "Réalisé par opérations", nombre(s(r.resultat.realiseOperationsUsd)), nombre(s(r.resultat.realiseOperationsEur)), "coût moyen pondéré, frais inclus"]);
    ongletSynthese.push([r.annee, "Positions résolues non rachetées (constaté)", nombre(s(r.resultat.constateUsd)), nombre(s(r.resultat.constateEur)), "valeur de résolution − coût restant"]);
    ongletSynthese.push([r.annee, "Remises et récompenses", nombre(s(r.resultat.revenusUsd)), nombre(s(r.resultat.revenusEur)), ""]);
    ongletSynthese.push([r.annee, "Résultat total de l'année", nombre(s(r.resultat.totalUsd)), nombre(s(r.resultat.totalEur)), "réalisé + constaté + remises"]);
    ongletSynthese.push([r.annee, "Frais de trading", nombre(s(r.frais.usd)), nombre(s(r.frais.eur)), "inclus dans les montants ci-dessus"]);
  }
  ongletSynthese.push([]);
  for (const [k, lib] of Object.entries(DEFINITIONS_VOLUME)) ongletSynthese.push(["toutes", `Volume — ${lib}`, nombre(s(analyse.volumes[k])), "", k === "parts" ? "en parts, pas en dollars" : ""]);

  const ongletRecon = [["controle", "statut", "attendu", "obtenu", "ecart", "ecart_relatif", "detail", "references"],
    ...analyse.controle.controles.map(c => [c.libelle, c.statut, s(c.attendu), s(c.obtenu), s(c.ecart), s(c.ecartRelatif), [c.detail, c.explication].filter(Boolean).join(" "), (c.refs || []).join(" ; ")]),
    [], ["anomalie", "niveau", "message", "references"],
    ...analyse.controle.anomalies.map(a => [a.code, a.niveau, a.message, a.refs.join(" ; ")])];

  return classeur([
    { nom: "Détail", lignes: ongletDetail },
    { nom: "Positions", lignes: ongletPositions },
    { nom: "Synthèse annuelle", lignes: ongletSynthese },
    { nom: "Réconciliation", lignes: ongletRecon }
  ]);
}
