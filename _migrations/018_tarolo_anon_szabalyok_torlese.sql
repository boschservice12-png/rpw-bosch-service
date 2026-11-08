-- ════════════════════════════════════════════════════════════════
--  018 — A FOTÓTÁROLÓ LEZÁRÁSA (RPW-003)
--  ----------------------------------------------------------------
--  A `rpw-photos` tárolón öt szabály engedte a nyilvános (anon) kulccsal
--  a listázást, letöltést, feltöltést, felülírást és TÖRLÉST — szerviz,
--  munka és munkamenet vizsgálata nélkül.
--
--  ⚠ ELŐFELTÉTEL — ENÉLKÜL A FOTÓZÁS MEGÁLL ⚠
--    1. a `rpw-storage` Edge Function él (2026-11-08 óta)
--    2. a kliens STORAGE_GATEWAY=true-val ki van telepítve
--    3. élesben igazolva: recepció-fotó, dosszié-irat, ügyfél-feltöltés,
--       fotó megjelenik, fotó törlése
--  A kapu az aláírt URL-eket service-kulccsal adja ki: ahhoz NEM kell
--  anon szabály. Ezért a szabályok törlése után a kapu tovább működik,
--  a közvetlen út pedig megszűnik.
--
--  ROLLBACK: 018_rollback.sql (az öt szabály vissza — újranyitja a rést)
-- ════════════════════════════════════════════════════════════════
begin;
drop policy if exists "Allow anon read from rpw-photos"  on storage.objects;
drop policy if exists "Allow anon upload to rpw-photos"  on storage.objects;
drop policy if exists "Allow anon update in rpw-photos"  on storage.objects;
drop policy if exists "Allow anon delete in rpw-photos"  on storage.objects;
drop policy if exists "rpw_photos signed url mint"       on storage.objects;
commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — elvárt: 0 sor
-- ════════════════════════════════════════════════════════════════
select policyname from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and (roles && array['anon','authenticated','public']::name[])
   and coalesce(qual, with_check, '') like '%rpw-photos%';
