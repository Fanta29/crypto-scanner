import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, avecChecksum, validerAdresseEvm } from "../assets/js/scanner/checksum.js";

test("Keccak-256 : vecteurs connus", () => {
  // Keccak-256("") et Keccak-256("abc") : valeurs de référence Ethereum (Keccak d'origine, pas SHA3-256)
  assert.equal(keccak256(new Uint8Array()), "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(keccak256(new TextEncoder().encode("abc")), "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  // Bloc de 136 octets exactement (frontière du taux) : le bourrage occupe un bloc entier de plus
  assert.equal(keccak256(new Uint8Array(136)).length, 64);
});

test("EIP-55 : vecteurs de la spécification", () => {
  // https://eips.ethereum.org/EIPS/eip-55 (« Test Cases »)
  for (const a of ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
    "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB", "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb"]) {
    assert.equal(avecChecksum(a.toLowerCase()), a);
    assert.equal(validerAdresseEvm(a).controle, "exact");
  }
});

test("validation d'adresse", () => {
  assert.equal(validerAdresseEvm("0x0054027F89EB523717D92C911a7fC8beE9dC59Ff").valide, true);
  assert.equal(validerAdresseEvm("0x0054027f89eb523717d92c911a7fc8bee9dc59ff").controle, "absent");
  assert.equal(validerAdresseEvm("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD").valide, false);   // une casse modifiée
  assert.equal(validerAdresseEvm("0x123").valide, false);
  assert.equal(validerAdresseEvm("").valide, false);
});
