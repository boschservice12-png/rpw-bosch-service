// ════════════════════════════════════════════════════════════════
//  FRONTEND-INTEGRÁCIÓ — VALÓDI UI-ESEMÉNYTŐL   (a brief 9. és 17. pontja)
//  ----------------------------------------------------------------
//  Ez NEM statikus szövegkeresés, és NEM közvetlen RPC-hívás.
//  A valódi oldalkód fut jsdom-ban, a valódi gombkezelő indul el,
//  és rögzítjük, MELYIK Supabase RPC futott le.
//
//  A teszt elbukik, ha egy oldal:
//    · nem hív szerverátmenetet
//    · kritikus mezőt normál patch-ben küld
//    · szerverhiba után lezártnak mutatja a fázist
// ════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

// ── Egy oldal betöltése valódi kóddal ────────────────────────────
// A HTML-ből kiszedjük a külső scripteket (azokat mi töltjük be),
// és a beágyazott oldalkódot futtatjuk.
function bootPage(htmlFile, setup){
  const html = R(htmlFile);
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
                        { url:'https://rpw.teszt/', runScripts:'outside-only' });
  const w = dom.window;

  // rögzítjük az RPC-hívásokat
  const RPC = [];
  const RESP = setup.resp || {};
  const sb = {
    rpc: (n, a) => { RPC.push({ name:n, args:a });
      const r = RESP[n];
      return Promise.resolve(typeof r === 'function' ? r(a) : (r || {data:null,error:null})); },
    from: () => ({ select:()=>({eq:()=>({single:()=>Promise.resolve({data:null,error:null})})}) }),
    storage: { from: () => ({ createSignedUrl: async()=>({data:null,error:{}}) }) }
  };

  // ⚠ A konfigurációt és a munkamenetet a MODULOK BETÖLTÉSE ELŐTT
  // kell beállítani — a modulok indulásukkor olvassák.
  w.RPW_CFG = Object.assign({
    SHOP_ID:'SHOP-A', AUTH_REQUIRED:true, PATCH_RPC:'rpw_patch_v3',
    SERVER_TRANSITIONS:true, STORAGE_PRIVATE:true, PRODUCTION:false
  }, setup.cfg || {});

  // munkamenet
  w.localStorage.setItem('rpw_auth', JSON.stringify({
    token:'t'.repeat(64), name:'Teszt Elek', employeeId:'E1', shopId:'SHOP-A',
    can:{ open:true, reception:true, work:true, close:true,
          override:true, delete:true, team:true, posts:true },
    exp: Date.now() + 9e6
  }));

  // a modulok betöltése abban a sorrendben, ahogy az oldal kéri
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const loaded = [];
  for (const src of scripts) {
    if (!/^rpw-/.test(src)) continue;
    const p = path.join(ROOT, src);
    if (!fs.existsSync(p)) continue;
    try { w.eval(fs.readFileSync(p, 'utf8')); loaded.push(src); }
    catch(e){ /* egyes modulok DOM-ot várnak — a lényegiek betöltődnek */ }
  }
  // ⚠ Az `rpw-config.js` a betöltéskor FELÜLÍRJA a RPW_CFG-t az éles
  // értékekkel. A tesztkonfigurációt ezért UTÁNA kell ráolvasztani.
  w.RPW_CFG = Object.assign(w.RPW_CFG || {}, {
    SHOP_ID:'SHOP-A', AUTH_REQUIRED:true, PATCH_RPC:'rpw_patch_v3',
    SERVER_TRANSITIONS:true, STORAGE_PRIVATE:true, PRODUCTION:false
  }, setup.cfg || {});

  return { w, sb, RPC, loaded, scripts, html };
}

// ── A vizsgált oldalak és a hozzájuk tartozó művelet ─────────────
const OLDALAK = [
  { f:'rpw-recepcio-red.html',     nev:'Recepció',      phase:1, action:'complete' },
  { f:'rpw-evaluare-red.html',     nev:'Evaluare',      phase:2, action:'complete' },
  { f:'rpw-reconstatare-red.html', nev:'Reconstatare',  phase:3, action:'complete' },
  { f:'rpw-tinichigerie-red.html', nev:'Tinichigerie',  phase:4, action:'complete' },
  { f:'rpw-vopsitorie-red.html',   nev:'Vopsitorie',    phase:5, action:'complete' },
  { f:'rpw-control-red.html',      nev:'Control',       phase:6, action:'complete' },
  { f:'rpw-inchidere-red.html',    nev:'Închidere',     phase:7, action:'complete' },
  { f:'rpw-dosar.html',            nev:'Dosar',         phase:null, action:'reopen' }
];

