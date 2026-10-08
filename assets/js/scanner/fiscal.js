/* fiscal.js — récapitulatif annuel orienté déclaration française.

   L'outil ne choisit aucun régime d'imposition : il fournit des données propres,
   converties et sourcées, pour que l'utilisateur ou son conseiller décide.

   Conventions (rappelées dans le document produit) :
   - année civile en heure de Paris ;
   - conversion de chaque montant au taux de référence BCE du jour de l'opération
     (USD pour 1 EUR, série EXR D.USD.EUR.SP00.A) ; à défaut de fixing ce jour-là,
     dernier fixing publié antérieur, et la substitution est signalée ligne par ligne ;
   - hypothèse 1 pUSD = 1 USDC = 1 USD (le pUSD est adossé à l'USDC, l'USDC vise la parité
     avec le dollar ; écarts de cours non pris en compte) ;
   - montants en euros calculés sans arrondi intermédiaire, arrondis au centime à
     l'affichage seulement. */
import { Dec, somme } from "./decimal.js";
import { CATEGORIES, dateDans } from "./modele.js";
import { tauxPour, SERIE_BCE, URL_BCE } from "./sources/bce.js";

export const HYPOTHESES = [
  "1 pUSD = 1 USDC = 1 USD : le pUSD est adossé à l'USDC ; les écarts de cours éventuels ne sont pas pris en compte.",
  `Conversion au taux de référence BCE du jour de l'opération (${SERIE_BCE}, USD pour 1 EUR) ; à défaut de fixing ce jour-là, dernier fixing antérieur.`,
  "Année civile appréciée en heure de Paris.",
  "Résultat réalisé au coût moyen pondéré, frais inclus dans le coût d'achat et déduits du produit de vente.",
  "Une position résolue mais non rachetée est comptée à sa valeur de résolution (0 pour une issue perdante) à la date de résolution, sur une ligne distincte."
];

export const POINTS_A_VERIFIER = [
  "Régime d'imposition applicable aux gains sur marchés prédictifs : il n'est pas tranché de façon évidente (gains de jeux, bénéfices non commerciaux, actifs numériques…). L'outil ne le choisit pas.",
  "Obligations déclaratives liées aux comptes et plateformes à l'étranger : formulaire 3916 (comptes à l'étranger) et 3916-bis (comptes d'actifs numériques), selon la nature retenue pour le wallet et la plateforme.",
  "Traitement des stablecoins (pUSD, USDC) : actifs numériques ou non au sens de la loi, et conséquences des conversions avec des euros réalisées hors Polymarket.",
  "Dépôts et retraits : leur provenance et leur destination finales (comptes, plateformes d'échange) peuvent avoir leurs propres conséquences fiscales, hors du champ de cet outil."
];

export const AVERTISSEMENT = "Ce document est une aide au calcul. Il ne constitue pas un conseil fiscal et ne préjuge pas du régime d'imposition applicable. Faites-le vérifier par un professionnel.";

function convertir(taux, horodatage, usd) {
  const date = dateDans(horodatage, "Europe/Paris");
  const t = tauxPour(taux, date);
  if (!t) return { date, taux: null, dateFixing: null, substitue: false, eur: null };
  return { date, taux: t.taux, dateFixing: t.dateFixing, substitue: t.substitue, eur: Dec.de(usd).divise(t.taux) };
}

/**
 * Récapitulatif de chaque année civile présente dans les données.
 * analyse : résultat d'analyser() ; taux : Map date → Dec (USD pour 1 EUR).
 */
export function recapitulatifs(analyse, taux, { maintenant = Math.floor(Date.now() / 1000) } = {}) {
  const annees = new Set(analyse.evenements.map(e => dateDans(e.horodatage).slice(0, 4)));
  for (const r of analyse.positions.realisations) annees.add(dateDans(r.horodatage).slice(0, 4));
  return [...annees].sort().map(a => recapAnnee(analyse, taux, a, maintenant));
}

