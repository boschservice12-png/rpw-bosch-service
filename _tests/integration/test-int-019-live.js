// ════════════════════════════════════════════════════════════════
//  019 — PIN-orákulum + ügyfél-link szigorítás, VALÓDI PostgreSQL-en
//  ----------------------------------------------------------------
//  Az ÉLŐ adatbázis alakját utánozza (app_session, rpw__pin_gyenge,
//  rpw__pin_utkozik — ezek a repó 001–009 láncában nincsenek; a
//  definíciók 2026-11-23-án az élő adatbázisból, csak olvasva).
//  Futtatja: 019 → ellenőrzés → 019_rollback → a régi viselkedés
//  visszajön → 019 újra (idempotens).
// ════════════════════════════════════════════════════════════════
const D = require('./_db.js');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

const J = 'RPW-11111111-2222-3333-4444-555555555555';
let c;

const LIVE_SHAPE = `
create extension if not exists pgcrypto;
create table rpw_employees(id uuid primary key default gen_random_uuid(), shop_id uuid not null,
  name text, role_code text, active boolean default true, pin_hash text, updated_at timestamptz);
create table rpw_pin_attempt(employee_id uuid);
create table rpw_pin_log(shop_id uuid, rpw_employee_id uuid, self_set boolean, at timestamptz);
create table app_session(token text, rpw_employee_id uuid, can jsonb, revoked_at timestamptz);
create table rpw_jobs(id text primary key, tenant_id uuid, data jsonb, version int default 1,
  updated_at timestamptz, deleted_at timestamptz);
create table rpw_audit(id bigserial, job_id text, tenant_id uuid, actor text, action text, patch jsonb,
  prev_version int, new_version int);
-- a teszt rpw2_session-je: ugyanaz a válaszalak, mint élesben
create function rpw2_session(p_token text) returns jsonb language sql as $$
  select coalesce((select jsonb_build_object('ok',true,'employee',jsonb_build_object(
           'id',e.id,'shop_id',e.shop_id,'can',a.can))
         from app_session a join rpw_employees e on e.id=a.rpw_employee_id
         where a.token=p_token and a.revoked_at is null), '{"ok":false}'::jsonb) $$;
CREATE OR REPLACE FUNCTION public.rpw__pin_gyenge(p_pin text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $function$
declare s text; i int; n int; egyforma boolean;
begin
  s := btrim(coalesce(p_pin,''));
  if length(s) < 4 then return 'PIN prea scurt (minim 4 cifre).'; end if;
  if s !~ '^[0-9]+$' then return 'PIN-ul poate conține doar cifre.'; end if;
  egyforma := true;
  for i in 2..length(s) loop if substr(s,i,1) <> substr(s,1,1) then egyforma := false; exit; end if; end loop;
  if egyforma then return 'PIN prea simplu (cifre identice).'; end if;
  return null;
end; $function$;
CREATE OR REPLACE FUNCTION public.rpw__pin_utkozik(p_shop uuid, p_pin text, p_kiveve uuid) RETURNS uuid
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $function$
declare r record;
begin
  for r in select id, pin_hash from rpw_employees
           where shop_id = p_shop and active and pin_hash is not null and (p_kiveve is null or id <> p_kiveve)
  loop if r.pin_hash = crypt(p_pin, r.pin_hash) then return r.id; end if; end loop;
  return null;
end; $function$;
`;

async function q(sql, p){ return (await c.query(sql, p)).rows; }
async function up(patch){ return (await q('select rpw_client_upload($1,$2::jsonb) r', [J, JSON.stringify(patch)]))[0].r; }
async function data(){ return (await q('select data from rpw_jobs where id=$1', [J]))[0].data; }
const e = (key, src) => ({ key, path: J + '/' + key + '.jpg', name: key + '.jpg', src: src || 'whatsapp' });