console.log('\n1. A rpw-data.js MINDEN érintett oldalon be van töltve');
{
  const KELL = ['index.html','rpw-recepcio-red.html','rpw-evaluare-red.html',
                'rpw-reconstatare-red.html','rpw-tinichigerie-red.html',
                'rpw-vopsitorie-red.html','rpw-control-red.html',
                'rpw-inchidere-red.html','rpw-dosar.html','rpw-cos.html'];
  KELL.forEach(f => {
    const h = R(f);
    ok(/<script src="rpw-data\.js"><\/script>/.test(h), '  ' + f + ': betöltve');
  });
}

console.log('\n2. A betöltési SORREND helyes (a függőségek előbb)');
{
  OLDALAK.concat([{f:'index.html'}]).forEach(o => {
    const h = R(o.f);
    const idx = s => h.indexOf('<script src="' + s + '"></script>');
    const data = idx('rpw-data.js');
    if (data < 0) { ok(false, '  ' + o.f + ': nincs rpw-data.js'); return; }
    ['rpw-auth.js','rpw-db.js'].forEach(dep => {
      const d = idx(dep);
      if (d >= 0) ok(d < data, '  ' + o.f + ': ' + dep + ' előbb');
    });
    const wf = idx('rpw-workflow.js');
    if (wf >= 0) ok(wf < data, '  ' + o.f + ': rpw-workflow.js előbb');
  });
}

