-- ════════════════════════════════════════════════════════════════
--  004 — SZEMÉLYZET, POSZTOK ÉS A KIVEZETÉS ALATTI UTAK
--  ----------------------------------------------------------------
--  Ezeket az RPC-ket a kliens MA is hívja. A 002–004 nem tartalmazta
--  őket — az RPC-konzisztencia teszt találta meg a hiányt.
--
--  A fájl VÉGÉN a kivezetés alatti (legacy) utak: léteznek, hogy a
--  `v2` fejlesztői konfiguráció működjön, de a 004 NEM ad rájuk
--  jogot, tehát production-ban nem hívhatók.
--
--  ELŐFELTÉTEL: 002    ROLLBACK: 004_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regprocedure('public.rpw__ctx(text)') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: futtasd előbb a 002_server_rpc.sql fájlt';
  end if;
end $$;

-- ── CSAPAT ───────────────────────────────────────────────────────
create or replace function public.rpw2_team(p_token text, p_include_left boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; emps jsonb; roles jsonb;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'team')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',x.id,'name',x.name,'role_code',x.role_code,'active',x.active,
           'hasPin',(x.pin_hash is not null),'pin_set_at',x.pin_set_at,
           'last_login',x.last_login,'left_at',x.left_at) order by x.active desc, x.name),'[]'::jsonb)
    into emps
  from rpw_employees x
  where x.shop_id=(e->>'shop_id')::uuid and (p_include_left or x.active);
  select coalesce(jsonb_agg(jsonb_build_object(
           'code',r.code,'label',r.label,'can',r.can,'sort_order',r.sort_order,
           'active',r.active) order by r.sort_order, r.code),'[]'::jsonb)
    into roles
  from rpw_roles r where r.shop_id=(e->>'shop_id')::uuid;
  return jsonb_build_object('ok',true,'employees',emps,'roles',roles);
end;
$$;

create or replace function public.rpw2_employee_save(
  p_token text, p_id uuid default null, p_name text default null,
  p_role_code text default null, p_phone text default null,
  p_active boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; nid uuid; mgrs int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'team')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;
  sid := (e->>'shop_id')::uuid;

  -- A szerviz nem maradhat csapatkezelő nélkül
  if p_id is not null and p_active = false then
    select count(*) into mgrs from rpw_employees x
      join rpw_roles r on r.shop_id=x.shop_id and r.code=x.role_code
     where x.shop_id=sid and x.active and x.id <> p_id
       and coalesce((r.can->>'team')::boolean,false);
    if mgrs = 0 then
      return jsonb_build_object('ok',false,'error','last_manager_lock',
        'message','Nu poți dezactiva ultimul coordonator de echipă.');
    end if;
  end if;

  if p_id is null then
    insert into rpw_employees(shop_id,name,role_code,phone,active)
    values (sid, p_name, p_role_code, p_phone, coalesce(p_active,true)) returning id into nid;
  else
    update rpw_employees set
      name = coalesce(p_name, name),
      role_code = coalesce(p_role_code, role_code),
      phone = coalesce(p_phone, phone),
      active = coalesce(p_active, active),
      left_at = case when p_active = false then now() else null end,
      -- KILÉPTETÉSKOR a PIN törlődik és a munkamenetek visszavonva
      pin_hash = case when p_active = false then null else pin_hash end
     where id = p_id and shop_id = sid returning id into nid;
    if p_active = false then
      update rpw_sessions set revoked_at = now()
       where employee_id = p_id and revoked_at is null;
    end if;
  end if;
  if nid is null then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('id',nid));
end;
$$;

create or replace function public.rpw2_pin_set(p_token text, p_employee_id uuid, p_new_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; n int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  -- saját PIN mindig állítható; másé csak `team` joggal
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

create or replace function public.rpw2_role_save(
  p_token text, p_code text, p_label text, p_can jsonb,
  p_sort int default 100, p_active boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'team')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;
  sid := (e->>'shop_id')::uuid;
  insert into rpw_roles(shop_id,code,label,can,sort_order,active)
  values (sid,p_code,p_label,coalesce(p_can,'{}'::jsonb),coalesce(p_sort,100),coalesce(p_active,true))
  on conflict (shop_id,code) do update set
    label=excluded.label, can=excluded.can,
    sort_order=excluded.sort_order, active=excluded.active;
  return jsonb_build_object('ok',true);
end;
$$;

-- ── POSZTOK ──────────────────────────────────────────────────────
create or replace function public.rpw_posts_get(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; rows jsonb;
begin
  -- ⚠ VOLATILE, nem STABLE! A rpw__ctx munkamenetet olvas; a PostgREST
  -- a STABLE függvényeket read-only tranzakcióban futtatja, és ott a
  -- bővítés elszállna. Ezt egyszer már megtanultuk élesben.
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'code',p.code,'label',p.label,'employee_id',p.employee_id,
           'employee_name',x.name,'sort_order',p.sort_order,'active',p.active)
         order by p.sort_order, p.code),'[]'::jsonb) into rows
  from rpw_posts p left join rpw_employees x on x.id=p.employee_id
  where p.shop_id=(e->>'shop_id')::uuid and p.active;
  return jsonb_build_object('ok',true,'rows',rows);
