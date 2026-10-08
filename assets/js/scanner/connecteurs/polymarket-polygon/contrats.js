/* contrats.js — adresses Polygon (chainid 137) utilisées par le connecteur.
   Source : https://docs.polymarket.com/resources/contracts.md (consulté le 2026-10-08),
   recoupé par les transferts réels de l'adresse de test. Adresses en minuscules. */

export const JETONS = {
  pUSD:     { adresse: "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb", decimales: 6, collateral: true },
  "USDC.e": { adresse: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimales: 6, collateral: false },
  USDC:     { adresse: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimales: 6, collateral: false }
};

/** Registres ERC-1155 des parts : seuls leurs transferts sont des positions Polymarket. */
export const REGISTRES_PARTS = {
  "0x4d97dcd97ec945f40cf65f87097ace5ea0476045": "ctf",   // Conditional Tokens (marchés v1)
  "0x006f54f7f9a22e0000cc2ab60031000000ae9fef": "v2"     // PositionManager (Polymarket Protocol V2)
};

/** Contrats Polymarket connus : un transfert avec eux est un mouvement interne au protocole. */
export const CONTRATS = {
  "0xe111180000d2663c0091e4f400237545b87b996b": "CTF Exchange",
  "0xe2222d279d744050d28e00520010520000310f59": "Neg Risk CTF Exchange",
  "0xe3333700ca9d93003f00f0f71f8515005f6c00aa": "Exchange V2 (combinés)",
  "0x4d97dcd97ec945f40cf65f87097ace5ea0476045": "Conditional Tokens",
  "0x006f54f7f9a22e0000cc2ab60031000000ae9fef": "PositionManager",
  "0x12121212006e4cd160d18e3f00711da5c3372600": "Router",
  "0x1000008dd9001b968442c1000017eae6e0da00ba": "BinaryModule",
  "0x200000900045e3b6259600682756002200028933": "NegRiskModule",
  "0x30000034706c7d8e12009dab006be20000c031a8": "CombinatorialModule",
  "0xa1200000d0002264c9a1698e001292d00e1b00af": "AutoRedeemer",
  "0x93070a847efef7f70739046a929d47a521f5b8ee": "CollateralOnramp",
  "0x2957922eb93258b93368531d39facca3b4dc5854": "CollateralOfframp",
  "0xebc2459ec962869ca4c0bd1e06368272732bcb08": "PermissionedRamp",
  "0xada100db00ca00073811820692005400218fce1f": "CtfCollateralAdapter",
  "0xada2005600dec949baf300f4c6120000bdb6eaab": "NegRiskCtfCollateralAdapter",
  "0xd91e80cf2e7be2e162c6513ced06f1dd0da35296": "Neg Risk Adapter (déprécié)",
  "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb": "pUSD",
  "0x0000000000000000000000000000000000000000": "adresse nulle (frappe / destruction)"
};

export const ADRESSE_NULLE = "0x0000000000000000000000000000000000000000";
export const lienTx = h => `https://polygonscan.com/tx/${h}`;
export const lienAdresse = a => `https://polygonscan.com/address/${a}`;
