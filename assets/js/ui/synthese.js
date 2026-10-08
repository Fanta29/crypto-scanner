/* synthese.js — tableau de bord : volumes (plusieurs définitions), résultat, comparaison
   avec les chiffres affichés par Polymarket, graphiques mensuels. */
import { Dec } from "../scanner/decimal.js";
import { DEFINITIONS_VOLUME } from "../scanner/volumes.js";
import { usd, parts, signe, nombre, dateParis, html } from "./format.js";
import { barres } from "./graphique.js";

export function synthese(a) {
  const v = a.volumes, p = a.pnl, ref = a.reference;
  const s = ref.stats?.all_time_pnl;
  const couv = a.controle.couverture;
  const kpi = (k, val, d = "") => `<div class="cs-kpi"><div class="k">${k}</div><div class="v">${val}</div>${d ? `<div class="d">${d}</div>` : ""}</div>`;
  return `
  <section class="card" aria-labelledby="cs-t-synth">
    <p class="eyebrow">Synthèse · ${html(couv.nombre.toLocaleString("fr-FR"))} événements du ${html(dateParis(couv.premier))} au ${html(dateParis(couv.dernier))} (heure de Paris)</p>
    <h2 id="cs-t-synth" style="margin-top:0">Volumes</h2>
    <div class="cs-kpis">
      ${kpi("Parts échangées", parts(v.parts), DEFINITIONS_VOLUME.parts)}
      ${kpi("Notionnel", usd(v.notionnel), DEFINITIONS_VOLUME.notionnel)}
      ${kpi("Espèces échangées", usd(v.especes), DEFINITIONS_VOLUME.especes)}
      ${kpi("Espèces + rachats", usd(v.especesEtRachats), DEFINITIONS_VOLUME.especesEtRachats)}
    </div>
    ${ref.volume ? `<p class="muted" style="font-size:13.5px">Polymarket affiche un « volume » de <b class="cs-mono">${parts(ref.volume.volume)}</b> : ce sont des <b>parts</b>, pas des dollars
      ${Dec.de(ref.volume.volume).egal(v.parts) ? "— recalcul identique à l'unité près." : "— <span class=\"cs-ecart\">⚠ différent du recalcul, voir la réconciliation.</span>"}
      Son équivalent en dollars (notionnel, hors frais) est ${usd(ref.volume.volume_usdc)}.</p>` : ""}

    <h2>Résultat</h2>
    <div class="cs-kpis">
      ${kpi("Réalisé par opérations", signe(p.realiseOperations), "Ventes et rachats, au coût moyen pondéré, frais inclus")}
      ${kpi("Positions résolues non rachetées", signe(p.constateResolu), `${a.evaluation.resolues.length} positions à leur valeur de résolution (0 pour une issue perdante)`)}
      ${kpi("Remises et récompenses", signe(p.revenus), "Rebates, rewards, rendement")}
      ${kpi("Résultat global", signe(p.global), "Somme des trois lignes précédentes")}
      ${kpi("Latent (positions ouvertes)", signe(p.latent), `${a.evaluation.ouvertes.length} position(s) au prix courant Polymarket — non réalisé`)}
      ${kpi("Frais payés", usd(p.frais), "Déjà inclus dans les montants ci-dessus")}
    </div>
    ${s ? `<details class="cs-options"><summary>Comparer avec le résultat affiché par Polymarket</summary>
      <div class="cs-table-wrap"><table class="cs-table">
        <thead><tr><th>Rubrique Polymarket (/v2/user-stats)</th><th>Polymarket</th><th>Cet outil</th></tr></thead><tbody>
        <tr><td>realized_pnl (marchés + combinés)</td><td class="n">${usd(s.realized_pnl)}</td><td class="n">${usd(p.realiseOperations.plus(p.constateResolu))}</td></tr>
        <tr><td>unrealized_pnl</td><td class="n">${usd(s.unrealized_pnl)}</td><td class="n">${usd(p.latent)}</td></tr>
        <tr><td>Remises (taker + maker rebates, rewards…)</td><td class="n">${usd(s.wallet_income)}</td><td class="n">${usd(p.revenus)}</td></tr>
        <tr class="total"><td>economic_pnl</td><td class="n">${usd(s.economic_pnl)}</td><td class="n">${usd(p.global.plus(p.latent))}</td></tr>
        </tbody></table></div>
      <p class="muted" style="font-size:13px">Polymarket ne documente pas la composition exacte de ces rubriques ; son relevé date du ${html(dateParis(s.timestamp))}.
        Le résultat de cet outil se vérifie par une identité comptable : il égale les espèces nettes de l'activité (hors dépôts et retraits),
        vérifiées on-chain transaction par transaction, plus la valeur des parts encore détenues.</p></details>` : ""}

    <h2>Par mois</h2>
    <h4>Espèces échangées (achats + ventes)</h4>
    ${barres({ series: a.mensuel.map(m => ({ etiquette: m.periode, valeur: m.volumes.especes })), titre: "Espèces échangées par mois" })}
    <h4>Résultat (réalisé par opérations + positions résolues non rachetées)</h4>
    ${barres({ series: a.mensuel.map(m => ({ etiquette: m.periode, valeur: m.resultat })), titre: "Résultat par mois", signe: true })}
    <p class="cs-legende"><span><i class="l-1"></i>Espèces échangées</span><span><i class="l-gain"></i>Gain (▲)</span><span><i class="l-perte"></i>Perte (▼, hachuré)</span></p>
    <p class="muted" style="font-size:12.5px">Une position résolue mais jamais rachetée compte au mois de sa résolution. Sans elle, les pertes sur issues perdantes non rachetées n'apparaîtraient nulle part.</p>

    <h2>Par catégorie de marché</h2>
    <div class="cs-table-wrap"><table class="cs-table cartes">
      <thead><tr><th>Catégorie</th><th>Événements</th><th>Espèces échangées</th><th>Réalisé (opérations)</th><th>Résolues non rachetées</th><th>Résultat</th></tr></thead><tbody>
      ${a.parMarche.map(m => `<tr><td data-l="Catégorie">${html(m.categorie)}</td><td class="n" data-l="Événements">${m.nombre}</td><td class="n" data-l="Espèces">${usd(m.volumes.especes)}</td><td class="n" data-l="Réalisé (opérations)">${signe(m.realise)}</td><td class="n" data-l="Résolues non rachetées">${signe(m.constate)}</td><td class="n" data-l="Résultat">${signe(m.resultat)}</td></tr>`).join("")}
      </tbody></table></div>
    <p class="muted" style="font-size:12.5px">Catégorie déduite du préfixe de l'identifiant d'événement Polymarket (cs2 : Counter-Strike, mlb : baseball…) — heuristique, Polymarket ne fournit pas de catégorie dans l'historique.</p>
  </section>`;
}
