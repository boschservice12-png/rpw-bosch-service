// ════════════════════════════════════════════════════════════════
//  RPW-002 — RLS LEZÁRÁS AZ ÉLŐ ADATBÁZIS ALAKJÁRA (008)
//  ----------------------------------------------------------------
//  Valódi PostgreSQL. A fixture NEM a migrációs vonal, hanem az ÉLŐ
//  adatbázis alakja, ahogy 2026-08-29-én olvasással megmértük:
//
//    · rpw_jobs: RLS BE, egyetlen policy "rpw_jobs anon rw"
//                FOR ALL TO anon,authenticated USING(true) WITH CHECK(true)
//    · grants:   anon → SELECT, INSERT, UPDATE, DELETE
//    · a munkameneteket az `app_session` tárolja (nem rpw_sessions)
//    · a rpw_transition / rpw_requirements / rpw_can_complete /
//      rpw_cleanup_* / rpw_server_capabilities NEM létezik
//
//  Amit bizonyítunk:
//    1. a fixture tényleg reprodukálja a mai kitettséget (anon mindent tud)
//    2. a 008 lezárja: anon CRUD elutasítva
//    3. a tenant-biztos RPC-k továbbra is hívhatók
//    4. a NEM tenant-biztos régi RPC-k NEM kapnak jogot
//    5. a rollback másodpercek alatt visszaállít
//    6. a 008 újrafuttatható (idempotens)
//
//  Személyes adat nincs a fixture-ben.
// ════════════════════════════════════════════════════════════════
const D = require('./_db.js');
const fs = require('fs'), path = require('path');
const MIG = path.resolve(__dirname, '..', '..', '_migrations');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

const SHOP_A = '11111111-1111-1111-1111-111111111111';

// Egy művelet megkísérlése anon szerepként. 'ENGEDVE' / 'TILTVA'.
async function anonKent(c, sql, params){
  await c.query('set role anon');
  let r = 'ENGEDVE';
  try { await c.query(sql, params||[]); } catch(e){ r = 'TILTVA'; }
  try { await c.query('reset role'); } catch(e){ await c.query('reset role'); }
  return r;
}

