// Chargement des fixtures réelles (hors dépôt, voir .gitignore). Renvoie null si absentes :
// les tests qui en dépendent sont alors ignorés, avec un message explicite.
import { existsSync, readdirSync, readFileSync } from "node:fs";

export const ADRESSE_TEST = "0x0054027f89eb523717d92c911a7fc8bee9dc59ff";

function pages(dir, prefixe, cle) {
  return readdirSync(dir).filter(f => f.startsWith(prefixe)).sort()
    .flatMap(f => JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))[cle] ?? []);
}

export function chargerFixtures(adresse = ADRESSE_TEST) {
  const api = `fixtures/${adresse}`, oc = `fixtures/onchain/${adresse}`;
  if (!existsSync(api) || !existsSync(oc)) return null;
  const json = f => JSON.parse(readFileSync(`${api}/${f}`, "utf8"));
  return {
    adresse,
    activite: pages(api, "activity-desc-p", "data"),
    activiteAsc: pages(api, "activity-asc-p", "data"),
    combos: pages(api, "combos-p", "data"),
    positions: Object.fromEntries(["OPEN", "REDEEMABLE", "REDEEMABLE_LOST", "MERGEABLE", "CLOSED"]
      .map(s => [s, pages(api, `positions-${s}-p`, "data")])),
    positionsCombos: pages(api, "positions-combos-p", "data"),
    volume: json("user-volume.json").data,
    stats: json("user-stats.json").data,
    valeur: json("value.json").data,
    onchain: {
      erc20: { pUSD: pages(oc, "tokentx-pusd-p", "result"), "USDC.e": pages(oc, "tokentx-usdce-p", "result"), USDC: pages(oc, "tokentx-usdc-p", "result") },
      erc1155: pages(oc, "token1155tx-p", "result")
    },
    resolutions: existsSync(`${api}/resolutions.json`) ? json("resolutions.json").data : [],
    // Soldes relevés par tokenbalance juste après la capture on-chain (unités de base)
    soldes: (s => ({ pUSD: s.pusd, "USDC.e": s.usdce, USDC: s.usdc, capturesLe: s.capturesLe }))(JSON.parse(readFileSync(`${oc}/soldes.json`, "utf8")))
  };
}
