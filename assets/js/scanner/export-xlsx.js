/* export-xlsx.js — classeur XLSX écrit sans dépendance.
   Un fichier XLSX est une archive ZIP de fichiers XML (Office Open XML, ECMA-376).
   L'archive est écrite en mode « stored » (sans compression), avec CRC-32 : c'est
   un ZIP valide, simplement plus volumineux. Cellules : texte en chaîne en ligne
   (inlineStr), nombres en valeur numérique.
   Limite connue : un tableur lit les nombres en virgule flottante (15 chiffres
   significatifs). Les montants exacts restent disponibles dans l'export CSV. */

const enc = new TextEncoder();

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(octets) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Archive ZIP « stored ». fichiers : [{ nom, contenu: string | Uint8Array }] → Uint8Array */
export function zip(fichiers) {
  const parties = [], central = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = enc.encode(f.nom);
    const donnees = typeof f.contenu === "string" ? enc.encode(f.contenu) : f.contenu;
    const crc = crc32(donnees);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // UTF-8
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);           // date DOS fixe : 1980-01-01
    local.setUint32(14, crc, true); local.setUint32(18, donnees.length, true); local.setUint32(22, donnees.length, true);
    local.setUint16(26, nom.length, true); local.setUint16(28, 0, true);
    parties.push(new Uint8Array(local.buffer), nom, donnees);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, donnees.length, true); c.setUint32(24, donnees.length, true);
    c.setUint16(28, nom.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true);
    c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, decalage, true);
    central.push(new Uint8Array(c.buffer), nom);
    decalage += 30 + nom.length + donnees.length;
  }
  const tailleCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true); fin.setUint32(16, decalage, true);
  const tout = [...parties, ...central, new Uint8Array(fin.buffer)];
  const sortie = new Uint8Array(tout.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of tout) { sortie.set(p, i); i += p.length; }
  return sortie;
}

const xml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function colonne(i) {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

const NOMBRE = /^-?\d+(\.\d+)?$/;

function feuille(lignes) {
  const rangs = lignes.map((l, r) => `<row r="${r + 1}">` + l.map((v, c) => {
    const ref = `${colonne(c)}${r + 1}`;
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "object" && v.nombre !== undefined) return `<c r="${ref}"><v>${v.nombre}</v></c>`;
    const s = String(v);
    const style = r === 0 ? ' s="1"' : "";
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(s)}</t></is></c>`;
  }).join("") + "</row>").join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${rangs}</sheetData></worksheet>`;
}

/** Marque une valeur comme numérique (chaîne décimale exacte ou Dec). */
export const nombre = v => (v === null || v === undefined || v === "" ? "" : NOMBRE.test(String(v)) ? { nombre: String(v) } : String(v));

/** Classeur. onglets : [{ nom, lignes: [[en-têtes…], [valeurs…], …] }] → Uint8Array */
export function classeur(onglets) {
  const noms = onglets.map(o => xml(o.nom.slice(0, 31)));
  const fichiers = [
    { nom: "[Content_Types].xml", contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${onglets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { nom: "_rels/.rels", contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nom: "xl/workbook.xml", contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${noms.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { nom: "xl/_rels/workbook.xml.rels", contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${onglets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${onglets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nom: "xl/styles.xml", contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` },
    ...onglets.map((o, i) => ({ nom: `xl/worksheets/sheet${i + 1}.xml`, contenu: feuille(o.lignes) }))
  ];
  return zip(fichiers);
}
