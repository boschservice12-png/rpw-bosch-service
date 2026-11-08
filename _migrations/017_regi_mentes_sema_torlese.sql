-- ════════════════════════════════════════════════════════════════
--  017 — a 2026-08-29-i belső mentés-séma végleges törlése
--  ÉLESBEN ALKALMAZVA: 2026-11-08 (rpw_017_regi_mentes_sema_torlese),
--  Ferenc döntése.
--  Tartalma volt: a 014-gyel már törölt 35 munka, 442 audit-sor,
--  19 dolgozó PIN-hashekkel. Ok: GDPR adattakarékosság — a törölt adat
--  ne éljen tovább másolatban. Külső függőség nem volt (mérve).
--  (A 016 a három elgépelt, üres tárolót törölte.)
--   törlendő: 'FOTO', 'body workflow', 'STORAGE_BUCKET = ''rpw-photos''')
-- ════════════════════════════════════════════════════════════════
begin;
drop schema if exists rpw_backup_20260829 cascade;
commit;

-- ELLENŐRZÉS — elvárt: 0
select count(*) as sema_db from pg_namespace where nspname = 'rpw_backup_20260829';
