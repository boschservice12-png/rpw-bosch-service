-- ════════════════════════════════════════════════════════════════
--  016 — három elgépelt, ÜRES tároló törlése
--  ÉLESBEN ALKALMAZVA: 2026-11-08 (rpw_016_elgepelt_ures_tarolok_torlese),
--  Ferenc kérésére.
--  A storage.protect_delete a gazdátlan fájlok ellen véd. Üres tárolónál
--  ilyen nincs, ezért a Supabase hivatalos kapcsolójával (set LOCAL —
--  csak erre a tranzakcióra) töröljük, és csak ha 0 objektum van benne.
--  A NEM üres 'foto' tárolóra ez az út TILOS: a fájlok fizikailag a
--  tárhelyen maradnának — azt a Storage API / felület törli.
-- ════════════════════════════════════════════════════════════════
begin;
set local storage.allow_delete_query = 'true';
delete from storage.buckets b
 where b.id in ('FOTO', 'body workflow', 'STORAGE_BUCKET = ''rpw-photos''')
   and not exists (select 1 from storage.objects o where o.bucket_id = b.id);
commit;

-- ELLENŐRZÉS — elvárt: 0
select count(*) from storage.buckets
 where id in ('FOTO', 'body workflow', 'STORAGE_BUCKET = ''rpw-photos''');
