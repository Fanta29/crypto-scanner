// Faux transport HTTP pour les tests : une fonction (url) → { status, body, headers }.
export function fauxTransport(gestionnaire) {
  const appels = [];
  const transport = async url => {
    const u = new URL(url);
    appels.push(u);
    const r = await gestionnaire(u, appels.length);
    const corps = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return { status: r.status ?? 200, ok: (r.status ?? 200) < 400, headers: new Map(Object.entries(r.headers || {})), text: async () => corps };
  };
  transport.appels = appels;
  return transport;
}
