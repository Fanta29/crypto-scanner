// tools/capture-fixtures.mjs — capture des réponses réelles de la Data API v2
// pour une adresse, sauvegardées telles quelles (texte brut, sans re-sérialisation)
// dans fixtures/<adresse>/. Usage : node tools/capture-fixtures.mjs 0x…
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://data-api.polymarket.com";
const TYPES = "TRADE,SPLIT,MERGE,REDEEM,REWARD,CONVERSION,MIGRATION,MAKER_REBATE,"
  + "TAKER_REBATE,REFERRAL_REWARD,YIELD,DEPOSIT,WITHDRAWAL,TIP";
const user = (process.argv[2] || "").toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(user)) { console.error("adresse invalide"); process.exit(1); }
const dir = `fixtures/${user}`;
mkdirSync(dir, { recursive: true });

async function get(url, essai = 0) {
  const r = await fetch(url);
  if (r.status === 429 || r.status >= 500) {
    const attente = Number(r.headers.get("retry-after")) * 1000 || Math.min(30000, 500 * 2 ** essai);
    if (essai >= 6) throw new Error(`${r.status} après ${essai} essais : ${url}`);
    await new Promise(ok => setTimeout(ok, attente));
    return get(url, essai + 1);
  }
  const texte = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${texte} — ${url}`);
  return texte;
}

async function parcourir(nom, chemin, params) {
  let cursor = null, n = 0, page = 0;
  do {
    const q = new URLSearchParams({ ...params, user });
    if (cursor) q.set("cursor", cursor);
    const texte = await get(`${BASE}${chemin}?${q}`);
    const json = JSON.parse(texte);
    writeFileSync(`${dir}/${nom}-p${String(page).padStart(3, "0")}.json`, texte);
    n += json.data.length; page++;
    cursor = json.pagination?.next_cursor ?? null;
    process.stdout.write(`\r${nom}: ${n} lignes, ${page} pages`);
  } while (cursor);
  console.log();
}

const commun = { limit: "1000", start: "1", type: TYPES, exclude_deposits_withdrawals: "false" };
await parcourir("activity-desc", "/v2/activity", commun);
await parcourir("activity-asc", "/v2/activity", { ...commun, sort_direction: "ASC" });
await parcourir("combos", "/v2/activity/combos", { limit: "1000" });
for (const s of ["OPEN", "REDEEMABLE", "REDEEMABLE_LOST", "MERGEABLE", "CLOSED"])
  await parcourir(`positions-${s}`, "/v2/positions", { status: s, limit: "500" }).catch(e => console.log(`\npositions ${s}: ${e.message}`));
await parcourir("positions-combos", "/v2/positions/combos", { limit: "500" }).catch(e => console.log(`\n${e.message}`));
for (const [nom, chemin, p] of [
  ["user-volume", "/v2/user-volume", {}],
  ["user-stats", "/v2/user-stats", {}],
  ["user-pnl", "/v2/user-pnl", { interval: "all", fidelity: "1d" }],
  ["value", "/v2/value", {}]
]) {
  writeFileSync(`${dir}/${nom}.json`, await get(`${BASE}${chemin}?${new URLSearchParams({ ...p, user })}`));
}
// États de résolution des marchés simples tradés (20 conditions au plus par appel)
{
  const lignes = [];
  for (const f of (await import("node:fs")).readdirSync(dir).filter(f => f.startsWith("activity-desc-p")))
    lignes.push(...JSON.parse((await import("node:fs")).readFileSync(`${dir}/${f}`, "utf8")).data);
  const conds = [...new Set(lignes.filter(r => r.condition_id && !r.is_combo).map(r => r.condition_id))].sort();
  const toutes = [];
  for (let i = 0; i < conds.length; i += 20) {
    const t = await get(`${BASE}/v2/resolutions?${new URLSearchParams({ condition: conds.slice(i, i + 20).join(",") })}`);
    toutes.push(...JSON.parse(t).data);
  }
  writeFileSync(`${dir}/resolutions.json`, JSON.stringify({ data: toutes }));
  console.log("résolutions :", toutes.length, "pour", conds.length, "conditions");
}
console.log("terminé :", dir);
