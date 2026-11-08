-- 017 — a 2026-08-29-i belső mentés-séma végleges törlése
-- ÉLESBEN ALKALMAZVA: 2026-11-08 (rpw_017_regi_mentes_sema_torlese), Ferenc döntése.
-- Tartalma volt: a 014-gyel már törölt 35 munka, 442 audit-sor, 19 dolgozó PIN-hashekkel.
-- Ok: GDPR adattakarékosság — a törölt adat ne éljen tovább másolatban.
-- ⚠ NEM VONHATÓ VISSZA. (A Pro napi mentés 7 napig még tartalmazza.)
-- (A 016 — három elgépelt üres tároló — SQL-ből tiltott; a felületen kell törölni:
--  'FOTO', 'body workflow', 'STORAGE_BUCKET = ''rpw-photos''')
drop schema if exists rpw_backup_20260829 cascade;
