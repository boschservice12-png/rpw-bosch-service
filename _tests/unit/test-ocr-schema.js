// ════════════════════════════════════════════════════════════════
//  OCR — A PROMPT ÉS A SZŰRŐ UGYANARRÓL BESZÉL
//  ----------------------------------------------------------------
//  Ferenc, 2026-09-03: „a fotókat nem veszi be, nem olvas az OCR".
//
//  Az OCR-lánc három darabból áll, és MINDHÁROMNAK ugyanazokat a
//  mezőneveket kell ismernie:
//     1. a PROMPT (functions/ocr.js)  — ezt kérjük az AI-tól
//     2. a SZŰRŐ  (functions/_shared.js OCR_SCHEMA) — ezt engedjük át
//     3. a KLIENS (recepció / evaluare / panel) — ezt olvassa ki
//
//  A hiba az volt, hogy a 2. más neveket ismert, mint az 1. és a 3.
//  A `validateOcr` NÉMÁN eldobta a többit: a válasz 200-zal ment vissza,
//  csak éppen üresen. Így veszett el a talon márkája/évjárata/tulajdonosa,
//  a buletin neve és címe, a constatare KÁRLISTÁJA, és így bukott 502-re
//  MINDEN Audatex-import (egyetlen ismert mezője sem volt).
//
//  Ez a teszt nem másolat: a promptot a VALÓDI fájlból olvassa ki, és
//  megköveteli, hogy minden kért mező át is jusson a szűrőn. Ha valaki
//  új mezőt tesz a promptba és elfelejti a sémát, ez a teszt megbukik.
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  x ' + m)); };

const H = require(path.join(ROOT, 'functions', '_shared.js'));
const ocrSrc = R('functions/ocr.js');

// ── A prompt LEGKÜLSŐ JSON-kulcsai (a beágyazott tömb-elemek nem) ──
function topLevelKeys(prompt){
  const i = prompt.indexOf('{');
  if (i < 0) return [];
  let depth = 0, keys = [];
  for (let p = i; p < prompt.length; p++){
    const ch = prompt[p];
    if (ch === '{' || ch === '[') { depth++; continue; }
    if (ch === '}' || ch === ']') { depth--; if (depth === 0) break; continue; }
    if (ch === '"' && depth === 1){
      const m = /^"([A-Za-z0-9_]+)"\s*:/.exec(prompt.slice(p));
      if (m) { keys.push(m[1]); p += m[0].length - 1; }
    }
  }
  return keys;
}

// A PROMPTOK objektum kiolvasása a valódi forrásból (backtick-sztringek).
function promptOf(type){
  const re = new RegExp('\\n  ' + type + ': `([\\s\\S]*?)`,?\\n', 'm');
  const m = re.exec(ocrSrc);
  return m ? m[1] : null;
}

const TIPUSOK = ['talon', 'buletin', 'constatare', 'audatex'];

console.log('\n1. A prompt minden kért mezője átjut a szűrőn');
TIPUSOK.forEach(function(t){
  const p = promptOf(t);
  ok(!!p, t + ': a prompt megvan a functions/ocr.js-ben');
  if (!p) return;
  const kert = topLevelKeys(p);
  ok(kert.length > 0, t + ': a prompt kér mezőket (' + kert.length + ')');
  const enged = H.OCR_SCHEMA[t] || [];
  const hianyzo = kert.filter(k => enged.indexOf(k) < 0);
  ok(hianyzo.length === 0,
     t + ': a szűrő MINDEN kért mezőt ismer' +
     (hianyzo.length ? ' — HIÁNYZIK: ' + hianyzo.join(', ') : ''));
});

console.log('\n2. Amit a kliens kiolvas, az meg is érkezik');
// A valódi AI-válaszok alakja — típusonként egy teljes, reális minta.
const MINTA = {
  talon:      { plate:'MS-50-BSS', vin:'W0L0AHL0864099999', brand:'DACIA',
                model:'LOGAN', year:'2009', capacitate:'1598', owner:'SZKALICZKI SERVICE S.R.L.' },
  buletin:    { name:'POPESCU IOAN', address:'Targu Mures, jud. Mures', cnp:'1900101223344' },
  constatare: { nrDosar:'GO10124', proprietar:'POPESCU IOAN', asigurator:'ALLIANZ',
                daune:[{element:'bara fata', actiune:'inlocuire', ore:null},
                       {element:'aripa dreapta fata', actiune:'reparatie', ore:1.5}] },
  audatex:    { nr_dosar:'GO10124', ore_tinichigerie:6.2, ore_vopsitorie:5.0, pret_ora:120,
                total_manopera_ron:744.00, total_vopsitorie_ron:1482.79,
                total_piese_ron:8012.44, total_cu_tva:12389.47 }
};
TIPUSOK.forEach(function(t){
  const v = H.validateOcr(MINTA[t], t);
  ok(v.ok === true, t + ': a reális AI-válasz ELFOGADVA (nem 502)');
  if (!v.ok) return;
  const elveszett = Object.keys(MINTA[t]).filter(k => !(k in v.data));
  ok(elveszett.length === 0,
     t + ': egyetlen mező sem vész el' +
     (elveszett.length ? ' — ELVESZETT: ' + elveszett.join(', ') : ''));
});

