-- 004 ROLLBACK — személyzet, posztok, kivezetett utak eltávolítása
begin;
drop function if exists public.rpw_team(text);
drop function if exists public.rpw_login(uuid,text);
drop function if exists public.rpw_patch(text,jsonb);
drop function if exists public.rpw_next_job_number(text);
drop function if exists public.rpw_cleanup_hard_delete(text,text,text);
drop function if exists public.rpw_cleanup_list(text);
drop function if exists public.rpw_post_upsert(text,text,text,text,int,boolean);
drop function if exists public.rpw_post_assign(text,text,uuid);
drop function if exists public.rpw_posts_get(text);
drop function if exists public.rpw2_role_save(text,text,text,jsonb,int,boolean);
drop function if exists public.rpw2_pin_set(text,uuid,text);
drop function if exists public.rpw2_employee_save(text,uuid,text,text,text,boolean);
drop function if exists public.rpw2_team(text,boolean);
update public.rpw_schema_version set version='003', migrated_at=now() where id=1;
commit;
-- ELLENŐRZÉS: elvárt 0 sor
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('rpw2_team','rpw_posts_get','rpw_cleanup_list');
