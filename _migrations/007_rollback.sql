-- 007 ROLLBACK — a PIN-zárolás kezelése és a PIN-minőség visszavonása
--  A `rpw2_pin_set` visszaáll a 004-es állapotra: csak hosszt ellenőriz.
begin;

drop function if exists public.rpw2_pin_status(text);
drop function if exists public.rpw2_pin_unlock(text,uuid);

-- a 004-es törzs, szó szerint
create or replace function public.rpw2_pin_set(p_token text, p_employee_id uuid, p_new_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; n int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if (e->>'id')::uuid <> p_employee_id
     and not coalesce((e->'can'->>'team')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;
  if p_new_pin is null or length(btrim(p_new_pin)) < 4 then
    return jsonb_build_object('ok',false,'error','pin_too_short','message','PIN prea scurt (minim 4 cifre).');
  end if;
  sid := (e->>'shop_id')::uuid;
  update rpw_employees set pin_hash = crypt(p_new_pin, gen_salt('bf')), pin_set_at = now()
   where id = p_employee_id and shop_id = sid and active;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
  insert into rpw_pin_log(shop_id, employee_id, set_by, self_set)
  values (sid, p_employee_id, (e->>'id')::uuid, (e->>'id')::uuid = p_employee_id);
  return jsonb_build_object('ok',true);
end;
$$;
grant execute on function public.rpw2_pin_set(text,uuid,text) to anon, authenticated;

drop function if exists public.rpw__pin_weak(text);

update public.rpw_schema_version set version='006', migrated_at=now() where id=1;
commit;

-- ELLENŐRZÉS: elvárt 0 sor
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('rpw2_pin_status','rpw2_pin_unlock','rpw__pin_weak');
-- elvárt: '006'
select version from public.rpw_schema_version;
