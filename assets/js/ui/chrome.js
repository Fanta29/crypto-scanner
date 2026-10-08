/* chrome.js — en-tête et pied de page, repris du site de formation (même structure,
   mêmes classes). Le médaillon est celui du site : à l'intégration, ce fichier
   disparaît au profit de ui.js du site. */

const LOGO = `<svg class="mast-mark" viewBox="0 0 32 32" aria-hidden="true">
  <defs><linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" style="stop-color:var(--accent)"/><stop offset=".55" style="stop-color:var(--ok)"/><stop offset="1" style="stop-color:var(--warn)"/>
  </linearGradient></defs>
  <circle cx="16" cy="16" r="15" style="fill:var(--surface);stroke:var(--line)"/>
  <path d="M16 6 L25.5 24 L6.5 24 Z" fill="url(#logoGrad)"/>
</svg>`;

export function chrome() {
  document.body.insertAdjacentHTML("afterbegin", `
    <header class="masthead">
      <div class="mast-inner">
        <a class="mast-marque" href="index.html" aria-label="Retour à l'accueil">
          ${LOGO}
          <span class="mast-txt">
            <span class="mast-titre">Crypto Scanner</span>
            <span class="sub">Historique · Réconciliation · Récap fiscal</span>
          </span>
        </a>
        <span class="pastille" title="Phase 1 : Polymarket sur Polygon">Polymarket · Polygon</span>
      </div>
    </header>
    <div class="avert"><div class="avert-in">
      <b>Outil en lecture seule.</b> Aucune clé privée, signature ni connexion de wallet n'est demandée.
      Aide au calcul, pas un conseil fiscal ni une recommandation d'investissement.
    </div></div>`);
  document.body.insertAdjacentHTML("beforeend", `
    <footer class="pied"><div class="pied-in">
      <div>Sources : Data API Polymarket v2 · Etherscan API V2 (Polygon) · BCE (taux de référence)</div>
      <div class="maj">Les données sont lues, jamais écrites. Le cache reste dans ce navigateur.</div>
    </div></footer>`);
}
