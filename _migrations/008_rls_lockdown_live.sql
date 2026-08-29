-- ════════════════════════════════════════════════════════════════
--  008 — RLS LEZÁRÁS AZ ÉLŐ ADATBÁZIS ALAKJÁRA  (RPW-002)
--  ----------------------------------------------------------------
--  MIÉRT KÜLÖN A 005 MELLETT?
--  A 005 a MIGRÁCIÓS vonal alakjára készült (rpw_sessions tábla,
--  rpw_transition / rpw_requirements / rpw_can_complete / cleanup /
--  rpw_server_capabilities függvények). Az ÉLŐ adatbázis MÁS vonalon
--  épült: a munkameneteket az `app_session` tárolja, és a fenti hat
--  függvény NEM létezik rajta (2026-08-29-én ellenőrizve, olvasással).
--  Ezért a 005 élesben az előfeltétel-ellenőrzésénél megszakadna —
--  helyesen. Ez a migráció azt zárja le, ami élesben TÉNYLEGESEN nyitva van.
--
--  MIT ZÁR LE?
--  A teljes kitettség EGYETLEN objektumon áll:
--      policy "rpw_jobs anon rw"  FOR ALL TO anon,authenticated
--                                 USING(true) WITH CHECK(true)
--      grants: anon → SELECT, INSERT, UPDATE, DELETE ON rpw_jobs
--  Minden más rpw_* táblán MA SINCS anon jogosultság. A többi tábla
--  (shops, employees, tools, settings, admins…) MÁS alkalmazásoké —
--  ez a migráció SZÁNDÉKOSAN NEM NYÚL HOZZÁJUK.
--
--  ⚠ SORREND — ENÉLKÜL A MŰHELY MEGÁLL ⚠
--  A mai kliens AUTH_REQUIRED=false mellett KÖZVETLEN tábla-olvasással
--  dolgozik (sb.from('rpw_jobs')). Ha ez a migráció ELŐBB fut le, mint
--  ahogy a kliens átáll a token-alapú útra, a panel azonnal üres lesz.
--  KÖTELEZŐ SORREND:
--     1. rpw-config.js: AUTH_REQUIRED=true  ÉS  PATCH_RPC='rpw_patch_v3'
--     2. a belépés és a lista működésének igazolása élesben
--     3. CSAK EZUTÁN ez a migráció
--  A visszaállás egy lépés: 008_rollback.sql (másodpercek).
--
--  ELŐFELTÉTEL: a lentebb felsorolt függvények megléte.   ROLLBACK: 008_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

-- ── Előfeltétel: csak arra adunk jogot, ami LÉTEZIK ──────────────
-- Ha bármelyik hiányzik, a migráció MEGSZAKAD, és semmi nem változik.
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
    'public.rpw2_login(uuid,uuid,text)',
    'public.rpw2_session(text)',
    'public.rpw_logout(text)'
  ] loop
    if to_regprocedure(f) is null then
      raise exception 'ELŐFELTÉTEL HIÁNYZIK: % — a lezárás megszakadt, semmi nem változott', f;
    end if;
  end loop;
end $$;

-- ── 1) A mindent megengedő anon szabály megszüntetése ────────────
drop policy if exists "rpw_jobs anon rw" on public.rpw_jobs;

-- ── 2) RLS bekapcsolva ÉS kikényszerítve minden rpw_* táblán ─────
-- A `force` azért kell, mert enélkül a tábla tulajdonosa megkerülné.
-- Policy szándékosan NINCS: az adat CSAK SECURITY DEFINER függvényen át.
do $$
declare t text;
begin
  foreach t in array array['rpw_jobs','rpw_audit','rpw_employees','rpw_roles',
                           'rpw_posts','rpw_pin_log','rpw_job_counters',
                           'rpw_pin_attempt']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I force  row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- ── 3) search_path rögzítése minden SECURITY DEFINER rpw-függvényen ──
-- Enélkül egy sémabeszúrás átirányíthatná a függvény tábla-hivatkozásait.
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

-- ── 4) Minden EXECUTE visszavonása, majd NÉVRE SZÓLÓAN vissza ────
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

-- Belépés ELŐTT hívható (PIN nélküli adat)
grant execute on function public.rpw2_roster(uuid)          to anon, authenticated;
grant execute on function public.rpw2_login(uuid,uuid,text) to anon, authenticated;

