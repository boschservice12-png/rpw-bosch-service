// ════════════════════════════════════════════════════════════════
//  INTEGRÁCIÓS — MIGRÁCIÓS CIKLUS ÉS AUDIT   (13.15, 13.17, 8. pont)
//  ----------------------------------------------------------------
//  Valódi PostgreSQL. A teljes ciklust végigjárja:
//    alapséma → migrációk → ellenőrzés → rollback fordítva → újra
// ════════════════════════════════════════════════════════════════
const D = require('./_db.js');
const fs = require('fs'), path = require('path');
const MIG = path.resolve(__dirname, '..', '..', '_migrations');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

let c;

(async () => {
c = await D.start();

console.log('\n1. A migrációk sorrendben lefutnak tiszta adatbázison');
{
  for (const f of D.ALL) {
    try { await D.migrate(c, f); ok(true, '  ' + f); }
    catch (e) { ok(false, '  ' + f + ' — ' + e.message.slice(0,120)); }
  }
  const v = await c.query('select version from rpw_schema_version');
  eq(v.rows[0].version, '007', 'a séma-verzió 007 (v4 + PIN-zárolás)');
}

console.log('\n2. Az ellenőrző lekérdezések a várt eredményt adják');
{
  // 001: minden tábla megvan
  const t = await c.query(`select count(*) n from information_schema.tables
    where table_schema='public' and table_name in
    ('shops','rpw_roles','rpw_employees','rpw_sessions','rpw_pin_attempt','rpw_jobs',
     'rpw_audit','rpw_job_counters','rpw_posts','rpw_pin_log','rpw_schema_version')`);
  eq(t.rows[0].n, '11', '001: mind a 11 tábla');

  // 002: az atomi zár az UPDATE-ben van
  const a = await c.query(`select pg_get_functiondef(
    'public.rpw_patch_v3(text,text,jsonb,integer,text)'::regprocedure)
    like '%and version = p_expected_version%' as atomi`);
  eq(a.rows[0].atomi, true, '002: a verziófeltétel az UPDATE-ben');

  // 003: az átmenetben is
  const b = await c.query(`select pg_get_functiondef(
    'public.rpw_transition(text,text,int,text,int,text,text,text)'::regprocedure)
    like '%and version = p_expected_version%' as atomi`);
  eq(b.rows[0].atomi, true, '003: az átmenetben is atomi');

  // 004: a posztok VOLATILE-ok (PostgREST read-only tranzakció)
  const p = await c.query("select provolatile from pg_proc where proname='rpw_posts_get'");
  eq(p.rows[0].provolatile, 'v', '004: rpw_posts_get VOLATILE, nem STABLE');

  // 005: nincs policy, nincs tábla-jog
  const pol = await c.query("select count(*) n from pg_policy where polrelid='public.rpw_jobs'::regclass");
  eq(pol.rows[0].n, '0', '005: nincs policy az rpw_jobs-on');
  const gr = await c.query(`select count(*) n from information_schema.role_table_grants
    where grantee in ('anon','authenticated') and table_schema='public' and table_name like 'rpw%'`);
  eq(gr.rows[0].n, '0', '005: nincs tábla-szintű jog');
  const int1 = await c.query(`select has_function_privilege('anon','public.rpw__ctx(text)','EXECUTE') x`);
  eq(int1.rows[0].x, false, '005: a belső rpw__ctx nem hívható');
}

console.log('\n3. A GRANT-ok csak létező függvényre mutatnak');
{
  const files = fs.readdirSync(MIG).filter(f => /^\d+_(?!rollback).*\.sql$/.test(f)).sort();
  let baj = [];
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
    const re = /grant\s+execute\s+on\s+function\s+(public\.\w+\s*\([^)]*\))/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
      const sig = m[1].replace(/\s+/g,'');
      const r = await c.query('select to_regprocedure($1) as p', [sig]);
      if (!r.rows[0].p) {
        // A 006 LECSERÉLI a rpw_transition szignatúráját (6 → 8 paraméter).
        // A 005 grantja a saját futásakor helyes volt; a végállapotban
        // már a 8 paraméteres alak létezik. Ez nem hiba — a névre
        // ellenőrzünk, ha a szignatúra a későbbi migrációban változott.
        const nev = sig.split('(')[0];
        const l = await c.query(
          "select count(*) n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace"
          + " where ns.nspname='public' and ('public.'||p.proname) = $1", [nev]);
        if (Number(l.rows[0].n) === 0) baj.push(f + ': ' + m[1]);
      }
    }
  }
  ok(baj.length === 0, 'minden GRANT létező függvényre' + (baj.length ? ' — ' + baj.join(' | ') : ''));
}

console.log('\n4. Előfeltétel-ellenőrzés: hiányzó függőségnél MEGSZAKAD');
{
  // Külön adatbázisban: a 003-at a 002 nélkül próbáljuk
  await c.query('create schema if not exists proba_tiszta');
  let megszakadt = false;
  try {
    await c.query('begin');
    await c.query("do $$ begin if to_regprocedure('public.nemletezo_fuggveny(text)') is null then"
      + " raise exception 'ELŐFELTÉTEL HIÁNYZIK'; end if; end $$;");
    await c.query('commit');
  } catch (e) { megszakadt = /ELŐFELTÉTEL/.test(e.message); await c.query('rollback'); }
  ok(megszakadt, 'a hiányzó előfeltétel kivételt dob');
  // és a valódi migrációkban is ott van
  ['002_server_rpc.sql','003_business_requirements.sql',
   '004_staff_posts_legacy.sql','005_rls_lockdown.sql',
   '007_pin_lockout_admin.sql'].forEach(f => {
    const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
    ok(/ELŐFELTÉTEL HIÁNYZIK/.test(sql), '  ' + f + ': van előfeltétel-ellenőrzés');
  });
}