(async () => {
  c = await D.start();
  await c.query(LIVE_SHAPE);
  // a 019 előtti ÉLŐ állapot = a 019_rollback tartalma
  await D.rollback(c, '019_rollback.sql');
  const shop = '00000000-0000-0000-0000-0000000000a1';
  const [a] = await q("insert into rpw_employees(shop_id,name,pin_hash) values ($1,'Ana',crypt('4826',gen_salt('bf'))) returning id", [shop]);
  const [v] = await q("insert into rpw_employees(shop_id,name,pin_hash) values ($1,'Vasile',crypt('5937',gen_salt('bf'))) returning id", [shop]);
  await q("insert into app_session(token,rpw_employee_id,can) values ('TV',$1,'{}')", [v.id]);
  const pinSet = async pin => (await q('select rpw2_pin_set($1,$2,$3) r', ['TV', v.id, pin]))[0].r;

  console.log('\n0. A 019 ELŐTT (élő állapot): az orákulum létezik');
  eq((await pinSet('4826')).error, 'pin_taken', 'a kolléga PIN-je „foglalt" — ez árulja el');

  await D.migrate(c, '019_pin_orakulum_es_ugyfel_feltoltes.sql');

  console.log('\n1. 019 után: nincs „pin_taken"');
  eq((await pinSet('4826')).ok, true, 'a kolléga PIN-jét is beállíthatja (nem derül ki, kié)');
  eq((await pinSet('7777')).error, 'weak_pin', '  a gyenge PIN továbbra is tilos');
  ok((await q("select pin_hash = crypt('4826', pin_hash) m from rpw_employees where id=$1", [v.id]))[0].m, '  és tényleg ez lett a PIN-je');

  console.log('\n2. Lezárt munka: az ügyfél-link nem ír');
  await q("insert into rpw_jobs(id,tenant_id,data) values ($1,$2,$3)", [J, shop, JSON.stringify({ inchis: true })]);
  eq((await up({ clientGata: { at: 'x', files: 1 } })).error, 'closed', 'closed');
  eq((await q('select version from rpw_jobs where id=$1', [J]))[0].version, 1, '  a verzió sem nőtt');

  console.log('\n3. dosarActe: a személyzet fájlja megmarad');
  await q('update rpw_jobs set data=$2 where id=$1', [J, JSON.stringify({ dosarActe: { talon: [e('acta_talon_1', 'staff'), e('acta_talon_2')], pv: e('acta_pv_1', 'staff') } })]);
  let r = await up({ dosarActe: { talon: [e('acta_talon_1', 'staff'), e('acta_talon_3')] } });
  eq(r.ok, true, 'elfogadva');
  let d = await data();
  eq(d.dosarActe.talon.map(x => x.path), [J + '/acta_talon_1.jpg', J + '/acta_talon_3.jpg'], '  személyzet marad, az ügyfél régi bejegyzését az új váltja, nincs duplikáció');
  eq(d.dosarActe.talon[0].src, 'staff', '  a személyzeti bejegyzés nem lett „whatsapp"');
  eq(d.dosarActe.pv.path, J + '/acta_pv_1.jpg', '  a nem küldött rekesz érintetlen');
  r = await up({ dosarActe: { talon: [] } });
  eq((await data()).dosarActe.talon.map(x => x.src), ['staff'], '  üres rekesz: csak az ügyfél saját bejegyzése törlődik');

  console.log('\n4. Hamis bejegyzések kiesnek');
  r = await up({ dosarActe: { talon: [
    { path: 'RPW-99999999-2222-3333-4444-555555555555/acta_x.jpg' },
    { path: J + '/foto_1.jpg' }, { path: J + '/acta_a/b.jpg' }, 'szoveg',
    Object.assign(e('acta_ok'), { src: 'staff', gonosz: '<script>' })] } });
  d = await data();
  eq(d.dosarActe.talon.length, 2, '  csak a személyzeti + 1 érvényes maradt');
  eq(d.dosarActe.talon[1].src, 'whatsapp', '  az ügyfél nem nevezheti magát személyzetnek');
  ok(!('gonosz' in d.dosarActe.talon[1]), '  ismeretlen mező kiesik');
  eq((await up({ dosarActe: { 'rossz rekesz!': [] } })).error, 'bad_request', '  hibás rekesznév elutasítva');

  console.log('\n5. clientUploads: csak hozzáfűzés');
  await up({ clientUploads: [e('client_1')] });
  await up({ clientUploads: [e('client_2'), e('client_2')] });
  await up({ clientUploads: [] });
  eq((await data()).clientUploads.map(x => x.key), ['client_1', 'client_2'], '  üres/rövid lista nem töröl, duplikátum egyesül');
  await up({ clientUploads: [{ url: 'x' }] });
  eq((await data()).clientUploads.length, 2, '  útvonal nélküli bejegyzés kiesik');

  console.log('\n6. clientGata: csak {at, files}');
  eq((await up({ clientGata: { at: '2026-11-23T10:00:00Z', files: 3, inchis: true } })).ok, true, 'elfogadva');
  eq((await data()).clientGata, { at: '2026-11-23T10:00:00Z', files: 3 }, '  plusz mező kiesik');
  ok(!(await data()).inchis, '  a munka NEM zárult le');
  eq((await up({ clientGata: { at: 'x', files: -1 } })).error, 'bad_request', '  negatív szám elutasítva');
  eq((await up({ phase: 5 })).error, 'forbidden_field', '  más kulcs továbbra is tilos');

  console.log('\n7. Napló');
  const au = await q("select actor, action from rpw_audit where job_id=$1 order by id desc limit 1", [J]);
  eq(au[0], { actor: 'client_whatsapp', action: 'client_upload' }, '  az ügyfél írása naplózva');

  console.log('\n8. Visszaút: 019_rollback → a régi viselkedés; 019 újra');
  await D.rollback(c, '019_rollback.sql');
  eq((await pinSet('4826')).error, 'pin_taken', '  rollback után az eredeti függvény él');
  ok((await q("select to_regprocedure('public.rpw__client_entry(jsonb,text,text)') is null n"))[0].n, '  a segédfüggvény törölve');
  await D.migrate(c, '019_pin_orakulum_es_ugyfel_feltoltes.sql');
  eq((await pinSet('4826')).ok, true, '  019 ismét alkalmazható');

  await D.stop();
  console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(async err => { console.error(err); await D.stop(); process.exit(1); });
