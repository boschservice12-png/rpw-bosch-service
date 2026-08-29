// ════════════════════════════════════════════════════════════════
//  A MUNKAMENET KÉT VONALA (010)
//  ----------------------------------------------------------------
//  Ferenc bejelentkezett, és a panel ÜRES lett. Az ok:
//
//    RÉGI (ERP) : app_session.employee_id     -> employees
//    ÚJ  (RPW2) : app_session.rpw_employee_id -> rpw_employees
//
//  A belépő lap a rpw2_login-t hívja, ami az ÚJ vonalra ír. A
//  rpw_session — amin a rpw__ctx, és rajta keresztül a teljes
//  adathozzáférés áll — CSAK a régi vonalat ismerte. A munkamenet
//  érvényes volt, de a szerver nem találta meg.
//
//  Ez a hiba KIZÁRÓLAG bekapcsolt beléptetésnél jelentkezik — ezért
//  maradt rejtve minden korábbi ellenőrzés elől.
//
//  Valódi PostgreSQL, az élő tábla-alakra épített fixture-rel.
// ════════════════════════════════════════════════════════════════
const D = require('./_db.js');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

const SHOP  = '11111111-1111-1111-1111-111111111111';
const ERP   = '22222222-2222-2222-2222-222222222222';   // régi ERP-dolgozó
const RPW2  = '33333333-3333-3333-3333-333333333333';   // RPW2-dolgozó
const T_ERP = 'a'.repeat(64), T_RPW2 = 'b'.repeat(64);
const T_LEJART = 'c'.repeat(64), T_INAKTIV = 'd'.repeat(64);

const hivas = async (c, token) => (await c.query('select public.rpw_session($1) as r', [token])).rows[0].r;

