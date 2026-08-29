// ════════════════════════════════════════════════════════════════
//  TÖRLÉS — A TELJES LÁNC, VALÓDI LAPKÓDON
//  ----------------------------------------------------------------
//  „Nem tudok törölni." Két, egymástól független hiba ült ugyanazon
//  az úton, és EGYIKET SEM fogta meg egyetlen teszt sem, mert
//  mindkettő csak AKKOR derül ki, ha a gombkezelő TÉNYLEGESEN lefut:
//
//   1. A `rpw-cache.js` indulási takarítója a `rpw_auth` kulcsot is
//      törölte — MINDEN oldalbetöltéskor. A felhasználó folyamatosan
//      kiesett; az `isAdmin()` hamis lett, a törlés „Doar admin"-t írt.
//      (A szerveren 8 belépés látszott három nap alatt.)
//
//   2. A `dJ()` egy `L` nevű függvényt hívott, ami SEHOL nem létezik.
//      Bejelentkezve is ReferenceError-t dobott a megerősítő ablak
//      megnyitása ELŐTT: rákattintottál, és nem történt SEMMI.
//
//  Ezért ez a teszt nem szöveget keres: elindítja a lapot, belép,
//  megnyomja a gombot, és megnézi, MI ÉRT EL A SZERVERIG.
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  x ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

const CAN_MGR = { team:true, posts:true, open:true, reception:true,
                  work:true, close:true, override:true, delete:true };

console.log('\n1. A munkamenet TÚLÉLI az oldalbetöltést');
{
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
                        { url:'https://rpw.teszt/', runScripts:'outside-only' });
  const w = dom.window;
  ['rpw_auth','rpw_admin','rpw_last_who'].forEach(k => w.localStorage.setItem(k, 'x'));
  w.localStorage.setItem('rpw_job_J1', '{"client":"Nagy Béla"}');   // régi, TTL nélküli munkaadat
  w.eval(R('rpw-cache.js'));

  // ez fut minden oldalbetöltéskor (index.html)
  w.RPWCache.migrateLegacy(); w.RPWCache.sweep();

  ok(!!w.localStorage.getItem('rpw_auth'),     'a bejelentkezés MEGMARAD');
  ok(!!w.localStorage.getItem('rpw_admin'),    'az admin-kapcsoló is');
  ok(!!w.localStorage.getItem('rpw_last_who'), 'és a legutóbbi belépő neve is');
  ok(!w.localStorage.getItem('rpw_job_J1'),    'a régi munkaadat viszont TÖRLŐDIK (közös gép)');

  // kijelentkezéskor MINDEN megy
  w.RPWCache.wipe();
  ok(!w.localStorage.getItem('rpw_auth'),  'kijelentkezéskor a munkamenet törlődik');
  ok(!w.localStorage.getItem('rpw_admin'), '  az admin-kapcsoló is');

  const C = require(path.join(ROOT,'rpw-cache.js'));
  ok(C.LEGACY_SESSION.indexOf('rpw_auth') >= 0, 'a munkamenet-kulcsok külön listán vannak');
  ok(C.LEGACY_CACHE.indexOf('rpw_auth') < 0,    '  és NINCSENEK az indulási takarításban');
}

// ── Egy lap felállítása bejelentkezett emberrel ──────────────────
function bootPanel(opts){
  opts = opts || {};
  const html = R('index.html');
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',
                        { url:'https://rpw.teszt/index.html', runScripts:'outside-only' });
  const w = dom.window;
  const SZERVER = [];
  if(opts.session !== false){
    w.localStorage.setItem('rpw_auth', JSON.stringify({
      token:'t'.repeat(64), name:'Teszt Vezető', employeeId:'E1', shopId:'SHOP-A',
      rawRole:'Műszakvezető', roleCode:'MANAGER', can:(opts.can||CAN_MGR),
      exp: Date.now() + 9e6 }));
  }
  // Az AUTH_REQUIRED bekapcsolasa ota a bejelentkezett ut RPC-n megy
  // (rpw_job_trash), nem tabla-frissitessel. A harness MINDKETTOT feljegyzi,
  // kulonben a "elment-e a szerverre" allitas vakon zold lenne.
  const rpc = async (n, a) => {
    if(n === 'rpw2_session') return { data:{ ok:true, employee:{ id:'E1', name:'Teszt Vezető',
      role:'Műszakvezető', shop_id:'SHOP-A', can:(opts.can||CAN_MGR) } }, error:null };
    if(n === 'rpw_job_trash'){ SZERVER.push({ rpc:n, id:(a&&a.p_id), deleted_at:true });
      return { data:{ ok:true }, error:null }; }
    if(n === 'rpw_jobs_list') return { data:{ ok:true, rows:[] }, error:null };
    return { data:null, error:null };
  };
  const update = v => { const t = { eq: () => t,
    then: f => { SZERVER.push(v); return Promise.resolve(f({ error:null })) } }; return t; };
  w.supabase = { createClient: () => ({ rpc,
    from: () => ({ select: () => ({ order: () => Promise.resolve({data:[],error:null}) }), update:update }),
    storage: { from: () => ({}) } }) };

  for (const m of html.matchAll(/<script src="(rpw-[^"]+)"><\/script>/g)) { try { w.eval(R(m[1])) } catch(e) {} }
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) { try { w.eval(m[1]) } catch(e) {} }
  return { w, SZERVER, dom };
}

const varj = ms => new Promise(r => setTimeout(r, ms));

