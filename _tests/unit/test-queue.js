// ════════════════════════════════════════════════════════════════
//  TARTÓS OFFLINE SOR — a munka túléli az újratöltést
//  ----------------------------------------------------------------
//  A `rpw-queue.js` hónapokig KÉSZEN állt, és EGYETLEN lap sem töltötte
//  be. Az `RPWData.create` elfogadott `opts.queue`-t — senki nem adott
//  neki. Következmény: ha elment a net és a kolléga frissített, a mentés
//  csak helyben maradt, és SOHA nem ment el a szerverre.
//
//  Ez a teszt a BEKÖTÉST méri, nem a modul belsejét:
//    · minden lap betölti, a rpw-data.js ELŐTT
//    · a sor túléli az „újratöltést" (új példány, ugyanaz a tár)
//    · a mentőréteg tényleg beleteszi, ami nem ment át
//    · és csak IGAZOLT szerver-siker után veszi ki
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  x ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

// A modulokat tiszta globálba töltjük (nincs böngésző)
function load(file, globals){
  const mod = { exports:{} };
  const g = Object.assign({}, globals||{});
  new Function('module','exports','self','window','globalThis', R(file))
    (mod, mod.exports, undefined, undefined, globalThis);
  return mod.exports;
}
const Q = require(path.join(ROOT,'rpw-queue.js'));

console.log('\n1. Minden lap betölti — a rpw-data.js ELŐTT');
{
  const lapok = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f))
                  .filter(f => /<script src="rpw-data\.js">/.test(R(f)));
  ok(lapok.length >= 11, 'a rpw-data.js ' + lapok.length + ' lapon van');
  const hianyzik = lapok.filter(f => !/<script src="rpw-queue\.js">/.test(R(f)));
  ok(hianyzik.length === 0, 'mindegyik betölti a sort is' +
     (hianyzik.length ? ' — HIÁNYZIK: ' + hianyzik.join(', ') : ''));
  // a sorrend számít: a rpw-data.js indulásakor már léteznie kell
  const rossz = lapok.filter(f => {
    const s = R(f);
    return s.indexOf('<script src="rpw-queue.js">') > s.indexOf('<script src="rpw-data.js">');
  });
  ok(rossz.length === 0, 'és MINDIG előbb' + (rossz.length ? ' — ROSSZ SORREND: ' + rossz.join(', ') : ''));
}

