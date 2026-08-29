// ════════════════════════════════════════════════════════════════
//  #4 — AMIT A `prepare` ÍRT, AZ IS GÖRGŐDJÖN VISSZA
//  ----------------------------------------------------------------
//  A kódreview azt írta, hogy a `prepare` és a mutate-callback MINDKETTŐ
//  beállítja a `closedAt`-ot, tehát duplán alkalmazódhat. Utánanéztem:
//  EZ NEM ÍGY VAN. A kettő két KÜLÖN ÚT:
//
//    SERVER_TRANSITIONS = false → commitCriticalTransition → mutate()
//    SERVER_TRANSITIONS = true  → commitViaServer          → prepare()
//
//  A szerver-ág korán visszatér, a mutate-callback ott le sem fut.
//  Dupla alkalmazás tehát nincs.
//
//  VAN VISZONT VALÓDI HIBA UGYANOTT: a szerver-ág elutasításkor NEM
//  görgette vissza azt, amit a `prepare` beírt — pedig a helyszíni
//  megjegyzés azt ígéri, hogy „a helyi állapot VÁLTOZATLAN marad".
//  A lap így lezárási dátumot mutatott volna egy le NEM zárt munkán.
//
//  Ma ez az út alszik (SERVER_TRANSITIONS=false), de pont ez következik
//  (RPW-003). Ezért mérjük meg most, amíg olcsó.
// ════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  x ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

const W = require(path.join(ROOT, 'rpw-workflow.js'));

function ujJob(){
  return { id:'J1', version:1, phase:7, inchis:false,
           closing:{ factura:'F-1', deviz:'D-1' },
           closingPhotos:[{data:'a'},{data:'b'},{data:'c'},{data:'d'},{data:'e'}],
           phases:{} };
}
function opciok(job, szerverValasz){
  return {
    action:'complete', phase:7,
    prepare:function(){
      if(!job.closing) job.closing={};
      job.closing.closedAt='2026-08-29';
      job.closing.handoverAt='2026-08-29T21:00:00.000Z';
      return {ok:true};
    },
    save:function(){ return Promise.resolve({ok:true, data:{}}); },
    __valasz: szerverValasz
  };
}
function szerverrel(valasz, fn){
  global.RPW_CFG = { SERVER_TRANSITIONS:true };
  global.RPWData = { __instance:{ serverTransition: async function(){ return valasz; } } };
  return fn().finally(function(){ delete global.RPW_CFG; delete global.RPWData; });
}

