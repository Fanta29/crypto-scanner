/* checksum.js — validation d'adresse EVM et somme de contrôle EIP-55.
   Keccak-256 (la variante d'origine utilisée par Ethereum, et non SHA3-256 normalisé :
   le bourrage diffère, 0x01 au lieu de 0x06), implémentée ici sans dépendance.
   Référence : https://eips.ethereum.org/EIPS/eip-55 — vecteurs de test repris dans tests/. */

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const M = (1n << 64n) - 1n;
const rotl = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M);

function keccakF(s) {
  for (let r = 0; r < 24; r++) {
    const C = [0, 1, 2, 3, 4].map(x => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let x = 0; x < 5; x++) {
      const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) s[x + y] ^= D;
    }
    const B = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x + 5 * y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y] = B[x + 5 * y] ^ (~B[(x + 1) % 5 + 5 * y] & M & B[(x + 2) % 5 + 5 * y]);
    s[0] ^= RC[r];
  }
}

/** Keccak-256 d'une suite d'octets → chaîne hexadécimale de 64 caractères. */
export function keccak256(octets) {
  const taux = 136;
  const n = octets.length;
  const bloc = new Uint8Array(Math.ceil((n + 1) / taux) * taux);
  bloc.set(octets); bloc[n] = 0x01; bloc[bloc.length - 1] |= 0x80;
  const s = new Array(25).fill(0n);
  for (let o = 0; o < bloc.length; o += taux) {
    for (let i = 0; i < taux / 8; i++) {
      let v = 0n;
      for (let b = 7; b >= 0; b--) v = (v << 8n) | BigInt(bloc[o + i * 8 + b]);
      s[i] ^= v;
    }
    keccakF(s);
  }
  let h = "";
  for (let i = 0; i < 4; i++) for (let b = 0; b < 8; b++) h += Number((s[i] >> BigInt(8 * b)) & 0xffn).toString(16).padStart(2, "0");
  return h;
}

/** Adresse avec la casse EIP-55. */
export function avecChecksum(adresse) {
  const a = adresse.toLowerCase().replace(/^0x/, "");
  const h = keccak256(new TextEncoder().encode(a));
  return "0x" + [...a].map((c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join("");
}

/**
 * Valide une saisie d'adresse EVM.
 * Toute en minuscules ou toute en majuscules : format valide, somme de contrôle absente.
 * Casse mixte : la somme de contrôle EIP-55 doit être exacte.
 */
export function validerAdresseEvm(saisie) {
  const s = String(saisie || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) return { valide: false, raison: "Format attendu : 0x suivi de 40 caractères hexadécimaux." };
  const corps = s.slice(2);
  const casseUnique = corps === corps.toLowerCase() || corps === corps.toUpperCase();
  const attendu = avecChecksum(s);
  if (casseUnique) return { valide: true, adresse: s.toLowerCase(), checksum: attendu, controle: "absent" };
  if (attendu !== s) return { valide: false, raison: `Somme de contrôle EIP-55 incorrecte (attendu ${attendu}). Vérifiez l'adresse.` };
  return { valide: true, adresse: s.toLowerCase(), checksum: attendu, controle: "exact" };
}
