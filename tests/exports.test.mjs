import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, zip, classeur, nombre } from "../assets/js/scanner/export-xlsx.js";
import { versCsv } from "../assets/js/scanner/export-csv.js";

test("CRC-32 : valeur de contrôle standard", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xCBF43926);   // vecteur de contrôle du CRC-32/ISO-HDLC
});

test("ZIP stored : signatures et répertoire central", () => {
  const z = zip([{ nom: "a.txt", contenu: "bonjour" }]);
  const v = new DataView(z.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(v.getUint16(z.length - 22 + 10, true), 1);
});

test("XLSX : chaque onglet présent, texte échappé, nombres numériques", () => {
  const x = classeur([{ nom: "Détail", lignes: [["a", "b"], ["<&>", nombre("1.5")]] }]);
  const s = new TextDecoder().decode(x);
  assert.ok(s.includes("xl/worksheets/sheet1.xml"));
  assert.ok(s.includes("&lt;&amp;&gt;"));
  assert.ok(s.includes("<v>1.5</v>"));
});

test("CSV : BOM, échappement RFC 4180", () => {
  const c = versCsv([{ a: 'dit "oui", puis', b: "x" }], ["a", "b"]);
  assert.ok(c.startsWith("﻿a,b\r\n"));
  assert.ok(c.includes('"dit ""oui"", puis",x'));
});
