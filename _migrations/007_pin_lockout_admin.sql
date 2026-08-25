-- ════════════════════════════════════════════════════════════════
--  007 — PIN-ZÁROLÁS KEZELÉSE + PIN-MINŐSÉG
--  ----------------------------------------------------------------
--  MIT JAVÍT
--  A felület (index.html, `Echipă → Personal`) HÁROM dolgot ígér,
--  amelyhez nem volt szerveroldal:
--
--    1. `rpw2_pin_status`  — ki hány rossz PIN-nél tart, ki zárolt
--    2. `rpw2_pin_unlock`  — a csapatkezelő feloldja a zárolást
--    3. gyenge / ütköző PIN elutasítása (`weak_pin`, `pin_taken`)
--
--  Az 1–2. RPC EGYSZERŰEN NEM LÉTEZETT: a kliens hívta, a Supabase
--  `function does not exist` hibát adott, a hívás `try/catch`-ben
--  elnyelődött. A zárolás-jelző és a feloldó gomb SOHA nem jelent
--  meg — a felhasználó pedig azt hitte, hogy nincs zárolt kolléga.
--
--  A 3. pontot a felület SZÖVEGE már állította („NU un an, nu cifre
--  identice sau consecutive… Fiecare coleg trebuie să aibă alt PIN"),
--  a `004`-es `rpw2_pin_set` viszont csak a hosszt nézte. Egy ígéret,
--  amit semmi nem tartott be.
--
--  A zárolás MAGA működött (002 `rpw2_login`: 10 rossz PIN → 15 perc,
--  `rpw_pin_attempt`) — csak nem lehetett se látni, se feloldani.
--
--  ELŐFELTÉTEL: 001–006    ROLLBACK: 007_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regprocedure('public.rpw2_pin_set(text,uuid,text)') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: futtasd előbb a 001–006 migrációkat';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════
--  1) PIN-MINŐSÉG — egy helyen, hogy a szabály ne szóródjon szét
-- ════════════════════════════════════════════════════════════════
--  A felület szövege a szabály; ez a függvény a betartatása.
--  Gyenge:  · nem csak számjegy       · csupa azonos számjegy
--           · szigorúan növekvő/csökkenő futam (1234, 9876)
--           · négyjegyű évszám (1900–2099) — a leggyakoribb választás
create or replace function public.rpw__pin_weak(p_pin text)
returns boolean
language plpgsql immutable
as $$
declare s text; i int; asc_run boolean := true; desc_run boolean := true; d int; p int;
begin
  s := btrim(coalesce(p_pin, ''));
  if s !~ '^[0-9]+$' then return true; end if;          -- nem számjegy
  if length(s) < 4   then return true; end if;          -- rövid
  if s ~ ('^' || substr(s,1,1) || '+$') then return true; end if;   -- csupa azonos

  for i in 2..length(s) loop
    d := substr(s,i,1)::int;
    p := substr(s,i-1,1)::int;
    if d <> p + 1 then asc_run  := false; end if;
    if d <> p - 1 then desc_run := false; end if;
  end loop;
  if asc_run or desc_run then return true; end if;      -- 1234 / 9876

  if length(s) = 4 and s::int between 1900 and 2099 then return true; end if;  -- évszám

  return false;
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  2) rpw2_pin_set — MOST MÁR BETARTATJA, AMIT A FELÜLET ÍGÉR
-- ════════════════════════════════════════════════════════════════
create or replace function public.rpw2_pin_set(p_token text, p_employee_id uuid, p_new_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; n int; pin text;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  -- saját PIN mindig állítható; másé csak `team` joggal
  if (e->>'id')::uuid <> p_employee_id
     and not coalesce((e->'can'->>'team')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;

  pin := btrim(coalesce(p_new_pin,''));
  if length(pin) < 4 then
    return jsonb_build_object('ok',false,'error','pin_too_short','message','PIN prea scurt (minim 4 cifre).');
  end if;
  if rpw__pin_weak(pin) then
    return jsonb_build_object('ok',false,'error','weak_pin',
      'message','PIN prea simplu — nu folosi un an, cifre identice sau consecutive.');
  end if;

  sid := (e->>'shop_id')::uuid;

  -- ÜTKÖZÉS: a szervizben mindenkinek MÁS PIN-je legyen.
  -- A hash bcrypt, tehát nem összehasonlítható — végig kell nézni.
  -- Egy műhelyben ez tíz-húsz sor, nem terhelés.
  if exists (
    select 1 from rpw_employees x
     where x.shop_id = sid and x.active
       and x.id <> p_employee_id
       and x.pin_hash is not null
       and x.pin_hash = crypt(pin, x.pin_hash)
  ) then
    return jsonb_build_object('ok',false,'error','pin_taken',
      'message','PIN-ul e deja folosit de un coleg.');
  end if;

  update rpw_employees set pin_hash = crypt(pin, gen_salt('bf')), pin_set_at = now()
   where id = p_employee_id and shop_id = sid and active;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;

  -- Új PIN → a régi rossz próbálkozások elévülnek. Enélkül a dolgozó
  -- a friss PIN-jével is zárolva maradna, ami értelmetlen.
  delete from rpw_pin_attempt where employee_id = p_employee_id;

  insert into rpw_pin_log(shop_id, employee_id, set_by, self_set)
  values (sid, p_employee_id, (e->>'id')::uuid, (e->>'id')::uuid = p_employee_id);
  return jsonb_build_object('ok',true);
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  3) rpw2_pin_status — KI HÁNY ROSSZ PIN-NÉL TART
-- ════════════════════════════════════════════════════════════════
--  Csak `team` joggal, és csak a SAJÁT szerviz dolgozóiról.
--  A `rpw_pin_attempt` nem tartalmaz `shop_id`-t, ezért a szűrés a
--  dolgozói táblán megy — enélkül más szerviz állapota is látszana.
create or replace function public.rpw2_pin_status(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; rows jsonb;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'team')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;
  sid := (e->>'shop_id')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',          x.id,
           'attempts',    x.n,
           'locked',      x.locked,
           'minutesLeft', x.minutes_left) order by x.id), '[]'::jsonb)
    into rows
  from (
    select emp.id,
           a.n,
           (a.n >= 10 and a.window_start > now() - interval '15 minutes') as locked,
           greatest(0, ceil(extract(epoch from
             (a.window_start + interval '15 minutes' - now())) / 60))::int as minutes_left
      from rpw_employees emp
      join rpw_pin_attempt a on a.employee_id = emp.id
     where emp.shop_id = sid
       and a.window_start > now() - interval '15 minutes'
  ) x;

  return jsonb_build_object('ok', true, 'rows', rows);
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  4) rpw2_pin_unlock — A ZÁROLÁS FELOLDÁSA
-- ════════════════════════════════════════════════════════════════
--  A gomb elrejtése nem védelem: a jogot ITT is ellenőrizzük.
--  A feloldás naplózódik — ki oldotta fel, kinek.
create or replace function public.rpw2_pin_unlock(p_token text, p_employee_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; n int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'team')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;
  sid := (e->>'shop_id')::uuid;

  -- Csak a SAJÁT szerviz dolgozója oldható fel
  if not exists (select 1 from rpw_employees where id = p_employee_id and shop_id = sid) then
    return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found'));
  end if;

  delete from rpw_pin_attempt where employee_id = p_employee_id;
  get diagnostics n = row_count;

  insert into rpw_audit(job_id, tenant_id, actor, action, patch)
  values (null, sid, coalesce(e->>'name','?'), 'pin_unlock',
          jsonb_build_object('employee_id', p_employee_id, 'cleared', n));

  return jsonb_build_object('ok', true, 'cleared', n);
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  5) JOGOK
-- ════════════════════════════════════════════════════════════════
grant execute on function public.rpw2_pin_set(text,uuid,text)   to anon, authenticated;
grant execute on function public.rpw2_pin_status(text)          to anon, authenticated;
grant execute on function public.rpw2_pin_unlock(text,uuid)     to anon, authenticated;

-- A minőség-ellenőrző BELSŐ: csak a `pin_set` hívja, kívülről nem kell.
revoke all on function public.rpw__pin_weak(text) from anon, authenticated;

update public.rpw_schema_version set version='007', migrated_at=now() where id=1;
commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS
-- ════════════════════════════════════════════════════════════════
-- 1) elvárt: mindhárom true
select to_regprocedure('public.rpw2_pin_status(text)')      is not null as van_status,
       to_regprocedure('public.rpw2_pin_unlock(text,uuid)') is not null as van_unlock,
       to_regprocedure('public.rpw__pin_weak(text)')        is not null as van_minoseg;

-- 2) gyenge PIN-ek — elvárt: mind true
select rpw__pin_weak('1111') as azonos, rpw__pin_weak('1234') as novekvo,
       rpw__pin_weak('9876') as csokkeno, rpw__pin_weak('1969') as evszam,
       rpw__pin_weak('12a4') as nem_szam, rpw__pin_weak('123')  as rovid;

-- 3) jó PIN — elvárt: false
select rpw__pin_weak('4917') as rendben;

-- 4) elvárt: '007'
select version from public.rpw_schema_version;
