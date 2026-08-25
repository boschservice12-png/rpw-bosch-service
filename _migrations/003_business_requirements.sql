-- ════════════════════════════════════════════════════════════════
--  003 — ÜZLETI KÖVETELMÉNYEK + FÁZISÁTMENETEK
--  ----------------------------------------------------------------
--  A brief 7. pontja: „Ne másolj kézzel két külön üzleti
--  szabályrendszert a JavaScriptbe és az SQL-be."
--
--  EGY SZABÁLYFORRÁS: az `rpw_phase_requirements` tábla.
--    · a SZERVER ebből ellenőriz a lezárás előtt
--    · a KLIENS ugyanezt kéri le (`rpw_requirements`) UX-előnézethez
--  Így nincs két igazság, ami idővel szétcsúszik.
--
--  Az ellenőrzés ADATÚT alapú: a szabály megmondja, hol keresse az
--  értéket a job JSONB-jében, és milyen típusú ellenőrzés kell.
--
--  ELŐFELTÉTEL: 002_server_rpc.sql    ROLLBACK: 003_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regprocedure('public.rpw__ctx(text)') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: futtasd előbb a 002_server_rpc.sql fájlt';
  end if;
end $$;

-- ── A SZABÁLYTÁBLA ───────────────────────────────────────────────
create table if not exists public.rpw_phase_requirements (
  id             bigserial primary key,
  shop_id        uuid,                 -- NULL = minden szervizre érvényes alapszabály
  phase          smallint not null check (phase between 1 and 7),
  action         text not null default 'complete',   -- complete | start | skip | reopen
  code           text not null,        -- pl. wf_talon_missing
  data_path      text[] not null,      -- hol keresse: '{docs}' vagy '{closing,factura}'
  check_type     text not null,        -- present | non_empty | array_non_empty | true | array_has
  check_arg      text,                 -- array_has esetén a keresett típus
  required       boolean not null default true,
  severity       text not null default 'block',      -- block | warn
  override_ok    boolean not null default false,     -- felülbírálható-e override joggal
  message_ro     text not null,
  active_version int not null default 1,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (shop_id, phase, action, code)
);
create index if not exists rpw_phase_req_idx
  on public.rpw_phase_requirements(phase, action) where active;

-- ── ALAPSZABÁLYOK (shop_id = NULL) ───────────────────────────────
-- Ezek a `rpw-workflow.js` ma élő szabályaiból származnak. A kódok
-- SZÁNDÉKOSAN azonosak, hogy a kliens fordításai változatlanul
-- működjenek.
insert into public.rpw_phase_requirements
  (shop_id, phase, action, code, data_path, check_type, check_arg, required, severity, override_ok, message_ro)
values
  -- 1. fázis — recepció
  (null,1,'complete','wf_worktype_missing',  '{damageType}',        'non_empty',       null, true,'block',false,'Tipul lucrării lipsește.'),
  (null,1,'complete','wf_talon_missing',     '{docs}',              'array_has',    'talon', true,'block',false,'Talonul lipsește.'),
  (null,1,'complete','wf_constatare_missing','{docs}',              'array_has','constatare',true,'block',true ,'Constatarea lipsește.'),
  (null,1,'complete','wf_nrdosar_missing',   '{nrDosar}',           'non_empty',       null, true,'block',true ,'Numărul de dosar lipsește.'),
  (null,1,'complete','wf_photos_missing',    '{photos}',            'array_non_empty', null, true,'block',true ,'Lipsesc fotografiile obligatorii.'),
  -- 2. fázis — értékelés / deviz
  (null,2,'complete','wf_eval_not_final',    '{evalData,status}',   'non_empty',       null, true,'block',false,'Evaluarea nu este finalizată.'),
  (null,2,'complete','wf_no_deviz',          '{deviz}',             'present',         null, true,'block',true ,'Devizul lipsește.'),
  -- 3. fázis — visszaszemle
  (null,3,'complete','wf_reconst_no_response','{reconst,responseDate}','non_empty',     null, true,'block',true ,'Lipsește răspunsul la reconstatare.'),
  -- 4. fázis — bádogos
  (null,4,'complete','wf_no_work_rows',      '{bodyRows}',          'array_non_empty', null, true,'block',true ,'Nu există operațiuni de tinichigerie.'),
  -- 5. fázis — fényezés
  (null,5,'complete','wf_no_paint_rows',     '{paintRows}',         'array_non_empty', null, true,'block',true ,'Nu există operațiuni de vopsitorie.'),
  -- 6. fázis — végellenőrzés
  (null,6,'complete','wf_control_incomplete','{control,allDone}',   'true',            null, true,'block',false,'Controlul final nu este complet.'),
  (null,6,'complete','wf_control_nok',       '{control,lastResult}','not_nok',         null, true,'block',false,'Controlul final este NOK.'),
  -- 7. fázis — lezárás
  (null,7,'complete','wf_no_invoice',        '{closing,factura}',   'non_empty',       null, true,'block',false,'Factura lipsește.'),
  (null,7,'complete','wf_no_deviz_ref',      '{closing,devizRef}',  'non_empty',       null, true,'block',true ,'Referința devizului lipsește.')
