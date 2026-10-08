// tools/capture-onchain.mjs — transferts ERC-20 (pUSD, USDC.e, USDC natif) d'une adresse
// via Etherscan API V2 (chainid 137). Clé lue dans ETHERSCAN_API_KEY, jamais écrite.
// Les réponses sont sauvegardées sans la clé. Usage : node tools/capture-onchain.mjs 0x…
import { mkdirSync, writeFileSync } from "node:fs";
const user = (process.argv[2] || "").toLowerCase();
const KEY = process.env.ETHERSCAN_API_KEY;
if (!KEY) throw new Error("ETHERSCAN_API_KEY manquante");
const JETONS = {
  pusd: "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb",
  usdce: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
  usdc: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"
};
const dir = `fixtures/onchain/${user}`;
mkdirSync(dir, { recursive: true });
const pause = ms => new Promise(ok => setTimeout(ok, ms));
for (const [nom, contrat] of Object.entries(JETONS)) {
  let page = 1, total = 0;
  for (;;) {
    const q = new URLSearchParams({ chainid: "137", module: "account", action: "tokentx",
      contractaddress: contrat, address: user, page: String(page), offset: "1000",
      sort: "asc", apikey: KEY });
    const texte = await (await fetch(`https://api.etherscan.io/v2/api?${q}`)).text();
    const j = JSON.parse(texte);
    if (j.status !== "1" && j.message !== "No transactions found") throw new Error(texte);
    const n = Array.isArray(j.result) ? j.result.length : 0;
    writeFileSync(`${dir}/tokentx-${nom}-p${page}.json`, texte);
    total += n;
    if (n < 1000) break;
    page++; await pause(400);
  }
  console.log(nom, total);
  await pause(400);
}
// Transferts ERC-1155 (parts : Conditional Tokens et PositionManager, éventuels jetons tiers)
{
  let page = 1, total = 0;
  for (;;) {
    const q = new URLSearchParams({ chainid: "137", module: "account", action: "token1155tx",
      address: user, page: String(page), offset: "1000", sort: "asc", apikey: KEY });
    const texte = await (await fetch(`https://api.etherscan.io/v2/api?${q}`)).text();
    const j = JSON.parse(texte);
    if (j.status !== "1" && j.message !== "No transactions found") throw new Error(texte);
    const n = Array.isArray(j.result) ? j.result.length : 0;
    writeFileSync(`${dir}/token1155tx-p${page}.json`, texte);
    total += n;
    if (n < 1000) break;
    page++; await pause(400);
  }
  console.log("erc1155", total);
}
// Soldes au moment de la capture (unités de base)
{
  const soldes = { capturesLe: new Date().toISOString() };
  for (const [nom, contrat] of Object.entries(JETONS)) {
    const q = new URLSearchParams({ chainid: "137", module: "account", action: "tokenbalance",
      contractaddress: contrat, address: user, tag: "latest", apikey: KEY });
    soldes[nom] = JSON.parse(await (await fetch(`https://api.etherscan.io/v2/api?${q}`)).text()).result;
    await pause(400);
  }
  writeFileSync(`${dir}/soldes.json`, JSON.stringify(soldes));
  console.log("soldes", soldes);
}