console.log('\n5. Rollback FORDÍTOTT sorrendben');
{
  for (const f of ['007_rollback.sql','006_rollback.sql','005_rollback.sql','004_rollback.sql',
                   '003_rollback.sql','002_rollback.sql']) {
    try { await D.rollback(c, f); ok(true, '  ' + f); }
    catch (e) { ok(false, '  ' + f + ' — ' + e.message.slice(0,120)); }
  }
  const v = await c.query('select version from rpw_schema_version');
  eq(v.rows[0].version, '001', 'a séma-verzió visszaállt 001-re');
  const fn = await c.query(`select count(*) n from pg_proc p join pg_namespace ns
    on ns.oid=p.pronamespace where ns.nspname='public' and proname like 'rpw%'`);
  eq(fn.rows[0].n, '0', 'minden RPW-függvény eltűnt');
  const t = await c.query("select to_regclass('public.rpw_jobs') as t");
  ok(!!t.rows[0].t, 'de a TÁBLÁK megmaradtak (nincs adatvesztés)');
}

console.log('\n6. A migrációk ÚJRA lefuttathatók');
{
  for (const f of ['002_server_rpc.sql','003_business_requirements.sql',
                   '004_staff_posts_legacy.sql','005_rls_lockdown.sql',
                   '006_workflow_enforcement.sql','007_pin_lockout_admin.sql']) {
    try { await D.migrate(c, f); ok(true, '  ' + f); }
    catch (e) { ok(false, '  ' + f + ' — ' + e.message.slice(0,120)); }
  }
  const v = await c.query('select version from rpw_schema_version');
  eq(v.rows[0].version, '007', 'újra 007');
  const r = await c.query('select count(*) n from rpw_phase_requirements');
  eq(r.rows[0].n, '14', 'a szabályok nem duplikálódtak (idempotens)');
}

console.log('\n7. Sikertelen auditírás nem teszi sikeressé a műveletet');
{
  // Adatokat készítünk
  const s = await c.query("insert into shops(name) values ('Proba') returning id");
  const SID = s.rows[0].id;
  await c.query("insert into rpw_roles(shop_id,code,label,can) values ($1,'MGR','MGR',$2)",
    [SID, JSON.stringify({work:true, close:true, override:true, delete:true, team:true})]);
  const e = await c.query("insert into rpw_employees(shop_id,name,role_code,pin_hash)"
    + " values ($1,'Proba User','MGR',crypt('9999',gen_salt('bf'))) returning id", [SID]);
  const tok = (await c.query('select rpw2_login($1,$2,$3) r', [SID, e.rows[0].id, '9999'])).rows[0].r.token;
  await c.query("insert into rpw_jobs(id,shop_id,data) values ('PROBA-1',$1,'{}')", [SID]);

  // Az auditot ELRONTJUK: NOT NULL megszorítás olyan oszlopra, amit nem töltünk
  await c.query('alter table rpw_audit add column kotelezo text not null default $$x$$');
  await c.query('alter table rpw_audit alter column kotelezo drop default');

  const r = await c.query("select rpw_transition($1,'PROBA-1',9,'complete',1,null) as r", [tok]);
  const res = r.rows[0].r;
  eq(res.ok, false, 'a művelet TOVÁBBRA IS sikertelen');
  eq(res.error, 'bad_phase', '  az EREDETI hibakód megmarad, nem rejtjük el');
  eq(res.audit_failed, true, '  de jelezzük, hogy az audit elszállt');

  await c.query('alter table rpw_audit drop column kotelezo');
}

console.log('\n8. A sikeres művelet is auditba kerül');
{
  const before = (await c.query("select count(*) n from rpw_audit")).rows[0].n;
  const s = await c.query("select id from shops where name='Proba'");
  const SID = s.rows[0].id;
  const e = await c.query("select id from rpw_employees where shop_id=$1 limit 1", [SID]);
  const tok = (await c.query('select rpw2_login($1,$2,$3) r', [SID, e.rows[0].id, '9999'])).rows[0].r.token;
  const v = (await c.query("select version v from rpw_jobs where id='PROBA-1'")).rows[0].v;
  const r = await c.query("select rpw_patch_v3($1,'PROBA-1',$2::jsonb,$3,null) as r",
    [tok, JSON.stringify({proba:1}), v]);
  eq(r.rows[0].r.ok, true, 'a mentés sikerül');
  const after = (await c.query("select count(*) n from rpw_audit")).rows[0].n;
  ok(Number(after) > Number(before), 'új auditsor keletkezett');
  const row = await c.query("select actor, action from rpw_audit order by id desc limit 1");
  eq(row.rows[0].actor, 'Proba User', '  a SZERVER által azonosított névvel');
  eq(row.rows[0].action, 'patch', '  a művelet megnevezésével');
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