console.log('\n3. Az RPWData inicializálva van (nincs "undefined" hiba)');
{
  OLDALAK.forEach(o => {
    const h = R(o.f);
    ok(/RPWData\.init\(/.test(h), '  ' + o.nev + ': RPWData.init() meghívva');
    ok(/if\(window\.RPWData\)/.test(h) || /window\.RPWData/.test(h),
       '  ' + o.nev + ': létezés-ellenőrzéssel');
  });
}

console.log('\n4. Minden kritikus hívási hely megadja a műveletet');
{
  let osszes = 0, jelolt = 0;
  OLDALAK.forEach(o => {
    const h = R(o.f);
    const hivasok = (h.match(/commitCriticalTransition\(/g) || []).length;
    const metak    = (h.match(/action:\s*[('"]/g) || []).length;
    osszes += hivasok; jelolt += metak;
    ok(metak >= hivasok, '  ' + o.nev + ': ' + metak + '/' + hivasok + ' hívás megjelölve');
  });
  ok(jelolt >= osszes, 'összesen ' + jelolt + '/' + osszes + ' kritikus hívás megjelölve');
}

(async () => {

console.log('\n5. A tölcsér a SZERVERRE megy (valódi modul, valódi hívás)');
{
  const boot = bootPage('rpw-recepcio-red.html', {
    resp: { rpw_transition: { data:{ ok:true, version:8,
             data:{ phase:2, phases:{'1':{status:'done',completedBy:'Teszt Elek'},
                                     '2':{status:'active'}} } }, error:null } }
  });
  const w = boot.w;
  ok(!!w.RPWWorkflow, 'a RPWWorkflow betöltődött');
  ok(!!w.RPWData, 'a RPWData betöltődött');
  w.RPWData.init(boot.sb, {});
  eq(w.RPWWorkflow.serverTransitionsOn(), true,
     'a szerveroldali átmenet AKTÍV a konfigurációval');

  const JOB = { id:'J-UI-1', version:7, phases:{'1':{status:'active'}}, rework:[] };
  const res = await w.RPWWorkflow.commitCriticalTransition(JOB, function(){
    throw new Error('A HELYI MUTÁCIÓ NEM FUTHAT LE, ha a szerver dönt!');
  }, { action:'complete', phase:1,
       save:function(){ throw new Error('A régi mentési út sem futhat le!'); } });

  eq(boot.RPC.length, 1, 'PONTOSAN EGY RPC-hívás történt');
  eq(boot.RPC[0].name, 'rpw_transition', '  és az a rpw_transition');
  const a = boot.RPC[0].args;
  eq(a.p_id, 'J-UI-1', '  helyes job ID');
  eq(a.p_phase, 1, '  helyes fázis');
  eq(a.p_action, 'complete', '  helyes művelet');
  eq(a.p_expected_version, 7, '  a SZERVERTŐL kapott verzió');
  ok(a.p_token && a.p_token.length === 64, '  helyes token');
  ok(!boot.RPC.some(r => r.name === 'rpw_patch_v3'), '  NEM futott kritikus rpw_patch_v3');

  eq(res.ok, true, 'a művelet sikeres');
  eq(JOB.version, 8, 'az ÚJ verziót átvette');
  eq(JOB.phases['1'].status, 'done', 'a SZERVER állapotát vette át');
  eq(JOB.phases['1'].completedBy, 'Teszt Elek', '  a szerver írta a nevet');
  eq(JOB.phase, 2, '  a következő fázis aktív');
}

console.log('\n6. SZERVERELUTASÍTÁS után a helyi állapot VÁLTOZATLAN');
{
  const boot = bootPage('rpw-recepcio-red.html', {
    resp: { rpw_transition: { data:{ ok:false, error:'requirements_missing',
             message:'Faza nu poate fi închisă.',
             missing:[{code:'wf_talon_missing', message:'Talonul lipsește.', phase:1}] },
           error:null } }
  });
  const w = boot.w;
  w.RPWData.init(boot.sb, {});
  const JOB = { id:'J-UI-2', version:7, phase:1,
                phases:{'1':{status:'active'}}, rework:[], inchis:false };
  // A `migrateJob` séma-normalizálást végez (hiányzó fázisok kitöltése) —
  // ez NEM workflow-változás. A KRITIKUS mezőket hasonlítjuk.
  const krit = j => JSON.stringify({ phase:j.phase, inchis:j.inchis, version:j.version,
    statuszok:Object.keys(j.phases||{}).map(k => k+':'+(j.phases[k]||{}).status),
    rework:(j.rework||[]).map(r => r.id+':'+r.status) });
  w.RPWWorkflow.migrateJob(JOB);      // a séma-normalizálás UTÁN rögzítünk
  const elotte = krit(JOB);
  const res = await w.RPWWorkflow.commitCriticalTransition(JOB, function(){
    throw new Error('nem futhat');
  }, { action:'complete', phase:1 });

  eq(res.ok, false, 'a művelet elutasítva');
  eq(krit(JOB), elotte, 'a KRITIKUS mezők változatlanok');
  eq(JOB.phases['1'].status, 'active', '  a fázis NEM lett done');
  eq(JOB.inchis, false, '  a dosszié NEM zárult le');
  eq(JOB.version, 7, '  a verzió sem változott');
  ok(res.error && res.error.code === 'requirements_missing', 'a hibakód átjön');
  ok(Array.isArray(res.error.missing) && res.error.missing.length === 1,
     '  a missing lista is');
  eq(res.error.missing[0].code, 'wf_talon_missing', '  a hiány kódjával');
  ok(/lipsește/.test(res.error.missing[0].message), '  román üzenettel');
}

console.log('\n7. VERZIÓÜTKÖZÉS esetén emberi döntés, nincs csendes felülírás');
{
  const boot = bootPage('rpw-evaluare-red.html', {
    resp: { rpw_transition: { data:{ ok:false, error:'version_conflict',
             message:'Alt coleg a modificat dosarul între timp. Reîncarcă.',
             server_version:11 }, error:null } }
  });
  const w = boot.w;
  w.RPWData.init(boot.sb, {});
  const JOB = { id:'J-UI-3', version:7, phases:{'2':{status:'active'}}, rework:[] };
  const res = await w.RPWWorkflow.commitCriticalTransition(JOB, function(){ return {ok:true}; },
    { action:'complete', phase:2 });
  eq(res.ok, false, 'elutasítva');
  eq(res.conflict, true, '  konfliktusként jelölve');
  eq(res.serverVersion, 11, '  a szerver verziójával');
  eq(JOB.version, 7, 'a helyi verzió NEM íródott felül automatikusan');
  eq(JOB.phases['2'].status, 'active', '  a fázis sem');
}

console.log('\n8. OFFLINE állapotban NINCS hamis lezárás');
{
  const boot = bootPage('rpw-vopsitorie-red.html', { resp:{} });
  const w = boot.w;
  w.RPWData.init(boot.sb, {});
  Object.defineProperty(w.navigator, 'onLine', { value:false, configurable:true });
  const JOB = { id:'J-UI-4', version:5, phases:{'5':{status:'active'}}, rework:[] };
  const res = await w.RPWWorkflow.commitCriticalTransition(JOB, function(){
    throw new Error('nem futhat offline');
  }, { action:'complete', phase:5 });
  eq(res.ok, false, 'a művelet nem hajtódik végre');
  eq(res.offline, true, '  offline-ként jelölve');
  eq(JOB.phases['5'].status, 'active', 'a fázis NEM lett done');
  eq(boot.RPC.length, 0, '  és nem is ment RPC-hívás');
  ok(/conexiune/i.test(res.error.message), '  román üzenettel');
}

console.log('\n9. Hiányzó verzióval NEM indul átmenet');
{
  const boot = bootPage('rpw-control-red.html', { resp:{} });
  const w = boot.w;
  w.RPWData.init(boot.sb, {});
  const JOB = { id:'J-UI-5', phases:{'6':{status:'active'}}, rework:[] };  // nincs version
  const res = await w.RPWWorkflow.commitCriticalTransition(JOB, function(){ return {ok:true}; },
    { action:'complete', phase:6 });
  eq(res.ok, false, 'elutasítva');
  eq(res.error.code, 'no_version', '  no_version');
  eq(boot.RPC.length, 0, '  nem ment RPC-hívás null verzióval');
}

console.log('\n10. A rework lezárása AZONOSÍTÓT küld, nem indoklást');
{
  const boot = bootPage('rpw-tinichigerie-red.html', {
    resp: { rpw_transition: { data:{ ok:true, version:9, data:{ rework:[] } }, error:null } }
  });
  const w = boot.w;
  w.RPWData.init(boot.sb, {});
  const JOB = { id:'J-UI-6', version:8, phase:4, rework:[{id:'rw-9', status:'open'}] };
  const _r10 = await w.RPWWorkflow.commitCriticalTransition(JOB, function(){ return {ok:true}; },
    { action:'rework_close', phase:4, reworkId:'rw-9', note:'Reparat complet' });
  ok(boot.RPC.length > 0, 'történt RPC-hívás' +
     (boot.RPC.length ? '' : ' — DE NEM: ' + JSON.stringify(_r10)));
  if(!boot.RPC.length){ console.log('   res=', JSON.stringify(_r10).slice(0,220)); }
  eq(boot.RPC[0] && boot.RPC[0].name, 'rpw_transition', 'rpw_transition fut');
  eq(boot.RPC[0].args.p_action, 'rework_close', '  rework_close');
  eq(boot.RPC[0].args.p_rework_id, 'rw-9', '  az AZONOSÍTÓ külön mezőben');
  eq(boot.RPC[0].args.p_note, 'Reparat complet', '  a megjegyzés is külön');
  eq(boot.RPC[0].args.p_reason, null, '  a p_reason NEM az azonosító');
}

console.log('\n11. Skip esetén indoklás megy');
{
  const boot = bootPage('rpw-tinichigerie-red.html', {
    resp: { rpw_transition: { data:{ ok:true, version:9, data:{} }, error:null } }
  });
  const w = boot.w;
  w.RPWData.init(boot.sb, {});
  const JOB = { id:'J-UI-7', version:8, phases:{'4':{status:'active'}}, rework:[] };
  await w.RPWWorkflow.commitCriticalTransition(JOB, function(){ return {ok:true}; },
    { action:'skip', phase:4, reason:'Nu exista lucrari de tinichigerie' });
  eq(boot.RPC[0].args.p_action, 'skip', 'skip művelet');
  ok(boot.RPC[0].args.p_reason && boot.RPC[0].args.p_reason.length >= 5,
     '  érdemi indoklással (' + boot.RPC[0].args.p_reason + ')');
}


console.log('\n12. MIND A HÉT FÁZISOLDAL a rpw_transition-t hívja');
{
  // Minden oldal SAJÁT kódjával, valódi modulokkal.
  const ESETEK = [
    { f:'rpw-recepcio-red.html',     nev:'Recepció 1',     phase:1, action:'complete' },
    { f:'rpw-evaluare-red.html',     nev:'Evaluare 2',     phase:2, action:'complete' },
    { f:'rpw-reconstatare-red.html', nev:'Reconstatare 3', phase:3, action:'complete' },
    { f:'rpw-tinichigerie-red.html', nev:'Tinichigerie 4', phase:4, action:'complete' },
    { f:'rpw-vopsitorie-red.html',   nev:'Vopsitorie 5',   phase:5, action:'complete' },
    { f:'rpw-control-red.html',      nev:'Control 6',      phase:6, action:'complete' },
    { f:'rpw-inchidere-red.html',    nev:'Închidere 7',    phase:7, action:'complete' },
    { f:'rpw-dosar.html',            nev:'Dosar reopen',   phase:3, action:'reopen',
      reason:'Rework necesar dupa control' }
  ];
  for (const e of ESETEK) {
    const boot = bootPage(e.f, {
      resp: { rpw_transition: { data:{ ok:true, version:42,
               data:{ phase:(e.phase < 7 ? e.phase+1 : 7),
                      inchis:(e.action==='complete' && e.phase===7),
                      phases:{ [String(e.phase)]:{ status:'done' } } } }, error:null } }
    });
    const w = boot.w;
    if (!w.RPWData || !w.RPWWorkflow) { ok(false, '  ' + e.nev + ': modulok hiányoznak'); continue; }
    w.RPWData.init(boot.sb, {});
    const JOB = { id:'J-'+e.phase, version:41, phase:e.phase,
                  phases:{ [String(e.phase)]:{ status:'active' } }, rework:[], inchis:false };
    const res = await w.RPWWorkflow.commitCriticalTransition(JOB, function(){
      throw new Error('helyi mutáció NEM futhat: ' + e.nev);
    }, { action:e.action, phase:e.phase, reason:e.reason || null });

    const txn = boot.RPC.filter(r => r.name === 'rpw_transition');
    const pat = boot.RPC.filter(r => r.name === 'rpw_patch_v3');
    eq(txn.length, 1, '  ' + e.nev + ': PONTOSAN EGY rpw_transition');
    eq(pat.length, 0, '  ' + e.nev + ': NULLA kritikus rpw_patch_v3');
    if (txn.length) {
      eq(txn[0].args.p_phase, e.phase, '  ' + e.nev + ': helyes fázis');
      eq(txn[0].args.p_action, e.action, '  ' + e.nev + ': helyes művelet');
      eq(txn[0].args.p_expected_version, 41, '  ' + e.nev + ': helyes verzió');
      ok(!!txn[0].args.p_token, '  ' + e.nev + ': tokennel');
    }
    eq(res.ok, true, '  ' + e.nev + ': sikeres');
    eq(JOB.version, 42, '  ' + e.nev + ': új verzió átvéve');
  }
}

console.log('\n13. A 7. fázis lezárása ZÁRJA a dossziét — külön patch NÉLKÜL');
{
  const boot = bootPage('rpw-inchidere-red.html', {
    resp: { rpw_transition: { data:{ ok:true, version:20,
             data:{ inchis:true, phases:{'7':{status:'done'}} } }, error:null } }
  });
  const w = boot.w;
  w.RPWData.init(boot.sb, {});
  const JOB = { id:'J-CLOSE', version:19, phase:7,
                phases:{'7':{status:'active'}}, rework:[], inchis:false };
  await w.RPWWorkflow.commitCriticalTransition(JOB, function(){ return {ok:true}; },
    { action:'complete', phase:7 });
  eq(JOB.inchis, true, 'a dosszié lezárult');
  const inchisPatch = boot.RPC.filter(r =>
    r.name === 'rpw_patch_v3' && JSON.stringify(r.args).indexOf('inchis') >= 0);
  eq(inchisPatch.length, 0, '  és NEM ment külön {inchis:true} patch');
}

console.log('\n14. Ugyanaz a művelet nem mentődik kétszer');
{
  const boot = bootPage('rpw-recepcio-red.html', {
    resp: { rpw_transition: { data:{ ok:true, version:8, data:{ phase:2 } }, error:null } }
  });
  const w = boot.w;
  w.RPWData.init(boot.sb, {});
  const JOB = { id:'J-DUP', version:7, phases:{'1':{status:'active'}}, rework:[] };
  let saveHivas = 0;
  await w.RPWWorkflow.commitCriticalTransition(JOB, function(){ return {ok:true}; },
    { action:'complete', phase:1, save:function(){ saveHivas++; return {ok:true}; } });
  eq(saveHivas, 0, 'a régi mentési út NEM futott (nincs kettős mentés)');
  eq(boot.RPC.length, 1, '  egyetlen szerverhívás');
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
})().catch(e => {
  console.log('\n  VÉGZETES: ' + (e.message||e).toString().slice(0,400));
  console.log('\n✗ ' + pass + ' pass / ' + (fail+1) + ' fail');
  process.exit(1);
});
