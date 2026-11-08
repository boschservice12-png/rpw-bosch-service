-- ════════════════════════════════════════════════════════════════
--  015 — a régi 'foto' tároló mindenki számára nyitott "allow_all" szabálya
--  ÉLESBEN ALKALMAZVA: 2026-11-08 (rpw_015_foto_allow_all_policy_torles),
--  Ferenc jóváhagyásával.
--  A tároló 11 fájlja (szerszámfotók, 2026-02-25) SQL-ből nem törölhető
--  (storage.protect_delete): Supabase → Storage → foto → mind kijelöl → Delete.
-- ════════════════════════════════════════════════════════════════
begin;
drop policy if exists "allow_all" on storage.objects;
commit;

-- ELLENŐRZÉS — elvárt: 0
select count(*) as allow_all_db from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname = 'allow_all';
