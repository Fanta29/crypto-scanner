// tools/serveur-dev.mjs — serveur de développement sans dépendance : fichiers statiques
// et fonctions api/*.js exécutées comme sur Vercel (req.query, res.status().json()).
// Usage : ETHERSCAN_API_KEY=… node tools/serveur-dev.mjs [port]   (défaut 8000)
// Alternative officielle : la CLI Vercel (`vercel dev`).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const RACINE = process.cwd(), PORT = Number(process.argv[2] || 8000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".csv": "text/csv" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const nom = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
      const mod = await import(pathToFileURL(join(RACINE, "api", `${nom}.js`)).href);
      const reponse = {
        statut: 200, status(c) { this.statut = c; return this; },
        setHeader: (k, v) => res.setHeader(k, v),
        json(o) { res.writeHead(this.statut, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(o)); }
      };
      return await mod.default({ method: req.method, query: Object.fromEntries(url.searchParams) }, reponse);
    }
    const chemin = normalize(join(RACINE, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
    if (!chemin.startsWith(RACINE)) { res.writeHead(403).end(); return; }
    if (!(await stat(chemin)).isFile()) throw new Error("absent");
    res.writeHead(200, { "content-type": TYPES[extname(chemin)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(chemin));
  } catch (e) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Introuvable");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
