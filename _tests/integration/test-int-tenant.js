// ════════════════════════════════════════════════════════════════
//  INTEGRÁCIÓS TESZTEK — VALÓDI PostgreSQL
//  ----------------------------------------------------------------
//  Ez NEM mock. Beágyazott PostgreSQL indul, a migrációk lefutnak,
//  és az igazi SQL-függvények ellen mérünk.
//
//  Lefedi a brief 6. pontjának mind a 12 esetét és a 13. pont
//  regressziós listáját.
// ════════════════════════════════════════════════════════════════
const D = require('./_db.js');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

let c, SHOP_A, SHOP_B, USER_A, USER_B, USER_TECH, TOK_A, TOK_B, TOK_TECH;
const JOB_A = 'JOB-A-1', JOB_B = 'JOB-B-1';

const CAN_ALL  = { team:true, posts:true, open:true, reception:true,
                   work:true, close:true, override:true, delete:true };
const CAN_TECH = { team:false, posts:false, open:false, reception:false,
                   work:true, close:false, override:false, delete:false };

// A teljes dokumentáció-készlet, amivel az 1. fázis lezárható
const FULL_P1 = {
  damageType:'asig', nrDosar:'DOS-123',
  docs:[{type:'talon'},{type:'constatare'}],
  photos:[{path:'a.jpg'}],
  phases:{}
};

async function rpc(name, args){
  const keys = Object.keys(args);
  const sql = 'select ' + name + '(' +
    keys.map((k,i)=>k+' => $'+(i+1)).join(', ') + ') as r';
  const r = await c.query(sql, keys.map(k=>args[k]));
  return r.rows[0].r;
}

async function setup(){
  c = await D.start();
  for (const f of D.ALL) await D.migrate(c, f);

  const a = await c.query("insert into shops(name) values ('Service A') returning id");
  const b = await c.query("insert into shops(name) values ('Service B') returning id");
  SHOP_A = a.rows[0].id; SHOP_B = b.rows[0].id;

  for (const [sid, code, can] of [[SHOP_A,'MGR',CAN_ALL],[SHOP_A,'TECH',CAN_TECH],
                                  [SHOP_B,'MGR',CAN_ALL]]) {
    await c.query('insert into rpw_roles(shop_id,code,label,can) values ($1,$2,$3,$4)',
                  [sid, code, code, JSON.stringify(can)]);
  }
  const ea = await c.query("insert into rpw_employees(shop_id,name,role_code,pin_hash)"
    + " values ($1,'User A','MGR', crypt('1111', gen_salt('bf'))) returning id", [SHOP_A]);
  const et = await c.query("insert into rpw_employees(shop_id,name,role_code,pin_hash)"
    + " values ($1,'Tech A','TECH', crypt('2222', gen_salt('bf'))) returning id", [SHOP_A]);
  const eb = await c.query("insert into rpw_employees(shop_id,name,role_code,pin_hash)"
    + " values ($1,'User B','MGR', crypt('3333', gen_salt('bf'))) returning id", [SHOP_B]);
  USER_A = ea.rows[0].id; USER_B = eb.rows[0].id; USER_TECH = et.rows[0].id;

  TOK_A    = (await rpc('rpw2_login', {p_shop_id:SHOP_A, p_employee_id:USER_A, p_pin:'1111'})).token;
  TOK_TECH = (await rpc('rpw2_login', {p_shop_id:SHOP_A, p_employee_id:et.rows[0].id, p_pin:'2222'})).token;
  TOK_B    = (await rpc('rpw2_login', {p_shop_id:SHOP_B, p_employee_id:USER_B, p_pin:'3333'})).token;

  await c.query('insert into rpw_jobs(id,shop_id,data) values ($1,$2,$3)',
                [JOB_A, SHOP_A, JSON.stringify({plate:'MS-01-AAA', phases:{}})]);
  await c.query('insert into rpw_jobs(id,shop_id,data) values ($1,$2,$3)',
                [JOB_B, SHOP_B, JSON.stringify({plate:'MS-02-BBB', phases:{}})]);
}