on conflict (shop_id, phase, action, code) do nothing;

-- ── EGY ÉRTÉK KIÉRTÉKELÉSE ───────────────────────────────────────
create or replace function public.rpw__check_one(
  p_data jsonb, p_path text[], p_check text, p_arg text default null)
returns boolean
language plpgsql immutable as $$
declare v jsonb;
begin
  v := p_data #> p_path;
  if p_check = 'present' then
    return v is not null and v <> 'null'::jsonb;
  elsif p_check = 'non_empty' then
    return v is not null and v <> 'null'::jsonb
       and btrim(coalesce(v #>> '{}', '')) <> '';
  elsif p_check = 'array_non_empty' then
    return v is not null and jsonb_typeof(v) = 'array' and jsonb_array_length(v) > 0;
  elsif p_check = 'array_has' then
    return v is not null and jsonb_typeof(v) = 'array' and exists (
      select 1 from jsonb_array_elements(v) x
      where coalesce(x->>'type', x->>'typ', '') ilike '%'||p_arg||'%');
  elsif p_check = 'true' then
    return coalesce(v #>> '{}', 'false') in ('true','t','1');
  elsif p_check = 'not_nok' then
    return coalesce(v #>> '{}', '') <> 'nok';
  end if;
  return true;   -- ismeretlen típus nem blokkol
end;
$$;

-- ── A HIÁNYOK LISTÁJA ────────────────────────────────────────────
-- Ugyanez fut a szerveren lezáráskor ÉS ezt kéri le a kliens.
create or replace function public.rpw__missing(
  p_shop uuid, p_data jsonb, p_phase int, p_action text, p_override boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp
as $$
declare r record; out jsonb := '[]'::jsonb;
begin
  for r in
    select * from rpw_phase_requirements
    where active and phase = p_phase and action = p_action
      and (shop_id is null or shop_id = p_shop)
      and required
    order by code
  loop
    -- override joggal a felülbírálható szabályok kimaradnak
    if p_override and r.override_ok then continue; end if;
    if not rpw__check_one(p_data, r.data_path, r.check_type, r.check_arg) then
      out := out || jsonb_build_object('code', r.code, 'message', r.message_ro,
                                       'phase', r.phase, 'severity', r.severity,
                                       'overridable', r.override_ok);
    end if;
  end loop;
  return out;
end;
$$;

-- Nyilvános: a kliens UX-előnézethez kéri le a szabályokat
create or replace function public.rpw_requirements(p_token text, p_phase int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; rows jsonb;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'phase',phase,'action',action,'code',code,'path',data_path,
           'check',check_type,'arg',check_arg,'severity',severity,
           'overridable',override_ok,'message',message_ro) order by phase, code), '[]'::jsonb)
    into rows
  from rpw_phase_requirements
  where active and (shop_id is null or shop_id=(e->>'shop_id')::uuid)
    and (p_phase is null or phase = p_phase);
  return jsonb_build_object('ok',true,'rows',rows,
    'rules_version',(select coalesce(max(active_version),1) from rpw_phase_requirements));
end;
$$;

-- Nyilvános: „lezárható-e most?" — a kliens gombja ezt kérdezi
create or replace function public.rpw_can_complete(p_token text, p_id text, p_phase int)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; j record; miss jsonb;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  select * into j from rpw_jobs where id=p_id and shop_id=(e->>'shop_id')::uuid and deleted_at is null;
  if not found then return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found')); end if;
  miss := rpw__missing((e->>'shop_id')::uuid, j.data, p_phase, 'complete', false);
  return jsonb_build_object('ok',true,'can', jsonb_array_length(miss)=0,
                            'missing',miss,'version',j.version);
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  FÁZISÁTMENET — EGYETLEN RPC, ATOMI VERZIÓZÁRRAL
-- ════════════════════════════════════════════════════════════════
--  p_action: start | complete | skip | reopen | rework_open | rework_close
create or replace function public.rpw_transition(
  p_token text, p_id text, p_phase int, p_action text,
  p_expected_version int default null, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare
  e jsonb; sid uuid; me text; can jsonb;
  j record; d jsonb; new_ver int; ph text;
  cur text; prev text; need text; miss jsonb; has_override boolean;
  exists_here boolean;
begin
  -- 1) MUNKAMENET
  e := rpw__ctx(p_token);
  if e is null then
    return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized'));
  end if;
  sid := (e->>'shop_id')::uuid; me := e->>'name'; can := e->'can';
  has_override := coalesce((can->>'override')::boolean,false);

  -- 2) TULAJDONJOG — idegen és nem létező NEM különböztethető meg
  select * into j from rpw_jobs where id=p_id and shop_id=sid and deleted_at is null;
  if not found then
    return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found'));
  end if;
  d := j.data;

  -- 3) ÉRVÉNYESSÉG
  if p_phase is null or p_phase < 1 or p_phase > 7 then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'bad_phase');
  end if;
  if p_action is null or p_action not in
     ('start','complete','skip','reopen','rework_open','rework_close') then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'bad_action');
  end if;

  -- 4) A VERZIÓ KÖTELEZŐ minden kritikus műveletnél
  if p_expected_version is null then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'expected_version_required');
  end if;

  -- 5) INDOKLÁS kötelező skip és reopen (override) esetén
  if p_action in ('skip','reopen') and btrim(coalesce(p_reason,'')) = '' then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'reason_required');
  end if;

  -- 6) LEZÁRT munka
  if coalesce(d->>'inchis','false')='true' and p_action <> 'reopen' then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'job_closed');
  end if;

  -- 7) JOGOSULTSÁG
  need := case
    when p_action in ('reopen','skip')        then 'override'
    when p_phase = 7 and p_action='complete'  then 'close'
    else 'work' end;
  if not coalesce((can->>need)::boolean,false) then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'not_allowed',
                     jsonb_build_object('need',need));
  end if;

  ph   := p_phase::text;
  cur  := coalesce(d->'phases'->ph->>'status','pending');
  prev := case when p_phase=1 then 'done'
          else coalesce(d->'phases'->((p_phase-1)::text)->>'status','pending') end;

  -- 8) SORREND — nincs átugrás
  if p_action in ('start','complete') and prev not in ('done','skipped') and not has_override then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'prev_not_closed',
      jsonb_build_object('prev_phase',p_phase-1,'prev_status',prev));
  end if;

  -- 9) NYITOTT REWORK
  if p_action='complete' and exists(
       select 1 from jsonb_array_elements(coalesce(d->'rework','[]'::jsonb)) r
       where coalesce(r->>'status','open')='open') and not has_override then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'open_rework');
  end if;

  -- 10) ÜZLETI KAPUK — az ADATVEZÉRELT szabálytáblából
  if p_action='complete' then
    miss := rpw__missing(sid, d, p_phase, 'complete', has_override);
    if jsonb_array_length(miss) > 0 then
      return rpw__deny(p_id,sid,me,p_phase,p_action,'requirements_missing',
                       jsonb_build_object('missing',miss));
    end if;
  end if;

  -- 11) ÁLLAPOTGÉP
  if p_action='start' then
    if cur='done' then return rpw__deny(p_id,sid,me,p_phase,p_action,'already_done'); end if;
    d := jsonb_set(d, array['phases',ph], coalesce(d->'phases'->ph,'{}'::jsonb)
         || jsonb_build_object('status','active','started',now()));
    d := jsonb_set(d,'{phase}',to_jsonb(p_phase));
  elsif p_action='complete' then
    if cur='done' then return rpw__deny(p_id,sid,me,p_phase,p_action,'already_done'); end if;
    d := jsonb_set(d, array['phases',ph], coalesce(d->'phases'->ph,'{}'::jsonb)
         || jsonb_build_object('status','done','finished',now(),'completedBy',coalesce(me,'')));
    if p_phase < 7 then
      d := jsonb_set(d, array['phases',(p_phase+1)::text],
           coalesce(d->'phases'->((p_phase+1)::text),'{}'::jsonb)
           || jsonb_build_object('status','active','started',now()));
      d := jsonb_set(d,'{phase}',to_jsonb(p_phase+1));
    else
      d := jsonb_set(d,'{inchis}','true'::jsonb);
    end if;
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
         jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'phase',p_phase,
           'status','open','reason',coalesce(p_reason,''),'by',coalesce(me,''),'at',now())));
  else -- rework_close
    d := jsonb_set(d,'{rework}', (
      select coalesce(jsonb_agg(case when coalesce(r->>'status','open')='open'
               and (p_reason is null or r->>'id' = p_reason)
             then r || jsonb_build_object('status','closed','closedBy',coalesce(me,''),'closedAt',now())
             else r end), '[]'::jsonb)
      from jsonb_array_elements(coalesce(d->'rework','[]'::jsonb)) r));
  end if;

  -- 12) ⚠ ATOMI ÍRÁS — a verziófeltétel az UPDATE-ben van
  update rpw_jobs
     set data = d, version = version + 1, updated_at = now()
   where id = p_id and shop_id = sid and deleted_at is null
     and version = p_expected_version
  returning version into new_ver;

  if new_ver is null then
    select exists(select 1 from rpw_jobs where id=p_id and shop_id=sid and deleted_at is null)
      into exists_here;
    if not exists_here then
      return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found'));
    end if;
    return rpw__deny(p_id,sid,me,p_phase,p_action,'version_conflict',
      jsonb_build_object('server_version',
        (select version from rpw_jobs where id=p_id and shop_id=sid)));
  end if;

  insert into rpw_audit(job_id,tenant_id,actor,action,phase,patch,prev_version,new_version)
  values (p_id,sid,me,'transition:'||p_action,ph,
          jsonb_build_object('action',p_action,'reason',p_reason),
          p_expected_version,new_ver);

  return jsonb_build_object('ok',true,'data',d,'version',new_ver);
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  SZERVER-KÉPESSÉGEK (a brief 15. pontja)
-- ════════════════════════════════════════════════════════════════
create or replace function public.rpw_server_capabilities()
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp
as $$
declare rls_on boolean; anon_policy boolean;
begin
  select relrowsecurity and relforcerowsecurity into rls_on
    from pg_class where oid = 'public.rpw_jobs'::regclass;
  select exists(select 1 from pg_policy where polrelid='public.rpw_jobs'::regclass)
    into anon_policy;
  return jsonb_build_object(
    'ok', true,
    'schema_version', (select version from rpw_schema_version where id=1),
    'rpcs', (select coalesce(jsonb_agg(proname order by proname),'[]'::jsonb)
             from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and proname like 'rpw%' and not proname like 'rpw\_\_%'),
    'rls_locked', coalesce(rls_on,false) and not anon_policy,
    'rules_version', (select coalesce(max(active_version),1) from rpw_phase_requirements),
    'business_gates_server_side', true,
    'storage_mode', 'private',
    'server_time', now()
  );
end;
$$;

update public.rpw_schema_version set version='003', migrated_at=now() where id=1;
commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS
-- ════════════════════════════════════════════════════════════════
-- 1) elvárt 15 alapszabály
select count(*) as alapszabaly from public.rpw_phase_requirements where shop_id is null;

-- 2) az RPC-k megvannak — elvárt 6 sor
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in
 ('rpw__check_one','rpw__missing','rpw_requirements','rpw_can_complete',
  'rpw_transition','rpw_server_capabilities') order by 1;

-- 3) az atomi zár az átmenetben is — elvárt: true
select pg_get_functiondef('public.rpw_transition(text,text,int,text,int,text)'::regprocedure)
       like '%and version = p_expected_version%' as atomi_zar;

-- 4) elvárt: '003'
select version from public.rpw_schema_version;
