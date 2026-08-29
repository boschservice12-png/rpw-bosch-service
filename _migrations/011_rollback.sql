-- ════════════════════════════════════════════════════════════════
--  011 ROLLBACK — a régi munkamásolatok vissza a public sémába
--  FIGYELEM: ezután ismét RLS nélküli munkamásolatok ülnek abban a
--  sémában, amit a PostgREST kiszolgál. Csak akkor futtasd, ha valami
--  tényleg hiányzik belőlük.
-- ════════════════════════════════════════════════════════════════
begin;
alter table if exists rpw_archiv.rpw_jobs_backup_20260822   set schema public;
alter table if exists rpw_archiv.rpw_jobs_backup_pre_shopid set schema public;
alter table if exists rpw_archiv.rpw_jobs_backup_pre_p03    set schema public;
alter table if exists rpw_archiv.rpw_jobs_backup_pre_l1h    set schema public;
commit;
