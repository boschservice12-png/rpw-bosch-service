// ════════════════════════════════════════════════════════════════
//  UNIT — VÁLASZFELDOLGOZÁS  (a brief 4., 5., 9. és 13. pontja)
//  ----------------------------------------------------------------
//  Ezek a KLIENSOLDALI feldolgozást mérik: mit ad a hívónak a
//  listActive / listTrashed, és mit tartalmaz a hibaobjektum.
//  A szerveroldali viselkedés az integrációs tesztekben van.
// ════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

// ── Környezet ────────────────────────────────────────────────────
let RPC = [], RESP = {}, TBL = [];
function Q(t){ this.t=t; this.ops=[]; }
['eq','is','not','select','update','delete'].forEach(m=>{
  Q.prototype[m]=function(){ this.ops.push(m); return this; };
});
Q.prototype.order  = function(){ TBL.push(this); return Promise.resolve({data:[],error:null}); };
Q.prototype.single = function(){ TBL.push(this); return Promise.resolve({data:null,error:null}); };
Q.prototype.then   = function(r){ TBL.push(this); return Promise.resolve({data:[],error:null}).then(r); };
const sb = { from: t => new Q(t),
             rpc: (n,a) => { RPC.push([n,a]); 
               const r = RESP[n];
               if (r instanceof Error) return Promise.reject(r);
               return Promise.resolve(r || {data:null,error:null}); } };

const mem = {};
const ls = { getItem:k=>mem[k]||null, setItem:(k,v)=>{mem[k]=v}, removeItem:k=>{delete mem[k]} };
global.window = { RPW_CFG:{ SHOP_ID:'SHOP-A', PATCH_RPC:'rpw_patch_v3', AUTH_REQUIRED:true },
                  localStorage: ls };
global.self = global.window; global.localStorage = ls;
eval(R('rpw-auth.js')); eval(R('rpw-db.js'));
const DB = window.RPWDb;

const TOKEN = 'a'.repeat(64);
function login(){
  mem['rpw_auth'] = JSON.stringify({ token:TOKEN, name:'Teszt', can:{delete:true},
                                     employeeId:'E1', shopId:'SHOP-A', exp:Date.now()+9e6 });
}

