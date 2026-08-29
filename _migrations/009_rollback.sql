-- ════════════════════════════════════════════════════════════════
--  009 ROLLBACK — a szűk ügyfél-út eltávolítása
--  FIGYELEM: ha a 008 lezárás MÁR fut, ez a rollback elvágja az
--  ügyfél-feltöltést. Előbb a 008_rollback.sql-t futtasd.
-- ════════════════════════════════════════════════════════════════
begin;
drop function if exists public.rpw_client_upload(text, jsonb);
drop function if exists public.rpw_client_job_get(text);
commit;
