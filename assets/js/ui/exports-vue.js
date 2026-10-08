/* exports-vue.js — téléchargements CSV et XLSX, générés dans le navigateur. */
import { csvDetaille, xlsxComplet } from "../scanner/exports.js";

function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const lien = Object.assign(document.createElement("a"), { href: url, download: nom });
  document.body.append(lien); lien.click(); lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportsVue(racine, a, recaps, taux) {
  const base = `polymarket-${a.adresse.slice(0, 8)}-${(a.recupereLe || new Date().toISOString()).slice(0, 10)}`;
  racine.innerHTML = `<section class="card" aria-labelledby="cs-t-exp">
    <p class="eyebrow">Exports</p><h2 id="cs-t-exp" style="margin-top:0">Télécharger</h2>
    <div class="cs-actions">
      <button class="btn" type="button" data-x="csv">CSV détaillé</button>
      <button class="btn ghost" type="button" data-x="xlsx">Classeur XLSX (4 onglets)</button>
    </div>
    <p class="muted" style="font-size:13px">CSV : une ligne par événement, toutes colonnes, hash et lien Polygonscan, taux BCE et montant en euros ; montants à pleine précision.
      XLSX : détail, positions, synthèse annuelle, réconciliation (un tableur lit les nombres avec 15 chiffres significatifs : le CSV fait foi).</p>
  </section>`;
  racine.querySelector('[data-x="csv"]').addEventListener("click", () => telecharger(`${base}.csv`, csvDetaille(a, taux), "text/csv;charset=utf-8"));
  racine.querySelector('[data-x="xlsx"]').addEventListener("click", () => telecharger(`${base}.xlsx`, xlsxComplet(a, recaps, taux), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
}
