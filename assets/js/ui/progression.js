/* progression.js — avancement de la récupération : étapes, événements lus, période couverte. */
import { dateParis, html } from "./format.js";

const ETAPES = [["cache", "Cache local"], ["activite", "Historique Data API"], ["positions", "Positions et chiffres Polymarket"],
  ["resolutions", "Résolutions des marchés"], ["onchain", "Transferts on-chain (Etherscan)"], ["bce", "Taux BCE"], ["analyse", "Analyse et réconciliation"]];

export function progression(racine) {
  racine.innerHTML = `<section class="card cs-progression" aria-live="polite">
    <p class="eyebrow">Récupération</p>
    <div class="bar"><i style="width:0%"></i></div>
    <p class="cs-msg" id="cs-prog-detail">Préparation…</p>
    <ol>${ETAPES.map(([k, l]) => `<li data-e="${k}">○ ${l}</li>`).join("")}</ol></section>`;
  const barre = racine.querySelector(".bar i"), detail = racine.querySelector("#cs-prog-detail");
  let courante = -1;
  return {
    etape(cle, texte) {
      const i = ETAPES.findIndex(([k]) => k === cle);
      if (i > courante) {
        racine.querySelectorAll("li").forEach((li, j) => {
          li.className = j < i ? "fait" : j === i ? "encours" : "";
          li.textContent = (j < i ? "✓ " : j === i ? "● " : "○ ") + ETAPES[j][1];
        });
        courante = i;
        barre.style.width = `${Math.round((i / ETAPES.length) * 100)}%`;
      }
      if (texte) detail.innerHTML = texte;
    },
    activite(p) {
      const d = p.derniere?.timestamp;
      this.etape("activite", `${p.lignes.toLocaleString("fr-FR")} événements lus en ${p.pages} page(s)${d ? ` · remonté jusqu'au ${html(dateParis(d))}` : ""}`);
    },
    fin() { racine.innerHTML = ""; },
    erreur(m) { detail.className = "cs-msg ko"; detail.textContent = "✗ " + m; }
  };
}
