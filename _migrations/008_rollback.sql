-- ════════════════════════════════════════════════════════════════
--  008 ROLLBACK — a lezárás visszavonása
--  ----------------------------------------------------------------
--  A műhely másodpercek alatt visszaáll a lezárás előtti működésre.
--  FIGYELEM: ez ÚJRA MEGNYITJA az anon hozzáférést az rpw_jobs-hoz.
--  Csak akkor futtasd, ha a lezárás után a munka megállt, és a
--  visszaállás gyorsabb, mint a hibakeresés.
-- ════════════════════════════════════════════════════════════════
begin;

-- 1) A tábla-jogok és a mindent megengedő szabály visszaállítása
grant select, insert, update, delete on public.rpw_jobs to anon, authenticated;
drop policy if exists "rpw_jobs anon rw" on public.rpw_jobs;
create policy "rpw_jobs anon rw" on public.rpw_jobs
  as permissive for all to anon, authenticated
  using (true) with check (true);
alter table public.rpw_jobs enable row level security;
alter table public.rpw_jobs no force row level security;

-- 2) A többi rpw_* táblán a kikényszerítés feloldása
--    (jogot NEM adunk vissza: azokon a lezárás előtt sem volt)
do $$
declare t text;
begin
  foreach t in array array['rpw_audit','rpw_employees','rpw_roles','rpw_posts',
                           'rpw_pin_log','rpw_job_counters','rpw_pin_attempt']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I no force row level security', t);
    end if;
  end loop;
end $$;

-- 3) A függvény-EXECUTE visszaadása a lezárás előtti (megengedő) állapotra
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'rpw%'
  loop
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;

commit;