(async () => {

console.log('\n1. A két út KÜLÖN fut — nincs dupla alkalmazás');
{
  // helyi út: a mutate fut, a prepare NEM
  global.RPW_CFG = { SERVER_TRANSITIONS:false };
  const job = ujJob();
  let prepareFutott = 0, mutateFutott = 0;
  await W.commitCriticalTransition(job, function(){
    mutateFutott++;
    job.closing.closedAt='2026-08-29';
    return W.completePhase(job,7,{actor:'Teszt Ember'});
  }, { action:'complete', phase:7,
       prepare:function(){ prepareFutott++; return {ok:true}; },
       save:function(){ return Promise.resolve({ok:true}); } });
  eq(mutateFutott, 1, 'a helyi úton a mutate lefut');
  eq(prepareFutott, 0, '  a prepare viszont NEM — nincs mit duplán alkalmazni');
  delete global.RPW_CFG;
}

console.log('\n2. Szerver-ág: elutasításkor a prepare írása is VISSZAÁLL');
{
  const job = ujJob();
  let mutateHivas = 0;
  await szerverrel({ ok:false, error:{ code:'denied', message:'nu' } }, async function(){
    // SZAMLALUNK, nem dobunk: egy dobast egy try/catch elnyelhet, es akkor
    // a teszt vak lenne arra, ha a szerver-ag MEGIS lefuttatja a mutate-et.
    const res = await W.commitCriticalTransition(job, function(){ mutateHivas++; return {ok:true}; },
      opciok(job));
    eq(mutateHivas, 0, 'a szerver-ágon a mutate NEM futott le');
    ok(res && res.ok === false, 'a szerver elutasította');
    ok(res.serverRejected === true, '  és ezt meg is mondja');
  });
  ok(job.closing.closedAt == null, 'a closedAt VISSZAÁLLT — nincs lezárási dátum');
  // A migrateJob normalizalja a `closing`-ot: a hianyzo mezok NULL-ra
  // allnak. A pillanatkep EZT az allapotot orzi, tehat a visszaallas
  // helyes eredmenye a null — nem az undefined.
  eq(job.closing.handoverAt, null, '  az átadás időpontja is visszaállt (null)');
  eq(job.closing.factura, 'F-1', '  az EREDETI mezők viszont megmaradtak');
  eq(job.inchis, false, '  és a munka nincs lezárva');
}

console.log('\n3. Szerver-ág: sikernél megmarad, amit a szerver visszaad');
{
  const job = ujJob();
  let mutateHivas2 = 0;
  await szerverrel({ ok:true, version:5, data:{ inchis:true, phase:7 } }, async function(){
    const res = await W.commitCriticalTransition(job, function(){ mutateHivas2++; return {ok:true}; },
      opciok(job));
    eq(mutateHivas2, 0, 'a mutate itt sem futott le');
    ok(res && res.ok === true, 'sikeres átmenet');
  });
  eq(job.inchis, true, 'a szerver állapotát vettük át');
  eq(job.version, 5, '  a verziót is');
  eq(job.closing.closedAt, '2026-08-29', '  és a felkészített mező MEGMARADT');
}

console.log('\n4. Szerver-ág: ha a mentés nem igazolt, szintén visszaáll');
{
  const job = ujJob();
  global.RPW_CFG = { SERVER_TRANSITIONS:true };
  global.RPWData = { __instance:{ serverTransition: async () => ({ok:true}) } };
  const o = opciok(job);
  o.save = function(){ return Promise.resolve({failed:true}); };   // nem igazolt
  const res = await W.commitCriticalTransition(job, function(){ return {ok:true}; }, o);
  ok(res && res.ok === false, 'nem sikerült');
  ok(res.notSynced === true, '  és megmondja, hogy nem szinkronizált');
  ok(job.closing.closedAt == null, 'a closedAt itt is visszaállt');
  delete global.RPW_CFG; delete global.RPWData;
}

console.log('\n5. Elutasításkor az ÚJ felső szintű mezők is eltűnnek');
{
  // A `prepare` nem csak beágyazott objektumot írhat: ha új felső szintű
  // mezőt tesz a jobra, azt is el kell takarítani. Enélkül a lap egy
  // le nem zárt munkán mutatna „lezárási" adatot.
  const job = ujJob();
  global.RPW_CFG = { SERVER_TRANSITIONS:true };
  global.RPWData = { __instance:{ serverTransition: async () => ({ok:false, error:{code:'denied'}}) } };
  const res = await W.commitCriticalTransition(job, function(){ return {ok:true}; }, {
    action:'complete', phase:7,
    prepare:function(){ job.lezarasFolyamatban = true; job.closing.closedAt='2026-08-29'; return {ok:true}; },
    save:function(){ return Promise.resolve({ok:true, data:{}}); }
  });
  ok(res && res.ok === false, 'a szerver elutasította');
  eq(job.lezarasFolyamatban, undefined, 'az ÚJ felső szintű mező eltűnt');
  ok(job.closing.closedAt == null, '  és a beágyazott is visszaállt');
  eq(job.id, 'J1', '  az eredeti mezők megmaradtak');
  delete global.RPW_CFG; delete global.RPWData;
}

console.log('\n' + (fail ? 'x ' : 'OK ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
})();
