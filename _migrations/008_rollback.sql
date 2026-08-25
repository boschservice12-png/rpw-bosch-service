-- 008 VISSZAVONÁSA — csak vészhelyzetben.
-- ⚠ A deprecated utak EXECUTE jogát NEM adjuk vissza automatikusan:
--   a régi rpw_patch/rpw_login veszélyes (bérlővédelem és verziózár
--   nélküli) utak voltak; a visszakapcsolásuk emberi döntés, külön
--   paranccsal, dokumentált indokkal. (Lásd a feladat 7. pontját.)
begin;
drop function if exists public.rpw_job_create(text,text,jsonb,text);
update public.rpw_schema_version set version='007', migrated_at=now() where id=1;
commit;
