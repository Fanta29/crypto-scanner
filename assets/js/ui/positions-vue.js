/* positions-vue.js — positions ouvertes, résolues non rachetées, soldées. */
import { Dec } from "../scanner/decimal.js";
import { usd, parts, signe, nombre, dateParis, html } from "./format.js";

function tableau(lignes, colonnes) {
  return `<div class="cs-table-wrap"><table class="cs-table cartes"><thead><tr>${colonnes.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>
    ${lignes.map(l => `<tr>${colonnes.map(c => `<td class="${c[2] || ""}" data-l="${c[0]}">${c[1](l)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function positionsVue(a) {
  const e = a.evaluation, soldees = [...a.positions.soldees].sort((x, y) => y.realise.abs().cmp(x.realise.abs()));
  const nom = p => `${html(p.marche ?? p.actif.slice(0, 24) + "…")}${p.issue ? ` · <b>${html(p.issue)}</b>` : ""}${p.combine ? ' <span class="cs-cat">combiné</span>' : ""}`;
  const resolues = [...e.resolues].sort((x, y) => x.resultat.cmp(y.resultat));
  return `
  <section class="card" aria-labelledby="cs-t-pos">
    <p class="eyebrow">Positions · méthode du coût moyen pondéré</p>
    <h2 id="cs-t-pos" style="margin-top:0">Positions</h2>
    <h3>Ouvertes — marché non tranché (${e.ouvertes.length})</h3>
    ${e.ouvertes.length ? tableau(e.ouvertes, [["Marché · issue", nom, "m"], ["Parts", p => parts(p.quantite), "n"], ["Coût restant", p => usd(p.cout), "n"],
      ["Prix courant", p => html(nombre(p.valeurUnitaire, 4)), "n"], ["Valeur", p => usd(p.valeur), "n"], ["Latent", p => signe(p.resultat), "n"]]) : '<p class="muted">Aucune.</p>'}
    <p class="muted" style="font-size:12.5px">Valorisation au prix courant publié par Polymarket : résultat non réalisé, indicatif.</p>
    <h3>Résolues, non rachetées (${e.resolues.length})</h3>
    <p class="muted" style="font-size:13px">Marché tranché, parts toujours sur le wallet. Une issue perdante vaut 0 : la perte est constatée à la date de résolution.
      Total : ${signe(e.constate)}.</p>
    <details class="cs-options"><summary>Afficher le détail</summary>
    ${tableau(resolues, [["Marché · issue", nom, "m"], ["Parts", p => parts(p.quantite), "n"], ["Coût restant", p => usd(p.cout), "n"],
      ["Valeur unitaire", p => html(nombre(p.valeurUnitaire, 4)), "n"], ["Résultat constaté", p => signe(p.resultat), "n"], ["Résolu le (Paris)", p => html(dateParis(p.date)), "t"]])}</details>
    ${e.nonValorisees.length ? `<h3>Non valorisées (${e.nonValorisees.length})</h3><p class="muted" style="font-size:13px">Ni résolution ni prix connus. Coût restant : ${usd(e.coutNonValorise, 6)}.</p>
      ${tableau(e.nonValorisees, [["Marché · issue", nom, "m"], ["Parts", p => parts(p.quantite), "n"], ["Coût restant", p => usd(p.cout, 6), "n"]])}` : ""}
    <h3>Soldées (${soldees.length})</h3>
    <p class="muted" style="font-size:13px">Pour une position soldée, le réalisé égale exactement le total reçu moins le total payé (frais compris).</p>
    <details class="cs-options"><summary>Afficher le détail (tri par résultat absolu)</summary>
    ${tableau(soldees, [["Marché · issue", nom, "m"], ["Payé", p => usd(p.paye), "n"], ["Reçu", p => usd(p.recu), "n"], ["Frais", p => usd(p.frais), "n"],
      ["Réalisé", p => signe(p.realise), "n"], ["Soldée le (Paris)", p => html(dateParis(p.cloture)), "t"]])}</details>
  </section>`;
}
