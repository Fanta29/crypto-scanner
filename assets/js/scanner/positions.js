/* positions.js — positions et résultat réalisé, au coût moyen pondéré.

   Générique : ne lit que des événements normalisés. Un actif « espèces » (STABLES) vaut
   1 USD ; tout autre actif est une position dont on suit la quantité et le coût restant.

   Règles (documentées dans le README, § Méthode de coût) :
   - Entrée de parts contre espèces (achat, split) : le coût est l'espèce nette versée,
     frais compris. Plusieurs parts reçues : répartition selon `position.allocation`
     si elle est fournie, sinon au prorata des quantités (parts égales pour un split).
   - Sortie de parts contre espèces (vente, rachat, merge) : chaque part sortie emporte
     coût moyen × quantité ; le produit (espèce nette reçue, frais déduits) est réparti
     selon `allocation` (rachat : l'issue gagnante), sinon au prorata des quantités.
     Réalisé = produit − coût emporté.
   - Échange de parts contre parts (conversion, migration) : le coût emporté par les parts
     sorties, diminué des espèces reçues, passe aux parts entrées. Si les espèces reçues
     dépassent ce coût, l'excédent est réalisé.
   - Pour une position entièrement soldée, réalisé = total reçu − total payé, exactement. */
import { Dec, somme } from "./decimal.js";
import { STABLES, anomalie, trier } from "./modele.js";

function repartir(total, mouvements, allocation) {
  // Répartit `total` entre les mouvements ; le dernier absorbe l'arrondi pour que la somme soit exacte.
  const poids = mouvements.map(m => allocation && allocation[m.actif] !== undefined ? Dec.de(allocation[m.actif])
    : allocation ? Dec.ZERO : m.quantite);
  const tot = somme(poids);
  if (tot.estZero()) return mouvements.map((m, i) => (i === mouvements.length - 1 ? total : Dec.ZERO));
  let reste = total;
  return mouvements.map((m, i) => {
    if (i === mouvements.length - 1) return reste;
    const part = total.fois(poids[i]).divise(tot).arrondi(12);
    reste = reste.moins(part);
    return part;
  });
}

/** Ordre de traitement : chronologique ; dans une même transaction, les sorties internes
    de parts passent avant les entrées internes (le coût doit partir avant d'arriver). */
function ordonner(evenements) {
  const rang = e => (e.categorie === "TRANSFERT_INTERNE" ? (e.sorties.some(m => !STABLES.has(m.actif)) ? 0 : 1) : 0);
  return trier(evenements).sort((a, b) => (a.horodatage === b.horodatage && a.hash === b.hash ? rang(a) - rang(b) : 0));
}

