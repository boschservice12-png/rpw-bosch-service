-- ════════════════════════════════════════════════════════════════
--  013 — TÖRLÉS (Ferenc döntése, 2026-08-30)
--  ----------------------------------------------------------------
--  Négy dolog megy, mind visszafordíthatatlan. Mindegyiket megmértem
--  a törlés ELŐTT, és a mérést itt hagyom, hogy később is látszódjon,
--  mi volt bennük.
--
--  1) A `rpw_archiv` négy régi munkamásolata — 87 sor.
--     Tegnap kerültek ki a kiszolgált sémából (011), ma eldobjuk.
--     ⚠ EZZEL A MUNKÁK KORÁBBI ÁLLAPOTAI VÉGLEG ELVESZNEK.
--     A MAI adat NEM érintett: a `rpw_backup_20260829` séma MARAD.
--
--  2) A régi `foto` tároló 11 fájlja — ⚠ SQL-BŐL NEM TÖRÖLHETŐ.
--     MÉRÉS: mind a `tools/<shop_id>/` útvonalon, mind 2026-02-25-én,
--     hét perc alatt, mind pontosan azonos méretű (1817 kB) — vagyis
--     SZERSZÁM-fotók egy próba-sorozatból, NEM kárfelvételek. Egyetlen
--     munka sem hivatkozza őket (mérve), és a kód sem ismeri a `foto`
--     tárolót (a használt tároló: `rpw-photos`).
--
--     A Supabase MEGVÉDI a tároló-tábláit: „Direct deletion from storage
--     tables is not allowed. Use the Storage API instead." Ez helyes
--     védelem — árva fájlok maradnának utána. Ezért a képek törlése a
--     felületen történik; ITT csak a LISTÁJUKAT őrizzük meg, hogy
--     utólag is látszódjon, mi volt ott.
--
--  3) A `tools`, `tool_categories`, `settings` ERP-maradék táblák
--     az archívba kerülnek — NEM töröljük őket. Egyetlen függvény sem
--     hivatkozza őket (mérve), és a kliens sem hívja.
--
--  ROLLBACK: 013_rollback.sql — az archívba MOZGATÁST visszacsinálja.
--  A TÖRÖLT sorokat és képeket NEM tudja visszahozni.
-- ════════════════════════════════════════════════════════════════
begin;

-- ── 1) Amit törlünk, arról marad NYOM ────────────────────────────
create table if not exists rpw_archiv.torolt_2026_08_30 (
  mikor      timestamptz not null default now(),
  mi         text not null,
  azonosito  text,
  meret      bigint,
  keszult    timestamptz,
  megjegyzes text
);
revoke all on rpw_archiv.torolt_2026_08_30 from public, anon, authenticated;

-- a törlendő KÉPEK listája (a kép maga megy, a nyoma marad)
insert into rpw_archiv.torolt_2026_08_30 (mi, azonosito, meret, keszult, megjegyzes)
select 'storage:foto', o.name, (o.metadata->>'size')::bigint, o.created_at,
       'szerszam-foto a tools funkciobol; egyetlen munka sem hivatkozta'
from storage.objects o where o.bucket_id = 'foto';

-- a törlendő TÁBLÁK sorszáma
insert into rpw_archiv.torolt_2026_08_30 (mi, azonosito, meret, megjegyzes)
select 'tabla:rpw_archiv', c.relname, c.reltuples::bigint,
       'regi munkamasolat, a 011-ben kivonva a public semabol'
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'rpw_archiv' and c.relkind = 'r'
  and c.relname like 'rpw_jobs_backup%';

-- ── 2) A régi tároló fájljai — NEM ITT (lásd a fejlécet) ─────────
-- A törlés a Supabase felületén: Storage → foto → mind kijelöl → Delete.
-- Utána a tároló maga is eldobható.

-- ── 3) A négy régi munkamásolat ──────────────────────────────────
drop table if exists rpw_archiv.rpw_jobs_backup_20260822;
drop table if exists rpw_archiv.rpw_jobs_backup_pre_shopid;
drop table if exists rpw_archiv.rpw_jobs_backup_pre_p03;
drop table if exists rpw_archiv.rpw_jobs_backup_pre_l1h;

-- ── 4) Az ERP-maradék az archívba (NEM törlés) ───────────────────
alter table if exists public.settings        set schema rpw_archiv;
alter table if exists public.tools           set schema rpw_archiv;
alter table if exists public.tool_categories set schema rpw_archiv;

revoke all on all tables in schema rpw_archiv from public;
revoke all on all tables in schema rpw_archiv from anon;
revoke all on all tables in schema rpw_archiv from authenticated;

commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — futtasd a migráció UTÁN
-- ════════════════════════════════════════════════════════════════

-- 1) Eltűnt-e minden, aminek el kellett? Elvárt: mind 0.
select (select count(*) from storage.objects where bucket_id='foto')         as regi_foto_meg_ott_van,
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='rpw_archiv' and c.relname like 'rpw_jobs_backup%')  as maradt_regi_masolat,
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname in ('settings','tools','tool_categories')) as maradt_erp_a_publicban;

-- 2) MEGVAN-E, aminek maradnia KELL? Ez a kontroll — enélkül a fenti
--    nullák nem érnek semmit.
select (select count(*) from public.rpw_jobs)                                as elo_munkak,
       (select count(*) from rpw_backup_20260829.rpw_jobs)                   as mai_pillanatkep,
       (select count(*) from storage.objects where bucket_id='rpw-photos')   as elo_fotok,
       (select count(*) from rpw_archiv.torolt_2026_08_30)                   as torlesi_nyom;

-- 3) Az archív továbbra is zárva?  Elvárt: false, false.
select has_schema_privilege('anon','rpw_archiv','USAGE')                     as anon_lathatja,
       has_table_privilege('anon','rpw_archiv.torolt_2026_08_30','SELECT')   as anon_olvashatja;