(async () => {
const c = await D.start();

console.log('\n══ RPW-002 — RLS LEZÁRÁS AZ ÉLŐ ALAKON (valódi adatbázis) ══');

console.log('\n0. Az ÉLŐ alak felépítése (fixture)');
{
  // Táblák — az élő oszlopnevekkel (deleted_at, version, shop_id)
  await c.query(`
    create table public.rpw_jobs(
      id text primary key, shop_id uuid not null, data jsonb not null default '{}',
      version int not null default 1, deleted_at timestamptz,
      updated_at timestamptz not null default now());
    create table public.rpw_audit(
      id bigserial primary key, job_id text, actor text, at timestamptz default now());
    create table public.app_session(
      token text primary key, employee_id uuid, shop_id uuid,
      expires_at timestamptz not null default now()+interval '12 hours');
    create table public.rpw_employees(
      id uuid primary key, shop_id uuid, name text, pin_hash text, active boolean default true);
    create table public.rpw_roles(code text primary key, can jsonb);
    create table public.rpw_posts(id text primary key);
    create table public.rpw_pin_log(id bigserial primary key);
    create table public.rpw_job_counters(prefix text primary key, n int);
    create table public.rpw_pin_attempt(id bigserial primary key);`);

  // Az élő SECURITY DEFINER függvények — a VALÓDI szignatúrákkal.
  // A törzs itt szándékosan a lényegre szorítkozik: a jogosultsági
  // viselkedést mérjük, nem az üzleti logikát (azt a test-int-tenant fedi).
  await c.query(`
    create function public.rpw__ctx(p_token text) returns uuid
      language sql security definer as
      $$ select shop_id from public.app_session where token=p_token and expires_at>now() $$;
    create function public.rpw_jobs_list(p_token text, p_trashed boolean) returns jsonb
      language sql security definer as
      $$ select jsonb_build_object('ok', public.rpw__ctx(p_token) is not null,
           'rows', coalesce((select jsonb_agg(to_jsonb(j)) from public.rpw_jobs j
             where j.shop_id = public.rpw__ctx(p_token)
               and (p_trashed = (j.deleted_at is not null))), '[]'::jsonb)) $$;
    create function public.rpw_job_get(p_token text, p_id text) returns jsonb
      language sql security definer as
      $$ select coalesce((select to_jsonb(j)||jsonb_build_object('ok',true) from public.rpw_jobs j
           where j.id=p_id and j.shop_id=public.rpw__ctx(p_token)),
           jsonb_build_object('ok',false,'error','not_found')) $$;
    create function public.rpw_patch_v3(p_token text, p_id text, p_patch jsonb,
        p_expected_version integer, p_phase text) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;
    create function public.rpw_job_trash(p_token text, p_id text) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;
    create function public.rpw_job_restore(p_token text, p_id text) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;
    create function public.rpw_job_purge(p_token text, p_id text) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;
    create function public.rpw_job_number(p_token text, p_prefix text) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;
    create function public.rpw2_login(p_shop_id uuid, p_employee_id uuid, p_pin text) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;
    create function public.rpw2_session(p_token text) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;
    create function public.rpw2_roster(p_shop_id uuid) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;
    create function public.rpw_logout(p_token text) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;
    -- NEM tenant-biztos, régi utak (a hívó adná a shop_id-t / nincs token)
    create function public.rpw_patch_v2(p_id text, p_patch jsonb, p_expected_version integer,
        p_actor text, p_phase text) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;
    create function public.rpw_login(p_shop_id uuid, p_pin text) returns jsonb
      language sql security definer as $$ select jsonb_build_object('ok',true) $$;`);

  // A MAI kitettség: RLS be, de egyetlen mindent megengedő policy + teljes grant
  await c.query(`
    alter table public.rpw_jobs enable row level security;
    create policy "rpw_jobs anon rw" on public.rpw_jobs
      as permissive for all to anon, authenticated using (true) with check (true);
    grant select, insert, update, delete on public.rpw_jobs to anon, authenticated;`);
  await c.query("insert into public.rpw_jobs(id,shop_id,data) values ('J1',$1,'{}')",[SHOP_A]);
  ok(true, 'az élő alak felépült');
}

console.log('\n1. A fixture reprodukálja a MAI kitettséget (a lezárás ELŐTT)');
{
  eq(await anonKent(c,'select * from public.rpw_jobs'), 'ENGEDVE', 'anon OLVASHATJA a munkákat');
  eq(await anonKent(c,"insert into public.rpw_jobs(id,shop_id,data) values ('X',$1,'{}')",[SHOP_A]),
     'ENGEDVE', 'anon ÍRHAT is');
  eq(await anonKent(c,"delete from public.rpw_jobs where id='X'"), 'ENGEDVE', 'anon TÖRÖLHET is');
  eq(await anonKent(c,"select public.rpw_patch_v2('J1','{}'::jsonb,1,'x',null)"),
     'ENGEDVE', 'a nem tenant-biztos rpw_patch_v2 is hívható');
}

console.log('\n2. A 008 lezár: közvetlen anon CRUD elutasítva');
{
  await D.migrate(c, '008_rls_lockdown_live.sql');
  eq(await anonKent(c,'select * from public.rpw_jobs'), 'TILTVA', 'anon SELECT tiltva');
  eq(await anonKent(c,"insert into public.rpw_jobs(id,shop_id,data) values ('Y',$1,'{}')",[SHOP_A]),
     'TILTVA', 'anon INSERT tiltva');
  eq(await anonKent(c,"update public.rpw_jobs set data='{}'::jsonb"), 'TILTVA', 'anon UPDATE tiltva');
  eq(await anonKent(c,'delete from public.rpw_jobs'), 'TILTVA', 'anon DELETE tiltva');
  const pol = await c.query("select count(*) n from pg_policy where polrelid='public.rpw_jobs'::regclass");
  eq(pol.rows[0].n, '0', '  a mindent megengedő policy eltűnt');
  const gr = await c.query(`select count(*) n from information_schema.role_table_grants
    where grantee in ('anon','authenticated') and table_schema='public' and table_name like 'rpw%'`);
  eq(gr.rows[0].n, '0', '  és egyetlen tábla-jog sem maradt');
  const f = await c.query("select relforcerowsecurity from pg_class where oid='public.rpw_jobs'::regclass");
  eq(f.rows[0].relforcerowsecurity, true, '  az RLS ki is van KÉNYSZERÍTVE (a tulajdonos sem kerüli meg)');
}

console.log('\n3. A tenant-biztos utak TOVÁBBRA IS hívhatók (a műhely dolgozni tud)');
{
  for (const [nev, hivas] of [
    ['rpw2_roster',   "select public.rpw2_roster($1)"],
    ['rpw2_login',    "select public.rpw2_login($1,$1,'1234')"],
    ['rpw2_session',  "select public.rpw2_session('t')"],
    ['rpw_jobs_list', "select public.rpw_jobs_list('t',false)"],
    ['rpw_job_get',   "select public.rpw_job_get('t','J1')"],
    ['rpw_patch_v3',  "select public.rpw_patch_v3('t','J1','{}'::jsonb,1,null)"],
    ['rpw_job_trash', "select public.rpw_job_trash('t','J1')"],
    ['rpw_logout',    "select public.rpw_logout('t')"]]) {
    eq(await anonKent(c, hivas, /\$1/.test(hivas)?[SHOP_A]:[]), 'ENGEDVE', nev + ' hívható');
  }
}

console.log('\n4. A NEM tenant-biztos régi utak NEM kapnak jogot');
{
  eq(await anonKent(c,"select public.rpw_patch_v2('J1','{}'::jsonb,1,'x',null)"),
     'TILTVA', 'rpw_patch_v2 (a hívó adná az actort) tiltva');
  eq(await anonKent(c,"select public.rpw_login($1,'1234')",[SHOP_A]),
     'TILTVA', 'rpw_login (token nélküli régi belépés) tiltva');
  eq(await anonKent(c,"select public.rpw__ctx('t')"),
     'TILTVA', 'a belső rpw__ctx kívülről nem hívható');
}

console.log('\n5. A tokenből jön a shop — hamisítani nem lehet');
{
  // Érvényes munkamenet SHOP_A-ra, és egy munka egy MÁSIK szervizhez
  const SHOP_B = '22222222-2222-2222-2222-222222222222';
  await c.query("insert into public.app_session(token,shop_id) values ('tokA',$1)",[SHOP_A]);
  await c.query("insert into public.rpw_jobs(id,shop_id,data) values ('J_B',$1,'{}')",[SHOP_B]);
  await c.query('set role anon');
  const lista = await c.query("select public.rpw_jobs_list('tokA',false) as r");
  const egy   = await c.query("select public.rpw_job_get('tokA','J_B') as r");
  await c.query('reset role');
  const ids = (lista.rows[0].r.rows||[]).map(x=>x.id);
  eq(ids, ['J1'], 'SHOP_A csak a SAJÁT munkáját listázza');
  eq(egy.rows[0].r.ok, false, 'SHOP_A nem nyithatja meg SHOP_B munkáját');
  eq(egy.rows[0].r.error, 'not_found', '  a válasz not_found — a létezést sem szivárogtatja');
}

console.log('\n6. A rollback másodpercek alatt visszaállít');
{
  await D.rollback(c, '008_rollback.sql');
  eq(await anonKent(c,'select * from public.rpw_jobs'), 'ENGEDVE', 'a régi működés visszatér');
  eq(await anonKent(c,"select public.rpw_patch_v2('J1','{}'::jsonb,1,'x',null)"),
     'ENGEDVE', '  a régi RPC is újra hívható');
}

console.log('\n7. A 008 újrafuttatható (idempotens)');
{
  await D.migrate(c, '008_rls_lockdown_live.sql');
  eq(await anonKent(c,'select * from public.rpw_jobs'), 'TILTVA', 'másodszorra is lezár');
  await D.migrate(c, '008_rls_lockdown_live.sql');
  eq(await anonKent(c,'select * from public.rpw_jobs'), 'TILTVA', 'harmadszorra sem hibázik');
}

console.log('\n8. Hiányzó előfeltétel esetén MEGSZAKAD, és semmit nem változtat');
{
  await D.rollback(c, '008_rollback.sql');           // vissza a nyitott állapotba
  await c.query('drop function public.rpw_job_get(text,text)');
  let hiba = null;
  try { await D.migrate(c, '008_rls_lockdown_live.sql'); } catch(e){ hiba = e.message; }
  // A megszakadt `begin;`-t le kell zarni, kulonben a kapcsolat abortalt
  // tranzakcioban marad — ez a teszt sajat takaritasa, nem a migracioe.
  try { await c.query('rollback'); } catch(e){}
  ok(!!hiba && /ELŐFELTÉTEL HIÁNYZIK/.test(hiba), 'a hiányra hivatkozva megszakad');
  eq(await anonKent(c,'select * from public.rpw_jobs'), 'ENGEDVE',
     '  és FÉLBEHAGYOTT állapot nem marad (a tranzakció visszagördült)');
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
await D.stop();
process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); await D.stop(); process.exit(1); });