(async () => {
const c = await D.start();
await c.query('create extension if not exists pgcrypto');

console.log('\n══ A MUNKAMENET KÉT VONALA (valódi adatbázis) ══');

console.log('\n0. Az ÉLŐ tábla-alak felépítése');
{
  await c.query(`
    create table public.employees(
      id uuid primary key, name text, role text, department text, is_active boolean default true);
    create table public.rpw_employees(
      id uuid primary key, shop_id uuid, name text, role_code text,
      pin_hash text, active boolean default true);
    create table public.rpw_roles(
      shop_id uuid, code text, label text, active boolean default true);
    create table public.app_session(
      token_hash text primary key, kind text not null default 'EMPLOYEE',
      shop_id uuid not null, employee_id uuid, admin_id uuid, rpw_employee_id uuid,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      expires_at timestamptz not null default now()+interval '12 hours',
      revoked_at timestamptz);`);
  await c.query("insert into public.employees(id,name,role,department) values ($1,'Regi Ember','Recepció','iroda')",[ERP]);
  await c.query("insert into public.rpw_employees(id,shop_id,name,role_code) values ($1,$2,'Uj Ember','MANAGER')",[RPW2,SHOP]);
  await c.query("insert into public.rpw_roles(shop_id,code,label) values ($1,'MANAGER','Műszakvezető')",[SHOP]);
  const h = t => `encode(digest('${t}','sha256'),'hex')`;
  // RÉGI vonal: employee_id kitöltve
  await c.query(`insert into public.app_session(token_hash,shop_id,employee_id) values (${h(T_ERP)},$1,$2)`,[SHOP,ERP]);
  // ÚJ vonal: rpw_employee_id kitöltve, employee_id NULL — pontosan úgy, ahogy a rpw2_login ír
  await c.query(`insert into public.app_session(token_hash,shop_id,rpw_employee_id) values (${h(T_RPW2)},$1,$2)`,[SHOP,RPW2]);
  // lejárt és inaktív eset, szintén az ÚJ vonalon
  await c.query(`insert into public.app_session(token_hash,shop_id,rpw_employee_id,expires_at)
                 values (${h(T_LEJART)},$1,$2, now()-interval '1 hour')`,[SHOP,RPW2]);
  ok(true, 'a két vonal felépült');
}

console.log('\n1. A HIBA reprodukálása (a javítás ELŐTT)');
{
  await D.rollback(c, '010_rollback.sql');            // a régi, csak-ERP változat
  const regi = await hivas(c, T_ERP);
  const uj   = await hivas(c, T_RPW2);
  eq(regi.ok, true,  'a RÉGI vonalú munkamenetet megtalálja');
  eq(uj.ok,   false, 'az ÚJ vonalút NEM — ez ürítette ki Ferenc paneljét');
  eq(uj.error,'invalid', '  és "invalid"-ot mond rá, pedig érvényes');
}

console.log('\n2. A JAVÍTÁS UTÁN mindkét vonal működik');
{
  await D.migrate(c, '010_session_lineage_fix.sql');
  const regi = await hivas(c, T_ERP);
  const uj   = await hivas(c, T_RPW2);
  eq(regi.ok, true, 'a RÉGI vonal VÁLTOZATLANUL működik (nem törtünk el semmit)');
  eq(regi.employee.name, 'Regi Ember', '  ugyanazt a dolgozót adja');
  eq(regi.employee.role, 'Recepció',   '  ugyanazzal a szereppel');
  eq(uj.ok, true, 'az ÚJ vonalú munkamenetet MOSTANTÓL megtalálja');
  eq(uj.employee.name, 'Uj Ember', '  a nevet a rpw_employees-ből veszi');
  eq(uj.employee.shop_id, SHOP, '  a szervizt a munkamenetből — ezen áll a lista szűrése');
}

console.log('\n3. A SZEREP a magyar munkakör — a kliens ezt várja');
{
  // A RPWRoles.mapEmployeeRole a magyar LABEL-t képezi le ('Műszakvezető' -> manager).
  // Ha a role_code menne vissza ('MANAGER'), a kliens NEM ismerné fel,
  // és a dolgozó "nincs RPW-hozzáférése" üzenetet kapna — belépés után.
  const uj = await hivas(c, T_RPW2);
  eq(uj.employee.role, 'Műszakvezető', 'a rpw_roles LABEL-je megy vissza, nem a kód');
  const RR = require('../../rpw-roles.js');
  eq(RR.mapEmployeeRole(uj.employee.role), 'manager',
     '  és a kliens ebből valódi RPW-szerepet képez');
}

console.log('\n4. Amit NEM szabad elrontani');
{
  eq((await hivas(c, 'rovid')).error, 'no_token', 'rövid token elutasítva');
  eq((await hivas(c, 'z'.repeat(64))).error, 'invalid', 'ismeretlen token elutasítva');
  eq((await hivas(c, T_LEJART)).error, 'expired', 'lejárt munkamenet elutasítva');

  // visszavont munkamenet
  await c.query("update public.app_session set revoked_at=now() where rpw_employee_id=$1 and expires_at>now()",[RPW2]);
  eq((await hivas(c, T_RPW2)).error, 'invalid', 'VISSZAVONT munkamenet elutasítva');
  await c.query("update public.app_session set revoked_at=null where rpw_employee_id=$1",[RPW2]);

  // inaktivált dolgozó
  await c.query('update public.rpw_employees set active=false where id=$1',[RPW2]);
  eq((await hivas(c, T_RPW2)).error, 'inactive', 'kilépett dolgozó munkamenete elutasítva');

  // ISMERETLEN (NULL) allapot — a ketes esetnek is ZARVA kell lennie.
  // Ma az `active` NOT NULL DEFAULT true, tehat ez nem fordulhat elo; a
  // vedelem viszont nem tamaszkodhat egy masik tabla kenyszerere. A
  // rpw2_session ugyanigy zar (coalesce(active,false)).
  await c.query('update public.rpw_employees set active=null where id=$1',[RPW2]);
  eq((await hivas(c, T_RPW2)).error, 'inactive',
     'ISMERETLEN (NULL) allapotu dolgozo is elutasitva — nem fail-open');
  await c.query('update public.rpw_employees set active=true where id=$1',[RPW2]);
}

console.log('\n5. Szerep nélküli dolgozó sem akad el');
{
  // Ha nincs rpw_roles sor a kodhoz, a kod megy vissza — nem null, nem hiba.
  await c.query("update public.rpw_employees set role_code='NINCS_ILYEN' where id=$1",[RPW2]);
  const r = await hivas(c, T_RPW2);
  eq(r.ok, true, 'a munkamenet érvényes marad');
  eq(r.employee.role, 'NINCS_ILYEN', '  és a kód megy vissza szerepként');
  await c.query("update public.rpw_employees set role_code='MANAGER' where id=$1",[RPW2]);
}

console.log('\n6. A rollback visszaáll a korábbi viselkedésre');
{
  await D.rollback(c, '010_rollback.sql');
  eq((await hivas(c, T_ERP)).ok,  true,  'a régi vonal továbbra is megy');
  eq((await hivas(c, T_RPW2)).ok, false, 'az új vonal ismét nem található');
  await D.migrate(c, '010_session_lineage_fix.sql');   // vissza a javított állapotba
  eq((await hivas(c, T_RPW2)).ok, true,  'és újra alkalmazva ismét működik');
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
await D.stop();
process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); await D.stop(); process.exit(1); });
