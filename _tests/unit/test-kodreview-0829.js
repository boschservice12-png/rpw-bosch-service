// ════════════════════════════════════════════════════════════════
//  KÓDREVIEW 2026-08-29 — #3 (XSS) és #5 (hamis lezárási jelvény)
//  ----------------------------------------------------------------
//  #3: a `job.id` nyersen került egy inline `onclick`-be, egy dupla
//      idézőjeles attribútumon belüli aposztrófos JS-stringbe. A
//      munkaazonosító az adatbázisból ÉS az URL-ből jön (`gJI()` a nyers
//      query paramétert adja vissza), tehát egy aposztróf kilépett volna
//      belőle. A `plate` mellette escape-elve volt — csak az azonosító nem.
//
//  #5: a lezáró fotók jelvénye `photos.length`-t számolt. A törlés
//      (`delClosePhoto`) NULL-t hagy a tömbben, tehát 2 valódi fotó +
//      3 törölt hely is **5/5-öt mutatott, zölden**.
//
//      FONTOS PONTOSÍTÁS: a lezárás MAGA jól számolt — a
//      `RPWWorkflow.canCompletePhase` a `realPhotoCount`-ot használja,
//      ami szűri a lyukakat. Hiányos munkát tehát NEM lehetett lezárni.
//      A jelvény hazudott, és a dolgozó értetlenül állt a hibaüzenet
//      előtt. Ez a teszt MINDKETTŐT rögzíti, hogy a kapu se csússzon el.
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const LAPOK = fs.readdirSync(ROOT).filter(n => /\.html$/.test(n));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  x ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

