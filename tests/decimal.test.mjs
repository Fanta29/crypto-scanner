import { test } from "node:test";
import assert from "node:assert/strict";
import { Dec, d, somme } from "../assets/js/scanner/decimal.js";

test("lecture et écriture canoniques", () => {
  assert.equal(d("12.3400").toString(), "12.34");
  assert.equal(d("-0.5").toString(), "-0.5");
  assert.equal(d("0").toString(), "0");
  assert.equal(d("-0").toString(), "0");
  assert.equal(d("1e-6").toString(), "0.000001");
  assert.equal(d("2.5E3").toString(), "2500");
  assert.equal(d(".5").toString(), "0.5");
  assert.throws(() => d("abc"));
  assert.throws(() => d(""));
});

test("nombres JSON : représentation la plus courte, pas la valeur binaire", () => {
  // 0.1 + 0.2 en flottant vaut 0.30000000000000004 ; en Dec, la somme est exacte
  assert.equal(d(0.1).plus(d(0.2)).toString(), "0.3");
  assert.equal(d(1e-6).toString(), "0.000001");
  assert.equal(d(215.058822).toString(), "215.058822");
  assert.equal(d(0.6699999991).toString(), "0.6699999991");
});

test("unités de base", () => {
  assert.equal(Dec.deUnites("162856", 6).toString(), "0.162856");
  assert.equal(Dec.deUnites(1500000000n, 6).toString(), "1500");
});

test("arithmétique exacte et arrondi demi au pair", () => {
  assert.equal(d("80.835821").fois("0.6699999991").toString(), "54.1599999972477611"); // produit exact, recalculé avec Python Decimal
  assert.equal(d("1").divise("3").aFixe(6), "0.333333");
  assert.equal(d("2.5").arrondi(0).toString(), "2");
  assert.equal(d("3.5").arrondi(0).toString(), "4");
  assert.equal(d("-2.5").arrondi(0).toString(), "-2");
  assert.equal(d("0.125").aFixe(2), "0.12");
  assert.equal(d("0.135").aFixe(2), "0.14");
  assert.equal(d("-1.005").aFixe(2), "-1.00");   // valeurs attendues recalculées avec Python Decimal, ROUND_HALF_EVEN
  assert.throws(() => d(1).divise(0));
});

test("précision excessive refusée plutôt que tronquée", () => {
  assert.throws(() => d("0." + "0".repeat(18) + "1"));
  assert.equal(d("0." + "0".repeat(17) + "10").toString(), "0." + "0".repeat(17) + "1");
});

test("somme et comparaisons", () => {
  assert.equal(somme(["30711.473182", "-20615", "69156.110093", "69438.205076", "23.1851", "-148713.810595"]).toString(), "0.162856");
  assert.ok(d("1").sup("0.999999"));
  assert.ok(d("-1").inf(0));
  assert.equal(d("0.000").estZero(), true);
  assert.equal(JSON.stringify({ v: d("1.50") }), '{"v":"1.5"}');
});
