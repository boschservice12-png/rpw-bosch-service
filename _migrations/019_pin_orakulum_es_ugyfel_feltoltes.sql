-- ════════════════════════════════════════════════════════════════
--  019 — PIN-orákulum megszüntetése + ügyfél-link szigorítása
--  Ferenc jóváhagyása: 2026-11-23 („igen mindharom mehet")
--  Forrás: AUDIT-SYMFONY-LOCALHOST-2026-11-23.md §3.2 és §4
--  Visszaút: 019_rollback.sql (a 2026-11-23-i élő definíciók szó szerint)
--
--  1) rpw2_pin_set: NINCS többé „pin_taken" válasz. A belépés dolgozó + PIN,
--     ezért az egyediség nem kell — a „foglalt" válasz viszont elárulta a
--     kolléga PIN-jét (a névsorból látszik, kié).
--  2) rpw_client_upload: nincs többé felülíró `data || p_patch`.
--     - lezárt (inchis) munka: 'closed'
--     - dosarActe: rekeszenként a személyzet fájljai MARADNAK; az ügyfél
--       saját (src=whatsapp) bejegyzéseit a most küldött, ÉRVÉNYES
--       bejegyzések váltják (útvonal <munka>/acta_…, src kényszerítve)
--     - clientUploads: csak hozzáfűzés, útvonal szerint egyesítve (<munka>/client_…)
--     - clientGata: csak {at ≤40 karakter, files 0..1000}
--     - korlát: rekeszenként 30, összesen 200 ügyfélfájl
-- ════════════════════════════════════════════════════════════════

begin;

-- ── 1) PIN beállítás — az ütközés-ellenőrzés nélkül ─────────────
create or replace function public.rpw2_pin_set(p_token text, p_employee_id uuid, p_new_pin text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  s jsonb; e jsonb; sid uuid; me uuid; sajat boolean;
  hiba text; n int;
begin
  s := rpw2_session(p_token);
  if not (s->>'ok')::boolean then
    return jsonb_build_object('ok',false,'error','unauthorized',
      'message','Sesiune invalidă sau expirată.');
  end if;
  e   := s->'employee';
  sid := (e->>'shop_id')::uuid;
  me  := (e->>'id')::uuid;
  sajat := (me = p_employee_id);

  if not sajat and not coalesce((e->'can'->>'team')::boolean, false) then
    return jsonb_build_object('ok',false,'error','not_allowed',
      'message','Nu ai dreptul să setezi PIN-ul altui coleg.','need','team');
  end if;

  if not exists (select 1 from rpw_employees
                 where id = p_employee_id and shop_id = sid and active) then
    return jsonb_build_object('ok',false,'error','not_found',
      'message','Angajatul nu a fost găsit.');
  end if;

  hiba := rpw__pin_gyenge(p_new_pin);
  if hiba is not null then
    return jsonb_build_object('ok',false,'error','weak_pin','message',hiba);
  end if;

  -- 019: NINCS kolléga-PIN ütközés-ellenőrzés (az orákulum volt).

  update rpw_employees
     set pin_hash = crypt(btrim(p_new_pin), gen_salt('bf')), updated_at = now()
   where id = p_employee_id and shop_id = sid and active;
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok',false,'error','not_found',
      'message','Angajatul nu a fost găsit.');
  end if;

  delete from rpw_pin_attempt where employee_id = p_employee_id;

  begin
    if exists(select 1 from rpw_pin_log
              where shop_id=sid and rpw_employee_id=p_employee_id) then
      update rpw_pin_log set at=now(), self_set=sajat
       where shop_id=sid and rpw_employee_id=p_employee_id;
    else
      insert into rpw_pin_log(shop_id, rpw_employee_id, self_set, at)
      values (sid, p_employee_id, sajat, now());
    end if;
  exception when others then null;
  end;

  if not sajat then
    begin
      update app_session set revoked_at = now()
       where rpw_employee_id = p_employee_id and revoked_at is null;
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok',true,
    'message', case when sajat then 'PIN-ul tău a fost schimbat.'
                    else 'PIN-ul colegului a fost setat.' end);