(async () => {

console.log('\n2. Bejelentkezett vezető: a törlés VÉGIGMEGY a szerverig');
{
  const { w, SZERVER, dom } = bootPanel({});
  await varj(300);
  ok(!!w.RPWAuth.session(), 'a munkamenet a betöltés után is él');
  ok(w.eval('isAdmin()') === true, 'isAdmin() igaz');

  const uz = []; w.__uz = uz;
  w.eval('window.toast=function(m){window.__uz.push(m)}');
  w.eval('window.RPWWorkflow.ask=function(o){ window.__cim=o.title; o.onConfirm(); }');
  w.eval('JOBS.length=0; JOBS.push({id:"J1",number:"1",plate:"MS-01-AAA",phase:7,inchis:true,' +
         'sosire:"sosit",flux:"reparatie",phases:{},programare:{}})');

  w.dJ('J1');                       // ← EZ dobott ReferenceError-t az `L()` miatt
  await varj(250);

  ok(!!w.__cim, 'a megerősítő ablak MEGNYÍLT (' + (w.__cim||'—') + ')');
  eq(SZERVER.length, 1, 'pontosan egy szerverhívás történt');
  ok(SZERVER[0] && !!SZERVER[0].deleted_at, '  és az a kosárba tette (deleted_at)');
  ok(SZERVER[0] && SZERVER[0].rpc === 'rpw_job_trash',
     '  a TOKENES úton, nem közvetlen tábla-írással  ('+((SZERVER[0]||{}).rpc||'tábla-írás')+')');
  ok(uz.join(' ').length > 0, 'a felhasználó visszajelzést kapott');
  try{ dom.window.close() }catch(e){}
}

console.log('\n3a. Bejelentkezés nélkül a panel EL SEM INDUL (RPW-001 óta)');
{
  // 2026-08-29 elott a lap munkamenet nelkul is felepult, es a torlest a
  // sajat ellenorzese allitotta meg. Az AUTH_REQUIRED bekapcsolasa ota az
  // or MAR AZ ELSO KEPKOCKA ELOTT megallitja a lapot es a loginra kuld —
  // igy a torles kerdese fel sem merul.
  const { w, SZERVER, dom } = bootPanel({ session:false });
  await varj(300);
  ok(w.RPWAuth.blocked() === true, 'az őr megállította a lapot');
  ok(!!w.document.querySelector('style[data-rpw-block]'), '  a lap el van rejtve');
  eq(SZERVER.length, 0, '  és semmi nem ment a szerverre');
  try{ dom.window.close() }catch(e){}
}

console.log('\n3b. Bejelentkezve, DE törlési jog nélkül sem töröl — és megmondja');
{
  // Ez a valodi mai eset: a dolgozo BENT van, csak nincs joga torolni.
  const { w, SZERVER, dom } = bootPanel({ can:{ team:false, posts:false, open:true,
    reception:true, work:true, close:false, override:false, delete:false } });
  await varj(300);
  ok(w.eval('isAdmin()') === false, 'isAdmin() hamis (nincs törlési jog)');
  const uz = []; w.__uz = uz;
  w.eval('window.toast=function(m){window.__uz.push(m)}');
  w.eval('window.RPWWorkflow.ask=function(o){ o.onConfirm(); }');
  w.eval('JOBS.length=0; JOBS.push({id:"J1",number:"1",plate:"MS-01-AAA",phase:7,inchis:true,' +
         'sosire:"sosit",flux:"reparatie",phases:{},programare:{}})');
  w.dJ('J1');
  await varj(250);
  eq(SZERVER.length, 0, 'semmi nem ment a szerverre');
  ok(uz.length > 0, '  és a felhasználó üzenetet kapott, nem néma kudarcot');
  try{ dom.window.close() }catch(e){}
}

console.log('\n4. Programált munkát adminként SEM lehet törölni (poka-yoke)');
{
  const { w, SZERVER, dom } = bootPanel({});
  await varj(300);
  const uz = []; w.__uz = uz;
  w.eval('window.toast=function(m){window.__uz.push(m)}');
  w.eval('window.RPWWorkflow.ask=function(o){ o.onConfirm(); }');
  w.eval('JOBS.length=0; JOBS.push({id:"J2",number:"2",plate:"MS-02-BBB",phase:1,inchis:false,' +
         'sosire:"programat",flux:"reparatie",phases:{},programare:{date:"2026-09-01"}})');
  eq(w.eval('categorizeJob(JOBS[0])'), 'viitoare', 'a munka programált');
  w.dJ('J2');
  await varj(250);
  eq(SZERVER.length, 0, 'nem törlődött — a szabály szerint csak „Ratat" lehet');
  ok(uz.length > 0, '  és megmondja, miért');
  try{ dom.window.close() }catch(e){}
}

console.log('\n5. A konkrét hiba nem jöhet vissza');
{
  const s = R('index.html');
  ok(!/lang\s*:\s*L\s*\(/.test(s), 'a törlés nem hív nem létező nyelv-függvényt');
  ok(!/[^.\w$g][^.\w$s]?\bL\s*\(\)/.test(s.replace(/\/\/[^\n]*/g,'')),
     '  és sehol máshol sincs ilyen hívás a kódban');
  ok(/lang:gL\(\)/.test(s),   '  a nyelvet a létező gL() adja');
  ok(/function gL\(\)/.test(s), '  és a gL() tényleg létezik');
}

console.log('\n' + (fail ? 'x ' : 'OK ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
})();
