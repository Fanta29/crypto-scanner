/* store.js — cache local des données brutes déjà récupérées (IndexedDB).
   Seul point de contact avec le stockage : le remplacer par un service distant ne
   touche rien d'autre. Aucune donnée ne quitte l'appareil. */

const BASE = "crypto-scanner", VERSION = 1, MAGASIN = "bruts";

function ouvrir() {
  return new Promise((ok, ko) => {
    if (!globalThis.indexedDB) return ko(new Error("IndexedDB indisponible"));
    const r = indexedDB.open(BASE, VERSION);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

async function operation(mode, f) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const t = db.transaction(MAGASIN, mode);
    const r = f(t.objectStore(MAGASIN));
    t.oncomplete = () => { db.close(); ok(r?.result); };
    t.onerror = () => { db.close(); ko(t.error); };
  });
}

/** Données brutes d'un connecteur pour une adresse, ou null. */
export async function lire(connecteur, adresse) {
  try { return (await operation("readonly", s => s.get(`${connecteur}:${adresse.toLowerCase()}`))) ?? null; }
  catch { return null; }
}

export async function ecrire(connecteur, adresse, bruts) {
  try { await operation("readwrite", s => s.put(bruts, `${connecteur}:${adresse.toLowerCase()}`)); return true; }
  catch { return false; }       // navigation privée, quota : le cache est un confort, pas une nécessité
}

export async function effacer(connecteur, adresse) {
  try { await operation("readwrite", s => s.delete(`${connecteur}:${adresse.toLowerCase()}`)); } catch { /* sans objet */ }
}
