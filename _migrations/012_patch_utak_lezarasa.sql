-- ════════════════════════════════════════════════════════════════
--  012 — A BÉRLŐ-ELLENŐRZÉS NÉLKÜLI ÍRÁSI UTAK LEZÁRÁSA
--  ----------------------------------------------------------------
--  Kódreview, 2026-08-29. Az adatbázis megerősítette:
--
--    fuggveny        token?  szerviz?  anon hivhatja?
--    rpw_patch       NEM     NEM       IGEN
--    rpw_patch_v2    NEM     NEM       IGEN
--
--  Minden más írási út (rpw_patch_v3, rpw_job_trash/restore/purge)
--  tokent kér ÉS szervizt ellenőriz. Ez a kettő nem.
--
--  MIÉRT SÜRGŐS: 2026-08-29 este bekapcsoltuk a dolgozói beléptetést.
--  Ez a két függvény pontosan azt kerüli meg: aki ismeri a lapban lévő
--  anon kulcsot és egy munkaazonosítót, BELÉPÉS NÉLKÜL írhat munkát —
--  ma a sajátunkat, egy második szerviz után bárkiét.
--
--  MIÉRT BIZTONSÁGOS MOST: a szerver naplója szerint 24 óra alatt
--  EGYSZER SEM hívta őket senki (rpw_patch 0, rpw_patch_v2 0), miközben
--  a rpw_patch_v3 5-ször és a rpw_client_upload 21-szer futott.
--  Belépve mindkét kliens-ág a v3-ra megy (rpw-db.js patch(),
--  rpw-save.js), az ügyfél-feltöltés pedig a rpw_client_upload-ra.
--
--  ⚠ CSAPDA A VISSZAÚTON — EZT NE FELEJTSD ⚠
--  Ez a lezárás KÉT konfigurációs kapcsolóhoz van kötve:
--
--    AUTH_REQUIRED = false  → a mentés visszaesik a rpw_patch / v2-re
--    CLIENT_RPC    = false  → az ügyfél-feltöltés visszaesik a v2-re
--
--  Ha BÁRMELYIKET visszaállítod, EGYIDEJŰLEG futtatni kell a
--  012_rollback.sql-t, különben a mentés némán elhal. A visszaállás
--  tehát mostantól KÉT lépés, nem egy.
--
--  ROLLBACK: 012_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regproc('public.rpw_patch_v3') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: rpw_patch_v3 — enélkül nem maradna írási út';
  end if;
  if to_regproc('public.rpw_client_upload') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: rpw_client_upload — enélkül az ügyfél-feltöltés elhalna';
  end if;
end $$;

-- A PUBLIC-TOL IS EL KELL VENNI. Postgresben a fuggvenyek ALAPBOL
-- futtathatok a PUBLIC szamara, es az anon ezen keresztul akkor is
-- hozzajut, ha tole kulon elvettuk. Az elso nekifutasom pont ezt hagyta
-- ki: a rpw_patch elolt (mert onnan egy korabbi migracio mar elvette a
-- PUBLIC-ot), a rpw_patch_v2 viszont NEM — az ACL-jeben ott allt a
-- `=X/postgres`, vagyis a PUBLIC. Az ellenorzo lekerdezes fogta meg.
revoke execute on function public.rpw_patch(text, jsonb)                          from public;
revoke execute on function public.rpw_patch_v2(text, jsonb, integer, text, text)  from public;
revoke execute on function public.rpw_patch(text, jsonb)                          from anon, authenticated;
revoke execute on function public.rpw_patch_v2(text, jsonb, integer, text, text)  from anon, authenticated;

commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — futtasd a migráció UTÁN
-- ════════════════════════════════════════════════════════════════

-- 1) Elveszett-e a jog, ÉS megvan-e még a jó út?
--    A KONTROLL-sor bizonyítja, hogy a mérőeszköz működik: ha a v3 is
--    false lenne, a többi false semmit nem érne.
select 'KONTROLL: rpw_patch_v3 (maradnia KELL)' as mit,
       has_function_privilege('anon','public.rpw_patch_v3(text,text,jsonb,integer,text)','EXECUTE') as anon
union all select 'KONTROLL: rpw_client_upload (maradnia KELL)',
       has_function_privilege('anon','public.rpw_client_upload(text,jsonb)','EXECUTE')
union all select 'rpw_patch (el kell tunnie)',
       has_function_privilege('anon','public.rpw_patch(text,jsonb)','EXECUTE')
union all select 'rpw_patch_v2 (el kell tunnie)',
       has_function_privilege('anon','public.rpw_patch_v2(text,jsonb,integer,text,text)','EXECUTE');

-- 2) Maradt-e olyan írási RPC, amit anon hívhat token nélkül?
--    2026-08-29-én a 012 UTÁN ez marad, és MINDEGYIK szándékos vagy külön
--    döntés tárgya — a 008 lezárás rendezi őket:
--      rpw2_login          a belépés maga: token nélkül kell hívni
--      rpw_client_upload   az ügyfél szűk útja, három mezőre engedélyezve
--      rpw_login,
--      rpw_login_named     RÉGI belépési utak, a kliens már nem hívja
--      rpw_next_job_number a jobszám-számláló léptetése
--      rpw_roles_seed      `on conflict do nothing`: meglévőt nem ír felül
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname ~ '^rpw'
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and pg_get_functiondef(p.oid) !~* '(p_token|rpw__ctx)'
  and pg_get_functiondef(p.oid) ~* '(insert into|update )'
order by p.proname;
