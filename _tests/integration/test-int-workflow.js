// ════════════════════════════════════════════════════════════════
//  INTEGRÁCIÓS — WORKFLOW-KIKÉNYSZERÍTÉS   (a brief 16. pontja)
//  ----------------------------------------------------------------
//  VALÓDI PostgreSQL. Azt bizonyítja, hogy a `rpw_patch_v3` NEM
//  kerülheti meg a workflow-t, és hogy a mezőszintű jogosultság él.
// ════════════════════════════════════════════════════════════════
const D = require('./_db.js');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

let c, SHOP, JOB = 'JOB-W-1';
let TOK_MGR, TOK_RECEPTION, TOK_TECH;

const CAN_MANAGER = { team:true, posts:true, open:true, reception:true,
                      work:true, close:true, override:true, delete:true };
const CAN_RECEPTION = { team:false, posts:false, open:true, reception:true,
                        work:false, close:false, override:false, delete:true };
const CAN_TECHNICIAN = { team:false, posts:false, open:false, reception:false,
                         work:true, close:false, override:false, delete:false };

async function rpc(name, args){
  const keys = Object.keys(args);
  const sql = 'select ' + name + '(' + keys.map((k,i)=>k+' => $'+(i+1)).join(', ') + ') as r';
  return (await c.query(sql, keys.map(k=>args[k]))).rows[0].r;
}
async function ver(){ return (await c.query('select version v from rpw_jobs where id=$1',[JOB])).rows[0].v; }
async function data(){ return (await c.query('select data d from rpw_jobs where id=$1',[JOB])).rows[0].d; }
async function patch(tok, p){ return rpc('rpw_patch_v3',
  { p_token:tok, p_id:JOB, p_patch:JSON.stringify(p), p_expected_version:await ver(), p_phase:null }); }