end;
$function$;

-- ── 2a) Segéd: egy ügyfél-bejegyzés megtisztítása (vagy null) ───
create or replace function public.rpw__client_entry(p_e jsonb, p_job text, p_prefix text)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  pth text; elo text; k text; v jsonb; ki jsonb := '{}'::jsonb;
begin
  if p_e is null or jsonb_typeof(p_e) <> 'object' or jsonb_typeof(p_e->'path') is distinct from 'string' then
    return null;
  end if;
  pth := p_e->>'path';
  elo := p_job || '/' || p_prefix;
  if left(pth, length(elo)) <> elo or substr(pth, length(elo) + 1) !~ '^[A-Za-z0-9_.-]{1,160}$' then
    return null;
  end if;
  foreach k in array array['key','path','url','name','type','ts'] loop
    v := p_e->k;
    if v is not null and jsonb_typeof(v) in ('string','number','boolean') then
      ki := ki || jsonb_build_object(k, left(p_e->>k, 2000));
    end if;
  end loop;
  return ki || jsonb_build_object('src', 'whatsapp');
end;
$function$;

revoke all on function public.rpw__client_entry(jsonb, text, text) from public, anon, authenticated;

-- ── 2b) Ügyfél-feltöltés — összefésülés felülírás helyett ───────
create or replace function public.rpw_client_upload(p_job_id text, p_patch jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  engedett text[] := array['clientUploads','dosarActe','clientGata'];
  k text; slot text; bej jsonb; c jsonb;
  regi_version int; uj_version int; tid uuid;
  d jsonb; acte jsonb; szemely jsonb; sajat jsonb; szem_utak text[]; bejovo jsonb;
  van jsonb; latott text[]; g jsonb;
begin
  if p_job_id is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any(engedett)) then
      return jsonb_build_object('ok', false, 'error', 'forbidden_field', 'field', k);
    end if;
  end loop;

  select version, tenant_id, data into regi_version, tid, d
    from public.rpw_jobs where id = p_job_id and deleted_at is null
    for update;
  if regi_version is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  d := coalesce(d, '{}'::jsonb);

  -- lezárt munkára az ügyfél-link már nem ír
  if coalesce((d->>'inchis')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  -- dosarActe: rekeszenként
  if p_patch ? 'dosarActe' then
    if jsonb_typeof(p_patch->'dosarActe') <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_request');
    end if;
    acte := case when jsonb_typeof(d->'dosarActe') = 'object' then d->'dosarActe' else '{}'::jsonb end;
    for slot, bejovo in select * from jsonb_each(p_patch->'dosarActe') loop
      if slot !~ '^[A-Za-z0-9_]{1,40}$' then
        return jsonb_build_object('ok', false, 'error', 'bad_request');
      end if;
      -- a személyzet bejegyzései (minden, ami nem src=whatsapp) maradnak
      szemely := '[]'::jsonb; szem_utak := array[]::text[];
      for bej in select * from jsonb_array_elements(
                   case jsonb_typeof(acte->slot) when 'array' then acte->slot
                                                 when 'object' then jsonb_build_array(acte->slot)
                                                 else '[]'::jsonb end) loop
        if jsonb_typeof(bej) <> 'object' or (bej->>'src') is distinct from 'whatsapp' then
          szemely := szemely || jsonb_build_array(bej);
          if jsonb_typeof(bej) = 'object' and bej->>'path' is not null then
            szem_utak := szem_utak || (bej->>'path');
          end if;
        end if;
      end loop;
      -- az ügyfél érvényes bejegyzései (a visszaküldött személyzeti fájl nem duplázódik)
      sajat := '[]'::jsonb; latott := array[]::text[];
      for bej in select * from jsonb_array_elements(
                   case jsonb_typeof(bejovo) when 'array' then bejovo
                                             when 'object' then jsonb_build_array(bejovo)
                                             else '[]'::jsonb end) loop
        c := rpw__client_entry(bej, p_job_id, 'acta_');
        if c is not null and not ((c->>'path') = any(szem_utak)) and not ((c->>'path') = any(latott))
           and jsonb_array_length(szemely) + jsonb_array_length(sajat) < greatest(jsonb_array_length(szemely), 30) then
          sajat := sajat || jsonb_build_array(c);
          latott := latott || (c->>'path');
        end if;
      end loop;
      acte := acte || jsonb_build_object(slot, szemely || sajat);
    end loop;
    d := d || jsonb_build_object('dosarActe', acte);
  end if;

  -- clientUploads: csak hozzáfűzés
  if p_patch ? 'clientUploads' then
    if jsonb_typeof(p_patch->'clientUploads') not in ('array','object') then
      return jsonb_build_object('ok', false, 'error', 'bad_request');
    end if;
    van := case jsonb_typeof(d->'clientUploads') when 'array' then d->'clientUploads' else '[]'::jsonb end;
    latott := array(select e->>'path' from jsonb_array_elements(van) e
                     where jsonb_typeof(e) = 'object' and e->>'path' is not null);
    for bej in select * from jsonb_array_elements(
                 case jsonb_typeof(p_patch->'clientUploads') when 'array' then p_patch->'clientUploads'
                                                             else jsonb_build_array(p_patch->'clientUploads') end) loop
      c := rpw__client_entry(bej, p_job_id, 'client_');
      if c is not null and not ((c->>'path') = any(latott)) and jsonb_array_length(van) < 200 then
        van := van || jsonb_build_array(c);
        latott := latott || (c->>'path');
      end if;
    end loop;
    d := d || jsonb_build_object('clientUploads', van);
  end if;

  -- clientGata: csak {at, files}
  if p_patch ? 'clientGata' then
    g := p_patch->'clientGata';
    if jsonb_typeof(g) <> 'object' or jsonb_typeof(g->'at') is distinct from 'string' or length(g->>'at') > 40
       or jsonb_typeof(g->'files') is distinct from 'number' or (g->>'files') !~ '^[0-9]{1,4}$'
       or (g->>'files')::int > 1000 then
      return jsonb_build_object('ok', false, 'error', 'bad_request');
    end if;
    d := d || jsonb_build_object('clientGata', jsonb_build_object('at', g->>'at', 'files', (g->>'files')::int));
  end if;

  update public.rpw_jobs
     set data       = d,
         version    = version + 1,
         updated_at = now()
   where id = p_job_id and deleted_at is null
   returning version into uj_version;

  if to_regclass('public.rpw_audit') is not null then
    begin
      insert into public.rpw_audit(job_id, tenant_id, actor, action, patch,
                                   prev_version, new_version)
      values (p_job_id, tid, 'client_whatsapp', 'client_upload', p_patch,
              regi_version, uj_version);
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'version', uj_version);
end $function$;

commit;

-- ── ELLENŐRZÉS (csak olvas) — elvárt: mind true ─────────────────
select position('pin_taken' in pg_get_functiondef('public.rpw2_pin_set(text,uuid,text)'::regprocedure)) = 0 as nincs_orakulum,
       position('''closed''' in pg_get_functiondef('public.rpw_client_upload(text,jsonb)'::regprocedure)) > 0 as lezart_vedve,
       position('data || p_patch' in pg_get_functiondef('public.rpw_client_upload(text,jsonb)'::regprocedure)) = 0 as nincs_felulir,
       has_function_privilege('anon', 'public.rpw_client_upload(text,jsonb)', 'execute') as ugyfel_link_mukodik,
       not has_function_privilege('anon', 'public.rpw__client_entry(jsonb,text,text)', 'execute') as seged_zart;
