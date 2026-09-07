-- ════════════════════════════════════════════════════════════════
--  011 — TAKARÍTÁS: a régi munkamásolatok kikerülnek a public sémából
--  ----------------------------------------------------------------
--  A `public` sémát a PostgREST kiszolgálja. Négy régi mentés-tábla ült
--  benne, KIKAPCSOLT RLS-sel:
--
--    rpw_jobs_backup_20260822     49 sor
--    rpw_jobs_backup_pre_shopid   13 sor
--    rpw_jobs_backup_pre_p03      13 sor
--    rpw_jobs_backup_pre_l1h      12 sor
--
--  Ma NEM elérhetők, mert nincs rájuk grant — ezt megmértem. De egyetlen
--  elgépelt `grant` elég lenne hozzá, és akkor 87 munkasor válna szabadon
--  olvashatóvá, RLS nélkül, ügyféladatostul. Egy mentés ne legyen az a
--  hely, ahol a rendszer kinyílik.
--
--  Egyetlen függvény sem hivatkozza őket (megmérve a törzsek átvizsgálásával).
--
--  NEM TÖRLÜNK: a táblák átkerülnek a zárt `rpw_archiv` sémába. Ha bármi
--  hiányozni fog belőlük, egy `alter table ... set schema public` visszahozza.
--  A törlés külön döntés, külön napon.
--
--  ROLLBACK: 011_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

create schema if not exists rpw_archiv;
revoke all on schema rpw_archiv from public;
revoke all on schema rpw_archiv from anon;
revoke all on schema rpw_archiv from authenticated;

comment on schema rpw_archiv is
  'Kivont, mar nem hasznalt tablak. Nem kiszolgalt sema, anon/authenticated jog nelkul. Torles elott ide kerulnek.';

alter table if exists public.rpw_jobs_backup_20260822   set schema rpw_archiv;
alter table if exists public.rpw_jobs_backup_pre_shopid set schema rpw_archiv;
alter table if exists public.rpw_jobs_backup_pre_p03    set schema rpw_archiv;
alter table if exists public.rpw_jobs_backup_pre_l1h    set schema rpw_archiv;

revoke all on all tables in schema rpw_archiv from public;
revoke all on all tables in schema rpw_archiv from anon;
revoke all on all tables in schema rpw_archiv from authenticated;

commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — futtasd a migráció UTÁN
--  (ezek futottak élesben 2026-08-29-én, az eredmény a commitban)
-- ════════════════════════════════════════════════════════════════

-- 1) Elkerültek-e a public sémából, és zárva vannak-e?
--    Elvárt: mind a négy `rpw_archiv`-ban, anon_olvashatja = false.
select n.nspname as sema, c.relname as tabla,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_olvashatja
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname like 'rpw_jobs_backup%' and c.relkind = 'r'
order by n.nspname, c.relname;

-- 2) Megvan-e minden sor, és az ÉLŐ tábla érintetlen-e?
--    Elvárt: 49 / 13 / 13 / 12, és az élő rpw_jobs változatlan.
select 'rpw_jobs_backup_20260822' t, count(*) sor from rpw_archiv.rpw_jobs_backup_20260822
union all select 'rpw_jobs_backup_pre_shopid', count(*) from rpw_archiv.rpw_jobs_backup_pre_shopid
union all select 'rpw_jobs_backup_pre_p03',    count(*) from rpw_archiv.rpw_jobs_backup_pre_p03
union all select 'rpw_jobs_backup_pre_l1h',    count(*) from rpw_archiv.rpw_jobs_backup_pre_l1h
union all select 'ELO rpw_jobs',               count(*) from public.rpw_jobs
order by 1;

-- 3) Maradt-e RLS nélküli munkamásolat a kiszolgált sémában?
--    Elvárt: egyetlen sor sem.
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname like '%backup%';