end;
$$;

create or replace function public.rpw_post_assign(p_token text, p_code text, p_employee_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; n int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'posts')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;
  -- idegen szerviz dolgozója nem tehető posztra
  if p_employee_id is not null and not exists(
       select 1 from rpw_employees where id=p_employee_id and shop_id=(e->>'shop_id')::uuid and active) then
    return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found'));
  end if;
  update rpw_posts set employee_id = p_employee_id
   where code = p_code and shop_id = (e->>'shop_id')::uuid;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.rpw_post_upsert(
  p_token text, p_code text, p_label text, p_note text default null,
  p_sort int default 100, p_active boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'posts')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;
  insert into rpw_posts(shop_id,code,label,note,sort_order,active)
  values ((e->>'shop_id')::uuid,p_code,p_label,p_note,coalesce(p_sort,100),coalesce(p_active,true))
  on conflict (shop_id,code) do update set
    label=excluded.label, note=excluded.note,
    sort_order=excluded.sort_order, active=excluded.active;
  return jsonb_build_object('ok',true);
end;
$$;

-- ── KARBANTARTÁS ─────────────────────────────────────────────────
create or replace function public.rpw_cleanup_list(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; rows jsonb;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'delete')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'uid',j.id,'plate',j.data->>'plate','number',j.data->>'number',
           'deleted_at',j.deleted_at) order by j.deleted_at desc),'[]'::jsonb) into rows
  from rpw_jobs j
  where j.shop_id=(e->>'shop_id')::uuid and j.deleted_at is not null;
  return jsonb_build_object('ok',true,'rows',rows);
end;
$$;

create or replace function public.rpw_cleanup_hard_delete(p_token text, p_id text, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; n int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'delete')::boolean,false) then
    return jsonb_build_object('ok',false,'error','not_allowed','message',rpw__msg('not_allowed'));
  end if;
  if btrim(coalesce(p_reason,'')) = '' then
    return jsonb_build_object('ok',false,'error','reason_required','message',rpw__msg('reason_required'));
  end if;
  sid := (e->>'shop_id')::uuid;
  delete from rpw_jobs where id=p_id and shop_id=sid and deleted_at is not null;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
  insert into rpw_audit(job_id,tenant_id,actor,action,patch)
  values (p_id,sid,e->>'name','hard_delete',jsonb_build_object('reason',p_reason));
  return jsonb_build_object('ok',true);
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  KIVEZETÉS ALATT — csak a `v2` fejlesztői konfigurációhoz.
--  A 004 NEM ad rájuk jogot, tehát production-ban NEM hívhatók.
-- ════════════════════════════════════════════════════════════════
create or replace function public.rpw_next_job_number(p_prefix text default 'RPW')
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
begin
  -- ⚠ NINCS bérlővédelem — ezért nem kap grantot a 004-ben.
  return jsonb_build_object('ok',false,'error','deprecated',
    'message','Folosește rpw_job_number(p_token, p_prefix).');
end;
$$;

create or replace function public.rpw_patch(p_id text, p_patch jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
begin
  -- ⚠ NINCS bérlővédelem és nincs verziózár.
  return jsonb_build_object('ok',false,'error','deprecated',
    'message','Folosește rpw_patch_v3(p_token, ...).');
end;
$$;

create or replace function public.rpw_login(p_shop_id uuid, p_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
begin
  -- ⚠ Régi, PIN-ütközésre hajlamos belépés (név nélkül).
  return jsonb_build_object('ok',false,'error','deprecated',
    'message','Folosește rpw2_login(p_shop_id, p_employee_id, p_pin).');
end;
$$;

create or replace function public.rpw_team(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
begin
  return jsonb_build_object('ok',false,'error','deprecated',
    'message','Folosește rpw2_team(p_token, p_include_left).');
end;
$$;

update public.rpw_schema_version set version='004', migrated_at=now() where id=1;
commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS
-- ════════════════════════════════════════════════════════════════
-- 1) elvárt 12 sor
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in
 ('rpw2_team','rpw2_employee_save','rpw2_pin_set','rpw2_role_save',
  'rpw_posts_get','rpw_post_assign','rpw_post_upsert',
  'rpw_cleanup_list','rpw_cleanup_hard_delete',
  'rpw_next_job_number','rpw_patch','rpw_login','rpw_team')
order by 1;

-- 2) A posztok VOLATILE-ok (a PostgREST read-only tranzakciója miatt)
--    elvárt: 'v'
select provolatile from pg_proc where proname='rpw_posts_get';

-- 3) elvárt: '004'
select version from public.rpw_schema_version;
