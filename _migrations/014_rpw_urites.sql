-- 014_rpw_urites.sql
-- ------------------------------------------------------------------
-- Ferenc kerese (2026-09-03): "mindent torolj maradjon ures az egesz
-- app hogy ne zavarjanak a regi adatok".
--
-- ⚠ EZ A MIGRACIO NEM VONHATO VISSZA ⚠
--    Ferenc kifejezetten ugy dontott, hogy ARCHIV MASOLAT NE KESZULJON
--    ("ne keszuljon, tunjon el vegleg"). A 011/013-tol elteroen tehat
--    NINCS rpw_archiv-ba masolas. A 41 munka es az 533 audit-sor
--    megsemmisul. Az egyetlen tartalek a Supabase napi mentese, ami a
--    torles napjan ~18 orasnal frissebb adatot NEM tartalmaz.
--    Nincs 014_rollback.sql, mert nincs mibol visszaallitani.
--
-- AMIT TOROL:
--    rpw_jobs   41 sor  (ebbol 2 mar torolt jelolessel)
--    rpw_audit 533 sor  (a fenti munkak elozmenye; nelkuluk ertelmetlen)
--
-- AMIT SZANDEKOSAN NEM BANT (es miert):
--    employees      a rpw_login tartalek bejelentkezes hitelesito tablaja
--                   (11 aktiv PIN), ES a rpw_posts konfiguracio idegen
--                   kulccsal ide mutat
--    jobs           a szuneteltetett redassistance-core panel termelesi
--                   elozmenye (2026-02-23 → 05-02), mas projekt adata
--    rpw_employees  19 dolgozo — nelkulu nincs bejelentkezes
--    rpw_roles      9 szerepkor — a fazis-jogosultsagok innen jonnek
--    rpw_posts      4 poszt: konfiguracio, nem adat
--    rpw_job_counters  MS-26- / 86. SZANDEKOSAN NEM NULLAZZUK: a regi
--                   munkaszamok szamlakon es biztositoi levelekben
--                   szerepelnek, ujrakiosztasuk utkozest okozna. A
--                   kovetkezo munka MS-26-87 lesz, nem MS-26-01.
--    rpw_pin_log    biztonsagi naplo (ki allitott kinek PIN-t), nem
--                   jelenik meg az appban, tehat nem "zavaro regi adat"
--    app_session    27 munkamenet; 12 ora alatt maguktol lejarnak, a
--                   torlesuk viszont mindenkit azonnal kileptetne
--
-- AMIT INNEN NEM LEHET: a 318 fenykep a storage-ban. A Supabase az SQL-bol
--    valo torlest tiltja ("Direct deletion from storage tables is not
--    allowed"), ezert azok a fajlok a feluleten torlendok. Amig ez nem
--    tortenik meg, arvan ott maradnak — az app nem latja oket.
-- ------------------------------------------------------------------

-- A torles ES az ellenorzes EGYETLEN utasitasban (DO blokk) van, hogy a
-- visszagorgetes ne fuggjon attol, tranzakcioba csomagolja-e a futtato:
-- ha barmelyik feltetel serul, a kivetel az egesz blokkot visszagorgeti,
-- es SEMMI nem tortenik meg.
--
-- A negativ tesztek (2026-09-03, elo adatbazison, mind visszagorgult):
--   M2  a rpw_posts konfiguraciot is elviszi  → "KONTROLL SERULT: rpw_posts kiurult"
--   M3  a rpw_jobs torlese kiesik             → "rpw_jobs nem urult ki: 41"
--   (M1 a rpw_roles-t celozta, de azt mar egy idegen kulcs megfogta a
--    kontroll elott — ezert nem az volt a bizonyitek, hanem az M2.)

begin;

do $$
declare
  v_jobs_elotte  bigint;
  v_audit_elotte bigint;
  v_jobs   bigint;
  v_audit  bigint;
  v_emp    bigint;
  v_rpwemp bigint;
  v_roles  bigint;
  v_posts  bigint;
  v_erp    bigint;
  v_szaml  int;
begin
  select count(*) into v_jobs_elotte  from rpw_jobs;
  select count(*) into v_audit_elotte from rpw_audit;

  delete from rpw_audit;                 -- eloszor: a munkakra hivatkozik
  delete from rpw_jobs;

  select count(*) into v_jobs   from rpw_jobs;
  select count(*) into v_audit  from rpw_audit;
  select count(*) into v_emp    from employees;
  select count(*) into v_rpwemp from rpw_employees;
  select count(*) into v_roles  from rpw_roles;
  select count(*) into v_posts  from rpw_posts;
  select count(*) into v_erp    from jobs;
  select last_no  into v_szaml  from rpw_job_counters limit 1;

  -- ki KELL urulnie
  if v_jobs  <> 0 then raise exception 'rpw_jobs nem urult ki: %',  v_jobs;  end if;
  if v_audit <> 0 then raise exception 'rpw_audit nem urult ki: %', v_audit; end if;

  -- KONTROLL: ezeknek valtozatlanul allniuk kell. Ha barmelyik nulla,
  -- akkor tul sokat toroltunk — es a kivetel mindent visszagorgett.
  if v_emp    < 1 then raise exception 'KONTROLL SERULT: employees kiurult';     end if;
  if v_rpwemp < 1 then raise exception 'KONTROLL SERULT: rpw_employees kiurult'; end if;
  if v_roles  < 1 then raise exception 'KONTROLL SERULT: rpw_roles kiurult';     end if;
  if v_posts  < 1 then raise exception 'KONTROLL SERULT: rpw_posts kiurult';     end if;
  if v_erp    < 1 then raise exception 'KONTROLL SERULT: jobs (ERP) kiurult';    end if;
  if coalesce(v_szaml,0) < 1 then
    raise exception 'KONTROLL SERULT: a munkaszam-szamlalo lenullazodott';
  end if;

  raise notice 'rpw_jobs: % -> 0 | rpw_audit: % -> 0 | erintetlen: employees %, rpw_employees %, rpw_roles %, rpw_posts %, jobs %, szamlalo %',
    v_jobs_elotte, v_audit_elotte, v_emp, v_rpwemp, v_roles, v_posts, v_erp, v_szaml;
end $$;

-- ELLENŐRZÉS — a commit elott fut, es a fenti DO blokk mar elhasalt volna,
-- ha barmi nem stimmel. Ez a lekerdezes a bizonyitek, amit ki lehet masolni.
select 'rpw_jobs — URES?'             as mit, count(*) as db, '0'   as varhato from rpw_jobs
union all select 'rpw_audit — URES?',            count(*), '0'   from rpw_audit
union all select 'KONTROLL rpw_employees',       count(*), '19'  from rpw_employees
union all select 'KONTROLL rpw_roles',           count(*), '9'   from rpw_roles
union all select 'KONTROLL rpw_posts',           count(*), '4'   from rpw_posts
union all select 'KONTROLL employees (belepes)', count(*), '20'  from employees
union all select 'KONTROLL jobs (ERP panel)',    count(*), '505' from jobs
order by 1;

commit;
