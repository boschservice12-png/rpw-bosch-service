// ════════════════════════════════════════════════════════════════
//  XSS-TESZTEK   (a brief 14. pontja)
//  Bemenetek: <img onerror=...>, idézőjel, <script>, javascript: URL
// ════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

// A projekt valódi escape-függvénye (index.html fejlécéből)
const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);

// ── A brief által kért bemenetek ─────────────────────────────────
const PAYLOADS = [
  ['img onerror',   '<img src=x onerror=alert(1)>'],
  ['script',        '<script>alert(1)</script>'],
  ['idézőjel',      '" onmouseover="alert(1)'],
  ['aposztróf',     "' onclick='alert(1)"],
  ['javascript URL','javascript:alert(1)'],
  ['svg onload',    '<svg onload=alert(1)>'],
  ['html entitás',  '&lt;img src=x onerror=alert(1)&gt;'],
  ['zárótag-törés', '</div><img src=x onerror=alert(1)><div>']
];

console.log('\n1. Az escape minden veszélyes karaktert semlegesít');
PAYLOADS.forEach(([nev, p]) => {
  const e = escH(p);
  ok(e.indexOf('<') < 0, '  ' + nev + ': nincs nyers <');
  ok(e.indexOf('>') < 0, '  ' + nev + ': nincs nyers >');
  ok(e.indexOf('"') < 0, '  ' + nev + ': nincs nyers "');
  ok(e.indexOf("'") < 0, '  ' + nev + ": nincs nyers '");
});

console.log('\n2. A veszélyes bemenet szövegként jelenik meg, nem elemként');
{
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="t"></div>');
  const d = dom.window.document;
  PAYLOADS.forEach(([nev, p]) => {
    d.getElementById('t').innerHTML = '<span>' + escH(p) + '</span>';
    ok(d.querySelectorAll('img').length === 0,    '  ' + nev + ': nem jött létre <img>');
    ok(d.querySelectorAll('script').length === 0, '  ' + nev + ': nem jött létre <script>');
    ok(d.querySelectorAll('svg').length === 0,    '  ' + nev + ': nem jött létre <svg>');
    const span = d.querySelector('span');
    ok(!span.getAttribute('onmouseover') && !span.getAttribute('onclick'),
       '  ' + nev + ': nem került rá eseménykezelő');
  });
}

console.log('\n3. A lightbox nem nyit meg javascript: sémájú forrást');
{
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<body></body>', { runScripts:'outside-only' });
  const w = dom.window;
  // a valódi openLB kiemelése a forrásból
  const src = R('rpw-dosar.html');
  const m = src.match(/window\.openLB\s*=\s*function[\s\S]*?\n\};/);
  ok(!!m, 'az openLB megtalálható');
  w.eval(m[0]);
  ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'vbscript:msgbox(1)',
   'data:text/html,<script>alert(1)</script>'].forEach(bad => {
    w.document.body.innerHTML = '';
    w.openLB(bad);
    ok(w.document.querySelectorAll('.lightbox').length === 0,
       '  elutasítva: ' + bad.slice(0, 28));
  });
  ['https://pelda.ro/kep.jpg', 'data:image/png;base64,iVBOR', 'blob:abc'].forEach(good => {
    w.document.body.innerHTML = '';
    w.openLB(good);
    ok(w.document.querySelectorAll('.lightbox').length === 1,
       '  megnyitva: ' + good.slice(0, 28));
  });
  // a forrás ATTRIBÚTUMKÉNT kerül be, nem HTML-ként
  w.document.body.innerHTML = '';
  w.openLB('https://pelda.ro/a.jpg" onerror="alert(1)');
  const img = w.document.querySelector('.lightbox img');
  ok(!img || !img.getAttribute('onerror'), 'idézőjeles forrásból sem lesz eseménykezelő');
}

console.log('\n4. A javított helyek escape-elve vannak');
{
  const idx = R('index.html');
  ok(/escH\(s\.plate/.test(idx),  'index.html: a rendszám escape-elve (beragadt munkák)');
  ok(/escH\(s\.client\)/.test(idx),'index.html: az ügyfélnév escape-elve');
  const rec = R('rpw-reconstatare-red.html');
  ok(/escH\(rc\.responseNote\)/.test(rec), 'reconstatare: a biztosító válasza escape-elve');
  // a KÓDOT nézzük, ne a magyarázó kommentet
  const dos = R('rpw-dosar.html').split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n');
  ok(!/lb\.innerHTML\s*=\s*'<img/.test(dos), 'dosar: a lightbox nem használ innerHTML-t');
  ok(/createElement\('img'\)/.test(dos),     '  hanem DOM-építést');
}

console.log('\n5. Az OCR eredménye sem kerül nyersen HTML-be');
{
  const sh = R('functions/_shared.js');
  ok(/function validateOcr/.test(sh), 'van séma-ellenőrzés az AI-válaszra');
  ok(/no_known_fields/.test(sh),      '  üres eredményt elutasít');
  ok(/not_an_object/.test(sh),        '  nem-objektumot elutasít');
  const o = R('functions/ocr.js');
  ok(/ai_invalid_json/.test(o),       'ocr.js: érvénytelen JSON → hiba, nem siker');
  ok(/502/.test(o),                   '  502-vel');
  ok(/needsHumanReview/.test(o),      '  emberi megerősítést kér');
  // az ismeretlen mezők nem jutnak tovább
  const H = require(path.join(ROOT, 'functions', '_shared.js'));
  const v = H.validateOcr({ vin:'WVWZZZ1JZXW000001', gonosz:'<img src=x onerror=alert(1)>' }, 'talon');
  ok(v.ok, 'érvényes mező átmegy');
  ok(v.data.gonosz === undefined, '  az ismeretlen mező NEM megy át');
  ok(v.ignored.indexOf('gonosz') >= 0, '  és jelezve van');
  ok(H.validateOcr('szöveg', 'talon').ok === false, 'szöveg-válasz elutasítva');
  ok(H.validateOcr({ semmi:1 }, 'talon').ok === false, 'ismeretlen mezők → elutasítva');
  // a kockázatos mezők megerősítést kérnek
  const u = H.flagUncertain({ vin:'ROSSZ', cnp:'123', total:'1500,50', plate:'MS12ABC' });
  ok(u.vin.needsConfirm === true,   'VIN megerősítést kér');
  ok(u.vin.ok === false,            '  és formailag hibásnak jelöli');
  ok(u.cnp.needsConfirm === true,   'CNP megerősítést kér');
  ok(u.total.needsConfirm === true, 'összeg megerősítést kér');
  ok(u.plate.needsConfirm === true, 'rendszám megerősítést kér');
}

console.log('\n6. Nincs escape nélküli felhasználói adat a HTML-építésben');
{
  const { flagged } = require(path.join(__dirname, 'xss-audit.js'));
  const RISK = /\.(client|plate|phone|nrDosar|asigurator|note|obs|responseNote|fileName)\b/;
  const valodi = flagged.filter(x => RISK.test(x.expr));
  ok(valodi.length === 0, 'az átvizsgáló nem talál felhasználói adatot escape nélkül' +
     (valodi.length ? ' — ' + valodi.map(v => v.file + ':' + v.line).join(', ') : ''));
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
