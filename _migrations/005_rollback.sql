-- ════════════════════════════════════════════════════════════════
--  005 ROLLBACK — az RLS-lezárás visszavonása
--  ⚠ ELŐBB állítsd vissza a klienst: PRODUCTION:false, AUTH_REQUIRED:false
-- ════════════════════════════════════════════════════════════════
begin;
alter table public.rpw_jobs no force row level security;
drop policy if exists "rpw_jobs anon rw" on public.rpw_jobs;
create policy "rpw_jobs anon rw" on public.rpw_jobs
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.rpw_jobs to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['rpw_audit','rpw_employees','rpw_roles','rpw_posts',
                           'rpw_pin_log','rpw_job_counters','rpw_sessions',
                           'rpw_pin_attempt','rpw_phase_requirements']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I no force row level security', t);
    end if;
  end loop;
end $$;

update public.rpw_schema_version set version='004', migrated_at=now() where id=1;
commit;

-- ELLENŐRZÉS: elvárt 1 sor, qual = true
select polname, pg_get_expr(polqual,polrelid) as qual
from pg_policy where polrelid='public.rpw_jobs'::regclass;
