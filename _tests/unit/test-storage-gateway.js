// ════════════════════════════════════════════════════════════════
//  RPW-003 — A FOTÓTÁROLÓ KAPUJA (supabase/functions/rpw-storage/core.js)
//  Minden jogosultsági döntés itt dől el; a tesztek főleg a TILTÁST mérik.
// ════════════════════════════════════════════════════════════════
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

const J1 = 'RPW-11111111-2222-4333-8444-555555555555';   // a saját szervizé
const J2 = 'RPW-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';   // MÁS szervizé
const J3 = 'RPW-99999999-9999-4999-8999-999999999999';   // nem létezik
const TOK = 'T'.repeat(40);

function makeDeps(over){
  const calls = { upload:[], read:[], remove:[], audit:[], rpc:[] };
  const deps = {
    calls,
    rpc: async (name, a) => {
      calls.rpc.push([name, a]);
      if (name === 'rpw2_session') return a.p_token === TOK
        ? { ok:true, employee:{ id:'E1', name:'Ion', shop_id:'S1', can:{ delete:false } } } : { ok:false, error:'invalid' };
      if (name === 'rpw_job_get') return (a.p_token === TOK && a.p_id === J1) ? { ok:true, id:J1 } : { ok:false, error:'not_found' };
      if (name === 'rpw_client_job_get') return (a.p_job_id === J1 || a.p_job_id === J2) ? { ok:true, id:a.p_job_id } : { ok:false, error:'not_found' };
      return null;
    },
    sign: {
      upload: async (p, o) => { calls.upload.push([p, o]); return { token:'UPTOK', signedUrl:'https://x/up?'+p }; },
      read:   async (ps, e) => { calls.read.push([ps, e]); return { data: ps.map(p => ({ path:p, signedUrl:'https://x/r?'+p })) }; },
      remove: async (ps) => { calls.remove.push(ps); return { ok:true }; },
    },
    audit: async (row) => { calls.audit.push(row); },
  };
  return Object.assign(deps, over || {});
}