console.log('\n3. A kárlista (daune) épségben és megszűrve jut át');
{
  const v = H.validateOcr(MINTA.constatare, 'constatare');
  const d = v.ok && v.data.daune;
  ok(Array.isArray(d) && d.length === 2, 'mind a két kártétel átjön');
  ok(!!d && d[0].element === 'bara fata' && d[1].ore === 1.5, 'az elemek értékei változatlanok');

  // A tömb elemei sem mehetnek át vakon: beágyazott szerkezet NEM jut be.
  const gonosz = H.validateOcr({ nrDosar:'X1', daune:[
    { element:'bara', beagyazott:{ a:1 }, actiune:'inlocuire' }
  ]}, 'constatare');
  ok(gonosz.ok === true && !('beagyazott' in gonosz.data.daune[0]),
     'a beágyazott objektum kiesik az elemből');
  ok(gonosz.data.daune[0].element === 'bara', 'az egyszerű értékek megmaradnak');

  // Darabszám- és hosszkorlát
  const sok = H.validateOcr({ nrDosar:'X1',
    daune: Array.from({length:500}, () => ({element:'x'.repeat(1000)})) }, 'constatare');
  ok(sok.data.daune.length <= 200, 'legfeljebb 200 elem (' + sok.data.daune.length + ')');
  ok(sok.data.daune[0].element.length <= 300, 'az elemnév hossza korlátozott');
}

console.log('\n4. A szigor megmarad: a szemét továbbra is elbukik');
{
  ok(H.validateOcr({ semmi:1 }, 'talon').ok === false, 'ismeretlen mezők → elutasítva');
  ok(H.validateOcr('szöveg', 'talon').ok === false, 'szöveg-válasz elutasítva');
  ok(H.validateOcr([], 'talon').ok === false, 'tömb-válasz elutasítva');
  ok(H.validateOcr({ vin:'X' }, 'ismeretlen_tipus').ok === false, 'ismeretlen típus elutasítva');
  const xss = H.validateOcr({ vin:'WVWZZZ1JZXW000001',
                              gonosz:'<img src=x onerror=alert(1)>' }, 'talon');
  ok(xss.ok === true && !('gonosz' in xss.data), 'az injektált mező kiesik');
}

console.log('\n5. A kliens által olvasott mezők a sémában vannak');
{
  // A recepció és az evaluare a `p.<mezo>` alakban olvassa az eredményt.
  const parok = [
    ['rpw-recepcio-red.html', ['plate','vin','brand','model','year','capacitate','owner'], 'talon'],
    ['rpw-recepcio-red.html', ['name','address','cnp'], 'buletin'],
    ['rpw-recepcio-red.html', ['nrDosar','proprietar','asigurator','daune'], 'constatare'],
    ['rpw-evaluare-red.html', ['nr_dosar','ore_tinichigerie','ore_vopsitorie','pret_ora',
                               'total_manopera_ron','total_vopsitorie_ron',
                               'total_piese_ron','total_cu_tva'], 'audatex'],
    ['index.html',            ['nrDosar','proprietar','asigurator','daune','plate'], 'constatare']
  ];
  parok.forEach(function(par){
    const src = R(par[0]), enged = H.OCR_SCHEMA[par[2]];
    const olvas = par[1].filter(k => new RegExp('\\bp\\.' + k + '\\b').test(src));
    ok(olvas.length === par[1].length,
       par[0] + ' (' + par[2] + '): mind a ' + par[1].length + ' mezőt olvassa (' + olvas.length + ')');
    const kimarad = par[1].filter(k => enged.indexOf(k) < 0);
    ok(kimarad.length === 0,
       par[0] + ' (' + par[2] + '): a séma mindet átengedi' +
       (kimarad.length ? ' — KIMARAD: ' + kimarad.join(', ') : ''));
  });
}