-- Belépés UTÁN — mind tokenre épül, a shop_id a munkamenetből jön
grant execute on function public.rpw2_session(text)                             to anon, authenticated;
grant execute on function public.rpw_logout(text)                               to anon, authenticated;
grant execute on function public.rpw_jobs_list(text,boolean)                    to anon, authenticated;
grant execute on function public.rpw_job_get(text,text)                         to anon, authenticated;
grant execute on function public.rpw_patch_v3(text,text,jsonb,integer,text)     to anon, authenticated;
grant execute on function public.rpw_job_trash(text,text)                       to anon, authenticated;
grant execute on function public.rpw_job_restore(text,text)                     to anon, authenticated;
grant execute on function public.rpw_job_purge(text,text)                       to anon, authenticated;
grant execute on function public.rpw_job_number(text,text)                      to anon, authenticated;

-- Csak ha léteznek (az élő készlet ezekben eltérhet)
do $$
declare f text;
begin
  foreach f in array array[
    'public.rpw2_can(text,text)', 'public.rpw2_team(text,boolean)',
    'public.rpw2_pin_status(uuid)', 'public.rpw_posts_get(text)',
    'public.rpw_post_assign(text,text,uuid)',
    'public.rpw_post_upsert(text,text,text,text,int,boolean)',
    'public.rpw2_employee_save(text,uuid,text,text,text,boolean)',
    'public.rpw2_pin_set(text,uuid,text)',
    'public.rpw2_role_save(text,text,text,jsonb,int,boolean)',
    'public.rpw2_pin_unlock(text,uuid)',
    -- a szuk ugyfel-ut (009): token nelkul hivhato, de csak a sajat
    -- dossziera es csak a harom feltoltesi kulcsra
    'public.rpw_client_job_get(text)',
    'public.rpw_client_upload(text,jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('grant execute on function %s to anon, authenticated', f);
    end if;
  end loop;
end $$;

-- ── 5) AMI SZÁNDÉKOSAN NEM KAP JOGOT ─────────────────────────────
-- Ezek nem tenant-biztosak (nincs token, vagy a hívó adja a shop_id-t),
-- ezért a 4) pont visszavonása után NEM kapják vissza az EXECUTE-ot:
--   rpw_patch, rpw_patch_v2, rpw_login, rpw_login_named, rpw_team,
--   rpw_session, rpw_set_pin, rpw_pin_set_for, rpw_next_job_number,
--   rpw_roles_seed, rpw_is_manager, rpw_consistency_check, rpw__ctx
-- A rpw__ctx belső segédfüggvény: kívülről nem hívható.

commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — futtasd a migráció UTÁN, és hasonlítsd az elvárthoz.
--  (A `commit;` után áll, ezért a migrációs futtató nem hajtja végre.)
-- ════════════════════════════════════════════════════════════════

-- 1) Nincs policy az rpw_jobs-on — elvárt: 0
select count(*) as policy_db from pg_policy where polrelid = 'public.rpw_jobs'::regclass;

-- 2) Nincs tábla-szintű jog egyetlen rpw_* táblán sem — elvárt: 0 sor
select table_name, grantee, privilege_type from information_schema.role_table_grants
where grantee in ('anon','authenticated') and table_schema='public' and table_name like 'rpw%';

-- 3) Az RLS ki van kényszerítve — elvárt: mindenhol true
select relname, relrowsecurity, relforcerowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relname like 'rpw%' and relkind='r' order by 1;

-- 4) A tenant-biztos utak hívhatók — elvárt: mind true
select has_function_privilege('anon','public.rpw_jobs_list(text,boolean)','EXECUTE') as lista,
       has_function_privilege('anon','public.rpw_job_get(text,text)','EXECUTE')      as megnyitas,
       has_function_privilege('anon','public.rpw_patch_v3(text,text,jsonb,integer,text)','EXECUTE') as mentes,
       has_function_privilege('anon','public.rpw2_login(uuid,uuid,text)','EXECUTE')  as belepes;

-- 5) A NEM tenant-biztos utak és a belső segéd NEM hívhatók — elvárt: mind false
select has_function_privilege('anon','public.rpw_patch_v2(text,jsonb,integer,text,text)','EXECUTE') as patch_v2,
       has_function_privilege('anon','public.rpw_login(uuid,text)','EXECUTE') as regi_belepes,
       has_function_privilege('anon','public.rpw__ctx(text)','EXECUTE')       as belso_ctx;
