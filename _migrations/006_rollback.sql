-- ════════════════════════════════════════════════════════════════
--  006 ROLLBACK — a workflow-kikényszerítés visszavonása
--  ⚠ Ezután a normál patch ÚJRA módosíthatja a workflow-mezőket.
--  ELŐBB: a kliensen SERVER_TRANSITIONS:false
-- ════════════════════════════════════════════════════════════════
begin;

-- 1) A V3 patch visszaállítása (védelem nélkül, de atomi zárral)
create or replace function public.rpw_patch_v3(
  p_token text, p_id text, p_patch jsonb,
  p_expected_version integer default null, p_phase text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; me text; merged jsonb; new_ver int; exists_here boolean;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  sid := (e->>'shop_id')::uuid; me := e->>'name';
  if not exists (select 1 from rpw_jobs where id = p_id) then
    insert into rpw_jobs(id, shop_id, data, version) values (p_id, sid, p_patch, 1)
    on conflict (id) do nothing returning data, version into merged, new_ver;
    if merged is not null then
      insert into rpw_audit(job_id,tenant_id,actor,action,phase,patch,prev_version,new_version)
      values (p_id, sid, me, 'create', p_phase, p_patch, null, new_ver);
      return jsonb_build_object('ok',true,'data',merged,'version',new_ver);
    end if;
  end if;
  if p_expected_version is null then
    return rpw__deny(p_id, sid, me, null, 'patch', 'expected_version_required');
  end if;
  update rpw_jobs set data = jsonb_deep_merge(data, p_patch),
         version = version + 1, updated_at = now()
   where id = p_id and shop_id = sid and deleted_at is null
     and version = p_expected_version
  returning data, version into merged, new_ver;
  if merged is null then
    select exists(select 1 from rpw_jobs where id=p_id and shop_id=sid and deleted_at is null) into exists_here;
    if not exists_here then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
    return rpw__deny(p_id, sid, me, null, 'patch', 'version_conflict',
      jsonb_build_object('server_version',(select version from rpw_jobs where id=p_id and shop_id=sid)));
  end if;
  insert into rpw_audit(job_id,tenant_id,actor,action,phase,patch,prev_version,new_version)
  values (p_id, sid, me, 'patch', p_phase, p_patch, p_expected_version, new_ver);
  return jsonb_build_object('ok',true,'data',merged,'version',new_ver);
end;
$$;

-- 2) A V3 trash visszaállítása (delete-jog nélkül)
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

-- 3) A V3 transition szignatúra visszaállítása (6 paraméter)
drop function if exists public.rpw_transition(text,text,int,text,int,text,text,text);