(async () => {
await setup();

console.log('\n══ TENANT-IZOLÁCIÓ (valódi adatbázis) ══');

console.log('\n1. SHOP_A csak JOB_A-t listázhatja');
{
  const r = await rpc('rpw_jobs_list', {p_token:TOK_A, p_trashed:false});
  eq(r.ok, true, 'a listázás sikerül');
  eq(r.rows.length, 1, 'pontosan egy munka');
  eq(r.rows[0].id, JOB_A, '  és az a sajátja');
  const rb = await rpc('rpw_jobs_list', {p_token:TOK_B, p_trashed:false});
  eq(rb.rows[0].id, JOB_B, 'SHOP_B a sajátját látja');
}

console.log('\n2. SHOP_A nem nyithatja meg JOB_B-t');
{
  const r = await rpc('rpw_job_get', {p_token:TOK_A, p_id:JOB_B});
  eq(r.ok, false, 'elutasítva');
  eq(r.error, 'not_found', '  not_found — a létezés sem derül ki');
  const r2 = await rpc('rpw_job_get', {p_token:TOK_A, p_id:'NEM-LETEZO'});
  eq(r2.error, 'not_found', 'nem létező azonosító UGYANAZT adja');
}

console.log('\n3. SHOP_A nem módosíthatja JOB_B-t');
{
  const r = await rpc('rpw_patch_v3', {p_token:TOK_A, p_id:JOB_B,
    p_patch:JSON.stringify({plate:'HACK'}), p_expected_version:1, p_phase:null});
  eq(r.ok, false, 'elutasítva');
  eq(r.error, 'not_found', '  not_found');
  const chk = await c.query('select data->>\'plate\' p from rpw_jobs where id=$1', [JOB_B]);
  eq(chk.rows[0].p, 'MS-02-BBB', '  az adat VÁLTOZATLAN');
}

console.log('\n4-6. SHOP_A nem törölheti / állíthatja vissza / purge-elheti JOB_B-t');
{
  for (const [fn, nev] of [['rpw_job_trash','kosárba'],['rpw_job_restore','visszaállítás'],
                            ['rpw_job_purge','végleges']]) {
    const r = await rpc(fn, {p_token:TOK_A, p_id:JOB_B});
    eq(r.ok, false, nev + ': elutasítva');
    eq(r.error, 'not_found', '  ' + nev + ': not_found');
  }
  const n = await c.query('select count(*) n from rpw_jobs where id=$1', [JOB_B]);
  eq(n.rows[0].n, '1', 'JOB_B továbbra is megvan');
}

console.log('\n8-9. Hamisított shop_id és actor figyelmen kívül marad');
{
  // A shop_id-t NEM lehet paraméterként átadni — nincs ilyen paraméter.
  const args = await c.query(
    "select pg_get_function_arguments(oid) a from pg_proc where proname='rpw_patch_v3'");
  ok(args.rows[0].a.indexOf('shop') < 0, 'a rpw_patch_v3-nak NINCS shop paramétere');
  ok(args.rows[0].a.indexOf('actor') < 0, '  és actor paramétere sem');
  // az actor a tokenből jön
  await rpc('rpw_patch_v3', {p_token:TOK_A, p_id:JOB_A,
    p_patch:JSON.stringify({x:1}), p_expected_version:1, p_phase:null});
  const au = await c.query(
    "select actor from rpw_audit where job_id=$1 order by id desc limit 1", [JOB_A]);
  eq(au.rows[0].actor, 'User A', 'az auditban a SZERVER által azonosított név');
}

console.log('\n10-11. Közvetlen anon CRUD elutasítva');
{
  await c.query('set role anon');
  let olvas = 'ENGEDVE', ir = 'ENGEDVE', tor = 'ENGEDVE';
  try { await c.query('select * from rpw_jobs'); } catch(e){ olvas = 'TILTVA'; }
  try { await c.query("insert into rpw_jobs(id,shop_id,data) values ('X',$1,'{}')", [SHOP_A]); }
  catch(e){ ir = 'TILTVA'; }
  try { await c.query('delete from rpw_jobs'); } catch(e){ tor = 'TILTVA'; }
  await c.query('reset role');
  eq(olvas, 'TILTVA', 'anon SELECT tiltva');
  eq(ir,    'TILTVA', 'anon INSERT tiltva');
  eq(tor,   'TILTVA', 'anon DELETE tiltva');
  // a belső segédfüggvény sem hívható
  await c.query('set role anon');
  let ctx = 'ENGEDVE';
  try { await c.query("select rpw__ctx('x')"); } catch(e){ ctx = 'TILTVA'; }
  await c.query('reset role');
  eq(ctx, 'TILTVA', 'a belső rpw__ctx nem hívható anonként');
}

console.log('\n══ ATOMI VERZIÓZÁR ══');

console.log('\n5. Két párhuzamos, azonos verziójú patch — pontosan EGY sikerül');
{
  const cur = await c.query('select version v from rpw_jobs where id=$1', [JOB_A]);
  const V = cur.rows[0].v;
  // KÉT KÜLÖN kapcsolat — valódi párhuzamosság
  const { Client } = require('pg');
  const mk = () => new Client({ host:'localhost', port:c.port||c.connectionParameters.port,
                                user:'postgres', password:'pw', database:'postgres' });
  const c1 = mk(), c2 = mk();
  await c1.connect(); await c2.connect();
  const q = (cl, patch) => cl.query(
    'select rpw_patch_v3($1,$2,$3::jsonb,$4,null) as r',
    [TOK_A, JOB_A, JSON.stringify(patch), V]);
  const [r1, r2] = await Promise.all([q(c1,{a:1}), q(c2,{a:2})]);
  const oks = [r1.rows[0].r.ok, r2.rows[0].r.ok];
  eq(oks.filter(Boolean).length, 1, 'PONTOSAN EGY sikerül');
  const loser = r1.rows[0].r.ok ? r2.rows[0].r : r1.rows[0].r;
  eq(loser.error, 'version_conflict', '  a másik: version_conflict');
  ok(typeof loser.server_version === 'number', '  és megadja a szerver verzióját');
  await c1.end(); await c2.end();
}

console.log('\n7. Hiányzó expected_version elutasítás');
{
  const r = await rpc('rpw_patch_v3', {p_token:TOK_A, p_id:JOB_A,
    p_patch:JSON.stringify({z:1}), p_expected_version:null, p_phase:null});
  eq(r.ok, false, 'elutasítva');
  eq(r.error, 'expected_version_required', '  stabil hibakód');
  eq(r.message, 'Versiunea dosarului este obligatorie.', '  román üzenet');
}

console.log('\n══ ÜZLETI KAPUK — SZERVEROLDALON ══');

console.log('\n9. Kötelező dokumentum nélkül közvetlen RPC-vel sem zárható fázis');
{
  await c.query("update rpw_jobs set data=$2, version=version+1 where id=$1",
                [JOB_A, JSON.stringify({plate:'MS-01-AAA', phases:{}})]);
  const v = (await c.query('select version v from rpw_jobs where id=$1',[JOB_A])).rows[0].v;
  const r = await rpc('rpw_transition', {p_token:TOK_A, p_id:JOB_A, p_phase:1,
    p_action:'complete', p_expected_version:v, p_reason:null});
  eq(r.ok, false, 'a lezárás elutasítva');
  eq(r.error, 'requirements_missing', '  requirements_missing');
  ok(Array.isArray(r.missing) && r.missing.length > 0, '  megnevezi a hiányokat');
  const kodok = r.missing.map(m=>m.code);
  ok(kodok.indexOf('wf_talon_missing') >= 0, '  hiányzik a talon');
  ok(r.missing[0].message && /lipse|Lipse/.test(r.missing[0].message), '  román üzenettel');
  const ph = await c.query("select data->'phases'->>'1' p from rpw_jobs where id=$1",[JOB_A]);
  ok(!ph.rows[0].p || ph.rows[0].p.indexOf('done') < 0, '  a fázis NEM zárult le');
}

console.log('\n   Teljes dokumentumkészlettel viszont lezárható');
{
  const v = (await c.query('select version v from rpw_jobs where id=$1',[JOB_A])).rows[0].v;
  await c.query('update rpw_jobs set data=$2, version=version+1 where id=$1',
                [JOB_A, JSON.stringify(FULL_P1)]);
  const v2 = (await c.query('select version v from rpw_jobs where id=$1',[JOB_A])).rows[0].v;
  const r = await rpc('rpw_transition', {p_token:TOK_A, p_id:JOB_A, p_phase:1,
    p_action:'complete', p_expected_version:v2, p_reason:null});
  eq(r.ok, true, 'most sikerül');
  eq(r.data.phases['1'].status, 'done', '  az 1. fázis lezárult');
  eq(r.data.phase, 2, '  a 2. fázis aktív');
}

console.log('\n10. Nyitott rework mellett override nélkül nincs lezárás');
{
  const d = Object.assign({}, FULL_P1, {
    phases:{1:{status:'done'},2:{status:'active'}},
    rework:[{id:'r1', status:'open', reason:'teszt'}],
    evalData:{status:'accepted'}, deviz:{total:100}
  });
  await c.query('update rpw_jobs set data=$2, version=version+1 where id=$1',
                [JOB_A, JSON.stringify(d)]);
  const v = (await c.query('select version v from rpw_jobs where id=$1',[JOB_A])).rows[0].v;
  const r = await rpc('rpw_transition', {p_token:TOK_TECH, p_id:JOB_A, p_phase:2,
    p_action:'complete', p_expected_version:v, p_reason:null});
  eq(r.ok, false, 'elutasítva');
  eq(r.error, 'open_rework', '  open_rework');
}

console.log('\n11. Skip indoklás nélkül nem engedélyezett');
{
  const v = (await c.query('select version v from rpw_jobs where id=$1',[JOB_A])).rows[0].v;
  const r = await rpc('rpw_transition', {p_token:TOK_A, p_id:JOB_A, p_phase:3,
    p_action:'skip', p_expected_version:v, p_reason:null});
  eq(r.ok, false, 'elutasítva');
  eq(r.error, 'reason_required', '  reason_required');
  const r2 = await rpc('rpw_transition', {p_token:TOK_A, p_id:JOB_A, p_phase:3,
    p_action:'skip', p_expected_version:v, p_reason:'Nu e necesar'});
  eq(r2.ok, true, 'indoklással sikerül');
}

console.log('\n12. Override manager jog nélkül nem engedélyezett');
{
  const v = (await c.query('select version v from rpw_jobs where id=$1',[JOB_A])).rows[0].v;
  const r = await rpc('rpw_transition', {p_token:TOK_TECH, p_id:JOB_A, p_phase:4,
    p_action:'skip', p_expected_version:v, p_reason:'proba'});
  eq(r.ok, false, 'a technikus nem skippelhet');
  eq(r.error, 'not_allowed', '  not_allowed');
  eq(r.need, 'override', '  megmondja, mi hiányzik');
}

console.log('\n13. Lezárt dosszié normál dolgozó által nem nyitható újra');
{
  const d = { inchis:true, phases:{7:{status:'done'}} };
  await c.query('update rpw_jobs set data=$2, version=version+1 where id=$1',
                [JOB_A, JSON.stringify(d)]);
  const v = (await c.query('select version v from rpw_jobs where id=$1',[JOB_A])).rows[0].v;
  const r = await rpc('rpw_transition', {p_token:TOK_TECH, p_id:JOB_A, p_phase:7,
    p_action:'reopen', p_expected_version:v, p_reason:'Trebuie redeschis'});
  eq(r.ok, false, 'a technikus nem nyithatja újra');
  eq(r.error, 'not_allowed', '  not_allowed');
  const r2 = await rpc('rpw_transition', {p_token:TOK_A, p_id:JOB_A, p_phase:7,
    p_action:'reopen', p_expected_version:v, p_reason:'Rework nou'});
  eq(r2.ok, true, 'a manager igen');
  eq(r2.data.inchis, false, '  a munka újranyílt');
}

console.log('\n6. Két párhuzamos fázislezárásból pontosan egy sikerül');
{
  const d = Object.assign({}, FULL_P1, { phases:{}, inchis:false });
  await c.query('update rpw_jobs set data=$2, version=version+1 where id=$1',
                [JOB_A, JSON.stringify(d)]);
  const V = (await c.query('select version v from rpw_jobs where id=$1',[JOB_A])).rows[0].v;
  const { Client } = require('pg');
  const port = c.connectionParameters.port;
  const mk = () => new Client({ host:'localhost', port, user:'postgres',
                                password:'pw', database:'postgres' });
  const c1 = mk(), c2 = mk(); await c1.connect(); await c2.connect();
  const q = cl => cl.query('select rpw_transition($1,$2,1,$3,$4,null) as r',
                           [TOK_A, JOB_A, 'complete', V]);
  const [r1,r2] = await Promise.all([q(c1), q(c2)]);
  const oks = [r1.rows[0].r.ok, r2.rows[0].r.ok];
  eq(oks.filter(Boolean).length, 1, 'PONTOSAN EGY lezárás sikerül');
  const loser = r1.rows[0].r.ok ? r2.rows[0].r : r1.rows[0].r;
  eq(loser.error, 'version_conflict', '  a másik: version_conflict');
  await c1.end(); await c2.end();
}

console.log('\n14. Az elutasított művelet auditba kerül');
{
  const before = (await c.query("select count(*) n from rpw_audit where action like 'denied:%'")).rows[0].n;
  const v = (await c.query('select version v from rpw_jobs where id=$1',[JOB_A])).rows[0].v;
  await rpc('rpw_transition', {p_token:TOK_TECH, p_id:JOB_A, p_phase:5,
    p_action:'skip', p_expected_version:v,
    p_reason:'Motiv valid pentru test'});   // érdemi indoklás: a JOG hiányát mérjük
  const after = (await c.query("select count(*) n from rpw_audit where action like 'denied:%'")).rows[0].n;
  ok(Number(after) > Number(before), 'új denied: bejegyzés keletkezett');
  const row = await c.query(
    "select action, patch from rpw_audit where action like 'denied:%' order by id desc limit 1");
  ok(/denied:not_allowed/.test(row.rows[0].action), '  a hibakóddal');
  ok(!JSON.stringify(row.rows[0].patch).match(/talon|buletin|cnp/i),
     '  dokumentumtartalom NÉLKÜL');
}

console.log('\n══ LISTÁZÁS ══');

console.log('\n3. listTrashed ugyanazt az RPC-t használja');
{
  const v = (await c.query('select version v from rpw_jobs where id=$1',[JOB_A])).rows[0].v;
  await rpc('rpw_job_trash', {p_token:TOK_A, p_id:JOB_A});
  const akt = await rpc('rpw_jobs_list', {p_token:TOK_A, p_trashed:false});
  eq(akt.rows.length, 0, 'az aktív lista üres');
  const kuka = await rpc('rpw_jobs_list', {p_token:TOK_A, p_trashed:true});
  eq(kuka.rows.length, 1, 'a kosárban egy van');
  eq(kuka.rows[0].id, JOB_A, '  a helyes munka');
  await rpc('rpw_job_restore', {p_token:TOK_A, p_id:JOB_A});
  const vissza = await rpc('rpw_jobs_list', {p_token:TOK_A, p_trashed:false});
  eq(vissza.rows.length, 1, 'visszaállítás után újra aktív');
}

console.log('\n   Válaszformátum');
{
  const r = await rpc('rpw_jobs_list', {p_token:TOK_A, p_trashed:false});
  ok(r.ok === true, 'siker: ok=true');
  ok(Array.isArray(r.rows), '  rows tömb');
  ok('version' in r, '  version mező jelen');
  const bad = await rpc('rpw_jobs_list', {p_token:'ervenytelen-token-ami-eleg-hosszu-32-karakter', p_trashed:false});
  eq(bad.ok, false, 'hiba: ok=false');
  eq(bad.error, 'unauthorized', '  unauthorized');
  ok(!!bad.message, '  üzenettel');
}

console.log('\n══ MUNKAMENET ══');
{
  const r = await rpc('rpw2_session', {p_token:TOK_A});
  eq(r.ok, true, 'érvényes token');
  eq(r.employee.name, 'User A', '  a helyes ember');
  // lejáratás
  await c.query("update rpw_sessions set expires_at = now() - interval '1 hour'"
    + " where employee_id = $1", [USER_A]);
  const e = await rpc('rpw2_session', {p_token:TOK_A});
  eq(e.ok, false, 'lejárt token elutasítva');
  const l = await rpc('rpw_jobs_list', {p_token:TOK_A, p_trashed:false});
  eq(l.error, 'unauthorized', '  és a listázás is');
  await c.query("update rpw_sessions set expires_at = now() + interval '12 hours'"
    + " where employee_id = $1", [USER_A]);
  // visszavonás
  await rpc('rpw_logout', {p_token:TOK_A});
  const rv = await rpc('rpw2_session', {p_token:TOK_A});
  eq(rv.ok, false, 'visszavont token elutasítva');
}

console.log('\n══ SZERVER-KÉPESSÉGEK ══');
{
  const cap = await rpc('rpw_server_capabilities', {});
  eq(cap.ok, true, 'lekérdezhető');
  eq(cap.schema_version, '008', '  séma-verzió 008 (job_create + kivezetések)');
  eq(cap.rls_locked, true, '  az RLS lezárva');
  eq(cap.business_gates_server_side, true, '  az üzleti kapuk szerveroldalon');
  ok(cap.rpcs.indexOf('rpw_transition') >= 0, '  a rpw_transition szerepel');
  ok(cap.rpcs.indexOf('rpw__ctx') < 0, '  a belső segédek NEM');
}

console.log('\n══ PIN-ZÁROLÁS ÉS PIN-MINŐSÉG (007) ══');
{
  // A MUNKAMENET szakasz visszavonta TOK_A-t — friss belépés kell.
  const TOK = (await rpc('rpw2_login', {p_shop_id:SHOP_A, p_employee_id:USER_A, p_pin:'1111'})).token;

  console.log('\n1. A gyenge PIN-t a SZERVER utasítja el, nem a felület');
  for (const [pin, hiba, mit] of [['1234','weak_pin','növekvő futam'],
                                  ['9876','weak_pin','csökkenő futam'],
                                  ['7777','weak_pin','csupa azonos'],
                                  ['1969','weak_pin','évszám'],
                                  ['2026','weak_pin','évszám'],
                                  ['12a4','weak_pin','nem csak számjegy'],
                                  ['123', 'pin_too_short','rövid']]) {
    const r = await rpc('rpw2_pin_set', {p_token:TOK, p_employee_id:USER_TECH, p_new_pin:pin});
    eq(r.error, hiba, '  ' + pin + ' → ' + mit);
  }

  console.log('\n2. Az erős PIN átmegy, és MŰKÖDIK is');
  {
    const r = await rpc('rpw2_pin_set', {p_token:TOK, p_employee_id:USER_TECH, p_new_pin:'4917'});
    eq(r.ok, true, 'elfogadva');
    const l = await rpc('rpw2_login', {p_shop_id:SHOP_A, p_employee_id:USER_TECH, p_pin:'4917'});
    eq(l.ok, true, '  az új PIN-nel be lehet lépni');
    const o = await rpc('rpw2_login', {p_shop_id:SHOP_A, p_employee_id:USER_TECH, p_pin:'2222'});
    eq(o.error, 'bad_pin', '  a régivel nem');
  }

  console.log('\n3. Ütköző PIN — a szervizben mindenkinek MÁS PIN-je van');
  {
    const r = await rpc('rpw2_pin_set', {p_token:TOK, p_employee_id:USER_A, p_new_pin:'4917'});
    eq(r.error, 'pin_taken', 'a kolléga PIN-je nem vehető át');
    const r2 = await rpc('rpw2_pin_set', {p_token:TOK, p_employee_id:USER_A, p_new_pin:'5382'});
    eq(r2.ok, true, '  másik PIN viszont mehet');
    // MÁSIK szervizben ugyanaz a PIN szabad — a szervizek nem látják egymást
    const TB = (await rpc('rpw2_login', {p_shop_id:SHOP_B, p_employee_id:USER_B, p_pin:'3333'})).token;
    const r3 = await rpc('rpw2_pin_set', {p_token:TB, p_employee_id:USER_B, p_new_pin:'4917'});
    eq(r3.ok, true, '  a MÁSIK szervizben ugyanaz a PIN szabad');
  }

  console.log('\n4. A zárolás állapotát csak csapatkezelő látja, és csak a SAJÁT szervizéből');
  {
    const t = await rpc('rpw2_pin_status', {p_token:TOK_TECH});
    eq(t.error, 'not_allowed', 'a technikus nem kérdezheti le');
    const n = await rpc('rpw2_pin_status', {p_token:'x'.repeat(40)});
    eq(n.error, 'unauthorized', '  érvénytelen tokennel sem');

    // 10 rossz PIN → zárolás (002 rpw2_login)
    for (let i=0;i<10;i++) await rpc('rpw2_login', {p_shop_id:SHOP_A, p_employee_id:USER_TECH, p_pin:'0000'});
    const blokk = await rpc('rpw2_login', {p_shop_id:SHOP_A, p_employee_id:USER_TECH, p_pin:'4917'});
    eq(blokk.error, 'locked', 'a 10. rossz PIN után a JÓ PIN sem enged be');

    const st = await rpc('rpw2_pin_status', {p_token:TOK});
    eq(st.ok, true, 'a csapatkezelő lekérdezheti');
    const sor = (st.rows||[]).filter(r => r.id === USER_TECH)[0];
    ok(!!sor, '  a zárolt kolléga szerepel benne');
    eq(sor && sor.locked, true, '  locked = true');
    eq(sor && sor.attempts, 10, '  attempts = 10');
    ok(sor && sor.minutesLeft > 0 && sor.minutesLeft <= 15, '  minutesLeft 1..15 között');

    // a MÁSIK szerviz vezetője NEM látja
    const TB = (await rpc('rpw2_login', {p_shop_id:SHOP_B, p_employee_id:USER_B, p_pin:'4917'})).token;
    const stb = await rpc('rpw2_pin_status', {p_token:TB});
    eq(stb.ok, true, 'a másik szerviz is lekérdezheti — a SAJÁTJÁT');
    ok((stb.rows||[]).filter(r => r.id === USER_TECH).length === 0,
       '  de SHOP_A zárolt dolgozója nincs benne');
  }

  console.log('\n5. A feloldás jogot kér — a gomb elrejtése nem védelem');
  {
    const t = await rpc('rpw2_pin_unlock', {p_token:TOK_TECH, p_employee_id:USER_TECH});
    eq(t.error, 'not_allowed', 'a technikus nem oldhat fel');
    const TB = (await rpc('rpw2_login', {p_shop_id:SHOP_B, p_employee_id:USER_B, p_pin:'4917'})).token;
    const b = await rpc('rpw2_pin_unlock', {p_token:TB, p_employee_id:USER_TECH});
    eq(b.error, 'not_found', 'a MÁSIK szerviz vezetője sem — nem is látja');

    const meg = await rpc('rpw2_login', {p_shop_id:SHOP_A, p_employee_id:USER_TECH, p_pin:'4917'});
    eq(meg.error, 'locked', '  a zárolás eddig érvényben maradt');

    const u = await rpc('rpw2_pin_unlock', {p_token:TOK, p_employee_id:USER_TECH});
    eq(u.ok, true, 'a saját szerviz vezetője feloldja');
    const be = await rpc('rpw2_login', {p_shop_id:SHOP_A, p_employee_id:USER_TECH, p_pin:'4917'});
    eq(be.ok, true, '  utána azonnal be lehet lépni');

    const st = await rpc('rpw2_pin_status', {p_token:TOK});
    ok((st.rows||[]).filter(r => r.id === USER_TECH).length === 0,
       '  és eltűnik a zárolás-listáról');

    const a = await c.query("select count(*) n from rpw_audit where action='pin_unlock'");
    ok(Number(a.rows[0].n) >= 1, 'a feloldás auditba kerül');
  }

  console.log('\n6. Új PIN esetén a régi rossz próbálkozások elévülnek');
  {
    for (let i=0;i<5;i++) await rpc('rpw2_login', {p_shop_id:SHOP_A, p_employee_id:USER_TECH, p_pin:'0000'});
    const elotte = await rpc('rpw2_pin_status', {p_token:TOK});
    ok((elotte.rows||[]).filter(r => r.id === USER_TECH).length === 1, 'öt rossz próbálkozás rögzült');
    const r = await rpc('rpw2_pin_set', {p_token:TOK, p_employee_id:USER_TECH, p_new_pin:'6284'});
    eq(r.ok, true, 'a vezető új PIN-t ad');
    const utana = await rpc('rpw2_pin_status', {p_token:TOK});
    ok((utana.rows||[]).filter(r => r.id === USER_TECH).length === 0,
       '  a friss PIN-nel nem marad zárolás felé tartó számláló');
  }
}

console.log('\n══ MIGRÁCIÓS ROLLBACK ══');
{
  // v4: a 008 van legfelül — fordított sorrendben bontunk
  await D.rollback(c, '008_rollback.sql');
  await D.rollback(c, '007_rollback.sql');
  const p7 = await c.query("select to_regprocedure('public.rpw2_pin_status(text)') as p");
  ok(!p7.rows[0].p, '007 rollback: a PIN-státusz függvény eltűnt');
  await D.rollback(c, '006_rollback.sql');
  await D.rollback(c, '005_rollback.sql');
  const pol = await c.query("select count(*) n from pg_policy where polrelid='public.rpw_jobs'::regclass");
  eq(pol.rows[0].n, '1', '005 rollback: a régi policy visszaállt');
  const v = await c.query('select version from rpw_schema_version');
  eq(v.rows[0].version, '004', '  a séma-verzió 004');
  // újrafuttatás
  await D.migrate(c, '005_rls_lockdown.sql');
  await D.migrate(c, '006_workflow_enforcement.sql');
  await D.migrate(c, '007_pin_lockout_admin.sql');
  const v2 = await c.query('select version from rpw_schema_version');
  eq(v2.rows[0].version, '007', 'a 005+006+007 újra lefuttatható (idempotens)');
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
await c.end(); await D.stop();
process.exit(fail ? 1 : 0);
})().catch(async e => {
  console.log('\n  VÉGZETES: ' + (e.message||e).toString().slice(0,400));
  console.log('\n✗ ' + pass + ' pass / ' + (fail+1) + ' fail');
  try{ await c.end(); }catch(_){}
  await D.stop(); process.exit(1);
});
