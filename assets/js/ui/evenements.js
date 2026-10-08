/* evenements.js — détail des événements : filtres par catégorie, période, origine,
   recherche par marché ; pagination. Chaque ligne renvoie à sa transaction. */
import { CATEGORIES, dateDans } from "../scanner/modele.js";
import { usd, parts, nombre, dateParis, dateUtc, html, lienTx, lienAdresse } from "./format.js";

const PAR_PAGE = 50;

export function evenements(racine, a) {
  const evts = [...a.evenements].sort((x, y) => y.horodatage - x.horodatage);
  racine.innerHTML = `
  <section class="card" aria-labelledby="cs-t-evts">
    <p class="eyebrow">Détail</p>
    <h2 id="cs-t-evts" style="margin-top:0">Événements</h2>
    <div class="cs-filtres">
      <div><label for="cs-f-cat">Catégorie</label><select id="cs-f-cat"><option value="">Toutes</option>
        ${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${html(c.libelle)}</option>`).join("")}</select></div>
      <div><label for="cs-f-du">Du (heure de Paris)</label><input type="text" id="cs-f-du" placeholder="AAAA-MM-JJ"></div>
      <div><label for="cs-f-au">Au</label><input type="text" id="cs-f-au" placeholder="AAAA-MM-JJ"></div>
      <div><label for="cs-f-q">Marché, issue ou hash</label><input type="text" id="cs-f-q" placeholder="ex. Yankees"></div>
      <div><label for="cs-f-or">Origine</label><select id="cs-f-or"><option value="">Toutes</option><option value="api+onchain">API + on-chain</option><option value="api">API seule</option><option value="onchain">On-chain seule</option></select></div>
    </div>
    <p class="cs-msg" id="cs-f-compte" role="status"></p>
    <div class="cs-table-wrap"><table class="cs-table cartes">
      <thead><tr><th>Date (Paris)</th><th>Catégorie</th><th>Marché · issue</th><th>Parts</th><th>Prix</th><th>Montant</th><th>Frais</th><th>Transaction</th></tr></thead>
      <tbody id="cs-f-corps"></tbody></table></div>
    <div class="cs-pagination"><button type="button" id="cs-f-prec">← Précédent</button><span id="cs-f-page"></span><button type="button" id="cs-f-suiv">Suivant →</button></div>
  </section>`;
  const $ = s => racine.querySelector(s);
  let page = 0, filtres = [];
  const appliquer = () => {
    const cat = $("#cs-f-cat").value, du = $("#cs-f-du").value.trim(), au = $("#cs-f-au").value.trim();
    const q = $("#cs-f-q").value.trim().toLowerCase(), or = $("#cs-f-or").value;
    filtres = evts.filter(e => {
      if (cat && e.categorie !== cat) return false;
      if (or && e.origine !== or) return false;
      const d = dateDans(e.horodatage);
      if (du && d < du) return false;
      if (au && d > au) return false;
      if (q && !`${e.position?.marche ?? ""} ${e.position?.issue ?? ""} ${e.hash} ${e.contrepartie ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    page = 0; dessiner();
  };
  const dessiner = () => {
    const n = Math.max(1, Math.ceil(filtres.length / PAR_PAGE));
    page = Math.min(page, n - 1);
    $("#cs-f-compte").textContent = `${filtres.length.toLocaleString("fr-FR")} événement(s) sur ${evts.length.toLocaleString("fr-FR")}`;
    $("#cs-f-page").textContent = `page ${page + 1} / ${n}`;
    $("#cs-f-prec").disabled = page === 0; $("#cs-f-suiv").disabled = page >= n - 1;
    $("#cs-f-corps").innerHTML = filtres.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE).map(e => `<tr>
      <td class="t" data-l="Date (Paris)" title="UTC : ${html(dateUtc(e.horodatage))}">${html(dateParis(e.horodatage))}</td>
      <td data-l="Catégorie"><span class="cs-cat ${e.categorie}">${html(CATEGORIES[e.categorie].libelle)}</span>${e.sousType ? `<br><span class="muted cs-mono" style="font-size:10.5px">${html(e.sousType)}</span>` : ""}</td>
      <td class="m" data-l="Marché · issue">${html(e.position?.marche ?? (e.contrepartie ? "Contrepartie" : ""))}${e.position?.issue ? ` · <b>${html(e.position.issue)}</b>` : ""}${e.contrepartie ? ` ${lienAdresse(e.contrepartie)}` : ""}${e.notes.length ? `<br><span class="muted" style="font-size:11.5px">${html(e.notes.join(" "))}</span>` : ""}</td>
      <td class="n" data-l="Parts">${e.parts ? parts(e.parts) : ""}</td>
      <td class="n" data-l="Prix">${e.prix ? html(nombre(e.prix, 4)) : ""}</td>
      <td class="n" data-l="Montant">${usd(e.montantUsd)}</td>
      <td class="n" data-l="Frais">${e.fraisUsd.estZero() ? "" : usd(e.fraisUsd, 4)}</td>
      <td data-l="Transaction">${lienTx(e.hash)}</td></tr>`).join("");
  };
  racine.querySelectorAll("select, input").forEach(el => el.addEventListener("input", appliquer));
  $("#cs-f-prec").addEventListener("click", () => { page--; dessiner(); });
  $("#cs-f-suiv").addEventListener("click", () => { page++; dessiner(); });
  appliquer();
}
