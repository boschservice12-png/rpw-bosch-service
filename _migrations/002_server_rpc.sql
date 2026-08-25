-- ════════════════════════════════════════════════════════════════
--  002 — MUNKAMENET- ÉS ADAT-RPC-K
--  ----------------------------------------------------------------
--  MINDEN adathozzáférés ezeken keresztül megy. A `shop_id` a
--  TOKENBŐL származik — soha nem a kliensből.
--
--  ⚠ ATOMI VERZIÓZÁR (a brief 3. pontja)
--  A régi minta — kiolvas, ellenőriz, majd feltétel nélkül ír —
--  NEM biztonságos: két párhuzamos kérés ugyanazzal az
--  expected_version értékkel is sikerülhet. Itt a verziófeltétel
--  MAGÁBAN AZ UPDATE-BEN van:
--        where ... and version = p_expected_version
--  Ha nem tér vissza sor, utólag döntjük el: not_found vagy
--  version_conflict.
--
--  ELŐFELTÉTEL: 001_base_schema.sql   ROLLBACK: 002_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

-- Előfeltétel-ellenőrzés: megszakad, ha a 001 nem futott
do $$
begin
  if to_regclass('public.rpw_jobs') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: futtasd előbb a 001_base_schema.sql fájlt';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════
--  MUNKAMENET
-- ════════════════════════════════════════════════════════════════

