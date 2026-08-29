-- ════════════════════════════════════════════════════════════════
--  010 ROLLBACK — vissza a CSAK RÉGI (ERP) vonalat ismerő változatra
--  FIGYELEM: ezután a rpw2_login-nal készült munkameneteket a szerver
--  ismét nem találja meg, és a panel ÜRES lesz bekapcsolt beléptetésnél.
-- ════════════════════════════════════════════════════════════════
begin;

create or replace function public.rpw_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare s record;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false, 'error', 'no_token');
  end if;

  select a.employee_id, a.shop_id, a.expires_at, e.name, e.role, e.department, e.is_active
    into s
  from app_session a
  join employees e on e.id = a.employee_id
  where a.token_hash = encode(digest(p_token,'sha256'),'hex')
    and a.revoked_at is null
  limit 1;

  if s.employee_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if s.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if coalesce(s.is_active,false) = false then
    return jsonb_build_object('ok', false, 'error', 'inactive');
  end if;

  update app_session
     set last_seen_at = now(),
         expires_at   = greatest(expires_at, now() + interval '4 hours')
   where token_hash = encode(digest(p_token,'sha256'),'hex');

  return jsonb_build_object('ok', true,
    'employee', jsonb_build_object(
      'id', s.employee_id, 'name', btrim(s.name), 'role', s.role,
      'department', s.department, 'shop_id', s.shop_id));
end;
$function$;

commit;
