// Construction de données brutes synthétiques au format réel (Data API v2 et Etherscan).
export const MOI = "0x00000000000000000000000000000000000000aa";
export const EXCHANGE = "0xe111180000d2663c0091e4f400237545b87b996b";
export const CTF = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
export const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
export const USDCE = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
export const NULLE = "0x0000000000000000000000000000000000000000";
const h = n => "0x" + String(n).padStart(64, "0");

export function ligne(n, o) {
  return { proxy_wallet: MOI, timestamp: 1782300000 + n * 60, condition_id: "", type: "TRADE", size: 0, usdc_size: 0,
    transaction_hash: h(n), price: 0, token_id: "", side: "", outcome_index: 999, title: "", slug: "", icon: "",
    event_slug: "", outcome: "", name: "", pseudonym: "", bio: "", profile_image: "", profile_image_optimized: "", ...o };
}
export const pusd = (n, de, vers, unites) => ({ hash: h(n), blockNumber: String(1000 + n), timeStamp: String(1782300000 + n * 60), from: de, to: vers, value: String(unites), contractAddress: PUSD });
export const parts = (n, de, vers, token, unites, registre = CTF) => ({ hash: h(n), blockNumber: String(1000 + n), timeStamp: String(1782300000 + n * 60), from: de, to: vers, tokenID: token, tokenValue: String(unites), contractAddress: registre });
export const hashDe = h;

/** Données brutes complètes. */
export const bruts = ({ activite = [], pusd: p = [], usdce = [], usdc = [], erc1155 = [], onchain = true } = {}) => ({
  adresse: MOI, activite,
  onchain: onchain ? { erc20: { pUSD: p, "USDC.e": usdce, USDC: usdc }, erc1155 } : null
});
