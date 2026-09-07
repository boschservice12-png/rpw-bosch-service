-- ════════════════════════════════════════════════════════════════
--  013 ROLLBACK — amit vissza LEHET hozni
--
--  ⚠ AMIT NEM: a négy régi munkamásolat 87 sora és a régi `foto`
--  tároló 11 képe VÉGLEG elveszett. A törlésükről a
--  rpw_archiv.torolt_2026_08_30 tábla őriz nyomot (mit, mekkorát,
--  mikor) — de a tartalmukat nem.
--
--  Ez a fájl CSAK az ERP-maradék táblák visszamozgatását csinálja meg.
-- ════════════════════════════════════════════════════════════════
begin;
alter table if exists rpw_archiv.settings        set schema public;
alter table if exists rpw_archiv.tools           set schema public;
alter table if exists rpw_archiv.tool_categories set schema public;
commit;

-- ELLENŐRZÉS: visszakerültek-e?  Elvárt: 3
select count(*) as vissza_a_publicban
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('settings','tools','tool_categories');
