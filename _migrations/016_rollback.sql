-- 016 ROLLBACK — a három ÜRES, elgépelt tároló visszahozása (adat nem volt bennük).
-- Csak akkor futtasd, ha valami a nevükre hivatkozik (2026-11-08-án semmi).
begin;
insert into storage.buckets (id, name, public)
values ('FOTO','FOTO',false), ('body workflow','body workflow',false),
       ('STORAGE_BUCKET = ''rpw-photos''','STORAGE_BUCKET = ''rpw-photos''',false)
on conflict (id) do nothing;
commit;
