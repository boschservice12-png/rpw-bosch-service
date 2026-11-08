-- 017_rollback.sql
-- EZ A MIGRÁCIÓ NEM VONHATÓ VISSZA.
-- A rpw_backup_20260829 séma tartalma (a 014-gyel már törölt adatok
-- másolata) Ferenc döntésére végleg törlődött, 2026-11-08-án.
-- Az egyetlen elméleti tartalék a Supabase napi automatikus mentése (7 nap),
-- és az csak TELJES projekt-visszaállítással érhető el.
do $$
begin
  raise exception '017: nem vonható vissza — a mentés-séma tulajdonosi döntésre végleg törölve (2026-11-08).';
end $$;
