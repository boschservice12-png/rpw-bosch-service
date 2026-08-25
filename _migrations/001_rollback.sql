-- ════════════════════════════════════════════════════════════════
--  001 ROLLBACK — az alapséma eltávolítása
--  ⚠ ADATVESZTÉS. Csak tiszta/teszt adatbázison futtatható.
--  Éles rendszeren SOHA — ott a séma már létezett a 001 előtt.
-- ════════════════════════════════════════════════════════════════
begin;
drop function if exists public.jsonb_deep_merge(jsonb,jsonb);
drop table if exists public.rpw_pin_log      cascade;
drop table if exists public.rpw_posts        cascade;
drop table if exists public.rpw_job_counters cascade;
drop table if exists public.rpw_audit        cascade;
drop table if exists public.rpw_jobs         cascade;
drop table if exists public.rpw_pin_attempt  cascade;
drop table if exists public.rpw_sessions     cascade;
drop table if exists public.rpw_employees    cascade;
drop table if exists public.rpw_roles        cascade;
drop table if exists public.shops            cascade;
drop table if exists public.rpw_schema_version cascade;
commit;

-- ELLENŐRZÉS: elvárt 0 sor
select table_name from information_schema.tables
where table_schema='public' and table_name like 'rpw%';
