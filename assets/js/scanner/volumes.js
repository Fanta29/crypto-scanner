/* volumes.js — plusieurs définitions du volume, nommées et calculées séparément. */
import { somme } from "./decimal.js";

export const DEFINITIONS_VOLUME = {
  parts: "Parts échangées (achats + ventes) — définition du « volume » affiché par Polymarket",
  notionnel: "Notionnel Σ parts × prix, hors frais — « volume_usdc » de Polymarket",
  especes: "Espèces versées aux achats + reçues aux ventes, frais compris (Σ ACHAT + Σ VENTE)",
  especesEtRachats: "Espèces échangées + rachats gagnants (Σ ACHAT + Σ VENTE + Σ REDEEM_GAGNANT)"
};

export function volumes(evts) {
  const t = evts.filter(e => e.categorie === "ACHAT" || e.categorie === "VENTE");
  const g = evts.filter(e => e.categorie === "REDEEM_GAGNANT");
  const especes = somme(t, e => e.montantUsd);
  return {
    parts: somme(t, e => e.parts ?? 0),
    notionnel: somme(t, e => e.notionnelUsd ?? 0),
    especes,
    especesEtRachats: especes.plus(somme(g, e => e.montantUsd)),
    achats: somme(t.filter(e => e.categorie === "ACHAT"), e => e.montantUsd),
    ventes: somme(t.filter(e => e.categorie === "VENTE"), e => e.montantUsd),
    frais: somme(t, e => e.fraisUsd),
    nombreTrades: t.length
  };
}
