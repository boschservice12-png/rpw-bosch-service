// ════════════════════════════════════════════════════════════════
//  ROTHADÁS-ŐR — halott gomb és hiányzó felirat
//  ----------------------------------------------------------------
//  Két hiba, amit a felhasználó lát, a fejlesztő viszont nem:
//
//    1. HALOTT GOMB — az `onclick="valami()"` olyan függvényre mutat,
//       amit senki nem definiált. A kattintás némán elszáll.
//       (Így élt hónapokig a `toast()` hiánya a dosszié-oldalon: a
//       feltöltés az első sorában dobott, és NEM tudtad meg, miért.)
//
//    2. HIÁNYZÓ FELIRAT — a `T('kulcs')` nem talál fordítást, és a
//       NYERS KULCSOT írja ki a képernyőre („incomplete", „ore").
//
//  Ez NEM szövegkeresés: minden lap TÉNYLEGESEN betöltődik jsdom-ban,
//  a moduljaival együtt, és a valódi globálokat kérdezzük.
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  x ' + m)); };

// A JS saját szavai — nem globálok, amiket definiálni kellene
const KULCSSZO = new Set(['if','for','while','return','event','this','function','typeof',
  'switch','try','delete','void','new','let','var','const','do','else','window','document']);

// Egészséges szerver: enélkül a `rpw-guard.js` — helyesen — megállítja a lapot,
// és a jogosultság-kapuk mögötti kezelők meg sem születnének.
const CAP = { ok:true, schema_version:'007', rls_locked:true,
  business_gates_server_side:true, storage_mode:'private',
  rpcs:['rpw_jobs_list','rpw_job_get','rpw_patch_v3','rpw_transition','rpw_job_trash',
        'rpw_job_restore','rpw_job_purge','rpw2_session','rpw2_login','rpw_requirements'] };

function boot(file){
  const html = R(file);
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',
                        { url:'https://rpw.teszt/' + file, runScripts:'outside-only' });
  const w = dom.window;
  w.URL.createObjectURL = () => 'blob:teszt';
  w.URL.revokeObjectURL = () => {};
  w.localStorage.setItem('rpw_auth', JSON.stringify({
    token:'t'.repeat(64), name:'Teszt Elek', employeeId:'E1', shopId:'SHOP-A',
    can:{ open:true, reception:true, work:true, close:true,
          override:true, delete:true, team:true, posts:true },
    exp: Date.now() + 9e6 }));
  w.supabase = { createClient: () => ({
    rpc: async n => ({ data:(n === 'rpw_server_capabilities' ? CAP : null), error:null }),
    from: () => ({ select: () => ({ order: () => Promise.resolve({data:[],error:null}),
                                    eq: () => ({ single: async () => ({data:null,error:null}) }) }),
                   upsert: async () => ({ error:null }) }),
    storage: { from: () => ({ upload: async () => ({error:null}),
      createSignedUrl: async () => ({ data:{signedUrl:'https://signed/x'}, error:null }) }) } }) };
  w.fetch = async () => ({ ok:true, status:200, json: async () => ({}) });

  for (const m of html.matchAll(/<script src="(rpw-[^"]+)"><\/script>/g)) {
    try { w.eval(R(m[1])) } catch(e) {}
  }
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) { try { w.eval(m[1]) } catch(e) {} }
  return { w, html, dom };
}

const LAPOK = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f)).sort();
console.log('\n1. Minden lap betölthető');
ok(LAPOK.length >= 12, 'megvan mind a ' + LAPOK.length + ' lap');

let osszKezelo = 0, osszFelirat = 0;
console.log('\n2. Nincs halott gomb, és nincs nyers kulcs a képernyőn');
for (const f of LAPOK){
  const { w, html, dom } = boot(f);

  // ── a kezelők: onclick="nev(" · onclick=\'nev(" · onclick="window.nev("
  const nevek = new Set();
  const ESEMENY = /on(?:click|change|input|submit|blur|focus|dblclick)\s*=\s*(?:\\?["']|\\\\")\s*(window\.)?([A-Za-z_$][\w$]*)\s*\(/g;
  for (const m of html.matchAll(ESEMENY)){
    if (m[1] || !KULCSSZO.has(m[2])) nevek.add(m[2]);
  }
  const halott = [...nevek].filter(n => typeof w[n] !== 'function');
  osszKezelo += nevek.size;
  ok(halott.length === 0, f + ': ' + nevek.size + ' kezelő él' +
     (halott.length ? ' — HALOTT: ' + halott.join(', ') : ''));

  // ── a feliratok: a SZÓTÁRAT kérdezzük, nem a T() visszatérését.
  // A T() a hiányzó kulcsot önmagával adja vissza — de van kulcs, aminek a
  // román fordítása tényleg önmaga („ore"). Az nem hiányzó felirat.
  const kulcsok = new Set();
  for (const m of html.matchAll(/\bT\(\s*'([a-zA-Z_0-9]+)'\s*\)/g)) kulcsok.add(m[1]);
  const szotarak = [w.i, w.EK_NAMES, w.TXT].filter(x => x && typeof x === 'object');
  const hianyzo = szotarak.length
    ? [...kulcsok].filter(k => !szotarak.some(d => Object.prototype.hasOwnProperty.call(d, k)))
    : [];
  osszFelirat += kulcsok.size;
  ok(hianyzo.length === 0, f + ': ' + kulcsok.size + ' felirat megvan' +
     (hianyzo.length ? ' — HIÁNYZIK: ' + hianyzo.join(', ') : ''));

  try { dom.window.close() } catch(e) {}
}

console.log('\n3. Nincs duplikált szótárkulcs');
{
  // Object literálban a KÉSŐBBI kulcs csendben felülírja a korábbit. Két
  // azonos kulcs tehát nem hiba, hanem ROSSZ FELIRAT — az egyik verzió
  // sosem jelenik meg. (Ez a takarítás pont ilyet szült: az `ore` már
  // létezett, és a „hiányzik" jelzés téves volt.)
  for (const f of LAPOK){
    const s = R(f);
    const kulcsok = [...s.matchAll(/[{,\s]([a-zA-Z_][a-zA-Z_0-9]*)\s*:\s*\{\s*(?:ro|en|hu)\s*:/g)].map(m => m[1]);
    const szamlalo = {};
    kulcsok.forEach(k => { szamlalo[k] = (szamlalo[k]||0) + 1 });
    const dup = Object.keys(szamlalo).filter(k => szamlalo[k] > 1);
    ok(dup.length === 0, f + ': ' + kulcsok.length + ' szótárkulcs, mind egyedi' +
       (dup.length ? ' — DUPLA: ' + dup.join(', ') : ''));
  }
}

console.log('\n4. A mérés érdemi — nem üres halmazon mondunk igent');
ok(osszKezelo > 150, 'a lapok együtt ' + osszKezelo + ' eseménykezelőt kötnek');
ok(osszFelirat > 500, 'és ' + osszFelirat + ' feliratot kérnek le');

console.log('\n5. A dosszié-oldal üzenetsávja a helyén van');
{
  // Ez a konkrét hiány bénította meg a feltöltést és a ZIP-exportot.
  const { w, dom } = boot('rpw-dosar.html');
  ok(typeof w.toast === 'function', 'rpw-dosar.html: van toast()');
  const hivasok = (R('rpw-dosar.html').match(/[^.\w]toast\(/g) || []).length;
  ok(hivasok >= 10, '  és ' + hivasok + ' helyről hívjuk');
  try { dom.window.close() } catch(e) {}
}

console.log('\n' + (fail ? 'x ' : 'OK ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
