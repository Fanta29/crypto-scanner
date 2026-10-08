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
import { html } from "./ui/format.js";
import * as connecteur from "./scanner/connecteurs/polymarket-polygon/index.js";
import { clientEtherscan } from "./scanner/sources/etherscan.js";
import { chargerTaux } from "./scanner/sources/bce.js";
import { analyser } from "./scanner/analyse.js";
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
  <div id="cs-saisie"></div><div id="cs-progression"></div><div id="cs-erreur"></div>
  <div id="cs-reconciliation"></div><div id="cs-synthese"></div><div id="cs-fiscal"></div>
  <div id="cs-positions"></div><div id="cs-evenements"></div><div id="cs-exports"></div>`;
const zone = id => document.querySelector(`#${id}`);

const parametre = new URLSearchParams(location.search).get("adresse") || "";
saisie(zone("cs-saisie"), { adresseInitiale: parametre, surValidation: lancer });

let enCours = null;
async function lancer({ adresse, mesAdresses, seuil, rafraichir }) {
  enCours?.abort();
  const ctrl = new AbortController(); enCours = ctrl;
  ["cs-reconciliation", "cs-synthese", "cs-fiscal", "cs-positions", "cs-evenements", "cs-exports", "cs-erreur"].forEach(id => (zone(id).innerHTML = ""));
  const prog = progression(zone("cs-progression"));
  history.replaceState(null, "", `?adresse=${adresse}`);
  try {
    prog.etape("cache", "Lecture du cache local…");
    const cache = rafraichir ? null : await store.lire(connecteur.id, adresse);
    const derniere = cache?.activite?.length ? Math.max(...cache.activite.map(r => r.timestamp)) : null;
    const bruts = await connecteur.recuperer(adresse, {
      signal: ctrl.signal,
      etherscan: clientEtherscan({ signal: ctrl.signal }),
      cache: derniere ? { activite: cache.activite, depuis: derniere - MARGE_INCREMENTALE } : null,
      progression: ({ etape, detail }) => {
        if (etape === "activite") prog.activite(detail);
        else if (etape === "reprise") prog.etape("activite", `Limite de débit : nouvel essai dans ${Math.round(detail.attente / 1000)} s…`);
        else if (etape === "onchain") prog.etape("onchain", detail?.transferts !== undefined ? `${html(detail.jeton)} : ${detail.transferts} transferts lus` : `${html(detail?.jeton ?? "")}…`);
        else prog.etape(etape);
      }
    });
    await store.ecrire(connecteur.id, adresse, bruts);

    prog.etape("analyse", "Normalisation, positions, réconciliation…");
    const a = analyser(connecteur, bruts, { mesAdresses, seuil });

    prog.etape("bce", "Taux de référence BCE…");
    let taux = new Map(), erreurTaux = null;
    if (a.evenements.length) {
      const ts = a.evenements.map(e => e.horodatage);
      try { taux = (await chargerTaux(dateDans(Math.min(...ts)), dateDans(Math.max(...ts)), { signal: ctrl.signal })).taux; }
      catch (e) { erreurTaux = e.message; }
    }
    const recaps = recapitulatifs(a, taux);
    prog.fin();

    if (bruts.incremental) zone("cs-erreur").innerHTML = `<p class="cs-msg">Mise à jour incrémentale : ${bruts.incremental.relues} événement(s) relus depuis le ${html(dateDans(bruts.incremental.depuis))}, ${bruts.incremental.conservees} repris du cache.</p>`;
    if (erreurTaux) zone("cs-erreur").innerHTML += `<div class="alerte"><b>Taux BCE indisponibles :</b> ${html(erreurTaux)}. Les montants en euros ne sont pas calculés.</div>`;
    zone("cs-reconciliation").innerHTML = reconciliation(a);
    zone("cs-synthese").innerHTML = synthese(a);
    fiscalVue(zone("cs-fiscal"), a, recaps, { surImpression: () => {
      document.body.classList.add("cs-impression");
      document.querySelectorAll(".cs-imprimable details").forEach(d => (d.open = true));
      addEventListener("afterprint", () => document.body.classList.remove("cs-impression"), { once: true });
      print();
    } });
    zone("cs-positions").innerHTML = positionsVue(a);
    evenements(zone("cs-evenements"), a);
    exportsVue(zone("cs-exports"), a, recaps, taux);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    prog.erreur(e.message);
    zone("cs-erreur").innerHTML = `<div class="alerte"><b>La récupération a échoué.</b> ${html(e.message)} — aucun chiffre partiel n'est affiché.</div>`;
  }
}
