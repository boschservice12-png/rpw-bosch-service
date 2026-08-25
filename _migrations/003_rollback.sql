-- 003 ROLLBACK — üzleti szabályok és fázisátmenetek eltávolítása
-- ⚠ ELŐBB: 004_rollback.sql
begin;
drop function if exists public.rpw_server_capabilities();
drop function if exists public.rpw_transition(text,text,int,text,int,text);
drop function if exists public.rpw_can_complete(text,text,int);
drop function if exists public.rpw_requirements(text,int);
drop function if exists public.rpw__missing(uuid,jsonb,int,text,boolean);
drop function if exists public.rpw__check_one(jsonb,text[],text,text);
drop table if exists public.rpw_phase_requirements cascade;
update public.rpw_schema_version set version='002', migrated_at=now() where id=1;
commit;
-- ELLENŐRZÉS: elvárt 0 sor
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('rpw_transition','rpw__missing');