export function recapAnnee(analyse, taux, annee, maintenant = Math.floor(Date.now() / 1000)) {
  const dans = ts => ts !== null && ts !== undefined && dateDans(ts).startsWith(annee);
  const anomalies = [];

  const lignes = analyse.evenements.filter(e => dans(e.horodatage)).map(e => {
    const c = convertir(taux, e.horodatage, e.montantUsd);
    if (!c.taux) anomalies.push(`Aucun taux BCE disponible pour ${c.date} (${e.id})`);
    return { evenement: e, ...c, fraisEur: c.taux ? e.fraisUsd.divise(c.taux) : null };
  });

  const parCategorie = Object.keys(CATEGORIES).map(cat => {
    const ls = lignes.filter(l => l.evenement.categorie === cat);
    return { categorie: cat, libelle: CATEGORIES[cat].libelle, nombre: ls.length,
      usd: somme(ls, l => l.evenement.montantUsd), eur: ls.some(l => !l.eur) ? null : somme(ls, l => l.eur) };
  }).filter(x => x.nombre > 0);

  // Réalisé par opérations, chaque réalisation convertie à sa propre date.
  const realisations = analyse.positions.realisations.filter(r => dans(r.horodatage)).map(r => ({ ...r, ...convertir(taux, r.horodatage, r.realise) }));
  // Positions résolues non rachetées : résultat constaté à la date de résolution.
  const constatees = analyse.evaluation.resolues.filter(l => dans(l.date)).map(l => ({ ...l, ...convertir(taux, l.date, l.resultat) }));
  const sansDate = analyse.evaluation.resolues.filter(l => l.date === null || l.date === undefined);
  if (sansDate.length) anomalies.push(`${sansDate.length} position(s) résolue(s) sans date de résolution connue : non rattachées à une année.`);

  const revenus = lignes.filter(l => l.evenement.categorie === "REBATE" || l.evenement.categorie === "REWARD");
  const sommeEur = ls => (ls.some(l => !l.eur) ? null : somme(ls, l => l.eur));
  const resultat = {
    realiseOperationsUsd: somme(realisations, r => r.realise), realiseOperationsEur: sommeEur(realisations),
    constateUsd: somme(constatees, l => l.resultat), constateEur: sommeEur(constatees),
    revenusUsd: somme(revenus, l => l.evenement.montantUsd), revenusEur: sommeEur(revenus)
  };
  resultat.totalUsd = resultat.realiseOperationsUsd.plus(resultat.constateUsd).plus(resultat.revenusUsd);
  resultat.totalEur = [resultat.realiseOperationsEur, resultat.constateEur, resultat.revenusEur].includes(null) ? null
    : resultat.realiseOperationsEur.plus(resultat.constateEur).plus(resultat.revenusEur);

  // Positions clôturées dans l'année (vue alternative : total reçu − total payé par position).
  const cloturees = analyse.positions.soldees.filter(p => dans(p.cloture));

  const trades = lignes.filter(l => l.evenement.categorie === "ACHAT" || l.evenement.categorie === "VENTE");
  const flux = lignes.filter(l => ["DEPOT", "RETRAIT", "TRANSFERT_INTERNE"].includes(l.evenement.categorie));

  // Fin d'année : 31 décembre 23:59:59 à Paris (≈ 1er janvier 00:00 Paris − 1 s).
  const finAnnee = Math.floor(Date.parse(`${Number(annee) + 1}-01-01T00:00:00+01:00`) / 1000) - 1;
  const anneeTerminee = maintenant > finAnnee;

  return {
    annee, anneeTerminee, finAnnee,
    lignes, parCategorie, resultat, realisations, constatees, cloturees,
    clotureesRealise: somme(cloturees, p => p.realise),
    frais: { usd: somme(trades, l => l.evenement.fraisUsd), eur: trades.some(l => !l.fraisEur) ? null : somme(trades, l => l.fraisEur) },
    flux,
    substitutions: lignes.filter(l => l.substitue).length,
    sourceTaux: { serie: SERIE_BCE, url: URL_BCE },
    hypotheses: HYPOTHESES, pointsAVerifier: POINTS_A_VERIFIER, avertissement: AVERTISSEMENT,
    anomalies
  };
}

/** Positions détenues à un instant (rejoue les événements antérieurs ou égaux). */
export async function positionsAu(evenements, horodatage) {
  const { calculerPositions } = await import("./positions.js");
  return calculerPositions(evenements.filter(e => e.horodatage <= horodatage)).ouvertes;
}