(async () => {
c = await D.start();
for (const f of D.ALL) await D.migrate(c, f);

const s = await c.query("insert into shops(name) values ('W Service') returning id");
SHOP = s.rows[0].id;
for (const [code, can] of [['MANAGER',CAN_MANAGER],['RECEPTION',CAN_RECEPTION],['TECHNICIAN',CAN_TECHNICIAN]]) {
  await c.query('insert into rpw_roles(shop_id,code,label,can) values ($1,$2,$3,$4)',
                [SHOP, code, code, JSON.stringify(can)]);
}
const mk = async (nev, rol, pin) => {
  const e = await c.query("insert into rpw_employees(shop_id,name,role_code,pin_hash)"
    + " values ($1,$2,$3,crypt($4,gen_salt('bf'))) returning id", [SHOP, nev, rol, pin]);
  return (await rpc('rpw2_login', {p_shop_id:SHOP, p_employee_id:e.rows[0].id, p_pin:pin})).token;
};
TOK_MGR       = await mk('Manager M','MANAGER','1111');
TOK_RECEPTION = await mk('Receptie R','RECEPTION','2222');
TOK_TECH      = await mk('Tehnician T','TECHNICIAN','3333');

await c.query('insert into rpw_jobs(id,shop_id,data) values ($1,$2,$3)',
  [JOB, SHOP, JSON.stringify({ plate:'MS-99-XXX', phases:{ '1':{status:'active'} }, rework:[] })]);

console.log('\n══ A rpw_patch_v3 NEM kerülheti meg a workflow-t ══');

console.log('\n1. A `phase` mező nem módosítható');
{
  const before = (await data()).phase;
  const r = await patch(TOK_MGR, { phase: 7 });
  eq(r.ok, false, 'elutasítva');
  eq(r.error, 'protected_workflow_field', '  protected_workflow_field');
  ok(r.fields.indexOf('phase') >= 0, '  megnevezi a mezőt');
  ok(/tranziția de fază/.test(r.message), '  román üzenettel');
  eq((await data()).phase, before, '  az adat VÁLTOZATLAN');
}

console.log('\n2. Fázis NEM állítható `done` állapotba (nested!)');
{
  const r = await patch(TOK_MGR, { phases: { '1': { status:'done' } } });
  eq(r.ok, false, 'elutasítva');
  eq(r.error, 'protected_workflow_field', '  protected_workflow_field');
  ok(r.fields.some(f => /phases\.1\.status/.test(f)), '  a TELJES utat megnevezi: ' + JSON.stringify(r.fields));
  eq((await data()).phases['1'].status, 'active', '  a fázis maradt active');
}

console.log('\n3. `inchis=true` nem írható');
{
  const r = await patch(TOK_MGR, { inchis: true });
  eq(r.error, 'protected_workflow_field', 'elutasítva');
  ok(!(await data()).inchis, '  a dosszié NEM zárult le');
}

console.log('\n4. Rework állapota nem zárható patch-csel');
{
  await c.query("update rpw_jobs set data = jsonb_set(data,'{rework}',"
    + " $2::jsonb), version=version+1 where id=$1",
    [JOB, JSON.stringify([{id:'rw1', status:'open', reason:'proba'}])]);
  const r = await patch(TOK_MGR, { rework: [{ id:'rw1', status:'closed' }] });
  eq(r.error, 'protected_workflow_field', 'elutasítva');
  const d = await data();
  eq(d.rework[0].status, 'open', '  a rework NYITVA maradt');
}

console.log('\n5. `completedBy` nem hamisítható');
{
  const r = await patch(TOK_MGR, { completedBy: 'Valaki Mas' });
  eq(r.error, 'protected_workflow_field', 'elutasítva');
  const r2 = await patch(TOK_MGR, { phases: { '1': { completedBy:'Hamis Nev' } } });
  eq(r2.error, 'protected_workflow_field', '  nested sem');
}

console.log('\n6. Mélyen ágyazott patch sem kerüli meg');
{
  const r = await patch(TOK_MGR, { closing: { status:'closed' } });
  eq(r.error, 'protected_workflow_field', 'closing.status elutasítva');
  const r2 = await patch(TOK_MGR, { phases: { '3': { finished: '2026-01-01' } } });
  eq(r2.error, 'protected_workflow_field', 'phases.3.finished elutasítva');
  const r3 = await patch(TOK_MGR, { rework: { '0': { status:'closed' } } });
  eq(r3.error, 'protected_workflow_field', 'rework objektumként is elutasítva');
}

console.log('\n7. TELJES job objektummal sem írható felül');
{
  const teljes = await data();
  teljes.inchis = true;
  teljes.phase = 7;
  teljes.plate = 'MODOSITOTT';
  const r = await patch(TOK_MGR, teljes);
  eq(r.ok, false, 'elutasítva');
  eq(r.error, 'protected_workflow_field', '  protected_workflow_field');
  ok(r.fields.length >= 2, '  több védett mezőt is megnevez');
  const d = await data();
  ok(!d.inchis, '  nem zárult le');
  eq(d.plate, 'MS-99-XXX', '  a rendszám sem változott (az egész patch elutasítva)');
}

console.log('\n8. `null` értékkel sem törölhetők a védett mezők');
{
  const r = await patch(TOK_MGR, { phases: null });
  eq(r.error, 'protected_workflow_field', 'phases:null elutasítva');
  const r2 = await patch(TOK_MGR, { inchis: null });
  eq(r2.error, 'protected_workflow_field', 'inchis:null elutasítva');
  ok(!!(await data()).phases, '  a phases megvan');
}

console.log('\n9. Típusváltással sem kerülhető meg');
{
  const r = await patch(TOK_MGR, { phases: [] });
  eq(r.error, 'protected_workflow_field', 'phases tömbként elutasítva');
  const r2 = await patch(TOK_MGR, { inchis: 'true' });
  eq(r2.error, 'protected_workflow_field', 'inchis szövegként elutasítva');
  const r3 = await patch(TOK_MGR, { rework: 'closed' });
  eq(r3.error, 'protected_workflow_field', 'rework szövegként elutasítva');
}

console.log('\n══ NORMÁL ADATMENTÉS TOVÁBBRA IS MŰKÖDIK ══');

console.log('\n10. Az engedélyezett mezők menthetők');
{
  const r = await patch(TOK_RECEPTION, { client:'Popescu Ion', phone:'0740111222' });
  eq(r.ok, true, 'a recepciós mentheti az ügyféladatot');
  const d = await data();
  eq(d.client, 'Popescu Ion', '  az adat megérkezett');
  const r2 = await patch(TOK_TECH, { elements:[{cod:'A1'}], bodyRows:[{op:'x'}] });
  eq(r2.ok, true, 'a technikus mentheti a szakmai adatot');
}

console.log('\n══ MEZŐSZINTŰ JOGOSULTSÁG ══');

console.log('\n11. A technikus NEM módosíthat recepciós adatot');
{
  const r = await patch(TOK_TECH, { client:'Hamis Nev' });
  eq(r.ok, false, 'elutasítva');
  eq(r.error, 'not_allowed', '  not_allowed');
  eq(r.need, 'reception', '  megmondja, mi kell');
  ok(r.fields.indexOf('client') >= 0, '  és melyik mező');
  ok(/Nu ai dreptul/.test(r.message), '  románul');
  eq((await data()).client, 'Popescu Ion', '  az adat változatlan');
}

console.log('\n12. A recepciós NEM módosíthat szakmai adatot');
{
  const r = await patch(TOK_RECEPTION, { bodyRows:[{op:'hamis'}] });
  eq(r.ok, false, 'elutasítva');
  eq(r.need, 'work', '  work jog kellene');
}

console.log('\n13. A recepciós NEM módosíthat végellenőrzési adatot');
{
  const r = await patch(TOK_RECEPTION, { control:{ allDone:true } });
  eq(r.ok, false, 'elutasítva');
  eq(r.need, 'close', '  close jog kellene');
  const r2 = await patch(TOK_MGR, { control:{ note:'ok' } });
  eq(r2.ok, true, 'a manager viszont mentheti');
}

console.log('\n14. Új dosszié létrehozásához `open` jog kell');
{
  const r = await rpc('rpw_patch_v3', { p_token:TOK_TECH, p_id:'UJ-JOB-1',
    p_patch:JSON.stringify({plate:'X'}), p_expected_version:null, p_phase:null });
  eq(r.ok, false, 'a technikus nem nyithat újat');
  eq(r.need, 'open', '  open jog kellene');
  const r2 = await rpc('rpw_patch_v3', { p_token:TOK_RECEPTION, p_id:'UJ-JOB-2',
    p_patch:JSON.stringify({plate:'Y'}), p_expected_version:null, p_phase:null });
  eq(r2.ok, true, 'a recepciós igen');
}

console.log('\n══ KOSÁR — delete jog ══');

console.log('\n15. Törlés jogosultság szerint');
{
  await c.query("insert into rpw_jobs(id,shop_id,data) values ('TRASH-1',$1,'{}')", [SHOP]);
  const r = await rpc('rpw_job_trash', { p_token:TOK_TECH, p_id:'TRASH-1' });
  eq(r.ok, false, 'a technikus NEM tehet kosárba');
  eq(r.error, 'not_allowed', '  not_allowed');
  eq(r.need, 'delete', '  delete jog kellene');
  ok(/coș/.test(r.message), '  román üzenettel');

  const r2 = await rpc('rpw_job_trash', { p_token:TOK_RECEPTION, p_id:'TRASH-1' });
  eq(r2.ok, true, 'a delete-jogos recepciós igen');

  const r3 = await rpc('rpw_job_trash', { p_token:TOK_MGR, p_id:'TRASH-1' });
  eq(r3.error, 'already_trashed', 'a már törölt stabil hibakódot ad');

  const r4 = await rpc('rpw_job_trash', { p_token:TOK_MGR, p_id:'NEM-LETEZO' });
  eq(r4.error, 'not_found', 'a nem létező: not_found');
}

console.log('\n16. Az elutasított kísérlet auditba kerül');
{
  const n = await c.query("select count(*) c from rpw_audit"
    + " where action='denied:protected_workflow_field'");
  ok(Number(n.rows[0].c) > 0, 'van denied:protected_workflow_field bejegyzés');
  const row = await c.query("select actor, patch from rpw_audit"
    + " where action='denied:protected_workflow_field' order by id desc limit 1");
  ok(!!row.rows[0].actor, '  actorral');
  ok(!!row.rows[0].patch.fields, '  a tiltott mezőutakkal');
  const p = JSON.stringify(row.rows[0].patch);
  ok(!/Popescu|0740|MS-99/.test(p), '  de ADATTARTALOM nélkül');
  const t = await c.query("select count(*) c from rpw_audit where action='denied:not_allowed'");
  ok(Number(t.rows[0].c) > 0, 'a jogosultsági elutasítás is auditálva');
}

console.log('\n══ A TRANSITION TOVÁBBRA IS MŰKÖDIK ══');

console.log('\n17. A fázis LEZÁRHATÓ az átmenettel');
{
  await c.query('update rpw_jobs set data=$2, version=version+1 where id=$1',
    [JOB, JSON.stringify({ damageType:'asig', nrDosar:'D1',
      docs:[{type:'talon'},{type:'constatare'}], photos:[{p:'a'}],
      phases:{}, rework:[] })]);
  const r = await rpc('rpw_transition', { p_token:TOK_MGR, p_id:JOB, p_phase:1,
    p_action:'complete', p_expected_version:await ver(), p_reason:null,
    p_rework_id:null, p_note:null });
  eq(r.ok, true, 'a lezárás sikerül');
  eq(r.data.phases['1'].status, 'done', '  az 1. fázis done');
  eq(r.data.phases['1'].completedBy, 'Manager M', '  a SZERVER írta a nevet');
}

console.log('\n18. Az atomi verziózár változatlanul él');
{
  // a 2. fázis követelményei: evalData.status + deviz
  await patch(TOK_TECH, { evalData:{ status:'acceptat' }, deviz:{ total:1500 } });
  const V = await ver();
  const { Client } = require('pg');
  const port = c.connectionParameters.port;
  const mkc = () => new Client({ host:'localhost', port, user:'postgres', password:'pw', database:'postgres' });
  const c1 = mkc(), c2 = mkc(); await c1.connect(); await c2.connect();
  const q = cl => cl.query('select rpw_transition($1,$2,2,$3,$4,null,null,null) as r',
                           [TOK_MGR, JOB, 'complete', V]);
  const [r1,r2] = await Promise.all([q(c1), q(c2)]);
  const oks = [r1.rows[0].r.ok, r2.rows[0].r.ok];
  eq(oks.filter(Boolean).length, 1, 'PONTOSAN EGY sikerül');
  await c1.end(); await c2.end();
}

console.log('\n19. Érdemi indoklás kötelező');
{
  const V = await ver();
  const r = await rpc('rpw_transition', { p_token:TOK_MGR, p_id:JOB, p_phase:3,
    p_action:'skip', p_expected_version:V, p_reason:'   ', p_rework_id:null, p_note:null });
  eq(r.error, 'reason_required', 'csak szóköz → elutasítva');
  const r2 = await rpc('rpw_transition', { p_token:TOK_MGR, p_id:JOB, p_phase:3,
    p_action:'skip', p_expected_version:V, p_reason:'ab', p_rework_id:null, p_note:null });
  eq(r2.error, 'reason_required', '  2 karakter is kevés (min. 5)');
  const r3 = await rpc('rpw_transition', { p_token:TOK_MGR, p_id:JOB, p_phase:3,
    p_action:'skip', p_expected_version:V, p_reason:'Nu este necesar', p_rework_id:null, p_note:null });
  eq(r3.ok, true, '  érdemi indoklással sikerül');
}

console.log('\n20. A rework lezárása AZONOSÍTÓT kér, nem indoklást');
{
  let V = await ver();
  const r = await rpc('rpw_transition', { p_token:TOK_MGR, p_id:JOB, p_phase:4,
    p_action:'rework_open', p_expected_version:V, p_reason:'Zgarietura pe usa',
    p_rework_id:null, p_note:null });
  eq(r.ok, true, 'rework megnyitva');
  const rwId = r.data.rework[r.data.rework.length-1].id;
  ok(!!rwId, '  van azonosítója');

  V = await ver();
  const r2 = await rpc('rpw_transition', { p_token:TOK_MGR, p_id:JOB, p_phase:4,
    p_action:'rework_close', p_expected_version:V, p_reason:null,
    p_rework_id:null, p_note:'kesz' });
  eq(r2.error, 'rework_id_required', 'azonosító nélkül elutasítva');

  const r3 = await rpc('rpw_transition', { p_token:TOK_MGR, p_id:JOB, p_phase:4,
    p_action:'rework_close', p_expected_version:V, p_reason:null,
    p_rework_id:'nemletezo', p_note:'x' });
  eq(r3.error, 'rework_not_found', 'ismeretlen azonosító elutasítva');

  const r4 = await rpc('rpw_transition', { p_token:TOK_MGR, p_id:JOB, p_phase:4,
    p_action:'rework_close', p_expected_version:V, p_reason:null,
    p_rework_id:rwId, p_note:'Reparat si verificat' });
  eq(r4.ok, true, 'helyes azonosítóval sikerül');
  const rw = r4.data.rework.find(x => x.id === rwId);
  eq(rw.status, 'closed', '  lezárva');
  eq(rw.note, 'Reparat si verificat', '  a lezárási megjegyzéssel');
}

console.log('\n21. Idegen tenant továbbra is not_found');
{
  const s2 = await c.query("insert into shops(name) values ('Masik') returning id");
  await c.query('insert into rpw_roles(shop_id,code,label,can) values ($1,$2,$3,$4)',
    [s2.rows[0].id, 'MGR','MGR', JSON.stringify(CAN_MANAGER)]);
  const e2 = await c.query("insert into rpw_employees(shop_id,name,role_code,pin_hash)"
    + " values ($1,'Idegen','MGR',crypt('9999',gen_salt('bf'))) returning id", [s2.rows[0].id]);
  const tok2 = (await rpc('rpw2_login', {p_shop_id:s2.rows[0].id, p_employee_id:e2.rows[0].id, p_pin:'9999'})).token;
  const r = await rpc('rpw_patch_v3', { p_token:tok2, p_id:JOB,
    p_patch:JSON.stringify({client:'X'}), p_expected_version:1, p_phase:null });
  eq(r.error, 'not_found', 'idegen patch: not_found');
  const r2 = await rpc('rpw_job_trash', { p_token:tok2, p_id:JOB });
  eq(r2.error, 'not_found', 'idegen trash: not_found');
}

console.log('\n══ ROLLBACK ══');

console.log('\n22. A 006 rollback visszaállítja a V3 állapotot');
{
  await D.rollback(c, '006_rollback.sql');
  const t = await c.query("select count(*) n from pg_tables where schemaname='public'"
    + " and tablename in ('rpw_protected_fields','rpw_patch_permissions')");
  eq(t.rows[0].n, '0', 'a V4 táblák eltűntek');
  const v = await c.query('select version from rpw_schema_version');
  eq(v.rows[0].version, '005', 'a séma-verzió 005');
  const sg = await c.query("select pg_get_function_identity_arguments(oid) a"
    + " from pg_proc where proname='rpw_transition'");
  eq(sg.rows.length, 1, 'egy transition szignatúra');
  ok(!/p_rework_id/.test(sg.rows[0].a), '  a V3-as (6 paraméteres)');
  // és a védelem tényleg megszűnt
  const r = await rpc('rpw_patch_v3', { p_token:TOK_MGR, p_id:JOB,
    p_patch:JSON.stringify({inchis:true}), p_expected_version:await ver(), p_phase:null });
  eq(r.ok, true, 'a V3 patch ÚJRA enged workflow-mezőt (ez a V3 hibája volt)');

  // újra fel
  await D.migrate(c, '006_workflow_enforcement.sql');
  const v2 = await c.query('select version from rpw_schema_version');
  eq(v2.rows[0].version, '006', 'a 006 újra lefuttatható');
  const r2 = await rpc('rpw_patch_v3', { p_token:TOK_MGR, p_id:JOB,
    p_patch:JSON.stringify({inchis:false}), p_expected_version:await ver(), p_phase:null });
  eq(r2.error, 'protected_workflow_field', '  és a védelem újra él');
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
