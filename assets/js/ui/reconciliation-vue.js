/* reconciliation-vue.js — rapport de contrôle, placé en tête du tableau de bord. */
import { usd, nombre, dateParis, html, court, lienTx } from "./format.js";

const STATUT = { ok: "✓ conforme", ecart: "✗ écart", explique: "⚠ expliqué", info: "ℹ info", non_fait: "– non fait" };

export function reconciliation(a) {
  const r = a.controle, c = r.couverture;
  const ref = x => (/^0x[0-9a-f]{64}$/i.test(x) ? lienTx(x) : html(x));
  return `
  <section class="card" aria-labelledby="cs-t-recon">
    <p class="eyebrow">Rapport de contrôle</p>
    <h2 id="cs-t-recon" style="margin-top:0">Réconciliation</h2>
    <div class="cs-bandeau ${r.statut}" role="status"><span class="ic" aria-hidden="true">${r.statut === "ok" ? "✓" : "✗"}</span>
      <div>${r.statut === "ok" ? "<b>Aucun écart non expliqué.</b>" : `<b>${r.nombreEcarts} contrôle(s) en écart.</b> Les opérations en cause sont listées sous chaque contrôle.`}
      Seuil : ${html(nombre(r.seuil, 6))} $ ; aucun arrondi n'est appliqué avant comparaison.</div></div>
    <ul class="cs-recon">
      ${r.controles.map(k => `<li class="${k.statut}"><span class="ic">${STATUT[k.statut] || k.statut}</span><span class="lib">${html(k.libelle)}</span>
        <span class="det">${k.attendu !== null && k.attendu !== undefined ? `attendu <span class="cs-mono">${html(k.attendu)}</span> · obtenu <span class="cs-mono">${html(k.obtenu)}</span> · écart <span class="cs-mono">${html(k.ecart ?? "—")}</span>${k.ecartRelatif ? ` (${html(k.ecartRelatif)})` : ""}` : ""}
          ${k.detail ? `<br>${html(k.detail)}` : ""}${k.explication ? `<br><b>Explication :</b> ${html(k.explication)}` : ""}</span>
        ${k.refs?.length ? `<details><summary>${k.refs.length} référence(s)</summary><ul>${k.refs.map(x => `<li>${ref(x)}</li>`).join("")}</ul></details>` : ""}</li>`).join("")}
    </ul>
    ${r.equations.map(eq => `
      <h4>Équation de flux — ${html(eq.actif)}</h4>
      <div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>Catégorie</th><th>Opérations</th><th>Flux net</th></tr></thead><tbody>
        ${eq.lignes.map(l => `<tr><td>${html(l.libelle)}</td><td class="n">${l.nombre}</td><td class="n">${html(nombre(l.montant, 6))}</td></tr>`).join("")}
        <tr class="total"><td>Solde calculé</td><td></td><td class="n">${html(nombre(eq.calcule, 6))}</td></tr>
        <tr><td>Solde on-chain${a.soldesLe ? ` (lu le ${html(a.soldesLe.slice(0, 19).replace("T", " "))} UTC)` : ""}</td><td></td><td class="n">${eq.observe ? html(nombre(eq.observe, 6)) : "non lu"}</td></tr>
        <tr><td>Écart</td><td></td><td class="n ${eq.statut === "ok" ? "cs-gain" : "cs-perte"}">${eq.ecart ? html(nombre(eq.ecart, 6)) : "—"}</td></tr>
      </tbody></table></div>`).join("")}
    <h4>Couverture</h4>
    <ul class="steps cs-steps">
      <li><span class="lbl">Premier / dernier événement (Paris)</span><span class="val">${html(dateParis(c.premier))} → ${html(dateParis(c.dernier))}</span></li>
      <li><span class="lbl">Lignes lues dans la Data API</span><span class="val">${c.lignesLues ?? "—"}${c.pages ? ` en ${c.pages} page(s)` : ""}</span></li>
      <li><span class="lbl">Doublons supprimés / réintégrés après contrôle on-chain</span><span class="val">${c.doublonsRetires} / ${c.doublonsReintegres}</span></li>
      <li><span class="lbl">Transactions on-chain absentes de la Data API</span><span class="val">${c.onchainSeul}</span></li>
      <li><span class="lbl">Événements par origine</span><span class="val">${Object.entries(c.parOrigine).map(([k, v]) => `${html(k)} ${v}`).join(" · ")}</span></li>
    </ul>
    ${r.anomalies.length ? `<details class="cs-options"><summary>${r.anomalies.length} anomalie(s) : ${r.niveaux.erreur} erreur(s), ${r.niveaux.alerte} alerte(s), ${r.niveaux.info} information(s)</summary>
      <ul class="cs-recon">${r.anomalies.map(x => `<li class="${x.niveau === "erreur" ? "ecart" : x.niveau === "alerte" ? "explique" : "info"}"><span class="ic">${html(x.niveau)}</span><span class="lib">${html(x.message)}</span>
        ${x.refs.length ? `<span class="det">${x.refs.map(ref).join(" · ")}</span>` : ""}</li>`).join("")}</ul></details>` : ""}
  </section>`;
}
