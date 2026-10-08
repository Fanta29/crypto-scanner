/* decimal.js — nombres décimaux exacts pour l'argent et les quantités.
   Représentation : entier BigInt à échelle fixe (ECHELLE décimales). Aucune opération
   ne passe par un flottant binaire. Les arrondis sont explicites et « au plus proche,
   demi au pair » (arrondi bancaire), sauf mention contraire. */

export const ECHELLE = 18;
const F = 10n ** BigInt(ECHELLE);

function arrondirDivision(n, d) {
  // n / d arrondi au plus proche, demi au pair ; d > 0
  if (d < 0n) { n = -n; d = -d; }
  const q = n / d, r = n % d;            // troncature vers zéro
  if (r === 0n) return q;
  const deuxR = (r < 0n ? -r : r) * 2n;
  const signe = n < 0n ? -1n : 1n;
  if (deuxR > d) return q + signe;
  if (deuxR < d) return q;
  return (q % 2n === 0n) ? q : q + signe;  // exactement au milieu : vers le pair
}

export class Dec {
  constructor(brut) { this.b = brut; Object.freeze(this); }

  /** Depuis une chaîne décimale (« -12.3456 », « 1e-6 ») ou un Dec. */
  static de(x) {
    if (x instanceof Dec) return x;
    if (typeof x === "bigint") return new Dec(x * F);
    if (typeof x === "number") return Dec.deNombre(x);
    if (typeof x !== "string") throw new TypeError(`Dec.de : type non pris en charge (${typeof x})`);
    const s = x.trim();
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
    if (!m || (m[2] === "" && (m[3] === undefined || m[3] === ""))) throw new RangeError(`Décimal invalide : « ${x} »`);
    const neg = m[1] === "-";
    let entier = m[2] || "0", frac = m[3] || "";
    let exp = m[4] ? parseInt(m[4], 10) : 0;
    // décalage de la virgule par l'exposant
    let chiffres = entier + frac, virgule = entier.length + exp;
    if (virgule < 0) { chiffres = "0".repeat(-virgule) + chiffres; virgule = 0; }
    if (virgule > chiffres.length) { chiffres = chiffres + "0".repeat(virgule - chiffres.length); }
    entier = chiffres.slice(0, virgule) || "0";
    frac = chiffres.slice(virgule);
    if (frac.length > ECHELLE) {
      const reste = frac.slice(ECHELLE);
      if (/[1-9]/.test(reste)) throw new RangeError(`Précision supérieure à ${ECHELLE} décimales : « ${x} »`);
      frac = frac.slice(0, ECHELLE);
    }
    const b = BigInt(entier) * F + BigInt((frac + "0".repeat(ECHELLE)).slice(0, ECHELLE));
    return new Dec(neg ? -b : b);
  }

  /** Depuis un nombre JSON. On part de sa représentation décimale la plus courte
      (celle que JavaScript écrit et relit à l'identique), jamais de sa valeur binaire. */
  static deNombre(n) {
    if (!Number.isFinite(n)) throw new RangeError(`Nombre non fini : ${n}`);
    return Dec.de(String(n));
  }

  /** Depuis un entier brut en unités de base (ex. 162856 avec 6 décimales → 0.162856). */
  static deUnites(entier, decimales) {
    const v = BigInt(entier);
    const d = BigInt(decimales);
    if (decimales > ECHELLE) throw new RangeError("décimales > ECHELLE");
    return new Dec(v * 10n ** (BigInt(ECHELLE) - d));
  }

  static get ZERO() { return ZERO; }

  plus(y) { return new Dec(this.b + Dec.de(y).b); }
  moins(y) { return new Dec(this.b - Dec.de(y).b); }
  fois(y) { return new Dec(arrondirDivision(this.b * Dec.de(y).b, F)); }
  divise(y) {
    const d = Dec.de(y).b;
    if (d === 0n) throw new RangeError("Division par zéro");
    return new Dec(arrondirDivision(this.b * F, d));
  }
  neg() { return new Dec(-this.b); }
  abs() { return this.b < 0n ? this.neg() : this; }
  signe() { return this.b > 0n ? 1 : this.b < 0n ? -1 : 0; }
  estZero() { return this.b === 0n; }
  cmp(y) { const o = Dec.de(y).b; return this.b > o ? 1 : this.b < o ? -1 : 0; }
  egal(y) { return this.cmp(y) === 0; }
  inf(y) { return this.cmp(y) < 0; }
  sup(y) { return this.cmp(y) > 0; }
  min(y) { return this.inf(y) ? this : Dec.de(y); }
  max(y) { return this.sup(y) ? this : Dec.de(y); }

  /** Arrondi à n décimales (demi au pair). */
  arrondi(n) {
    if (n >= ECHELLE) return this;
    const pas = 10n ** BigInt(ECHELLE - n);
    return new Dec(arrondirDivision(this.b, pas) * pas);
  }

  /** Nombre de décimales significatives (zéros finaux exclus). */
  decimales() {
    const s = this.toString(); const i = s.indexOf(".");
    return i < 0 ? 0 : s.length - i - 1;
  }

  /** Écriture canonique, sans zéros inutiles : « -12.5 », « 0 ». */
  toString() {
    const neg = this.b < 0n;
    const a = neg ? -this.b : this.b;
    const e = a / F, f = (a % F).toString().padStart(ECHELLE, "0").replace(/0+$/, "");
    return (neg && (e !== 0n || f) ? "-" : "") + e.toString() + (f ? "." + f : "");
  }

  /** Écriture à n décimales exactement, après arrondi. */
  aFixe(n) {
    const r = this.arrondi(n);
    const neg = r.b < 0n;
    const a = neg ? -r.b : r.b;
    const e = a / F;
    const f = (a % F).toString().padStart(ECHELLE, "0").slice(0, n);
    return (neg && a !== 0n ? "-" : "") + e.toString() + (n > 0 ? "." + f : "");
  }

  toJSON() { return this.toString(); }
}

const ZERO = new Dec(0n);

/** Somme d'une liste (Dec, chaînes, nombres). */
export function somme(liste, f = x => x) {
  let s = 0n;
  for (const x of liste) s += Dec.de(f(x)).b;
  return new Dec(s);
}

export const d = x => Dec.de(x);