console.log('\n2. A sor túléli az újratöltést');
{
  // A „tár" a böngészőben IndexedDB. Itt egy közös memóriaobjektum játssza
  // el ugyanazt: a lényeg, hogy KÉT KÜLÖN példány ugyanazt látja.
  const tar = {};
  const elso = Q.create({ backend: Q.memBackend(tar), now: () => 1000 });
  return (async () => {
    await elso.enqueue('J1', { note:'elso' }, 5);
    await elso.enqueue('J2', { note:'masodik' }, 7);
    eq(await elso.size(), 2, 'két dosszié vár a sorban');

    // ── ÚJRATÖLTÉS: új példány, ugyanaz a tár ──
    const masodik = Q.create({ backend: Q.memBackend(tar), now: () => 2000 });
    const varakozok = await masodik.pending();
    eq(varakozok.length, 2, 'az újratöltés után is ott van mind a kettő');
    eq(varakozok[0].jobId, 'J1', '  és a SORREND megmaradt (J1 az első)');
    eq(varakozok[1].jobId, 'J2', '  (J2 a második)');
    eq(varakozok[0].patch.note, 'elso', '  a tartalom sértetlen');
    eq(varakozok[0].expectedVersion, 5, '  a várt verzió is');

    // az új elemek a régiek UTÁN sorolódnak
    await masodik.enqueue('J3', { note:'harmadik' }, null);
    const mind = await masodik.pending();
    eq(mind.map(r => r.jobId), ['J1','J2','J3'], 'az új elem a sor VÉGÉRE kerül');

    console.log('\n3. Ugyanarra a dossziéra összevon, két dossziét NEM kever');
    {
      const t2 = {};
      const q = Q.create({ backend: Q.memBackend(t2), now: () => 1 });
      await q.enqueue('A', { note:'egy', client:'Kovacs' }, 3);
      await q.enqueue('A', { note:'ketto' }, 9);
      const p = await q.pending('A');
      eq(p.length, 1, 'egy rekord marad a dossziéhoz');
      eq(p[0].patch.note, 'ketto', '  az újabb érték nyer');
      eq(p[0].patch.client, 'Kovacs', '  a régi mező NEM vész el');
      eq(p[0].expectedVersion, 3, '  a BÁZIS verzió marad (az elsőé)');
      await q.enqueue('B', { note:'masik' }, 1);
      eq((await q.pending('A'))[0].patch.note, 'ketto', 'a másik dosszié nem írta felül');
    }

    console.log('\n4. A rekord CSAK igazolt siker után törlődik');
    {
      const t3 = {};
      const q = Q.create({ backend: Q.memBackend(t3), now: () => 1 });
      await q.enqueue('OK', { a:1 }, 1);
      await q.enqueue('UTK', { a:2 }, 1);
      await q.enqueue('NET', { a:3 }, 1);
      const sorrend = [];
      const r = await q.flush(async rec => {
        sorrend.push(rec.jobId);
        if(rec.jobId === 'OK')  return { ok:true };
        if(rec.jobId === 'UTK') return { ok:false, conflict:true, serverVersion:9 };
        return { ok:false, kind:'network' };
      });
      eq(sorrend, ['OK','UTK','NET'], 'FIFO sorrendben küld');
      eq(r.sent, 1, 'egy ment el');
      eq(await q.hasPending('OK'), false, '  a sikeres KIKERÜLT');
      eq(await q.hasPending('UTK'), true, '  az ütköző MEGMARADT');
      eq((await q.pending('UTK'))[0].state, 'conflict', '  ütközésként jelölve');
      eq(await q.hasPending('NET'), true, '  a hálózati hibás is MEGMARADT');
      eq((await q.pending('NET'))[0].state, 'waiting', '  várakozóként jelölve');
      eq(r.remaining, 2, 'kettő maradt');
    }

    console.log('\n5. A mentőréteg beleteszi, ami nem ment át');
    {
      const RPWSave = require(path.join(ROOT,'rpw-save.js'));
      const t4 = {};
      const q = Q.create({ backend: Q.memBackend(t4), now: () => 1 });

      // OFFLINE: a szerverhez el sem jutunk
      const saver = RPWSave.createSaver({
        sb:{ rpc: async () => ({ data:{ok:true}, error:null }) },
        queue:q, debounceMs:1, online: () => false, offlinePollMs:100000 });
      await saver.save({ id:'J9', plate:'MS-01-AAA', phase:2, note:'offline munka' });
      await new Promise(r => setTimeout(r, 40));
      eq(await q.hasPending('J9'), true, 'offline mentés a sorba került');
      const rec = (await q.pending('J9'))[0];
      eq(rec.patch.note, 'offline munka', '  a tartalommal együtt');
      eq(rec.patch.phase, undefined, '  DE workflow-mező nélkül (azt a szerver tiltja)');
    }

    console.log('\n6. Siker után kiveszi — és a `{ok:false}` NEM siker');
    {
      const RPWSave = require(path.join(ROOT,'rpw-save.js'));
      const t5 = {};
      const q = Q.create({ backend: Q.memBackend(t5), now: () => 1 });
      await q.enqueue('J8', { note:'regi' }, 1);

      let allapot = null;
      const jo = RPWSave.createSaver({
        sb:{ rpc: async () => ({ data:{ ok:true, version:4 }, error:null }) },
        queue:q, debounceMs:1, online: () => true,
        onState:(s) => { allapot = s; } });
      await jo.save({ id:'J8', note:'uj' });
      await new Promise(r => setTimeout(r, 40));
      eq(allapot, 'synced', 'sikeres mentés → synced');
      eq(await q.hasPending('J8'), false, '  és a sorból KIKERÜLT');

      // elutasítás a VÁLASZ TÖRZSÉBEN — ez volt a néma adatvesztés
      let allapot2 = null;
      const rossz = RPWSave.createSaver({
        sb:{ rpc: async () => ({ data:{ ok:false, error:'protected_workflow_field',
                                        fields:['phase'] }, error:null }) },
        queue:q, debounceMs:1, online: () => true, maxRetry:0,
        onState:(s) => { allapot2 = s; } });
      const eredmeny = await rossz.save({ id:'J7', note:'x' });
      await new Promise(r => setTimeout(r, 40));
      ok(allapot2 !== 'synced', 'az elutasítás NEM mutat „mentve"-t (' + allapot2 + ')');
      ok(eredmeny && eredmeny.failed === true, '  a hívó is hibát kap');
      eq(await q.hasPending('J7'), false, '  és NEM kerül a sorba (újraküldés sem javítaná)');
    }

    console.log('\n7. Az adatréteg magától megtalálja a sort');
    {
      const D = require(path.join(ROOT,'rpw-data.js'));
      ok(typeof D._resume === 'function', 'van újratöltés utáni indító');
      // a sor állapotai lefordulnak arra, amit a lapok jelzője ismer
      const cimkek = R('index.html').match(/function rpwSyncLabel[\s\S]{0,600}/)[0];
      Object.keys(D.QSTATE).forEach(k => {
        ok(cimkek.indexOf(D.QSTATE[k] + ':[') >= 0,
           '  „' + k + '" → „' + D.QSTATE[k] + '" — a jelző ismeri');
      });
      const src = R('rpw-data.js');
      ok(/root\.RPWQueue && root\.RPWQueue\.shared/.test(src), 'a közös sort veszi, nem újat gyárt');
      ok(/addEventListener\('online'/.test(src), 'és a hálózat visszatérésekor is indít');
    }

    console.log('\n8. A teljes út: offline mentés → újratöltés → online → megérkezik');
    {
      const RPWSave = require(path.join(ROOT,'rpw-save.js'));
      const tar2 = {};
      // ── 1. nap: nincs net ──
      const q1 = Q.create({ backend: Q.memBackend(tar2), now: () => 1 });
      const saver = RPWSave.createSaver({
        sb:{ rpc: async () => ({ data:null, error:{ message:'failed to fetch' } }) },
        queue:q1, debounceMs:1, online: () => false, offlinePollMs:100000 });
      await saver.save({ id:'J5', plate:'MS-05-EEE', note:'amit offline irtam' });
      await new Promise(r => setTimeout(r, 40));
      eq(await q1.hasPending('J5'), true, 'offline: a sorban van');

      // ── újratöltés: MINDEN memória elveszik, csak a tár marad ──
      const q2 = Q.create({ backend: Q.memBackend(tar2), now: () => 2 });
      eq(await q2.hasPending('J5'), true, 'újratöltés után is megvan');

      // ── 2. nap: van net — a sor üríti magát ──
      const megerkezett = [];
      const r = await q2.flush(async rec => { megerkezett.push(rec); return { ok:true }; });
      eq(r.sent, 1, 'egy rekord ment el');
      eq(megerkezett[0].patch.note, 'amit offline irtam', '  a MUNKA megérkezett');
      eq(await q2.hasPending('J5'), false, '  és a sor kiürült');
    }

    console.log('\n' + (fail ? 'x ' : 'OK ') + pass + ' pass / ' + fail + ' fail');
    process.exit(fail ? 1 : 0);
  })();
}
