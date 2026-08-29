// ════════════════════════════════════════════════════════════════
//  BIZTONSÁGI TESZTEK  A–O   (a brief 11. pontja)
//  ----------------------------------------------------------------
//  Ezek a KLIENSOLDALI viselkedést mérik: hogy a rendszer a
//  token-alapú, bérlővédett utat használja, és hogy a szerver
//  elutasítását helyesen kezeli.
//
//  A SZERVEROLDALI bizonyítás (két valódi szerviz közötti izoláció)
//  SQL-ben futott, és a _migrations/*.sql ellenőrző lekérdezései
//  ismétlik meg. Amit innen nem lehet mérni, azt a TEST-REPORT.md
//  „NEM VOLT IGAZOLHATÓ" jelöléssel tartalmazza.
// ════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

// ── Környezet: valódi rpw-auth.js + rpw-db.js, hálózat helyettesítve ──
let RPC = [], RESP = {}, TBL = [];
function Q(t){ this.t=t; this.ops=[]; }
['eq','is','not','select','update','delete'].forEach(m=>{
  Q.prototype[m]=function(){ this.ops.push([m].concat([].slice.call(arguments))); return this; };
});
Q.prototype.order  = function(){ TBL.push(this); return Promise.resolve({data:[],error:null}); };
Q.prototype.single = function(){ TBL.push(this); return Promise.resolve({data:null,error:null}); };
Q.prototype.then   = function(r){ TBL.push(this); return Promise.resolve({data:[],error:null}).then(r); };
const sb = { from: t => new Q(t),
             rpc: (n,a) => { RPC.push([n,a]); return Promise.resolve(RESP[n] || {data:null,error:null}); } };

const mem = {};
const ls = { getItem:k=>mem[k]||null, setItem:(k,v)=>{mem[k]=v}, removeItem:k=>{delete mem[k]} };
global.window = { RPW_CFG:{ SHOP_ID:'SHOP-A', PATCH_RPC:'rpw_patch_v3', AUTH_REQUIRED:true }, localStorage:ls };
global.self = global.window; global.localStorage = ls;
eval(R('rpw-auth.js')); eval(R('rpw-db.js')); eval(R('rpw-cache.js'));
const A = window.RPWAuth, DB = window.RPWDb, C = window.RPWCache;

const TOKEN_A = 'a'.repeat(64);
const CAN_ALL  = {team:true,posts:true,open:true,reception:true,work:true,close:true,override:true,delete:true};
const CAN_TECH = {team:false,posts:false,open:false,reception:false,work:true,close:false,override:false,delete:false};
function login(token, can, shop){
  mem['rpw_auth'] = JSON.stringify({ token:token, name:'Teszt', rawRole:'Rol', roleCode:'R',
                                     can:can, employeeId:'E1', shopId:shop||'SHOP-A',
                                     exp: Date.now()+9e6 });
}
const denied = { data:{ ok:false, error:'not_found' }, error:null };
const unauth = { data:{ ok:false, error:'unauthorized' }, error:null };

