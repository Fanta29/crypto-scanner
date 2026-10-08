/* scanner.js — script de la page. Orchestration seulement : la logique métier est
   dans scanner/, les composants dans ui/. */
import { chrome } from "./ui/chrome.js";
import { saisie } from "./ui/saisie.js";
import { progression } from "./ui/progression.js";
import { synthese } from "./ui/synthese.js";
import { reconciliation } from "./ui/reconciliation-vue.js";
import { evenements } from "./ui/evenements.js";
import { positionsVue } from "./ui/positions-vue.js";
import { fiscalVue } from "./ui/fiscal-vue.js";
import { exportsVue } from "./ui/exports-vue.js";
import { html, court } from "./ui/format.js";
import * as connecteur from "./scanner/connecteurs/polymarket-polygon/index.js";
import { clientEtherscan } from "./scanner/sources/etherscan.js";
import { chargerTaux } from "./scanner/sources/bce.js";
import { analyser } from "./scanner/analyse.js";
import { evaluerAu } from "./scanner/evaluation.js";
import { consolider } from "./scanner/consolidation.js";
import { recapitulatifs } from "./scanner/fiscal.js";
import { dateDans } from "./scanner/modele.js";
import * as store from "./store.js";

const MARGE_INCREMENTALE = 7 * 86400;   // un rescan relit au moins les 7 derniers jours

chrome();
const app = document.querySelector("#app");
app.innerHTML = `
  <div class="lede">
    <p class="eyebrow">Simulateur · lecture seule</p>
    <p class="h">Historique Polymarket, réconcilié et prêt pour la déclaration</p>
    <p>À partir d'une adresse, l'outil reconstitue toute l'activité Polymarket, la classe, la rapproche de la blockchain
       transaction par transaction et calcule volumes, résultats et récapitulatif annuel en euros.</p>
    <p>Il ne choisit pas le régime fiscal applicable et ne remplace pas un professionnel.</p>
  </div>
  <div id="cs-saisie"></div><div id="cs-progression"></div><div id="cs-erreur"></div><div id="cs-vues"></div>
  <div id="cs-reconciliation"></div><div id="cs-synthese"></div><div id="cs-fiscal"></div>
  <div id="cs-positions"></div><div id="cs-evenements"></div><div id="cs-exports"></div>`;
const zone = id => document.querySelector(`#${id}`);

const parametre = new URLSearchParams(location.search).get("adresse") || "";
saisie(zone("cs-saisie"), { adresseInitiale: parametre, surValidation: lancer });

