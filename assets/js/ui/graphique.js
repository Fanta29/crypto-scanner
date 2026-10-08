/* graphique.js — barres mensuelles en SVG écrit à la main (aucune bibliothèque).
   Couleurs portées par des classes CSS (variables du site), jamais dans le code.
   Les barres négatives sont hachurées : le sens ne repose pas sur la seule couleur. */
import { Dec } from "../scanner/decimal.js";
import { nombre, html } from "./format.js";

export function barres({ series, titre, signe = false }) {
  // series : [{ etiquette, valeur: Dec }]
  const L = 640, H = 220, g = 44, b = 26, h = 10;
  const vals = series.map(s => Number(Dec.de(s.valeur).aFixe(2)));
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const etendue = max - min || 1;
  const y = v => h + (H - h - b) * (max - v) / etendue;
  const largeur = (L - g - 8) / Math.max(1, series.length);
  const zero = y(0);
  const graduations = [max, (max + min) / 2, min].filter((v, i, a) => a.indexOf(v) === i);
  const barresSvg = series.map((s, i) => {
    const v = vals[i], x = g + i * largeur + largeur * 0.15, w = largeur * 0.7;
    const haut = Math.min(y(v), zero), hauteur = Math.max(1, Math.abs(y(v) - zero));
    const cls = signe ? (v >= 0 ? "gain" : "perte") : "serie-1";
    return `<rect class="${cls}" x="${x.toFixed(1)}" y="${haut.toFixed(1)}" width="${w.toFixed(1)}" height="${hauteur.toFixed(1)}"><title>${html(s.etiquette)} : ${nombre(s.valeur)} $</title></rect>
      <text x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${html(s.etiquette.slice(2))}</text>`;
  }).join("");
  return `<svg class="cs-graph" viewBox="0 0 ${L} ${H}" role="img" aria-label="${html(titre)}">
    <defs><pattern id="cs-hachures" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect class="hachure-fond" width="6" height="6"/><line class="hachure-trait" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>
    ${graduations.map(v => `<line class="grille" x1="${g}" x2="${L - 4}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${g - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${Math.round(v).toLocaleString("fr-FR")}</text>`).join("")}
    <line class="axe" x1="${g}" x2="${L - 4}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}"/>
    ${barresSvg}</svg>`;
}