-- Belső: a token → dolgozó + szerviz + jogosultságok
create or replace function public.rpw__ctx(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare h text; r record;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  h := encode(digest(p_token, 'sha256'), 'hex');
  select e.id, e.name, e.shop_id, e.role_code,
         coalesce(ro.can, '{}'::jsonb) as can, s.expires_at, s.revoked_at
    into r
  from rpw_sessions s
  join rpw_employees e on e.id = s.employee_id
  left join rpw_roles ro on ro.shop_id = e.shop_id and ro.code = e.role_code
  where s.token_hash = h;

  if not found then return null; end if;
  if r.revoked_at is not null then return null; end if;
  if r.expires_at is null or r.expires_at <= now() then return null; end if;
  if not exists (select 1 from rpw_employees where id = r.id and active) then return null; end if;

  return jsonb_build_object('id', r.id, 'name', r.name, 'shop_id', r.shop_id,
                            'role_code', r.role_code, 'can', r.can);
end;
$$;

-- Nyilvános: munkamenet + jogosultság-kapcsolók
create or replace function public.rpw2_session(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb;
begin
  e := rpw__ctx(p_token);
  if e is null then
    return jsonb_build_object('ok', false, 'error', 'invalid',
                              'message', 'Sesiune invalidă sau expirată.');
  end if;
  return jsonb_build_object('ok', true, 'employee', e);
end;
$$;

create or replace function public.rpw2_can(p_token text, p_perm text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  return jsonb_build_object('ok', true,
    'allowed', coalesce((e->'can'->>p_perm)::boolean, false));
end;
$$;

-- Névsor a belépéshez — PIN NÉLKÜL, szándékosan nyilvános
create or replace function public.rpw2_roster(p_shop_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp
as $$
declare rows jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'name', e.name, 'role', coalesce(ro.label, e.role_code),
           'hasPin', (e.pin_hash is not null)) order by e.name), '[]'::jsonb)
    into rows
  from rpw_employees e
  left join rpw_roles ro on ro.shop_id=e.shop_id and ro.code=e.role_code
  where e.shop_id = p_shop_id and e.active;
  return jsonb_build_object('ok', true, 'rows', rows);
end;
$$;

create or replace function public.rpw2_login(p_shop_id uuid, p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e record; a record; tok text; h text;
begin
  select * into e from rpw_employees
   where id=p_employee_id and shop_id=p_shop_id and active;
  if not found then
    return jsonb_build_object('ok',false,'error','not_found','message','Angajat inexistent.');
  end if;

  -- ablakos zárolás: 10 rossz PIN → 15 perc
  select * into a from rpw_pin_attempt where employee_id=p_employee_id;
  if found and a.n >= 10 and a.window_start > now() - interval '15 minutes' then
    return jsonb_build_object('ok',false,'error','locked',
      'message','Prea multe încercări. Așteaptă 15 minute.');
  end if;

  if e.pin_hash is null or e.pin_hash <> crypt(p_pin, e.pin_hash) then
    insert into rpw_pin_attempt(employee_id, window_start, n) values (p_employee_id, now(), 1)
    on conflict (employee_id) do update set
      n = case when rpw_pin_attempt.window_start > now() - interval '15 minutes'
               then rpw_pin_attempt.n + 1 else 1 end,
      window_start = case when rpw_pin_attempt.window_start > now() - interval '15 minutes'
               then rpw_pin_attempt.window_start else now() end;
    return jsonb_build_object('ok',false,'error','bad_pin','message','PIN incorect.');
  end if;

  delete from rpw_pin_attempt where employee_id=p_employee_id;
  tok := encode(gen_random_bytes(32), 'hex');
  h   := encode(digest(tok,'sha256'),'hex');
  insert into rpw_sessions(token_hash, employee_id, shop_id, expires_at)
  values (h, e.id, e.shop_id, now() + interval '12 hours');
  update rpw_employees set last_login = now() where id = e.id;

  return jsonb_build_object('ok',true,'token',tok,
    'employee', rpw__ctx(tok));
end;
$$;

create or replace function public.rpw_logout(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
begin
  update rpw_sessions set revoked_at = now()
   where token_hash = encode(digest(coalesce(p_token,''),'sha256'),'hex')
     and revoked_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  ELUTASÍTÁS: stabil hibakód + ROMÁN üzenet + audit
-- ════════════════════════════════════════════════════════════════
create or replace function public.rpw__msg(p_code text)
returns text language sql immutable as $$
  select case p_code
    when 'not_found'                 then 'Dosarul nu a fost găsit.'
    when 'unauthorized'              then 'Sesiune invalidă sau expirată.'
    when 'bad_phase'                 then 'Fază invalidă.'
    when 'bad_action'                then 'Acțiune invalidă.'
    when 'job_closed'                then 'Lucrarea este închisă. Redeschide-o întâi.'
    when 'not_allowed'               then 'Nu ai dreptul pentru această operațiune.'
    when 'version_conflict'          then 'Alt coleg a modificat dosarul între timp. Reîncarcă.'
    when 'expected_version_required' then 'Versiunea dosarului este obligatorie.'
    when 'prev_not_closed'           then 'Faza anterioară nu este închisă.'
    when 'open_rework'               then 'Există rework deschis — nu se poate închide.'
    when 'already_done'              then 'Faza este deja închisă.'
    when 'reason_required'           then 'Motivul este obligatoriu.'
    when 'requirements_missing'      then 'Faza nu poate fi închisă.'
    else 'Operațiunea a fost respinsă.' end;
$$;

create or replace function public.rpw__deny(
  p_id text, p_shop uuid, p_actor text, p_phase int, p_action text,
  p_code text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
begin
  -- Az elutasított kísérlet auditba kerül — dokumentumtartalom NÉLKÜL.
  if p_shop is not null then
    begin
      insert into rpw_audit(job_id, tenant_id, actor, action, phase, patch)
      values (p_id, p_shop, p_actor, 'denied:'||p_code, p_phase::text,
              jsonb_build_object('action', p_action) || coalesce(p_extra,'{}'::jsonb));
    exception when others then
      -- Az audit hibája NEM teszi sikeressé a műveletet, és nem is
      -- rejti el az eredeti hibát — csak jelezzük a válaszban.
      return jsonb_build_object('ok',false,'error',p_code,'message',rpw__msg(p_code),
                                'audit_failed', true) || coalesce(p_extra,'{}'::jsonb);
    end;
  end if;
  return jsonb_build_object('ok',false,'error',p_code,'message',rpw__msg(p_code))
         || coalesce(p_extra,'{}'::jsonb);
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  MUNKÁK — bérlővédetten
-- ════════════════════════════════════════════════════════════════

-- EGYETLEN listázó RPC: p_trashed dönti el, mit ad vissza
create or replace function public.rpw_jobs_list(p_token text, p_trashed boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; rows jsonb;
begin
  e := rpw__ctx(p_token);
  if e is null then
    return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized'));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', j.id, 'data', j.data, 'version', j.version,
           'updated_at', j.updated_at, 'deleted_at', j.deleted_at)
         order by j.updated_at desc), '[]'::jsonb)
    into rows
  from rpw_jobs j
  where j.shop_id = (e->>'shop_id')::uuid
    and (case when p_trashed then j.deleted_at is not null else j.deleted_at is null end);
  return jsonb_build_object('ok', true, 'rows', rows, 'version', null);
end;
$$;

create or replace function public.rpw_job_get(p_token text, p_id text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; j record;
begin
  e := rpw__ctx(p_token);
  if e is null then
    return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized'));
  end if;
  select * into j from rpw_jobs
   where id=p_id and shop_id=(e->>'shop_id')::uuid and deleted_at is null;
  if not found then
    -- Idegen VAGY nem létező: NEM különböztetjük meg.
    return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found'));
  end if;
  return jsonb_build_object('ok',true,'data',
    jsonb_build_object('id',j.id,'data',j.data,'version',j.version,'updated_at',j.updated_at));
end;
$$;

-- ── MENTÉS — ATOMI verziózárral ─────────────────────────────────
create or replace function public.rpw_patch_v3(
  p_token text, p_id text, p_patch jsonb,
  p_expected_version integer default null, p_phase text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; me text; merged jsonb; new_ver int; exists_here boolean;
begin
  e := rpw__ctx(p_token);
  if e is null then
    return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized'));
  end if;
  sid := (e->>'shop_id')::uuid; me := e->>'name';

  -- ÚJ munka: nincs mit ütköztetni
  if not exists (select 1 from rpw_jobs where id = p_id) then
    insert into rpw_jobs(id, shop_id, data, version) values (p_id, sid, p_patch, 1)
    on conflict (id) do nothing
    returning data, version into merged, new_ver;
    if merged is not null then
      insert into rpw_audit(job_id,tenant_id,actor,action,phase,patch,prev_version,new_version)
      values (p_id, sid, me, 'create', p_phase, p_patch, null, new_ver);
      return jsonb_build_object('ok',true,'data',merged,'version',new_ver);
    end if;
    -- versenyhelyzet: közben létrejött → esünk tovább a frissítési ágra
  end if;

  -- MEGLÉVŐ munka: a verzió KÖTELEZŐ
  if p_expected_version is null then
    return rpw__deny(p_id, sid, me, null, 'patch', 'expected_version_required');
  end if;

  -- ⚠ ATOMI: a verziófeltétel MAGÁBAN az UPDATE-ben van.
  update rpw_jobs
     set data = jsonb_deep_merge(data, p_patch),
         version = version + 1,
         updated_at = now()
   where id = p_id
     and shop_id = sid
     and deleted_at is null
     and version = p_expected_version
  returning data, version into merged, new_ver;

  if merged is null then
    -- Nem írt: vagy nincs itt, vagy más verzió van. Most döntjük el.
    select exists(select 1 from rpw_jobs
                   where id=p_id and shop_id=sid and deleted_at is null)
      into exists_here;
    if not exists_here then
      return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found'));
    end if;
    return rpw__deny(p_id, sid, me, null, 'patch', 'version_conflict',
      jsonb_build_object('server_version',
        (select version from rpw_jobs where id=p_id and shop_id=sid)));
  end if;

  insert into rpw_audit(job_id,tenant_id,actor,action,phase,patch,prev_version,new_version)
  values (p_id, sid, me, 'patch', p_phase, p_patch, p_expected_version, new_ver);
  return jsonb_build_object('ok',true,'data',merged,'version',new_ver);
end;
$$;

-- ── Kosár / visszaállítás / végleges törlés ─────────────────────
create or replace function public.rpw_job_trash(p_token text, p_id text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; n int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  sid := (e->>'shop_id')::uuid;
  update rpw_jobs set deleted_at = now(), updated_at = now()
   where id=p_id and shop_id=sid and deleted_at is null;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
  insert into rpw_audit(job_id,tenant_id,actor,action) values (p_id,sid,e->>'name','trash');
  return jsonb_build_object('ok',true,'data',jsonb_build_object('id',p_id));
end;
$$;

create or replace function public.rpw_job_restore(p_token text, p_id text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; n int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'delete')::boolean,false) then
    return rpw__deny(p_id,(e->>'shop_id')::uuid,e->>'name',null,'restore','not_allowed',
                     jsonb_build_object('need','delete'));
  end if;
  sid := (e->>'shop_id')::uuid;
  update rpw_jobs set deleted_at = null, updated_at = now()
   where id=p_id and shop_id=sid and deleted_at is not null;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
  insert into rpw_audit(job_id,tenant_id,actor,action) values (p_id,sid,e->>'name','restore');
  return jsonb_build_object('ok',true,'data',jsonb_build_object('id',p_id));
end;
$$;

create or replace function public.rpw_job_purge(p_token text, p_id text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; n int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  if not coalesce((e->'can'->>'delete')::boolean,false) then
    return rpw__deny(p_id,(e->>'shop_id')::uuid,e->>'name',null,'purge','not_allowed',
                     jsonb_build_object('need','delete'));
  end if;
  sid := (e->>'shop_id')::uuid;
  delete from rpw_jobs where id=p_id and shop_id=sid and deleted_at is not null;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
  insert into rpw_audit(job_id,tenant_id,actor,action) values (p_id,sid,e->>'name','purge');
  return jsonb_build_object('ok',true,'data',jsonb_build_object('id',p_id));
end;
$$;

-- ── Atomi munkaszám ─────────────────────────────────────────────
create or replace function public.rpw_job_number(p_token text, p_prefix text default 'RPW')
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; v int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  sid := (e->>'shop_id')::uuid;
  insert into rpw_job_counters(shop_id, prefix, n) values (sid, p_prefix, 1)
  on conflict (shop_id, prefix) do update set n = rpw_job_counters.n + 1
  returning n into v;
  return jsonb_build_object('ok',true,'data',
    jsonb_build_object('n',v,'number',p_prefix||'-'||lpad(v::text,5,'0')));
end;
$$;

update public.rpw_schema_version set version='002', migrated_at=now() where id=1;
commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS
-- ════════════════════════════════════════════════════════════════
-- 1) Minden RPC létezik — elvárt 14 sor
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in
 ('rpw__ctx','rpw2_session','rpw2_can','rpw2_roster','rpw2_login','rpw_logout',
  'rpw__msg','rpw__deny','rpw_jobs_list','rpw_job_get','rpw_patch_v3',
  'rpw_job_trash','rpw_job_restore','rpw_job_purge','rpw_job_number')
order by 1;

-- 2) Az atomi zár tényleg az UPDATE-ben van — elvárt: true
select pg_get_functiondef('public.rpw_patch_v3(text,text,jsonb,integer,text)'::regprocedure)
       like '%and version = p_expected_version%' as atomi_zar;

-- 3) elvárt: '002'
select version from public.rpw_schema_version;
