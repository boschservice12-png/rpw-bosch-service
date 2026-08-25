-- ════════════════════════════════════════════════════════════════
--  005 — RLS LEZÁRÁS  (a sorrend UTOLSÓ lépése)
--  ----------------------------------------------------------------
--  Ez a migráció csak olyan függvényekre ad EXECUTE jogot, amelyeket
--  a 002 és a 003 MÁR létrehozott. A brief 8. pontja pontosan ezt
--  kifogásolta a korábbi verzióban.
--
--  Utána közvetlen anon CRUD NINCS: minden adat a token-alapú
--  SECURITY DEFINER RPC-ken át érhető el.
--
--  ELŐFELTÉTEL: 001, 002, 003, 004    ROLLBACK: 005_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

-- ── Előfeltétel-ellenőrzés: hiány esetén MEGSZAKAD ──────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.rpw__ctx(text)',
    'public.rpw_jobs_list(text,boolean)',
    'public.rpw_job_get(text,text)',
    'public.rpw_patch_v3(text,text,jsonb,integer,text)',
    'public.rpw_job_trash(text,text)',
    'public.rpw_job_restore(text,text)',
    'public.rpw_job_purge(text,text)',
    'public.rpw_job_number(text,text)',
    -- a rpw_transition szignatúrája a 006-ban bővül (6 → 8 paraméter);
    -- ezért NEVRE ellenőrizzük, lásd a ciklus utáni külön vizsgálatot

    'public.rpw_requirements(text,int)',
    'public.rpw_can_complete(text,text,int)',
    'public.rpw_server_capabilities()',
    'public.rpw2_session(text)',
    'public.rpw2_login(uuid,uuid,text)',
    'public.rpw2_roster(uuid)',
    'public.rpw2_team(text,boolean)',
    'public.rpw2_employee_save(text,uuid,text,text,text,boolean)',
    'public.rpw2_pin_set(text,uuid,text)',
    'public.rpw2_role_save(text,text,text,jsonb,int,boolean)',
    'public.rpw_posts_get(text)',
    'public.rpw_post_assign(text,text,uuid)',
    'public.rpw_post_upsert(text,text,text,text,int,boolean)',
    'public.rpw_cleanup_list(text)',
    'public.rpw_cleanup_hard_delete(text,text,text)'
  ] loop
    if to_regprocedure(f) is null then
      raise exception 'ELŐFELTÉTEL HIÁNYZIK: % — futtasd előbb a 002, 003 és 004 migrációt', f;
    end if;
  end loop;
  -- a rpw_transition NÉVRE (a szignatúrája a 006-ban bővül)
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='rpw_transition') then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: rpw_transition — futtasd előbb a 003 migrációt';
  end if;
end $$;

-- ── 1) Az általános anon szabály megszüntetése ───────────────────
drop policy if exists "rpw_jobs anon rw" on public.rpw_jobs;

do $$
declare t text;
begin
  foreach t in array array['rpw_jobs','rpw_audit','rpw_employees','rpw_roles',
                           'rpw_posts','rpw_pin_log','rpw_job_counters',
                           'rpw_sessions','rpw_pin_attempt','rpw_phase_requirements']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I force  row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

revoke all on public.shops from anon, authenticated;

-- ── 2) search_path minden SECURITY DEFINER függvényen ────────────
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prosecdef and p.proname like 'rpw%'
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
  end loop;
end $$;

-- ── 3) Minden EXECUTE visszavonása, majd névre szólóan ───────────
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'rpw%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- Belépés előtt (PIN nélküli adat)
grant execute on function public.rpw2_roster(uuid)              to anon, authenticated;
grant execute on function public.rpw2_login(uuid,uuid,text)     to anon, authenticated;
grant execute on function public.rpw_server_capabilities()      to anon, authenticated;

-- Belépés után (tokenre épül)
grant execute on function public.rpw2_session(text)             to anon, authenticated;
grant execute on function public.rpw2_can(text,text)            to anon, authenticated;
grant execute on function public.rpw_logout(text)               to anon, authenticated;
grant execute on function public.rpw_jobs_list(text,boolean)    to anon, authenticated;
grant execute on function public.rpw_job_get(text,text)         to anon, authenticated;
grant execute on function public.rpw_patch_v3(text,text,jsonb,integer,text) to anon, authenticated;
grant execute on function public.rpw_job_trash(text,text)       to anon, authenticated;
grant execute on function public.rpw_job_restore(text,text)     to anon, authenticated;
grant execute on function public.rpw_job_purge(text,text)       to anon, authenticated;
grant execute on function public.rpw_job_number(text,text)      to anon, authenticated;
-- A rpw_transition szignatúrája a 006-ban bővül. A GRANT a TÉNYLEGESEN
-- létező alakra megy, hogy a 005 a 006 után is újrafuttatható legyen.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='rpw_transition'
  loop
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
grant execute on function public.rpw_requirements(text,int)     to anon, authenticated;
grant execute on function public.rpw_can_complete(text,text,int) to anon, authenticated;

-- Személyzet és posztok
grant execute on function public.rpw2_team(text,boolean)                          to anon, authenticated;
grant execute on function public.rpw2_employee_save(text,uuid,text,text,text,boolean)  to anon, authenticated;
grant execute on function public.rpw2_pin_set(text,uuid,text)                     to anon, authenticated;
grant execute on function public.rpw2_role_save(text,text,text,jsonb,int,boolean) to anon, authenticated;
grant execute on function public.rpw_posts_get(text)                              to anon, authenticated;
grant execute on function public.rpw_post_assign(text,text,uuid)                  to anon, authenticated;
grant execute on function public.rpw_post_upsert(text,text,text,text,int,boolean) to anon, authenticated;
grant execute on function public.rpw_cleanup_list(text)                           to anon, authenticated;
grant execute on function public.rpw_cleanup_hard_delete(text,text,text)          to anon, authenticated;

-- ⚠ A KIVEZETETT utak (rpw_patch, rpw_login, rpw_team, rpw_next_job_number)
-- SZÁNDÉKOSAN nem kapnak jogot: nincs bennük bérlővédelem.

-- A `rpw__` előtagú belső segédek SZÁNDÉKOSAN nem kapnak jogot.

update public.rpw_schema_version set version='005', migrated_at=now() where id=1;
commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS
-- ════════════════════════════════════════════════════════════════
-- 1) Nincs policy az rpw_jobs-on — elvárt 0 sor
select polname from pg_policy where polrelid='public.rpw_jobs'::regclass;

-- 2) Nincs tábla-szintű jog — elvárt 0 sor
select table_name, privilege_type from information_schema.role_table_grants
where grantee in ('anon','authenticated') and table_schema='public' and table_name like 'rpw%';

-- 3) A belső segédek nem hívhatók — elvárt: false, false
select has_function_privilege('anon','public.rpw__ctx(text)','EXECUTE') as ctx,
       has_function_privilege('anon','public.rpw__missing(uuid,jsonb,int,text,boolean)','EXECUTE') as missing;

-- 4) A capability-RPC lezártnak látja — elvárt: true
select (public.rpw_server_capabilities()->>'rls_locked')::boolean as rls_locked;

-- 5) elvárt: '005'
select version from public.rpw_schema_version;