console.log('\n6. A fotó-beolvasás nem akadhat el némán');
['rpw-recepcio-red.html', 'rpw-evaluare-red.html'].forEach(function(f){
  const s = R(f);
  ok(/r\.onerror\s*=/.test(s),          f + ': az olvasási hiba lekezelve');
  ok(/img\.onerror\s*=/.test(s),        f + ': a dekódolási hiba lekezelve');
  ok(/new Promise\(function\(res,rej\)/.test(s), f + ': a Promise-nak van elutasító ága');
  ok(/timeout/i.test(s),                f + ': van időkorlát');
  const hivas = (s.match(/resizeFile\(f\)\.then\(/g) || []).length;
  const fogas = (s.match(/\}\)\.catch\(function\(err\)\{toast\('Foto/g) || []).length;
  ok(hivas > 0 && hivas === fogas,
     f + ': mind a ' + hivas + ' fotó-hívás hibaága ki van vezetve (' + fogas + ')');
  const input = (s.match(/var f=e\.target\.files&&e\.target\.files\[0\];if\(!f\)return;/g) || []).length;
  const reset = (s.match(/try\{e\.target\.value=''\}catch\(_\)\{\}/g) || []).length;
  ok(input === reset,
     f + ': ugyanaz a fájl újra választható mind a ' + input + ' helyen (' + reset + ')');
});

console.log('\n7. Az irat lehet PDF is — a tárolás és a megjelenítés is tudja');
{
  const s = R('rpw-recepcio-red.html');

  // A tárolás nem drótozza be a .jpg-t
  ok(!/var path=JOB\.id\+'\/'\+photoKey\+'\.jpg';/.test(s),
     'a feltöltés NEM `.jpg`-t drótoz be');
  ok(/contentType:mime/.test(s), 'a feltöltés a VALÓDI tartalomtípust adja meg');
  ok(/JOB\.photoPaths\[photoKey\]=path/.test(s), 'a JOB megjegyzi a tényleges utat');
  ok(/JOB\.photoMime\[photoKey\]=mime/.test(s),  'a JOB megjegyzi a tényleges típust');
  ok(/function deletePhoto[\s\S]{0,200}var path=photoPath\(photoKey\)/.test(s),
     'a törlés a MEGJEGYZETT utat törli (nem vakon .jpg-t)');

  // A régi munka (nincs megjegyzett út) továbbra is .jpg
  ok(/if\(JOB&&JOB\.photoPaths&&JOB\.photoPaths\[photoKey\]\)return JOB\.photoPaths\[photoKey\];\s*\n\s*return JOB\.id\+'\/'\+photoKey\+'\.jpg';/.test(s),
     'a RÉGI munkák változatlanul a .jpg úton vannak');

  // A dataURL-ből olvasott típus — a valódi függvényt futtatjuk
  const src = /var MIME_EXT=[\s\S]*?\n}\n/.exec(s);
  ok(!!src, 'a MIME_EXT + mimeOfDataUrl kinyerhető a lapból');
  if (src){
    const f = new Function(src[0] + '\nreturn {m:mimeOfDataUrl,E:MIME_EXT};')();
    ok(f.m('data:application/pdf;base64,JVBERi0=') === 'application/pdf', 'PDF felismerve');
    ok(f.m('data:image/png;base64,iVBOR')          === 'image/png',       'PNG felismerve');
    ok(f.m('data:image/jpeg;base64,/9j/')          === 'image/jpeg',      'JPEG felismerve');
    ok(f.m('data:application/x-msdownload;base64,TVo') === 'image/jpeg',
       'ismeretlen típus NEM kerül be nyersen (jpeg-re esik vissza)');
    ok(f.E['application/pdf'] === 'pdf' && f.E['image/webp'] === 'webp', 'a kiterjesztés-tábla helyes');
  }

  // A megjelenítés: az irat-résekben NINCS csupasz <img>, docTag van
  ['bulUrl','talonUrl','constUrl','dUrl','cdUrl'].forEach(function(v){
    ok(!new RegExp("<img[^']*src=\"'\\+(escU\\()?" + v).test(s),
       v + ': nincs csupasz <img> (PDF-nél üres négyzet lenne)');
  });
  ok((s.match(/h\+=docTag\(/g) || []).length === 5, 'mind az 5 irat-rés a docTag-et használja');
  ok(/photoMime\(photoKey\)!=='application\/pdf'/.test(s), 'a docTag a típus szerint dönt');

  // Az accept: a FÁJLBÓL IMPORT fogad PDF-et, a KAMERA nem
  const pdfAccept = (s.match(/accept="image\/\*,application\/pdf"/g) || []).length;
  ok(pdfAccept === 5, 'öt beviteli mező fogad PDF-et (' + pdfAccept + ')');
  const kamera = s.match(/accept="[^"]*"\s+capture="environment"/g) || [];
  ok(kamera.length > 0 && kamera.every(x => !/pdf/.test(x)),
     'a kamera-bevitel NEM kér PDF-et (' + kamera.length + ' db)');
}

console.log('\n──────────────────────────────────────────');
console.log('  OCR-séma:  ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
