-- 019 VISSZAÚT — a 2026-11-23-i élő definíciók szó szerint (pg_get_functiondef), + a segéd törlése.
begin;

CREATE OR REPLACE FUNCTION public.rpw2_pin_set(p_token text, p_employee_id uuid, p_new_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  s jsonb; e jsonb; sid uuid; me uuid; sajat boolean;
  hiba text; utkozo uuid; n int;
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

  utkozo := rpw__pin_utkozik(sid, btrim(p_new_pin), p_employee_id);
  if utkozo is not null then
    return jsonb_build_object('ok',false,'error','pin_taken',
      'message','Acest PIN este deja folosit de un coleg. Alege altul.');
  end if;

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

CREATE OR REPLACE FUNCTION public.rpw_client_upload(p_job_id text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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

drop function if exists public.rpw__client_entry(jsonb, text, text);

commit;