export function calculerPositions(evenements) {
  const pos = new Map();          // actif → position
  const realisations = [];        // { evenement, horodatage, actif, produit, cout, realise }
  const anomalies = [];
  const conditionDe = new Map();  // actif → conditionId (pour solderCondition)
  const transit = new Map();      // « hash|actif » → { quantite, cout } : parts en cours de transfert interne

  const get = (actif, e) => {
    if (!pos.has(actif)) {
      pos.set(actif, { actif, quantite: Dec.ZERO, cout: Dec.ZERO, paye: Dec.ZERO, recu: Dec.ZERO, realise: Dec.ZERO,
        achetees: Dec.ZERO, sorties: Dec.ZERO, frais: Dec.ZERO, premier: e.horodatage, dernier: e.horodatage, cloture: null,
        marche: null, issue: null, conditionId: null, combine: false, evenements: [] });
    }
    return pos.get(actif);
  };

  for (const e of ordonner(evenements)) {
    let sortiesParts = e.sorties.filter(m => !STABLES.has(m.actif));
    const entreesParts = e.entrees.filter(m => !STABLES.has(m.actif));

    // Transfert interne de parts : le coût suit les parts, rien n'est réalisé.
    if (e.categorie === "TRANSFERT_INTERNE" && (sortiesParts.length || entreesParts.length)) {
      for (const m of sortiesParts) {
        const p = get(m.actif, e); p.dernier = e.horodatage; p.evenements.push(e.id);
        const c = p.quantite.estZero() ? Dec.ZERO : p.cout.fois(m.quantite.min(p.quantite)).divise(p.quantite);
        if (m.quantite.sup(p.quantite)) anomalies.push(anomalie("erreur", "survente", `${e.id} : transfert de ${m.quantite} parts alors que ${p.quantite} sont détenues`, [e.hash]));
        p.quantite = p.quantite.moins(m.quantite); p.cout = p.cout.moins(c);
        if (p.quantite.estZero()) p.cloture = e.horodatage;
        const k = `${e.hash}|${m.actif}`, t = transit.get(k) || { quantite: Dec.ZERO, cout: Dec.ZERO };
        transit.set(k, { quantite: t.quantite.plus(m.quantite), cout: t.cout.plus(c) });
      }
      for (const m of entreesParts) {
        const p = get(m.actif, e); p.dernier = e.horodatage; p.evenements.push(e.id);
        const k = `${e.hash}|${m.actif}`, t = transit.get(k);
        let c = Dec.ZERO;
        if (t && !t.quantite.estZero()) {
          c = t.cout.fois(m.quantite.min(t.quantite)).divise(t.quantite);
          transit.set(k, { quantite: t.quantite.moins(m.quantite), cout: t.cout.moins(c) });
        } else {
          anomalies.push(anomalie("alerte", "cout_transfert_inconnu", `${e.id} : parts reçues d'une autre de vos adresses, non analysée ici — coût d'origine inconnu, retenu à 0`, [e.hash]));
        }
        p.quantite = p.quantite.plus(m.quantite); p.cout = p.cout.plus(c); p.cloture = null;
        if (e.position?.marche && !p.marche) p.marche = e.position.marche;
        if (m.libelle && !p.issue) p.issue = m.libelle;
      }
      continue;
    }
    // Rachat sans données de parts : on solde toutes les positions de la condition.
    if (e.position?.solderCondition && sortiesParts.length === 0) {
      sortiesParts = [...pos.values()].filter(p => p.conditionId === e.position.solderCondition && p.quantite.signe() > 0)
        .map(p => ({ actif: p.actif, quantite: p.quantite }));
    }
    if (sortiesParts.length === 0 && entreesParts.length === 0) continue;

    const espEntree = somme(e.entrees.filter(m => STABLES.has(m.actif)), m => m.quantite);
    const espSortie = somme(e.sorties.filter(m => STABLES.has(m.actif)), m => m.quantite);
    const netRecu = espEntree.moins(espSortie);       // > 0 : espèces reçues
    const alloc = e.position?.allocation ?? null;

    const toucher = (p, m) => {
      p.dernier = e.horodatage; p.evenements.push(e.id);
      if (e.position) {
        if (!p.marche && e.position.marche) p.marche = e.position.marche;
        if (!p.issue && (m.libelle || e.position.issue)) p.issue = m.libelle || (e.position.tokenId && m.actif.endsWith(e.position.tokenId) ? e.position.issue : null);
        if (!p.conditionId && e.position.conditionId && e.position.tokenId && m.actif.endsWith(e.position.tokenId)) p.conditionId = e.position.conditionId;
        if (e.position.combine) p.combine = true;
      }
      if (p.conditionId) conditionDe.set(p.actif, p.conditionId);
    };

    // 1. Sorties : coût emporté au coût moyen.
    let coutSorti = Dec.ZERO;
    const coutsSortis = [];
    for (const m of sortiesParts) {
      const p = get(m.actif, e); toucher(p, m);
      let q = m.quantite;
      if (q.sup(p.quantite)) {
        anomalies.push(anomalie("erreur", "survente", `${e.id} : sortie de ${q} parts alors que ${p.quantite} sont détenues (${m.actif.slice(0, 20)}…)`, [e.hash]));
      }
      const c = p.quantite.estZero() ? Dec.ZERO : p.cout.fois(q.min(p.quantite)).divise(p.quantite);
      p.quantite = p.quantite.moins(q); p.cout = p.cout.moins(c); p.sorties = p.sorties.plus(q);
      if (p.quantite.signe() <= 0 && p.quantite.abs().inf("0.000001")) { p.quantite = Dec.ZERO; p.cout = Dec.ZERO; }
      coutSorti = coutSorti.plus(c); coutsSortis.push(c);
    }

    if (entreesParts.length === 0) {
      // Vente, rachat, merge : produit réparti, réalisé par part.
      const produits = repartir(netRecu, sortiesParts, alloc);
      sortiesParts.forEach((m, i) => {
        const p = pos.get(m.actif);
        const r = produits[i].moins(coutsSortis[i]);
        p.recu = p.recu.plus(produits[i]); p.realise = p.realise.plus(r);
        if (e.fraisUsd && sortiesParts.length === 1) p.frais = p.frais.plus(e.fraisUsd);
        if (p.quantite.estZero()) p.cloture = e.horodatage;
        realisations.push({ evenement: e.id, hash: e.hash, horodatage: e.horodatage, categorie: e.categorie, actif: m.actif, produit: produits[i], cout: coutsSortis[i], realise: r });
      });
      continue;
    }

    // 2. Entrées : coût à répartir.
    let aRepartir, realiseEchange = Dec.ZERO;
    if (sortiesParts.length === 0) {
      aRepartir = netRecu.neg();                         // espèces versées
      if (aRepartir.signe() < 0) {
        anomalies.push(anomalie("alerte", "entree_avec_paiement", `${e.id} : parts reçues avec des espèces reçues (${netRecu}) ; coût fixé à 0, excédent réalisé`, [e.hash]));
        realiseEchange = aRepartir.neg(); aRepartir = Dec.ZERO;
      }
    } else {
      aRepartir = coutSorti.moins(netRecu);              // conversion / migration
      if (aRepartir.signe() < 0) { realiseEchange = aRepartir.neg(); aRepartir = Dec.ZERO; }
    }
    const couts = repartir(aRepartir, entreesParts, alloc && Object.keys(alloc).some(k => entreesParts.some(m => m.actif === k)) ? alloc : null);
    entreesParts.forEach((m, i) => {
      const p = get(m.actif, e); toucher(p, m);
      p.quantite = p.quantite.plus(m.quantite); p.cout = p.cout.plus(couts[i]);
      p.achetees = p.achetees.plus(m.quantite);
      if (sortiesParts.length === 0) p.paye = p.paye.plus(couts[i]);
      if (e.fraisUsd && entreesParts.length === 1 && sortiesParts.length === 0) p.frais = p.frais.plus(e.fraisUsd);
      p.cloture = null;
    });
    if (sortiesParts.length > 0) {
      // Échange : le coût passe d'une position à l'autre ; seul un excédent d'espèces est réalisé.
      sortiesParts.forEach((m, i) => { const p = pos.get(m.actif); if (p.quantite.estZero()) p.cloture = e.horodatage; });
    }
    if (!realiseEchange.estZero()) {
      realisations.push({ evenement: e.id, hash: e.hash, horodatage: e.horodatage, categorie: e.categorie, actif: (sortiesParts[0] || entreesParts[0]).actif, produit: realiseEchange, cout: Dec.ZERO, realise: realiseEchange });
    }
  }

  const liste = [...pos.values()];
  return {
    positions: liste,
    ouvertes: liste.filter(p => p.quantite.signe() > 0),
    soldees: liste.filter(p => p.quantite.estZero()),
    realisations,
    realiseTotal: somme(realisations, r => r.realise),
    anomalies
  };
}