(async () => {
  const { handle, parsePath, isClientName } = await import(
    path.resolve(__dirname, '..', '..', 'supabase', 'functions', 'rpw-storage', 'core.js'));

  console.log('\n══ RPW-003 — fotótároló kapu ══');

  console.log('\n1. Útvonal-szűrés');
  ok(!!parsePath(J1 + '/talon.jpg'), 'érvényes: <jobId>/talon.jpg');
  ok(!!parsePath(J1 + '/acte/acta_x_1730000000000_ab12.pdf'), 'érvényes: egy almappa (acte/)');
  for (const p of ['../' + J1 + '/a.jpg', J1 + '/../x.jpg', '/' + J1 + '/a.jpg', J1 + '//a.jpg',
                   'RPW-x/a.jpg', J1, J1 + '/', J1 + '/a/b/c.jpg', J1 + '/a b.jpg', 123, null,
                   J1 + '/' + 'a'.repeat(300)]) {
    ok(parsePath(p) === null, 'elutasítva: ' + JSON.stringify(p).slice(0, 60));
  }
  ok(isClientName('client_1730000000000_ab12.jpg'), 'ügyfél-név: client_…');
  ok(isClientName('acta_constatare_1730000000000_ab12.pdf'), 'ügyfél-név: acta_…');
  ok(!isClientName('talon.jpg') && !isClientName('acte/acta_x_1730000000000_ab12.jpg'), 'dolgozói nevek NEM ügyfél-nevek');

  console.log('\n2. Dolgozó — munkamenet nélkül semmi');
  for (const op of ['sign-upload', 'sign-read', 'remove']) {
    const d = makeDeps();
    const r = await handle({ op, token: 'rossz', path: J1 + '/a.jpg', paths: [J1 + '/a.jpg'] }, d);
    ok(r.status === 401, op + ': érvénytelen token → 401');
    ok(!d.calls.upload.length && !d.calls.read.length && !d.calls.remove.length, op + ': a tárolóhoz nem nyúlt');
  }

  console.log('\n3. Dolgozó — saját munka: engedve');
  {
    const d = makeDeps();
    const r = await handle({ op:'sign-upload', token:TOK, path: J1 + '/talon.jpg' }, d);
    ok(r.status === 200 && r.body.token === 'UPTOK', 'sign-upload → feltöltési token');
    ok(d.calls.upload[0][1].upsert === true, 'dolgozó felülírhat (újrafotózás)');
    ok(!('signedUrl' in r.body) || typeof r.body.signedUrl === 'string', 'a válaszban nincs kulcs, csak URL');
    const r2 = await handle({ op:'sign-read', token:TOK, paths:[J1 + '/talon.jpg', J1 + '/acte/x.pdf'] }, d);
    ok(r2.status === 200 && r2.body.urls.length === 2, 'sign-read → 2 aláírt URL');
    ok(d.calls.read[0][1] === 3600, 'olvasási URL 1 óráig él');
  }

  console.log('\n4. Dolgozó — MÁS szerviz vagy nem létező munka: 403, és nem árulja el, melyik');
  {
    const d = makeDeps();
    const a = await handle({ op:'sign-upload', token:TOK, path: J2 + '/a.jpg' }, d);
    const b = await handle({ op:'sign-upload', token:TOK, path: J3 + '/a.jpg' }, d);
    ok(a.status === 403 && b.status === 403, 'idegen és nem létező munka egyaránt 403');
    ok(JSON.stringify(a.body) === JSON.stringify(b.body), 'a két válasz azonos — a létezés nem szivárog');
    const c = await handle({ op:'sign-read', token:TOK, paths:[J1 + '/a.jpg', J2 + '/b.jpg'] }, d);
    ok(c.status === 403, 'vegyes kötegben egy idegen útvonal → az egész köteg 403');
    ok(!d.calls.upload.length && !d.calls.read.length, 'a tárolóhoz nem nyúlt');
  }

  console.log('\n5. Törlés — naplózva; sikertelen törlés NEM ír auditot');
  {
    const d = makeDeps();
    const r = await handle({ op:'remove', token:TOK, paths:[J1 + '/a.jpg', J1 + '/b.jpg'] }, d);
    ok(r.status === 200 && r.body.removed === 2, 'törlés sikeres');
    ok(d.calls.audit.length === 1 && d.calls.audit[0].action === 'photo_remove', 'egy auditsor munkánként');
    ok(d.calls.audit[0].tenant_id === 'S1' && /Ion/.test(d.calls.audit[0].actor), 'az auditban a szerviz és a dolgozó a munkamenetből');
    const d2 = makeDeps({ sign: Object.assign({}, makeDeps().sign, { remove: async () => ({ error:'x' }) }) });
    const r2 = await handle({ op:'remove', token:TOK, paths:[J1 + '/a.jpg'] }, d2);
    ok(r2.status === 502 && d2.calls.audit.length === 0, 'sikertelen törlés → 502, auditsor NINCS');
    const many = Array.from({ length: 21 }, (_, i) => J1 + '/f' + i + '.jpg');
    ok((await handle({ op:'remove', token:TOK, paths: many }, makeDeps())).status === 400, 'túl nagy törlési köteg → 400');
  }

  console.log('\n6. Ügyfél (WhatsApp) — csak a saját dosszié, csak ügyfél-nevek, felülírás nélkül');
  {
    const d = makeDeps();
    const good = J1 + '/client_1730000000000_ab12.jpg';
    const r = await handle({ op:'client-sign-upload', path: good }, d);
    ok(r.status === 200, 'ügyfél feltölthet a nyitott dossziéba');
    ok(d.calls.upload[0][1].upsert === false, 'ügyfél NEM írhat felül meglévő fájlt');
    ok((await handle({ op:'client-sign-upload', path: J1 + '/talon.jpg' }, d)).status === 403, 'dolgozói fájlnévre az ügyfél nem tölthet');
    ok((await handle({ op:'client-sign-upload', path: J3 + '/client_1730000000000_ab12.jpg' }, d)).status === 403, 'nem létező dosszié → 403');
    ok((await handle({ op:'client-sign-read', paths:[J1 + '/talon.jpg'] }, d)).status === 403, 'ügyfél nem olvashatja a dolgozói fotót');
    ok((await handle({ op:'client-sign-read', paths:[good, J2 + '/client_1730000000000_ab12.jpg'] }, d)).status === 403, 'egy kérésben két dosszié → 403');
    ok((await handle({ op:'client-sign-read', paths:[good] }, d)).status === 200, 'ügyfél olvashatja a saját feltöltését');
    ok((await handle({ op:'remove', paths:[good] }, d)).status === 401, 'ügyfél NEM törölhet');
  }

  console.log('\n7. Ismeretlen művelet és hibás kérés');
  ok((await handle({ op:'list' }, makeDeps())).status === 400, 'list → 400 (nincs listázás)');
  ok((await handle(null, makeDeps())).status === 400, 'üres kérés → 400');
  ok((await handle({ op:'sign-upload', token:TOK, path: J1 + '/a.jpg' },
       makeDeps({ sign: Object.assign({}, makeDeps().sign, { upload: async () => ({ error:'x' }) }) }))).status === 502,
     'tárolóhiba → 502, nem hamis siker');

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
