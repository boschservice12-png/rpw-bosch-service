-- ═══════════════════════════════════════════════════════════════════════════
-- RPW — KONZISZTENCIA-ŐR
-- Végigmegy az élő dossziékon és kiírja az ellentmondásokat.
-- CSAK OLVAS. Soha nem ír, nem töröl. Bármikor futtatható.
--
-- Futtatás:  select * from rpw_consistency_check();
-- Összesítő: select sulyossag, szabaly, count(*) from rpw_consistency_check()
--            group by 1,2 order by 1,2;
--
-- A függvény már ALKALMAZVA van az éles adatbázison (2026-08-22).
-- Ez a fájl a repóban a forrás — ha módosítod, futtasd újra.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function rpw_consistency_check()
returns table(
  szabaly   text,
  sulyossag text,
  szam      text,
  rendszam  text,
  reszlet   text,
  job_id    text
)
language sql
stable
security definer
set search_path = public
as $$
-- 1) SÚLYOS — a munka a csőben van, de érkezésre vár
--    Ez a "két állapotgép" ellentmondása: phase>=1 (recepción vagy tovább),
--    de programare.status='viitor' (előjegyzésnek látszik). Ilyenkor a Panou
--    és a workflow mást hisz ugyanarról a dossziéról.
select 'phase_vs_sosire', 'sulyos',
       d->>'number', coalesce(nullif(d->>'plate',''),'—'),
       'phase='||coalesce(d->>'phase','?')||' de programare.status='||coalesce(d->'programare'->>'status','?'),
       j.id
from rpw_jobs j, lateral (select j.data) x(d)
where j.deleted_at is null
  and coalesce((d->>'phase')::int,0) >= 1
  and coalesce(d->'programare'->>'status','') = 'viitor'

union all
-- 2) SÚLYOS — "csak dosszié", mégis a javítási csőben
--    Nincs javítás, mégis a 7 fázisú cső követelményeit kapja.
select 'doar_dosar_in_flux', 'sulyos',
       d->>'number', coalesce(nullif(d->>'plate',''),'—'),
       'doarDosar=true de phase='||coalesce(d->>'phase','?'),
       j.id
from rpw_jobs j, lateral (select j.data) x(d)
where j.deleted_at is null
  and (d->>'doarDosar') = 'true'
  and coalesce((d->>'phase')::int,0) >= 1

union all
-- 3) SÚLYOS — duplikált munkaszám (deviz/számla hivatkozás ütközik)
select 'szam_utkozes', 'sulyos',
       d->>'number', coalesce(nullif(d->>'plate',''),'—'),
       'ugyanez a szam '||cnt||' munkan',
       j.id
from rpw_jobs j,
     lateral (select j.data) x(d),
     lateral (select count(*) from rpw_jobs k
              where k.deleted_at is null
                and k.data->>'number' = j.data->>'number') y(cnt)
where j.deleted_at is null and cnt > 1

union all
-- 4) SÚLYOS — csonka rekord (kevesebb mint 8 mező)
--    Ilyet a részleges patch hoz létre olyan azonosítóra, ami nincs a
--    szerveren. Nem valódi dosszié, csak töredék.
select 'csonka_rekord', 'sulyos',
       coalesce(d->>'number','(nincs szam)'), coalesce(nullif(d->>'plate',''),'—'),
       'csak '||(select count(*) from jsonb_object_keys(d))||' mezo van benne',
       j.id
from rpw_jobs j, lateral (select j.data) x(d)
where j.deleted_at is null
  and (select count(*) from jsonb_object_keys(d)) < 8

union all
-- 5) KÖZEPES — hiányos nyitás: nincs rendszám VAGY nincs telefon
select 'hianyos_nyitas', 'kozepes',
       d->>'number', coalesce(nullif(d->>'plate',''),'—'),
       case when btrim(coalesce(d->>'plate','')) = '' then 'nincs rendszam' else '' end ||
       case when btrim(coalesce(d->>'plate','')) = ''
             and btrim(coalesce(d->>'phone','')) = '' then ' + ' else '' end ||
       case when btrim(coalesce(d->>'phone','')) = '' then 'nincs telefon' else '' end,
       j.id
from rpw_jobs j, lateral (select j.data) x(d)
where j.deleted_at is null
  and (btrim(coalesce(d->>'plate','')) = '' or btrim(coalesce(d->>'phone','')) = '')
  and (select count(*) from jsonb_object_keys(d)) >= 8   -- a csonkákat a 4) hozza

union all
-- 6) KÖZEPES — lejárt előjegyzés, ami még mindig várakozik
select 'programare_lejart', 'kozepes',
       d->>'number', coalesce(nullif(d->>'plate',''),'—'),
       'datum '||(d->'programare'->>'date')||' ('||
       (current_date - (d->'programare'->>'date')::date)||' napja)',
       j.id
from rpw_jobs j, lateral (select j.data) x(d)
where j.deleted_at is null
  and coalesce(d->'programare'->>'status','') = 'viitor'
  and (d->'programare'->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
  and (d->'programare'->>'date')::date < current_date

union all
-- 7) ENYHE — biztosítós munka dosarStatus nélkül
--    Nem tudni, melyik doksilista fut rá (17 vagy 8 tétel).
select 'dosarstatus_hianyzik', 'enyhe',
       d->>'number', coalesce(nullif(d->>'plate',''),'—'),
       'damageType=asig de nincs dosarStatus',
       j.id
from rpw_jobs j, lateral (select j.data) x(d)
where j.deleted_at is null
  and (d->>'damageType') = 'asig'
  and coalesce(d->>'dosarStatus','') = ''

union all
-- 8) ENYHE — előjegyzés dátum nélkül (nem rendezhető, nem lehet lejárt)
select 'programare_datum_nelkul', 'enyhe',
       d->>'number', coalesce(nullif(d->>'plate',''),'—'),
       'programare.status=viitor, de nincs datum',
       j.id
from rpw_jobs j, lateral (select j.data) x(d)
where j.deleted_at is null
  and coalesce(d->'programare'->>'status','') = 'viitor'
  and coalesce(d->'programare'->>'date','') = ''
  and (select count(*) from jsonb_object_keys(d)) >= 8

order by 2, 1, 3;
$$;

grant execute on function rpw_consistency_check() to anon, authenticated;