let enCours = null;
async function lancer({ adresses, mesAdresses, seuil, rafraichir }) {
  enCours?.abort();
  const ctrl = new AbortController(); enCours = ctrl;
  ["cs-vues", "cs-reconciliation", "cs-synthese", "cs-fiscal", "cs-positions", "cs-evenements", "cs-exports", "cs-erreur"].forEach(id => (zone(id).innerHTML = ""));
  const prog = progression(zone("cs-progression"));
  history.replaceState(null, "", `?adresse=${adresses.join(",")}`);
  try {
    const brutsListe = [], analyses = [], messages = [];
    for (const [i, adresse] of adresses.entries()) {
      const qui = adresses.length > 1 ? `Adresse ${i + 1}/${adresses.length} — ` : "";
      prog.etape("cache", `${qui}lecture du cache local…`);
      const cache = rafraichir ? null : await store.lire(connecteur.id, adresse);
      const derniere = cache?.activite?.length ? Math.max(...cache.activite.map(r => r.timestamp)) : null;
      const bruts = await connecteur.recuperer(adresse, {
        signal: ctrl.signal,
        etherscan: clientEtherscan({ signal: ctrl.signal }),
        cache: derniere ? { activite: cache.activite, depuis: derniere - MARGE_INCREMENTALE } : null,
        progression: ({ etape, detail }) => {
          if (etape === "activite") prog.activite(detail);
          else if (etape === "reprise") prog.etape("activite", `${qui}limite de débit : nouvel essai dans ${Math.round(detail.attente / 1000)} s…`);
          else if (etape === "onchain") prog.etape("onchain", `${qui}${detail?.transferts !== undefined ? `${html(detail.jeton)} : ${detail.transferts} transferts lus` : `${html(detail?.jeton ?? "")}…`}`);
          else prog.etape(etape, qui ? `${qui}${etape}…` : undefined);
        }
      });
      await store.ecrire(connecteur.id, adresse, bruts);
      if (bruts.incremental) messages.push(`${court(adresse, 8)} : mise à jour incrémentale, ${bruts.incremental.relues} événement(s) relus depuis le ${html(dateDans(bruts.incremental.depuis))}, ${bruts.incremental.conservees} repris du cache.`);
      brutsListe.push(bruts);
      analyses.push(analyser(connecteur, bruts, { mesAdresses, seuil }));
    }

    prog.etape("analyse", "Normalisation, positions, réconciliation…");
    const vues = analyses.map((a, i) => ({ cle: a.adresse, libelle: court(a.adresse, 8), analyse: a, bruts: [brutsListe[i]] }));
    if (analyses.length > 1) vues.unshift({ cle: "consolide", libelle: `Consolidé (${analyses.length} adresses)`, analyse: consolider(connecteur, analyses, brutsListe, { seuil }), bruts: brutsListe });

    prog.etape("bce", "Taux de référence BCE…");
    let taux = new Map(), erreurTaux = null;
    const ts = analyses.flatMap(a => a.evenements.map(e => e.horodatage));
    if (ts.length) {
      try { taux = (await chargerTaux(dateDans(Math.min(...ts)), dateDans(Math.max(...ts)), { signal: ctrl.signal })).taux; }
      catch (e) { erreurTaux = e.message; }
    }
    prog.fin();

    zone("cs-erreur").innerHTML = messages.map(m => `<p class="cs-msg">${m}</p>`).join("")
      + (erreurTaux ? `<div class="alerte"><b>Taux BCE indisponibles :</b> ${html(erreurTaux)}. Les montants en euros ne sont pas calculés.</div>` : "");
    const afficher = cle => {
      const v = vues.find(x => x.cle === cle);
      const a = v.analyse, recaps = recapitulatifs(a, taux);
      zone("cs-reconciliation").innerHTML = reconciliation(a);
      zone("cs-synthese").innerHTML = synthese(a);
      const valoriseur = connecteur.valoriseur(v.bruts.length > 1 ? connecteur.fusionner(v.bruts) : v.bruts[0], { signal: ctrl.signal });
      fiscalVue(zone("cs-fiscal"), a, recaps, { valoriser: t => evaluerAu(a.evenements, t, valoriseur), surImpression: () => {
        document.body.classList.add("cs-impression");
        document.querySelectorAll(".cs-imprimable details").forEach(d => (d.open = true));
        addEventListener("afterprint", () => document.body.classList.remove("cs-impression"), { once: true });
        print();
      } });
      zone("cs-positions").innerHTML = positionsVue(a);
      evenements(zone("cs-evenements"), a);
      exportsVue(zone("cs-exports"), a, recaps, taux);
    };
    if (vues.length > 1) {
      zone("cs-vues").innerHTML = `<nav class="filtres" aria-label="Vue affichée">${vues.map((v, i) =>
        `<button type="button" data-vue="${html(v.cle)}" aria-pressed="${i === 0}">${html(v.libelle)}</button>`).join("")}</nav>`;
      zone("cs-vues").addEventListener("click", ev => {
        const b = ev.target.closest("[data-vue]"); if (!b) return;
        zone("cs-vues").querySelectorAll("[data-vue]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        afficher(b.dataset.vue);
      });
    }
    afficher(vues[0].cle);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    prog.erreur(e.message);
    zone("cs-erreur").innerHTML = `<div class="alerte"><b>La récupération a échoué.</b> ${html(e.message)} — aucun chiffre partiel n'est affiché.</div>`;
  }
}
