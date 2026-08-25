-- 002 ROLLBACK — a munkamenet- és adat-RPC-k eltávolítása
-- ⚠ ELŐBB: 004_rollback.sql és 003_rollback.sql
begin;
drop function if exists public.rpw_job_number(text,text);
drop function if exists public.rpw_job_purge(text,text);
drop function if exists public.rpw_job_restore(text,text);
drop function if exists public.rpw_job_trash(text,text);
drop function if exists public.rpw_patch_v3(text,text,jsonb,integer,text);
drop function if exists public.rpw_job_get(text,text);
drop function if exists public.rpw_jobs_list(text,boolean);
drop function if exists public.rpw__deny(text,uuid,text,int,text,text,jsonb);
drop function if exists public.rpw__msg(text);
drop function if exists public.rpw_logout(text);
drop function if exists public.rpw2_login(uuid,uuid,text);
drop function if exists public.rpw2_roster(uuid);
drop function if exists public.rpw2_can(text,text);
drop function if exists public.rpw2_session(text);
drop function if exists public.rpw__ctx(text);
update public.rpw_schema_version set version='001', migrated_at=now() where id=1;
commit;
-- ELLENŐRZÉS: elvárt 0 sor
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('rpw__ctx','rpw_patch_v3','rpw_jobs_list');
