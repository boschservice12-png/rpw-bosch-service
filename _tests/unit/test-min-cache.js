// ════════════════════════════════════════════════════════════════
//  A KICSUPASZÍTOTT GYORSÍTÓTÁR NEM MEHET VISSZA A SZERVERRE
//  ----------------------------------------------------------------
//  Kódreview, 2026-08-29. A `RPWCache.setJob` SZÁNDÉKOSAN hiányos
//  objektumot tárol (`minimal()`): nincs benne `client`, `phone`,
//  `vin`, `photos`, `elements`, `closing`. Kilenc lap viszont ezt
//  csinálta:
//
//      var cached = JSON.stringify(RPWCache.getJob(jid)||null);
//      if(cached){ JOB = JSON.parse(cached); ... render(); }
//
//  Két hiba egyszerre:
//    1. a `JSON.stringify(null)` a `"null"` STRING, ami IGAZ — az őr
//       sosem védett;
//    2. ha volt bejegyzés, a KICSUPASZÍTOTT munka került a JOB-ba. A
//       felhasználó szerkesztette, a `saveJ()` pedig visszaküldte —
//       részlegesen. Egy ingadozó hálózat így az adatvédelmi
//       funkcióból ADATVESZTÉST csinált.
//
//  Ez a teszt nem szöveget keres: valódi tárolóval végigviszi az utat,
//  és külön őrzi, hogy egyetlen lap se térjen vissza a régi mintához.
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  x ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

// ── valódi tároló, hogy az egész út végigfusson ──
const memoria = {};
global.localStorage = {
  getItem: k => (k in memoria ? memoria[k] : null),
  setItem: (k, v) => { memoria[k] = String(v); },
  removeItem: k => { delete memoria[k]; },
  key: i => Object.keys(memoria)[i],
  get length(){ return Object.keys(memoria).length; }
};
const C = require(path.join(ROOT, 'rpw-cache.js'));

const TELJES = {
  id:'J1', number:'123', plate:'MS-01-AAA', phase:7,
  client:'Nagy Béla', phone:'0730508346', vin:'WVWZZZ1JZXW000001',
  closing:{ closedAt:'2026-08-29', factura:'F-2026-77' },
  closingPhotos:[{data:'x'},{data:'y'}],
  elements:[{name:'capota'}], photos:['a.jpg'],
  phases:{ 1:{status:'done'} }
};

console.log('\n1. A MIN-bejegyzés megmondja magáról, hogy hiányos');
{
  const m = C.minimal(TELJES);
  eq(m.__min, 1, 'meg van jelölve');
  ok(m.client === undefined, '  a nevet tényleg nem tárolja');
  ok(m.phone  === undefined, '  a telefonszámot sem');
  ok(m.vin    === undefined, '  a VIN-t sem');
  ok(m.closing === undefined, '  a lezárási adatokat sem');
  ok(m.closingPhotos === undefined, '  a fotókat sem');
}

console.log('\n2. A régi minta CSAPDÁJA — ezért nem védett az őr');
{
  // Pontosan az a kifejezés, ami kilenc lapban állt.
  const regi = JSON.stringify(C.getJob('nincs-ilyen-munka') || null);
  eq(regi, 'null', 'a JSON.stringify(null) a "null" STRING-et adja');
  ok(!!regi === true, '  ami IGAZ — tehát az `if(cached)` őr átengedte');
  ok(JSON.parse(regi) === null, '  és csak a parse mentette meg a lapot');
}

console.log('\n3. Az ÚJ olvasó a MIN-bejegyzést NEM adja ki teljes munkaként');
{
  C.setJob(TELJES);
  const tarolt = C.getJob('J1');
  ok(!!tarolt, 'a bejegyzés eltárolódott');
  eq(tarolt.__min, 1, '  és MIN-ként van jelölve');

  const biztos = C.getFullJobJson('J1');
  eq(biztos, null, 'a getFullJobJson VALÓDI null-t ad — nem "null" stringet');
  ok(!!biztos === false, '  tehát az `if(cached)` őr MOST tényleg zár');
}

console.log('\n4. Nem létező munkára is valódi null');
{
  eq(C.getFullJobJson('nincs-ilyen'), null, 'ismeretlen azonosító → null');
}

console.log('\n5. TELJES munkát viszont kiad — a gyorsítótár nem halt meg');
{
  // Nem a setJob-on át: az mindig minimal()-t tárol. Közvetlen írással
  // bizonyítjuk, hogy a szűrő a JELÖLÉSRE néz, nem mindent utasít el.
  C.set('job:J2', { id:'J2', client:'Nagy Béla', closing:{ factura:'F-1' } });
  const j = C.getFullJobJson('J2');
  ok(typeof j === 'string', 'a teljes munkát JSON-ként kiadja');
  const vissza = JSON.parse(j);
  eq(vissza.client, 'Nagy Béla', '  és minden mezője megvan');
  eq(vissza.closing.factura, 'F-1', '  a lezárási adat is');
}

console.log('\n6. EGYETLEN lap sem tér vissza a régi mintához');
{
  const lapok = fs.readdirSync(ROOT).filter(n => /\.html$/.test(n));
  let erintett = 0;
  lapok.forEach(n => {
    const s = R(n);
    ok(s.indexOf('JSON.stringify(RPWCache.getJob') < 0,
       n + ': VISSZATÉRT a régi, csapdás minta (JSON.stringify(getJob…))');
    ok(!/Date\.parse\(null\s*\|\|\s*0\)/.test(s),
       n + ': visszatért a halott frissesség-összehasonlítás (Date.parse(null||0))');
    if(s.indexOf('RPWCache.getFullJobJson') >= 0) erintett++;
  });
  ok(erintett >= 9, 'legalább kilenc lap a biztonságos olvasót használja  (' + erintett + ')');
}

console.log('\n' + (fail ? 'x ' : 'OK ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
