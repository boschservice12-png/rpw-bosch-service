-- 015 — a régi 'foto' tároló mindenki számára nyitott "allow_all" szabályának törlése
-- ÉLESBEN ALKALMAZVA: 2026-11-08 (rpw_015_foto_allow_all_policy_torles), Ferenc jóváhagyásával.
-- A tároló 11 fájlja (szerszámfotók, 2026-02-25) SQL-ből nem törölhető (storage.protect_delete):
-- Supabase felület → Storage → foto → mind kijelöl → Delete.
-- Rollback: nincs — a szabályt szándékosan nem állítjuk vissza.
drop policy if exists "allow_all" on storage.objects;
