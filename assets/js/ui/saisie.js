/* saisie.js — champ d'adresse (format + somme de contrôle EIP-55) et options. */
import { validerAdresseEvm } from "../scanner/checksum.js";
import { html } from "./format.js";

export function saisie(racine, { surValidation, adresseInitiale = "" }) {
  racine.innerHTML = `
    <section class="card" aria-labelledby="cs-titre-saisie">
      <p class="eyebrow">Adresse à analyser</p>
      <h2 id="cs-titre-saisie" style="margin-top:0">Wallet Polymarket (proxy wallet, Polygon)</h2>
      <p class="muted">L'adresse affichée sur votre profil Polymarket, au format 0x… Plusieurs adresses à vous : séparez-les par une virgule
        ou un espace, l'outil produit une vue par adresse et une vue consolidée. Aucune connexion de wallet n'est demandée.</p>
      <form class="cs-saisie" novalidate>
        <div>
          <label for="cs-adresse">Adresse(s) 0x…</label>
          <input type="text" id="cs-adresse" autocomplete="off" spellcheck="false" inputmode="text" value="${html(adresseInitiale)}" aria-describedby="cs-msg-adresse">
        </div>
        <button class="btn" type="submit">Analyser</button>
      </form>
      <p class="cs-msg" id="cs-msg-adresse" role="status"></p>
      <details class="cs-options">
        <summary>Options</summary>
        <label for="cs-mes-adresses" style="margin-top:10px">Mes autres adresses, non analysées (une par ligne)
          <span class="hint">Les mouvements avec elles sont des transferts internes, exclus des dépôts et retraits. Les adresses analysées le sont déjà d'office.</span></label>
        <textarea id="cs-mes-adresses" spellcheck="false"></textarea>
        <div class="form-grid">
          <div><label for="cs-seuil">Seuil d'écart de réconciliation (USD)
            <span class="hint">0 par défaut : les montants sont exacts au millionième.</span></label>
            <input type="number" id="cs-seuil" value="0" min="0" step="0.000001"></div>
        </div>
        <label class="check"><input type="checkbox" id="cs-rafraichir"> Ignorer le cache local et tout relire</label>
      </details>
    </section>`;
  const champ = racine.querySelector("#cs-adresse"), msg = racine.querySelector("#cs-msg-adresse");
  const verifier = () => {
    const saisies = champ.value.split(/[\s,;]+/).filter(Boolean);
    if (!saisies.length) { msg.textContent = ""; msg.className = "cs-msg"; return { valide: false, adresses: [] }; }
    const res = saisies.map(x => ({ x, v: validerAdresseEvm(x) }));
    const ko = res.filter(r => !r.v.valide);
    const adresses = [...new Set(res.filter(r => r.v.valide).map(r => r.v.adresse))];
    if (ko.length) { msg.className = "cs-msg ko"; msg.textContent = ko.map(r => `✗ ${r.x.slice(0, 14)}… : ${r.v.raison}`).join(" "); return { valide: false, adresses }; }
    msg.className = "cs-msg ok";
    msg.textContent = adresses.length > 1 ? `✓ ${adresses.length} adresses valides : une vue par adresse et une vue consolidée.`
      : res[0].v.controle === "exact" ? "✓ Somme de contrôle EIP-55 vérifiée." : "✓ Format valide (adresse sans casse de contrôle : somme EIP-55 non vérifiable).";
    return { valide: true, adresses };
  };
  champ.addEventListener("input", verifier);
  racine.querySelector("form").addEventListener("submit", ev => {
    ev.preventDefault();
    const v = verifier();
    if (!v.valide) { champ.focus(); return; }
    const autres = racine.querySelector("#cs-mes-adresses").value.split(/\s+/).filter(Boolean);
    const invalides = autres.filter(a => !validerAdresseEvm(a).valide);
    if (invalides.length) { msg.className = "cs-msg ko"; msg.textContent = `✗ Adresse(s) invalide(s) dans les options : ${invalides.join(", ")}`; return; }
    surValidation({ adresses: v.adresses, mesAdresses: new Set([...autres.map(a => a.toLowerCase()), ...v.adresses]),
      seuil: racine.querySelector("#cs-seuil").value || "0", rafraichir: racine.querySelector("#cs-rafraichir").checked });
  });
  if (adresseInitiale) verifier();
}
