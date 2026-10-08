/* fiscal-vue.js — récapitulatif annuel, imprimable (PDF via l'impression du navigateur). */
import { usd, eur, signe, nombre, dateParis, html, lienTx, lienAdresse } from "./format.js";

export function fiscalVue(racine, a, recaps, { surImpression } = {}) {
  if (!recaps.length) { racine.innerHTML = ""; return; }
  const choix = recaps.at(-1).annee;
  racine.innerHTML = `
  <section class="card cs-imprimable" aria-labelledby="cs-t-fisc">
    <p class="eyebrow">Récapitulatif fiscal · aide au calcul</p>
    <h2 id="cs-t-fisc" style="margin-top:0">Année <span id="cs-annee-txt">${html(choix)}</span></h2>
    <div class="cs-actions"><label class="cs-noprint" for="cs-annee" style="margin:0">Année civile
      <select id="cs-annee">${recaps.map(r => `<option${r.annee === choix ? " selected" : ""}>${html(r.annee)}</option>`).join("")}</select></label>
      <button class="btn ghost" type="button" id="cs-imprimer">Imprimer / PDF</button></div>
    <div id="cs-recap"></div>
  </section>`;
  const dessiner = annee => {
    const r = recaps.find(x => x.annee === annee);
    racine.querySelector("#cs-annee-txt").textContent = annee;
    racine.querySelector("#cs-recap").innerHTML = `
      <div class="alerte"><b>${html(r.avertissement)}</b></div>
      <p class="muted" style="font-size:13px">Adresse <span class="cs-mono">${html(a.adresse)}</span> · données lues le ${html((a.recupereLe || "").slice(0, 10) || "—")} ·
        ${r.anneeTerminee ? "année close" : "<b>année en cours : chiffres provisoires</b>"}.</p>
      <h3>Résultat de l'année</h3>
      <div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>Rubrique</th><th>USD</th><th>EUR</th></tr></thead><tbody>
        <tr><td>Réalisé par opérations (ventes et rachats)</td><td class="n">${signe(r.resultat.realiseOperationsUsd)}</td><td class="n">${signe(r.resultat.realiseOperationsEur, "€")}</td></tr>
        <tr><td>Positions résolues non rachetées (constaté à la résolution)</td><td class="n">${signe(r.resultat.constateUsd)}</td><td class="n">${signe(r.resultat.constateEur, "€")}</td></tr>
        <tr><td>Remises et récompenses</td><td class="n">${signe(r.resultat.revenusUsd)}</td><td class="n">${signe(r.resultat.revenusEur, "€")}</td></tr>
        <tr class="total"><td>Total</td><td class="n">${signe(r.resultat.totalUsd)}</td><td class="n">${signe(r.resultat.totalEur, "€")}</td></tr>
        <tr><td>dont frais de trading payés (déjà déduits)</td><td class="n">${usd(r.frais.usd)}</td><td class="n">${eur(r.frais.eur)}</td></tr>
        <tr><td>Vue alternative : positions soldées par vente ou rachat dans l'année (${r.cloturees.length}), total reçu − total payé — hors positions résolues non rachetées, donc partielle</td><td class="n">${signe(r.clotureesRealise)}</td><td class="n">—</td></tr>
      </tbody></table></div>
      <h3>Totaux par catégorie</h3>
      <div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>Catégorie</th><th>Opérations</th><th>USD</th><th>EUR</th></tr></thead><tbody>
        ${r.parCategorie.map(c => `<tr><td>${html(c.libelle)}</td><td class="n">${c.nombre}</td><td class="n">${usd(c.usd)}</td><td class="n">${eur(c.eur)}</td></tr>`).join("")}
      </tbody></table></div>
      <h3>Dépôts, retraits et transferts (${r.flux.length})</h3>
      <details class="cs-options cs-depliable"><summary>Afficher la liste datée (s'ouvre automatiquement à l'impression)</summary>
      <div class="cs-table-wrap"><table class="cs-table cartes"><thead><tr><th>Date (Paris)</th><th>Nature</th><th>Actif</th><th>USD</th><th>Taux BCE</th><th>EUR</th><th>Contrepartie</th><th>Transaction</th></tr></thead><tbody>
        ${r.flux.map(l => { const e = l.evenement; const actif = [...e.entrees, ...e.sorties].find(m => !m.actif.includes(":"))?.actif ?? "pUSD";
          return `<tr><td class="t" data-l="Date (Paris)">${html(dateParis(e.horodatage))}</td><td data-l="Nature">${html(e.categorie === "DEPOT" ? "Dépôt" : e.categorie === "RETRAIT" ? "Retrait" : "Transfert interne")}${e.sousType ? ` <span class="muted cs-mono">${html(e.sousType)}</span>` : ""}</td>
          <td data-l="Actif">${html(actif)}</td><td class="n" data-l="USD">${usd(e.montantUsd)}</td><td class="n" data-l="Taux BCE">${l.taux ? html(nombre(l.taux, 4)) + (l.substitue ? ` <span class="muted">(${html(l.dateFixing)})</span>` : "") : "—"}</td>
          <td class="n" data-l="EUR">${eur(l.eur)}</td><td data-l="Contrepartie">${e.contrepartie ? lienAdresse(e.contrepartie) : '<span class="muted">non lisible</span>'}</td><td data-l="Transaction">${lienTx(e.hash)}</td></tr>`; }).join("")}
      </tbody></table></div></details>
      <p class="muted" style="font-size:12.5px">Les dépôts Polymarket arrivent sous forme de pUSD frappé sur le wallet : leur provenance n'est pas lisible sur Polygon.
        Pour un retrait, la contrepartie est l'adresse de sortie sur Polygon (souvent un pont), pas la destination finale.</p>
      <h3>Positions détenues ${r.anneeTerminee ? "au 31 décembre" : "à la date du relevé"}</h3>
      <p style="font-size:13.5px">${r.anneeTerminee
        ? "Année close : la valorisation au 31 décembre demande les prix à cette date, non chargés dans cette version (voir les limites)."
        : `Ouvertes : ${a.evaluation.ouvertes.length}, valeur ${usd(a.evaluation.valeurOuvertes)} (latent ${signe(a.evaluation.latent)}). Résolues non rachetées : ${a.evaluation.resolues.length}.`}
        Elles sont valorisées à part et ne sont pas comptées dans le réalisé.</p>
      <h3>Hypothèses</h3><ul>${r.hypotheses.map(h => `<li>${html(h)}</li>`).join("")}</ul>
      <p class="muted" style="font-size:12.5px">Taux : série BCE ${html(r.sourceTaux.serie)} (${html(r.sourceTaux.url)}). ${r.substitutions} opération(s) datée(s) d'un jour sans fixing ont reçu le dernier taux antérieur ; le taux et sa date figurent ligne par ligne dans l'export.</p>
      <h3>Points à vérifier avec un professionnel</h3><ul>${r.pointsAVerifier.map(h => `<li>${html(h)}</li>`).join("")}</ul>
      ${r.anomalies.length ? `<div class="alerte"><b>Anomalies :</b> ${r.anomalies.map(html).join(" · ")}</div>` : ""}`;
  };
  racine.querySelector("#cs-annee").addEventListener("input", ev => dessiner(ev.target.value));
  racine.querySelector("#cs-imprimer").addEventListener("click", () => surImpression?.());
  dessiner(choix);
}
