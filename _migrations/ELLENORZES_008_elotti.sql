-- ════════════════════════════════════════════════════════════════
--  008 ELŐTTI ELLENŐRZÉS — CSAK OLVAS, SEMMIT NEM MÓDOSÍT
--  ----------------------------------------------------------------
--  Futtasd KÖZVETLENÜL a 008_rls_lockdown_live.sql ELŐTT, ugyanazon az
--  adatbázison. GO csak akkor, ha MINDEN sor 'OK'.
--
--  Miért kell? A 008 2026-08-29-én készült. Azóta élesbe ment a 010-014,
--  és az ellenőrzés (2026-11-08) talált egy aláírás-eltérést
--  (rpw2_pin_status: uuid helyett text), amely a lezárás után csendben
--  eltörte volna a PIN-állapot lekérdezését. Ez a lekérdezés az ilyen
--  eltérést a futtatás ELŐTT mutatja meg.
-- ════════════════════════════════════════════════════════════════
with
-- 1) A 008 kötelező előfeltételei (ha hiányzik, a 008 megszakad)
kotelezo(sig) as (values
  ('public.rpw__ctx(text)'), ('public.rpw_jobs_list(text,boolean)'),
  ('public.rpw_job_get(text,text)'), ('public.rpw_patch_v3(text,text,jsonb,integer,text)'),
  ('public.rpw_job_trash(text,text)'), ('public.rpw_job_restore(text,text)'),
  ('public.rpw_job_purge(text,text)'), ('public.rpw_job_number(text,text)'),
  ('public.rpw2_login(uuid,uuid,text)'), ('public.rpw2_session(text)'),
  ('public.rpw_logout(text)'), ('public.rpw2_roster(uuid)')),
-- 2) A 008 feltételes listája — ha valamelyik hiányzik, a kliens adott
--    funkciója a lezárás után jogosultsági hibát kap
felteteles(sig) as (values
  ('public.rpw2_can(text,text)'), ('public.rpw2_team(text,boolean)'),
  ('public.rpw2_pin_status(text)'), ('public.rpw_posts_get(text)'),
  ('public.rpw_post_assign(text,text,uuid)'),
  ('public.rpw_post_upsert(text,text,text,text,int,boolean)'),
  ('public.rpw2_employee_save(text,uuid,text,text,text,boolean)'),
  ('public.rpw2_pin_set(text,uuid,text)'),
  ('public.rpw2_role_save(text,text,text,jsonb,int,boolean)'),
  ('public.rpw2_pin_unlock(text,uuid)'),
  ('public.rpw_client_job_get(text)'), ('public.rpw_client_upload(text,jsonb)'))
select 'A kötelező függvény' as csoport, sig as mit,
       case when to_regprocedure(sig) is not null then 'OK' else 'HIBA — hiányzik, a 008 megszakadna' end as eredmeny
  from kotelezo
union all
select 'B feltételes függvény', sig,
       case when to_regprocedure(sig) is not null then 'OK' else 'HIBA — a kliens hívja, a 008 után jog nélkül maradna' end
  from felteteles
union all
-- 3) Minden aktív dolgozónak van PIN-je (különben a lezárás után kizárva)
select 'C dolgozók', 'aktív dolgozó PIN nélkül',
       case when count(*) = 0 then 'OK' else 'HIBA — ' || count(*) || ' fő nem tud majd belépni' end
  from public.rpw_employees where coalesce(active, true) and pin_hash is null
union all
-- 4) A lezárás előtti állapot az, amire a 008 készült
select 'D kiinduló állapot', 'a "rpw_jobs anon rw" szabály létezik',
       case when exists (select 1 from pg_policies where schemaname='public'
                          and tablename='rpw_jobs' and policyname='rpw_jobs anon rw')
            then 'OK' else 'FIGYELEM — nincs ilyen szabály: a 008 már lefutott, vagy más az állapot' end
union all
-- 5) Kontroll-sor: a mérőeszköz működik (ha ez sem OK, a többi sem ér semmit)
select 'E kontroll', 'postgres SELECT jog az rpw_jobs-on',
       case when has_table_privilege('postgres','public.rpw_jobs','SELECT') then 'OK' else 'HIBA — a mérés nem megbízható' end
order by 1, 2;
