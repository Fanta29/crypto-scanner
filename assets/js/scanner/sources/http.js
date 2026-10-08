/* http.js — requêtes JSON avec reprises.
   `transport` est injectable (fetch par défaut) : les tests rejouent les fixtures
   sans réseau. Reprises sur 429 et 5xx : attente exponentielle plafonnée, ou la
   durée indiquée par l'en-tête Retry-After quand il est présent. */

const pause = (ms, signal) => new Promise((ok, ko) => {
  const t = setTimeout(ok, ms);
  signal?.addEventListener?.("abort", () => { clearTimeout(t); ko(signal.reason ?? new Error("Interrompu")); }, { once: true });
});

export class ErreurHttp extends Error {
  constructor(message, { statut, url, corps } = {}) {
    super(message); this.name = "ErreurHttp"; this.statut = statut; this.url = url; this.corps = corps;
  }
}

/**
 * GET JSON. Renvoie { json, texte }.
 * options : transport, signal, essaisMax (6), attenteMax (30 000 ms), surReprise(info)
 */
export async function getJson(url, { transport = globalThis.fetch, signal, essaisMax = 6, attenteMax = 30000, surReprise } = {}) {
  for (let essai = 0; ; essai++) {
    let rep;
    try {
      rep = await transport(url, { signal, headers: { accept: "application/json" } });
    } catch (e) {
      if (signal?.aborted || essai >= essaisMax) throw e;
      const attente = Math.min(attenteMax, 500 * 2 ** essai);
      surReprise?.({ url, essai, attente, cause: e.message });
      await pause(attente, signal);
      continue;
    }
    if (rep.status === 429 || rep.status >= 500) {
      if (essai >= essaisMax) throw new ErreurHttp(`HTTP ${rep.status} après ${essai + 1} essais`, { statut: rep.status, url });
      const ra = Number(rep.headers?.get?.("retry-after"));
      const attente = Number.isFinite(ra) && ra > 0 ? Math.min(attenteMax, ra * 1000) : Math.min(attenteMax, 500 * 2 ** essai);
      surReprise?.({ url, essai, attente, cause: `HTTP ${rep.status}` });
      await pause(attente, signal);
      continue;
    }
    const texte = await rep.text();
    if (!rep.ok) throw new ErreurHttp(`HTTP ${rep.status} : ${texte.slice(0, 300)}`, { statut: rep.status, url, corps: texte });
    try {
      return { json: JSON.parse(texte), texte };
    } catch {
      throw new ErreurHttp(`Réponse non JSON : ${texte.slice(0, 200)}`, { statut: rep.status, url, corps: texte });
    }
  }
}

export { pause };
