/* format.js — affichage des nombres et des dates, à partir des chaînes décimales
   exactes (aucun passage par un flottant). Convention française : espace fine
   insécable entre milliers, virgule décimale, vrai signe moins (U+2212). */
import { Dec } from "../scanner/decimal.js";
import { dateHeureDans } from "../scanner/modele.js";

const FINE = " ", MOINS = "−";

export function nombre(v, decimales = 2) {
  if (v === null || v === undefined) return "—";
  const s = Dec.de(v).aFixe(decimales);
  const neg = s.startsWith("-");
  const [e, f] = (neg ? s.slice(1) : s).split(".");
  const groupes = e.replace(/\B(?=(\d{3})+(?!\d))/g, FINE);
  return (neg ? MOINS : "") + groupes + (f ? "," + f : "");
}

export const usd = (v, d = 2) => (v === null || v === undefined ? "—" : `${nombre(v, d)}${FINE}$`);
export const eur = (v, d = 2) => (v === null || v === undefined ? "—" : `${nombre(v, d)}${FINE}€`);
export const parts = v => (v === null || v === undefined ? "—" : nombre(v, 6).replace(/,?0+$/, "").replace(/,$/, ""));

/** Montant signé avec icône et classe : ne repose jamais sur la seule couleur. */
export function signe(v, unite = "$", d = 2) {
  if (v === null || v === undefined) return `<span class="cs-mono">—</span>`;
  const x = Dec.de(v), s = x.signe();
  const txt = (s > 0 ? "+" + FINE : "") + nombre(x, d) + FINE + unite;
  if (s === 0) return `<span class="cs-mono">${txt}</span>`;
  return `<span class="cs-mono ${s > 0 ? "cs-gain" : "cs-perte"}"><span aria-hidden="true">${s > 0 ? "▲" : "▼"}</span> ${txt}<span class="cs-sr">${s > 0 ? " (gain)" : " (perte)"}</span></span>`;
}

export const dateParis = ts => (ts ? dateHeureDans(ts, "Europe/Paris") : "—");
export const dateUtc = ts => (ts ? dateHeureDans(ts, "UTC") : "—");
export const court = (h, n = 10) => (h ? `${h.slice(0, n)}…${h.slice(-4)}` : "—");
export const html = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const lienTx = h => `<a class="cs-mono" href="https://polygonscan.com/tx/${html(h)}" target="_blank" rel="noopener" title="${html(h)}">${court(h)}</a>`;
export const lienAdresse = a => (a ? `<a class="cs-mono" href="https://polygonscan.com/address/${html(a)}" target="_blank" rel="noopener" title="${html(a)}">${court(a, 8)}</a>` : "—");
