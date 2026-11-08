-- 018 ROLLBACK — az öt anon tárolószabály vissza.
-- ⚠ Ez ÚJRANYITJA a rést: a nyilvános kulccsal ismét listázható, letölthető,
-- felülírható és törölhető minden fotó. Csak akkor futtasd, ha a kapu nem
-- működik, és a fotózás sürgősebb, mint a lezárás. Kliens-oldalon ilyenkor
-- STORAGE_GATEWAY=false is kell (rpw-config.js).
begin;
create policy "Allow anon read from rpw-photos" on storage.objects for select to anon using (bucket_id = 'rpw-photos');
create policy "Allow anon upload to rpw-photos" on storage.objects for insert to anon with check (bucket_id = 'rpw-photos');
create policy "Allow anon update in rpw-photos" on storage.objects for update to anon using (bucket_id = 'rpw-photos');
create policy "Allow anon delete in rpw-photos" on storage.objects for delete to anon using (bucket_id = 'rpw-photos');
create policy "rpw_photos signed url mint" on storage.objects for select to anon, authenticated using (bucket_id = 'rpw-photos');
commit;
