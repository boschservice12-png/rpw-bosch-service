-- ════════════════════════════════════════════════════════════════
--  009 — SZŰK ÜGYFÉL-ÚT  (a 008 lezárás előfeltétele)
--  ----------------------------------------------------------------
--  MIÉRT KELL?
--  Az ügyfél a WhatsApp-linkről tölti fel a fotóit és az iratait.
--  PIN-je nincs és nem is lehet. Ma két úton dolgozik:
--     olvasás : KÖZVETLEN `rpw_jobs` tábla-olvasás  (a TELJES sort!)
--     írás    : `rpw_patch_v2`, token nélkül
--  A 008 lezárás mindkettőt megszünteti — vagyis a lezárás enélkül a
--  migráció nélkül ELVÁGNÁ az ügyfél-feltöltést.
--
--  MIT AD HELYETTE?
--  Két SZŰK függvényt, amelyek a munkaazonosítóra épülnek:
--
--   rpw_client_job_get(id)     → CSAK amit a feltöltő lap kirajzol:
--        number, plate, brand, dosarActe, clientUploads, clientGata.
--        NEM ad vissza telefonszámot, ügyfélnevet, belső jegyzetet,
--        műhelyfotókat, fázisállapotot. (Ma a lap a TELJES sort megkapja —
--        ez tehát adatvédelmi szigorítás is, nem csak lezárás.)
--
--   rpw_client_upload(id, patch) → CSAK három kulcsot ír:
--        clientUploads, dosarActe, clientGata.
--        Minden más kulcs ELUTASÍTVA (`forbidden_field`). Fázist, lezárást,
--        rework-öt, ügyfél-adatot az ügyfél NEM módosíthat.
--
--  MIT NEM OLD MEG?
--  A hozzáférést továbbra is a munkaazonosító adja. Aki kitalál egy
--  létező azonosítót, az EGY dosszié feltöltő-nézetét látja. A teljes
--  megoldás a dossziénkénti feltöltő-token (külön feladat). A mai
--  állapothoz képest viszont ez nagy szigorítás: ma az anon kulccsal
--  MINDEN munka egyben letölthető és törölhető.
--
--  ELŐFELTÉTEL: rpw_jobs tábla.        ROLLBACK: 009_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regclass('public.rpw_jobs') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: public.rpw_jobs';
  end if;
end $$;

-- ── OLVASÁS: csak a feltöltő lap mezői ──────────────────────────
create or replace function public.rpw_client_job_get(p_job_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare j record;
begin
  -- Onkenyes hosszkorlat NINCS: a dosszieszam formatuma valtozhat.
  if p_job_id is null or length(p_job_id) = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select id, data, version into j
    from public.rpw_jobs
   where id = p_job_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- SZIGORÚAN csak ez a hat mező megy ki.
  return jsonb_build_object(
    'ok', true,
    'id', j.id,
    'version', j.version,
    'data', jsonb_strip_nulls(jsonb_build_object(
      'number',        j.data->'number',
      'plate',         j.data->'plate',
      'brand',         coalesce(j.data->'brand', j.data->'auto'),
      'dosarActe',     coalesce(j.data->'dosarActe',    '{}'::jsonb),
      'clientUploads', coalesce(j.data->'clientUploads','[]'::jsonb),
      'clientGata',    j.data->'clientGata'
    ))
  );
end $$;

-- ── ÍRÁS: csak a három feltöltési kulcs ─────────────────────────
create or replace function public.rpw_client_upload(p_job_id text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  engedett text[] := array['clientUploads','dosarActe','clientGata'];
  k text;
  regi_version int;
  uj_version int;
  tid uuid;
begin
  if p_job_id is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  -- Egyetlen nem engedélyezett kulcs is ELUTASÍTJA az egész műveletet.
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any(engedett)) then
      return jsonb_build_object('ok', false, 'error', 'forbidden_field', 'field', k);
    end if;
  end loop;

  select version, tenant_id into regi_version, tid
    from public.rpw_jobs where id = p_job_id and deleted_at is null;
  if regi_version is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.rpw_jobs
     set data       = data || p_patch,
         version    = version + 1,
         updated_at = now()
   where id = p_job_id and deleted_at is null
   returning version into uj_version;

  -- ── AZ ÜGYFÉL MŰVELETE UGYANOLYAN NYOMOT HAGY, MINT A DOLGOZÓÉ ──
  -- A ház bevett audit-mintáját követjük (lásd rpw_patch_v3): nem elég a
  -- job_id és a név — a MIT és a MIRŐL MIRE is kell, különben az ügyfél
  -- feltöltése utólag nem rekonstruálható.
  if to_regclass('public.rpw_audit') is not null then
    begin
      insert into public.rpw_audit(job_id, tenant_id, actor, action, patch,
                                   prev_version, new_version)
      values (p_job_id, tid, 'client_whatsapp', 'client_upload', p_patch,
              regi_version, uj_version);
    exception when others then null;   -- audit-séma eltérése ne bukjon meg egy feltöltést
    end;
  end if;

  return jsonb_build_object('ok', true, 'version', uj_version);
end $$;

-- Az ügyfélnek nincs tokenje: ez a KÉT függvény hívható bejelentkezés nélkül.
grant execute on function public.rpw_client_job_get(text)        to anon, authenticated;
grant execute on function public.rpw_client_upload(text, jsonb)  to anon, authenticated;

commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — futtasd a migráció UTÁN
-- ════════════════════════════════════════════════════════════════

-- 1) A két ügyfél-függvény hívható — elvárt: true, true
select has_function_privilege('anon','public.rpw_client_job_get(text)','EXECUTE')       as olvasas,
       has_function_privilege('anon','public.rpw_client_upload(text,jsonb)','EXECUTE')  as iras;

-- 2) Tiltott mező elutasítása — elvárt: ok=false, error=forbidden_field
select public.rpw_client_upload('NINCS-ILYEN', '{"phase":3}'::jsonb) as tiltott_mezo;

-- 3) Nem létező dosszié — elvárt: ok=false, error=not_found
select public.rpw_client_job_get('NINCS-ILYEN') as nincs_ilyen;