console.log('\n1. #3 — az azonosító nem léphet ki az inline kezelőből');
{
  // A támadó bemenet: egy azonosító, ami lezárja a JS-stringet és az attribútumot.
  const escH = s => String(s==null?'':s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tamado = "x') ; alert(1) ; ('";
  const vedett = escH(encodeURIComponent(tamado));
  ok(vedett.indexOf("'") < 0, 'aposztróf nem marad benne');
  ok(vedett.indexOf('"') < 0, 'idézőjel sem');
  ok(vedett.indexOf('\\') < 0, '  visszaper sem (nem lehet idézőjelet visszacsempészni)');
  // A zárójel BENNE MARAD (az encodeURIComponent nem kódolja), és ez rendben
  // van: az érték egy JS-STRINGEN BELÜL ül, ahol a zárójel közönséges
  // karakter. A kilépéshez idézőjel kellene — az viszont %27/%22 lesz.
  // Ezt itt ki is mondjuk, hogy a következő olvasó ne "javítsa" vissza.
  var attr = 'onclick="location.assign(\'rpw-dosar.html?job=' + vedett + '\')"';
  eq((attr.match(/"/g)||[]).length, 2, 'az attribútumban PONTOSAN két idézőjel van — nem lépett ki');
  eq((attr.match(/'/g)||[]).length, 2, '  és pontosan két aposztróf');
  // és a valódi azonosítót nem rontja el
  eq(escH(encodeURIComponent('D1')), 'D1', 'a rendes azonosító változatlan');
}

console.log('\n2. #3 — egyetlen lap sem fűz nyers azonosítót inline kezelőbe');
{
  LAPOK.forEach(n => {
    const s = R(n);
    // a konkrét visszaeső minta
    ok(s.indexOf("?job='+job.id+") < 0,
       n + ": nyers job.id inline kezelőben (?job='+job.id+)");
    ok(s.indexOf("?job='+j.id+") < 0,
       n + ": nyers j.id inline kezelőben");
  });
}

console.log('\n3. #5 — a KAPU jól számol (ez eddig is így volt, itt marad)');
{
  const W = require(path.join(ROOT, 'rpw-workflow.js'));
  const lyukas = [{data:'x'}, null, null, {data:'y'}, null];
  eq(lyukas.length, 5, 'a tömb hossza 5 — ez csapta be a jelvényt');
  eq(W.realPhotoCount(lyukas), 2, 'a workflow viszont 2-t számol');
  eq(W.realPhotoCount([null,null,null,null,null]), 0, '  csupa törölt hely → 0');
  eq(W.realPhotoCount([{data:'a'},{url:'b'},{key:'c'},{path:'d'},{ref:'e'}]), 5,
     '  ötféle valódi hivatkozás → 5');

  // A LEZÁRÁS maga: hiányos munkát nem enged
  const job = { id:'J1', phase:7, closingPhotos: lyukas,
                closing:{ factura:'F-1', deviz:'D-1' } };
  const chk = W.canCompletePhase(job, 7);
  ok(chk && chk.ok !== true, 'két valódi fotóval a 7. fázis NEM zárható');
  ok((chk.missing||[]).indexOf('wf_photos_not_five') >= 0,
     '  és megnevezi az okot: wf_photos_not_five');
}

console.log('\n4. #5 — a jelvény már nem a nyers tömbhosszt mutatja');
{
  const s = R('rpw-inchidere-red.html');
  ok(s.indexOf('(photos.length>=5?') < 0,
     'rpw-inchidere-red.html: visszatért a nyers hossz-számolás');
  ok(s.indexOf('RPWWorkflow.realPhotoCount(photos)') >= 0,
     '  és a KÖZÖS számlálót használja');
  const r = R('rpw-reconstatare-red.html');
  ok(r.indexOf("+photos.length+'/20") < 0,
     'rpw-reconstatare-red.html: ott is javítva');
}

console.log('\n5. #8 — az újrapróbálás nem dobja el a hívó lejáratát');
{
  // Tele tárolót utánzunk: az ELSŐ setItem dob, a második átmegy.
  const memoria = {};
  let elsoDobott = false;
  global.localStorage = {
    getItem: k => (k in memoria ? memoria[k] : null),
    setItem: (k, v) => {
      if (!elsoDobott) { elsoDobott = true; throw new Error('QuotaExceeded'); }
      memoria[k] = String(v);
    },
    removeItem: k => { delete memoria[k]; },
    key: i => Object.keys(memoria)[i],
    get length(){ return Object.keys(memoria).length; }
  };
  delete require.cache[require.resolve(path.join(ROOT,'rpw-cache.js'))];
  const C2 = require(path.join(ROOT, 'rpw-cache.js'));

  const OT_PERC = 5*60*1000;
  C2.set('rovid', 'x', OT_PERC);
  const k = Object.keys(memoria).find(n => n.indexOf('rovid') >= 0);
  ok(!!k, 'a második próbálkozás eltárolta');
  const hatra = JSON.parse(memoria[k]).e - Date.now();
  ok(hatra <= OT_PERC + 5000, 'a HÍVÓ 5 perces lejárata maradt meg  (' + Math.round(hatra/60000) + ' perc)');
  ok(hatra < 60*60*1000, '  nem kapott 24 órát a takarítás után');
}

console.log('\n6. #7 — a belépés eldobja az anon bejegyzéseket');
{
  const memoria = {};
  global.localStorage = {
    getItem: k => (k in memoria ? memoria[k] : null),
    setItem: (k, v) => { memoria[k] = String(v); },
    removeItem: k => { delete memoria[k]; },
    key: i => Object.keys(memoria)[i],
    get length(){ return Object.keys(memoria).length; }
  };
  delete require.cache[require.resolve(path.join(ROOT,'rpw-cache.js'))];
  const C3 = require(path.join(ROOT, 'rpw-cache.js'));

  // bejelentkezés ELŐTT: anon hatókör
  eq(C3.scope(), 'anon', 'munkamenet nélkül a hatókör "anon"');
  C3.set('job:J1', { id:'J1', number:'123' });
  C3.set('lista',  [1,2,3]);
  ok(Object.keys(memoria).length >= 2, 'két anon bejegyzés keletkezett');

  const eldobva = C3.dropScope('anon');
  eq(eldobva, 2, 'a dropScope mind a kettőt eldobta');
  eq(Object.keys(memoria).length, 0, '  és nem maradt utána semmi');

  // a belépési út tényleg meghívja-e?
  const auth = R('rpw-auth.js');
  ok(/dropScope\('anon'\)/.test(auth),
     'a rpw-auth.js belépéskor MEGHÍVJA — nem csak létezik a függvény');
  const cache = R('rpw-cache.js');
  ok(/function dropScope/.test(cache), '  és a gyorsítótár adja is');
}

console.log('\n7. #6 — a függő mentés ürítése be van kötve');
{
  const save = R('rpw-save.js');
  ok(/function onExit/.test(save), 'a rpw-save.js közös kijáratot ad');
  ok(/addEventListener\('pagehide'/.test(save), '  a pagehide-ra be van kötve');
  ok(/visibilitychange/.test(save), '  és a visibilitychange-re is (telefonon ez a gyakori)');

  const LAPOK_SAVEJ = ['rpw-reconstatare-red.html','rpw-evaluare-red.html','rpw-recepcio-red.html',
                       'rpw-vopsitorie-red.html','rpw-inchidere-red.html','rpw-tinichigerie-red.html'];
  LAPOK_SAVEJ.forEach(n => {
    const s2 = R(n);
    // A puszta nev-egyezes keves: egy `if(false) RPWSave.onExit(...)` is
    // atmenne rajta. A VALODI bekotest kerjuk szamon.
    ok(s2.indexOf('if(window.RPWSave && RPWSave.onExit) RPWSave.onExit(') >= 0,
       n + ': ténylegesen bejelenti a saját ürítőjét (nem kikapcsolva)');
    ok(/clearTimeout\(_saveTimer\); _saveTimer=null;/.test(s2), '  és tényleg üríti a függő mentést');
  });
}

console.log('\n' + (fail ? 'x ' : 'OK ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