create or replace function public.rpw_transition(
  p_token text, p_id text, p_phase int, p_action text,
  p_expected_version int default null, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; me text; can jsonb; j record; d jsonb; new_ver int; ph text;
        cur text; prev text; need text; miss jsonb; has_override boolean; exists_here boolean;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  sid := (e->>'shop_id')::uuid; me := e->>'name'; can := e->'can';
  has_override := coalesce((can->>'override')::boolean,false);
  select * into j from rpw_jobs where id=p_id and shop_id=sid and deleted_at is null;
  if not found then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
  d := j.data;
  if p_phase is null or p_phase < 1 or p_phase > 7 then return rpw__deny(p_id,sid,me,p_phase,p_action,'bad_phase'); end if;
  if p_action is null or p_action not in ('start','complete','skip','reopen','rework_open','rework_close') then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'bad_action'); end if;
  if p_expected_version is null then return rpw__deny(p_id,sid,me,p_phase,p_action,'expected_version_required'); end if;
  if p_action in ('skip','reopen') and btrim(coalesce(p_reason,''))='' then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'reason_required'); end if;
  if coalesce(d->>'inchis','false')='true' and p_action <> 'reopen' then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'job_closed'); end if;
  need := case when p_action in ('reopen','skip') then 'override'
               when p_phase = 7 and p_action='complete' then 'close' else 'work' end;
  if not coalesce((can->>need)::boolean,false) then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'not_allowed',jsonb_build_object('need',need)); end if;
  ph := p_phase::text;
  cur := coalesce(d->'phases'->ph->>'status','pending');
  prev := case when p_phase=1 then 'done' else coalesce(d->'phases'->((p_phase-1)::text)->>'status','pending') end;
  if p_action in ('start','complete') and prev not in ('done','skipped') and not has_override then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'prev_not_closed',
      jsonb_build_object('prev_phase',p_phase-1,'prev_status',prev)); end if;
  if p_action='complete' and exists(select 1 from jsonb_array_elements(coalesce(d->'rework','[]'::jsonb)) r
     where coalesce(r->>'status','open')='open') and not has_override then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'open_rework'); end if;
  if p_action='complete' then
    miss := rpw__missing(sid, d, p_phase, 'complete', has_override);
    if jsonb_array_length(miss) > 0 then
      return rpw__deny(p_id,sid,me,p_phase,p_action,'requirements_missing',jsonb_build_object('missing',miss)); end if;
  end if;
  if p_action='start' then
    if cur='done' then return rpw__deny(p_id,sid,me,p_phase,p_action,'already_done'); end if;
    d := jsonb_set(d, array['phases',ph], coalesce(d->'phases'->ph,'{}'::jsonb) || jsonb_build_object('status','active','started',now()));
    d := jsonb_set(d,'{phase}',to_jsonb(p_phase));
  elsif p_action='complete' then
    if cur='done' then return rpw__deny(p_id,sid,me,p_phase,p_action,'already_done'); end if;
    d := jsonb_set(d, array['phases',ph], coalesce(d->'phases'->ph,'{}'::jsonb)
         || jsonb_build_object('status','done','finished',now(),'completedBy',coalesce(me,'')));
    if p_phase < 7 then
      d := jsonb_set(d, array['phases',(p_phase+1)::text], coalesce(d->'phases'->((p_phase+1)::text),'{}'::jsonb)
           || jsonb_build_object('status','active','started',now()));
      d := jsonb_set(d,'{phase}',to_jsonb(p_phase+1));
    else d := jsonb_set(d,'{inchis}','true'::jsonb); end if;
  elsif p_action='skip' then
    d := jsonb_set(d, array['phases',ph], coalesce(d->'phases'->ph,'{}'::jsonb)
         || jsonb_build_object('status','skipped','finished',now(),'reason',p_reason));
  elsif p_action='reopen' then
    d := jsonb_set(d, array['phases',ph], coalesce(d->'phases'->ph,'{}'::jsonb)
         || jsonb_build_object('status','active','reopened',now(),'reason',p_reason));
    d := jsonb_set(d,'{phase}',to_jsonb(p_phase));
    d := jsonb_set(d,'{inchis}','false'::jsonb);
  elsif p_action='rework_open' then
    d := jsonb_set(d,'{rework}', coalesce(d->'rework','[]'::jsonb) ||
         jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'phase',p_phase,
           'status','open','reason',coalesce(p_reason,''),'by',coalesce(me,''),'at',now())));
  else
    d := jsonb_set(d,'{rework}', (select coalesce(jsonb_agg(case when coalesce(r->>'status','open')='open'
             and (p_reason is null or r->>'id' = p_reason)
           then r || jsonb_build_object('status','closed','closedBy',coalesce(me,''),'closedAt',now())
           else r end),'[]'::jsonb) from jsonb_array_elements(coalesce(d->'rework','[]'::jsonb)) r));
  end if;
  update rpw_jobs set data = d, version = version + 1, updated_at = now()
   where id = p_id and shop_id = sid and deleted_at is null and version = p_expected_version
  returning version into new_ver;
  if new_ver is null then
    select exists(select 1 from rpw_jobs where id=p_id and shop_id=sid and deleted_at is null) into exists_here;
    if not exists_here then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
    return rpw__deny(p_id,sid,me,p_phase,p_action,'version_conflict',
      jsonb_build_object('server_version',(select version from rpw_jobs where id=p_id and shop_id=sid)));
  end if;
  insert into rpw_audit(job_id,tenant_id,actor,action,phase,patch,prev_version,new_version)
  values (p_id,sid,me,'transition:'||p_action,ph,jsonb_build_object('action',p_action,'reason',p_reason),
          p_expected_version,new_ver);
  return jsonb_build_object('ok',true,'data',d,'version',new_ver);
end;
$$;
grant execute on function public.rpw_transition(text,text,int,text,int,text) to anon, authenticated;

-- 4) A V3 capability visszaállítása
create or replace function public.rpw_server_capabilities()
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp
as $$
declare rls_on boolean; anon_policy boolean;
begin
  select relrowsecurity and relforcerowsecurity into rls_on from pg_class where oid='public.rpw_jobs'::regclass;
  select exists(select 1 from pg_policy where polrelid='public.rpw_jobs'::regclass) into anon_policy;
  return jsonb_build_object('ok',true,
    'schema_version',(select version from rpw_schema_version where id=1),
    'rpcs',(select coalesce(jsonb_agg(proname order by proname),'[]'::jsonb) from pg_proc p
            join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and proname like 'rpw%' and not proname like 'rpw\_\_%'),
    'rls_locked', coalesce(rls_on,false) and not anon_policy,
    'rules_version',(select coalesce(max(active_version),1) from rpw_phase_requirements),
    'business_gates_server_side', true, 'storage_mode','private', 'server_time', now());
end;
$$;

-- 5) A V4 táblák és segédek eltávolítása
drop function if exists public.rpw__patch_needs(jsonb,jsonb);
drop function if exists public.rpw__protected_hits(jsonb);
drop function if exists public.rpw__patch_paths(jsonb,text);
drop function if exists public.rpw__path_matches(text[],text);
drop table if exists public.rpw_patch_permissions  cascade;
drop table if exists public.rpw_protected_fields   cascade;

update public.rpw_schema_version set version='005', migrated_at=now() where id=1;
commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — a V3 állapot visszaállt
-- ════════════════════════════════════════════════════════════════
-- 1) elvárt 0 sor
select tablename from pg_tables where schemaname='public'
  and tablename in ('rpw_protected_fields','rpw_patch_permissions');

-- 2) elvárt: a 6 paraméteres szignatúra
select pg_get_function_identity_arguments(oid) as args from pg_proc where proname='rpw_transition';

-- 3) elvárt: false (a V3 patch nem véd)
select pg_get_functiondef('public.rpw_patch_v3(text,text,jsonb,integer,text)'::regprocedure)
       like '%protected_workflow_field%' as patch_vedett;

-- 4) elvárt: '005'
select version from public.rpw_schema_version;