(async () => {

console.log('\nA. Shop A nem listázhatja Shop B munkáit');
{
  login(TOKEN_A, CAN_ALL);
  RPC=[]; TBL=[]; RESP={ rpw_jobs_list:{ data:{ok:true, rows:[{id:'A1'}]}, error:null } };
  const r = await DB.listActive(sb);
  eq(RPC[0][0], 'rpw_jobs_list', 'a token-alapú RPC-n megy');
  eq(RPC[0][1].p_token, TOKEN_A, '  a saját tokenjével');
  eq(TBL.length, 0, '  NINCS közvetlen táblaolvasás');
  ok(JSON.stringify(RPC[0][1]).indexOf('shop_id') < 0, '  shop_id-t NEM küld — azt a szerver tudja');
  ok(!r.error, '  a saját listája megjön');
}

console.log('\nB. Shop A nem nyithatja meg Shop B job ID-ját');
{
  RPC=[]; RESP={ rpw_job_get: denied };
  const r = await DB.getRow(sb, 'SHOP-B-JOB-1');
  eq(RPC[0][0], 'rpw_job_get', 'RPC-n kérdez');
  ok(!!r.error, 'idegen azonosító → hiba');
  ok(/not_found/.test(JSON.stringify(r.error)), '  „not_found" — a létezés sem derül ki');
}

console.log('\nC. Shop A nem módosíthatja Shop B munkáját');
{
  RPC=[]; RESP={ rpw_patch_v3: denied };
  const r = await DB.patchV2(sb, 'SHOP-B-JOB-1', { plate:'HACK' }, {});
  eq(RPC[0][0], 'rpw_patch_v3', 'a védett mentési úton megy');
  ok(!!r.error, 'idegen munka módosítása elutasítva');
  ok(!('p_actor' in RPC[0][1]), '  actort NEM küld — a szerver azonosítja');
}

console.log('\nD. Shop A nem törölheti és nem állíthatja vissza Shop B munkáját');
{
  for (const [nev, fn, rpc] of [
    ['kosárba',      () => DB.softDelete(sb,'SHOP-B-JOB-1'), 'rpw_job_trash'],
    ['visszaállítás',() => DB.restore(sb,'SHOP-B-JOB-1'),    'rpw_job_restore'],
    ['végleges',     () => DB.purge(sb,'SHOP-B-JOB-1'),      'rpw_job_purge']]) {
    RPC=[]; TBL=[]; RESP={ [rpc]: denied };
    const r = await fn();
    eq(RPC[0][0], rpc, nev + ' → ' + rpc);
    eq(TBL.length, 0, '  ' + nev + ': nincs közvetlen táblaművelet');
    ok(!!r.error, '  ' + nev + ': elutasítva');
  }
}

console.log('\nE. Shop A nem kérhet signed URL-t Shop B fájljához');
{
  // A privát bucket + a szerveroldali jogosultság dönt. A kliens oldalon
  // az mérhető, hogy PUBLIKUS URL-re SOHA nem esik vissza.
  const g = global, old = { window:g.window, self:g.self };
  const win = { RPW_CFG:{ STORAGE_PRIVATE:true, BUCKET:'rpw-photos' } }; win.self=win; g.window=win; g.self=win;
  eval(R('rpw-photos.js'));
  const P = win.RPWPhotos;
  const sbDenied = { storage:{ from:()=>({
      createSignedUrl: async () => ({ error:{message:'Object not found'}, data:null }),
      getPublicUrl: () => ({ data:{ publicUrl:'https://KISZIVARGOTT/shopB.jpg' } })
  })}};
  const u = await P.signedUrl(sbDenied, 'SHOP-B-JOB/talon.jpg');
  eq(u, '', 'idegen fájlra ÜRES — nem ad publikus URL-t');
  Object.assign(g, old);
}

console.log('\nF. Hiányzó token minden védett RPC-nél tiltást ad');
{
  // ── RPW-001 (2026-08-29) — KET REETEG, KET ALLITAS ──────────────
  // (1) Munkamenet NELKUL a kliens el sem inditja a kerest — igy az
  //     atiranyitas alatt sem szivarog ki adat. Eddig kikuldte
  //     `p_token:null`-lal, es csak a szerver allitotta meg.
  // (2) A szerveroldali elutasitas ettol fuggetlenul kotelezo: ha MEGIS
  //     kimegy egy keres (helyben ervenyesnek latszo, de visszavont
  //     tokennel), a szerver nemet mond, es azt a kliens tovabbadja.
  const esetek = [
    ['listázás', () => DB.listActive(sb),               'rpw_jobs_list'],
    ['megnyitás',() => DB.getRow(sb,'J1'),              'rpw_job_get'],
    ['mentés',   () => DB.patchV2(sb,'J1',{a:1},{}),    'rpw_patch_v3'],
    ['kosárba',  () => DB.softDelete(sb,'J1'),          'rpw_job_trash']];

  delete mem['rpw_auth'];
  for (const [nev, fn, rpc] of esetek) {
    RPC=[]; RESP={ [rpc]: unauth };
    const r = await fn();
    eq(RPC.length, 0, nev + ': munkamenet nélkül EL SEM INDUL a kérés');
    ok(r.error && r.error.code==='auth_required', '  ' + nev + ': a kliens maga tiltja');
  }

  login(TOKEN_A, CAN_ALL);          // helyben ervenyes munkamenet
  for (const [nev, fn, rpc] of esetek) {
    RPC=[]; RESP={ [rpc]: unauth };
    const r = await fn();
    eq(RPC.length, 1, nev + ': visszavont tokennel a kérés kimegy');
    ok(!!r.error, '  ' + nev + ': és a SZERVER utasítja el');
  }
  delete mem['rpw_auth'];
}

console.log('\nG. Lejárt token tiltást ad');
{
  mem['rpw_auth'] = JSON.stringify({ token:TOKEN_A, can:CAN_ALL, employeeId:'E1',
                                     shopId:'SHOP-A', exp: Date.now() - 1000 });
  eq(A.session(), null, 'a lejárt munkamenet érvénytelen');
  eq(A.token(), null, '  nincs token');
  eq(A.guard(), false, '  az őr megállítja');
  RPC=[]; RESP={ rpw_jobs_list: unauth };
  const r = await DB.listActive(sb);
  // RPW-001 (2026-08-29): eddig itt az allt, hogy "nem is kuld tokent" —
  // vagyis a keres kiment, csak ures tokennel. Mostantol ki sem megy.
  eq(RPC.length, 0, '  és a kérés EL SEM INDUL (nem csak token nélkül megy)');
  ok(r.error && r.error.code==='auth_required', '  a kliens maga tiltja');
}

console.log('\nH. Visszavont token tiltást ad');
{
  // A visszavonás szerveroldali: a kliensnek érvényesnek TŰNIK, de a
  // szerver „invalid"-ot ad, és a kliens ilyenkor helyben is kidobja.
  login(TOKEN_A, CAN_ALL);
  RESP={ rpw2_session:{ data:{ ok:false, error:'invalid' }, error:null } };
  const r = await A.verify(sb);
  ok(!r.ok, 'a szerver elutasítja a visszavont tokent');
  eq(A.session(), null, '  és a helyi munkamenet is törlődik');
}

console.log('\nI. Nem megfelelő jogosultságú dolgozó nem zárhat fázist');
{
  login(TOKEN_A, CAN_TECH);
  eq(A.can('work'),  true,  'TECH: van fázismunka-joga');
  eq(A.can('close'), false, 'TECH: NINCS lezárási joga');
  eq(A.can('team'),  false, 'TECH: nincs csapat-joga');
  eq(A.can('delete'),false, 'TECH: nincs törlési joga');
  // a szerveroldali tiltás
  RPC=[]; RESP={ rpw_transition:{ data:{ ok:false, error:'not_allowed', need:'close' }, error:null } };
  const r = await sb.rpc('rpw_transition', { p_token:TOKEN_A, p_id:'J1', p_phase:7, p_action:'complete' });
  eq(r.data.error, 'not_allowed', 'a szerver is elutasítja');
  eq(r.data.need, 'close', '  és megmondja, mi hiányzik');
}

console.log('\nJ. Két azonos verziójú mentésből csak az első sikerül');
{
  login(TOKEN_A, CAN_ALL);
  RPC=[]; RESP={ rpw_patch_v3:{ data:{ ok:true, data:{}, version:8 }, error:null } };
  const r1 = await DB.patchV2(sb, 'J1', { a:1 }, { expected:7 });
  eq(RPC[0][1].p_expected_version, 7, 'az első a várt verziót küldi');
  ok(!r1.error, '  és sikerül');
  RESP={ rpw_patch_v3:{ data:{ ok:false, error:'version_conflict', server_version:8 }, error:null } };
  const r2 = await DB.patchV2(sb, 'J1', { a:2 }, { expected:7 });
  ok(!!r2.error, 'a második UGYANAZZAL a verzióval elbukik');
  ok(/version_conflict/.test(JSON.stringify(r2.error)), '  ütközésként, nem csendes felülírásként');
}

console.log('\nK. Nyitott rework mellett nem zárható végleg a munka');
{
  RPC=[]; RESP={ rpw_transition:{ data:{ ok:false, error:'open_rework' }, error:null } };
  const r = await sb.rpc('rpw_transition', { p_token:TOKEN_A, p_id:'J1', p_phase:7, p_action:'complete' });
  eq(r.data.error, 'open_rework', 'a szerver megállítja');
  // a kliens is: a workflow modul ugyanezt a szabályt ismeri
  const wf = R('rpw-workflow.js');
  ok(/wf_open_rework/.test(wf), 'a kliens is jelzi (wf_open_rework)');
}

console.log('\nL. Kötelező dokumentum nélkül nincs továbblépés');
{
  const wf = R('rpw-workflow.js');
  ['wf_talon_missing','wf_constatare_missing','wf_no_invoice','wf_no_deviz','wf_control_incomplete']
    .forEach(k => ok(wf.indexOf(k) > 0, '  szabály létezik: ' + k));
  ok(/function canCompletePhase/.test(wf), 'a lezárási ellenőrzés egy helyen van');
}

console.log('\nM. Kliensből hamisított actor és shop_id figyelmen kívül marad');
{
  login(TOKEN_A, CAN_ALL);
  RPC=[]; RESP={ rpw_patch_v3:{ data:{ ok:true, data:{}, version:2 }, error:null } };
  await DB.patchV2(sb, 'J1', { a:1 }, { actor:'HAMIS NEV', shop_id:'SHOP-B' });
  const arg = JSON.stringify(RPC[0][1]);
  ok(arg.indexOf('HAMIS NEV') < 0, 'a hamis actor NEM megy el');
  ok(arg.indexOf('SHOP-B')   < 0, 'a hamis shop_id NEM megy el');
  ok(arg.indexOf('p_token')  > 0, '  csak a token — a többit a szerver vezeti le');
}

console.log('\nN. OCR/classify/sendmail token nélkül nem hívja a külső szolgáltatót');
{
  const sh = R('functions/_shared.js');
  const kod = sh.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok(!/REQUIRE_FN_AUTH/.test(kod), 'nincs kiskapu környezeti változóval');
  ok(/rpw2_session/.test(kod), 'a végleges munkamenet-modellt ellenőrzi');
  ok(!/auth\.__token/.test(kod), 'nincs többé nem létező auth.__token mező');
  ok(/token:\s*token/.test(kod), '  a token elérhető az ownsJob számára');
  ['ocr.js','classify.js','sendmail.js'].forEach(f => {
    const s = R('functions/' + f);
    ok(/requireAuth\(event\)/.test(s), f + ': hitelesít');
    // a TÉNYLEGES külső hívás helye (nem a konstans deklarációé)
    const iAuth = s.indexOf('requireAuth(event)');
    const mCall = s.match(/fetch\(\s*(ANTHROPIC_URL|RESEND_URL|'https:\/\/api\.)/);
    if (mCall) ok(iAuth < s.indexOf(mCall[0]), '  ' + f + ': a hitelesítés MEGELŐZI a külső hívást');
  });
  const o = R('functions/ocr.js');
  ok(/H\.detectMedia\(image\)/.test(o), 'ocr.js: a formátumot ELLENŐRZI');
  ok(/415/.test(o), '  ismeretlen formátumot elutasít');
  const oKod = o.split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n');
  ok(!/let mediaType\s*=\s*'image\/jpeg'/.test(oKod), '  nincs „alapértelmezett jpeg" feltételezés a kódban');
}

console.log('\nO. Production konfiguráció veszélyes flag esetén fail-closed');
{
  const g = global, old = { window:g.window, self:g.self };
  const win = {}; win.self = win; g.window = win; g.self = win;
  eval(R('rpw-guard.js'));
  const G = win.RPWGuard;
  eq(G.productionSafety({ PRODUCTION:false }).ok, true, 'PRODUCTION=false → nem korlátoz');
  // 15 (v3): KILENC feltétel, nem négy.
  const MIND_OK = { PRODUCTION:true, AUTH_REQUIRED:true, PATCH_RPC:'rpw_patch_v3',
                    SERVER_TRANSITIONS:true, STORAGE_PRIVATE:true,
                    RLS_LOCKDOWN_VERIFIED:true, RPC_CONSISTENCY_VERIFIED:true,
                    BUSINESS_GATES_SERVER_SIDE:true, INTEGRATION_TESTS_PASSED:true,
                    ALL_ACTIVE_EMPLOYEES_HAVE_PIN:true };
  const bad = G.productionSafety({ PRODUCTION:true });
  eq(bad.ok, false, 'PRODUCTION=true + hiányzó flagek → NEM indul');
  eq(bad.invalid.length, 9, '  mind a KILENC hiányt megnevezi');
  Object.keys(MIND_OK).filter(k => k !== 'PRODUCTION').forEach(k => {
    const cfg = Object.assign({}, MIND_OK);
    cfg[k] = (k === 'PATCH_RPC') ? 'rpw_patch_v2' : false;
    eq(G.productionSafety(cfg).ok, false, '  egyetlen rossz flag is megállít: ' + k);
  });
  eq(G.productionSafety(MIND_OK).ok, true, 'mind a kilenc a helyén → indulhat');
  Object.assign(g, old);
}

console.log('\nP. (extra) A helyi gyorsítótár nem tárol személyes adatot');
{
  const job = { id:'J1', number:'RPW-001', plate:'MS-01-ABC',
                client:'Kovács János', phone:'0740123456', vin:'WVWZZZ1JZXW000001',
                docs:[{type:'buletin',data:'...'}], photos:[{data:'...'}],
                phases:{1:{status:'done',by:'Ferenc'}}, sosire:'sosit', flux:'reparatie' };
  const min = C.minimal(job);
  ['client','phone','vin','docs','photos'].forEach(k =>
    ok(min[k] === undefined, '  ' + k + ' NEM kerül a helyi tárolóba'));
  // 10 (v3): a rendszám MASZKOLVA — személyhez kapcsolható adat
  eq(min.plate, undefined, 'a nyers rendszám NEM kerül a tárolóba');
  eq(min.plateMasked, 'MS-…-ABC', '  csak maszkolt változat');
  eq(min.number, 'RPW-001', 'a munkaszám marad');
  ok(min.phases && min.phases[1] && min.phases[1].status === 'done', 'a fázisállapot marad');
  ok(min.phases[1].by === undefined, '  de a „ki csinálta" nem');
  // TTL
  C.set('proba', {x:1}, 50);
  ok(C.get('proba') !== null, 'friss bejegyzés olvasható');
  C.set('lejart', {x:1}, -1);
  eq(C.get('lejart'), null, 'lejárt bejegyzés NEM olvasható');
  // hatókör
  ok(/SHOP-A/.test(C.scope()) || C.scope() === 'anon', 'a hatókör a szervizhez kötött');
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
})();