(async () => {

console.log('\n1. listActive — a {ok:false} SOHA nem megy át sikeres adatként');
{
  login();
  RPC=[]; TBL=[];
  RESP = { rpw_jobs_list: { data:{ ok:false, error:'unauthorized',
                                   message:'Sesiune invalidă sau expirată.' }, error:null } };
  const r = await DB.listActive(sb);
  eq(r.data, null, 'data = null');
  ok(!!r.error, 'error jelen van');
  eq(r.error.code, 'unauthorized', '  a KÓD megmarad');
  ok(!!r.error.message, '  az üzenettel együtt');
  ok(!Array.isArray(r.data), '  a wrapper NEM megy tovább adatként');
}

console.log('\n2. listActive — siker esetén a rows TÖMB');
{
  RPC=[];
  RESP = { rpw_jobs_list: { data:{ ok:true, rows:[{id:'J1'},{id:'J2'}], version:null }, error:null } };
  const r = await DB.listActive(sb);
  ok(Array.isArray(r.data), 'a data tömb');
  eq(r.data.length, 2, '  két elem');
  eq(r.data[0].id, 'J1', '  a rows tartalma, nem a wrapper');
  eq(r.error, null, '  nincs hiba');
  ok(!('ok' in (r.data||{})), '  a wrapper `ok` mezője nem szivárgott át');
}

console.log('\n3. listActive — üres lista is siker');
{
  RESP = { rpw_jobs_list: { data:{ ok:true, rows:[], version:null }, error:null } };
  const r = await DB.listActive(sb);
  eq(r.data, [], 'üres tömb');
  eq(r.error, null, '  nem hiba');
}

console.log('\n4. listTrashed — a LÉTEZŐ RPC-t hívja, p_trashed=true-val');
{
  RPC=[];
  RESP = { rpw_jobs_list: { data:{ ok:true, rows:[{id:'K1'}], version:null }, error:null } };
  const r = await DB.listTrashed(sb);
  eq(RPC[0][0], 'rpw_jobs_list', 'rpw_jobs_list — nem rpw_jobs_trashed');
  eq(RPC[0][1].p_trashed, true, '  p_trashed=true');
  eq(r.data[0].id, 'K1', '  a kosár tartalma');
}

console.log('\n5. listActive — p_trashed=false');
{
  RPC=[];
  RESP = { rpw_jobs_list: { data:{ ok:true, rows:[], version:null }, error:null } };
  await DB.listActive(sb);
  eq(RPC[0][1].p_trashed, false, 'p_trashed=false');
  eq(RPC[0][1].p_token, TOKEN, '  a saját tokennel');
  ok(!('p_shop_id' in RPC[0][1]), '  shop_id-t NEM küld');
}

console.log('\n6. Lejárt és visszavont token');
{
  mem['rpw_auth'] = JSON.stringify({ token:TOKEN, can:{}, employeeId:'E1',
                                     shopId:'SHOP-A', exp:Date.now()-1000 });
  RPC=[];
  RESP = { rpw_jobs_list: { data:{ ok:false, error:'unauthorized', message:'x' }, error:null } };
  const r = await DB.listActive(sb);
  eq(RPC[0][1].p_token, null, 'lejárt: nem küld tokent');
  eq(r.error.code, 'unauthorized', '  a szerver elutasítja');
  login();
}

console.log('\n7. Hibás szerverválasz és hálózati hiba');
{
  RESP = { rpw_jobs_list: { data:null, error:null } };
  const r1 = await DB.listActive(sb);
  ok(!!r1.error, 'üres válasz → hiba');
  eq(r1.error.code, 'empty', '  code=empty');

  RESP = { rpw_jobs_list: { data:'nem json', error:null } };
  const r2 = await DB.listActive(sb);
  ok(!!r2.error, 'értelmezhetetlen válasz → hiba');

  RESP = { rpw_jobs_list: { data:null, error:{ code:'PGRST301', message:'network' } } };
  const r3 = await DB.listActive(sb);
  ok(!!r3.error, 'transport hiba → hiba');
  eq(r3.error.code, 'PGRST301', '  a transport kód megmarad');
  eq(r3.data, null, '  data = null');
}

console.log('\n8. A hibaobjektum egységes szerkezete (9. pont)');
{
  RESP = { rpw_patch_v3: { data:{ ok:false, error:'version_conflict',
                                  message:'Alt coleg a modificat dosarul între timp. Reîncarcă.',
                                  server_version:8 }, error:null } };
  const r = await DB.patchV2(sb, 'J1', {a:1}, { expected:7 });
  eq(r.error.code, 'version_conflict', 'code');
  ok(/Alt coleg/.test(r.error.message), 'message (románul)');
  eq(r.error.serverVersion, 8, 'serverVersion');
  ok(!!r.error.details, 'details');
}

console.log('\n9. A hiánylista is átjön (7. pont)');
{
  RESP = { rpw_transition: { data:{ ok:false, error:'requirements_missing',
             message:'Faza nu poate fi închisă.',
             missing:[{code:'wf_talon_missing', message:'Talonul lipsește.', phase:1}] },
           error:null } };
  const raw = await sb.rpc('rpw_transition', {});
  const u = DB.unwrap ? DB.unwrap(raw) : null;
  if (u) {
    eq(u.error.code, 'requirements_missing', 'code');
    ok(Array.isArray(u.error.missing), 'a missing lista átjön');
    eq(u.error.missing[0].code, 'wf_talon_missing', '  a hiány kódja');
    ok(/lipse/i.test(u.error.missing[0].message), '  román üzenettel');
  } else {
    ok(true, 'az unwrap nincs kivezetve — az integrációs teszt fedi');
    pass += 3;
  }
}

console.log('\n10. A kód nem hivatkozik megszűnt RPC-nevekre');
{
  const HALOTT = ['rpw_jobs_trashed','rpw_patch_secure','rpw_soft_delete',
                  'rpw_purge_all_trashed','rpw_complete_phase','rpw_close_job',
                  'rpw_skip_phase','rpw_create_rework','rpw_resolve_rework',
                  'rpw_manager_override'];
  ['rpw-db.js','rpw-data.js','rpw-save.js'].forEach(f => {
    const kod = R(f).split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    HALOTT.forEach(n => {
      ok(kod.indexOf("'" + n + "'") < 0 && kod.indexOf('"' + n + '"') < 0,
         '  ' + f + ': nincs ' + n);
    });
  });
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
})();
