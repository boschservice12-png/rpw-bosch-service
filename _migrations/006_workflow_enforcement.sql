-- ════════════════════════════════════════════════════════════════
--  006 — WORKFLOW-KIKÉNYSZERÍTÉS
--  ----------------------------------------------------------------
--  MIT JAVÍT
--  A V3 `rpw_patch_v3` tetszőleges deep merge-öt engedett:
--        data = jsonb_deep_merge(data, p_patch)
--  Ezzel a TELJES szerveroldali workflow megkerülhető volt — egy
--  `{"inchis":true}` patch lezárta a dossziét, minden ellenőrzés
--  nélkül. A fázisátmenet szabályai így csak addig értek valamit,
--  amíg a kliens önként használta őket.
--
--  MIT VEZET BE
--    1. VÉDETT WORKFLOW-MEZŐK — a normál patch nem érinti őket
--       (rekurzívan, nem csak a felső szinten)
--    2. PATCH-JOGOSULTSÁGI MODELL — adatvezérelt, mezőút → jog
--    3. `rpw_job_trash` `delete` jogot kér (a V3-ban nem kért)
--    4. Kötelező, érdemi indoklás skip / reopen / rework_open esetén
--    5. Külön `p_rework_id` és `p_note` — a `p_reason` nem
--       szolgálhat egyszerre azonosítóként és emberi indoklásként
--
--  ELŐFELTÉTEL: 001–005    ROLLBACK: 006_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regprocedure('public.rpw_transition(text,text,int,text,int,text)') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: futtasd előbb a 001–005 migrációkat';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════
--  1) VÉDETT WORKFLOW-MEZŐK
-- ════════════════════════════════════════════════════════════════
create table if not exists public.rpw_protected_fields (
  id             bigserial primary key,
  path_pattern   text not null,     -- pont-jelöléssel, `*` = tetszőleges kulcs
  reason         text not null,
  active         boolean not null default true,
  schema_version int not null default 6,
  unique (path_pattern)
);

insert into public.rpw_protected_fields (path_pattern, reason) values
  ('phase',                 'a fázist csak a rpw_transition léptetheti'),
  ('phases',                'a fázisállapotok csak átmenettel változhatnak'),
  ('phases.*',              'egyetlen fázis állapota sem írható közvetlenül'),
  ('phases.*.status',       'fázisstátusz'),
  ('phases.*.finished',     'lezárás időbélyege'),
  ('phases.*.started',      'indítás időbélyege'),
  ('phases.*.reopened',     'újranyitás időbélyege'),
  ('phases.*.completedBy',  'ki zárta le — a szerver tölti a tokenből'),
  ('phases.*.reason',       'skip/reopen indoklás'),
  ('inchis',                'a dosszié lezárása csak a 7. fázis lezárásával'),
  ('rework',                'a rework csak rework_open/rework_close művelettel'),
  ('rework.*',              'egyetlen rework tétel sem írható közvetlenül'),
  ('rework.*.status',       'rework státusz'),
  ('closing.status',        'lezárási státusz'),
  ('closing.closed',        'lezárás jelzője'),
  ('closing.completed',     'lezárás jelzője'),
  ('completedBy',           'a szerver tölti a tokenből'),
  ('finished',              'lezárás időbélyege'),
  ('started',               'indítás időbélyege'),
  ('reopened',              'újranyitás időbélyege'),
  ('skipReason',            'kihagyás indoklása'),
  ('override',              'felülbírálás'),
  ('transition',            'átmenet-adat'),
  ('workflowState',         'workflow-állapot'),
  ('history',               'az előzményt a szerver írja')
on conflict (path_pattern) do nothing;

-- Egy konkrét út illeszkedik-e egy mintára?
create or replace function public.rpw__path_matches(p_path text[], p_pattern text)
returns boolean
language plpgsql immutable as $$
declare parts text[]; i int;
begin
  parts := string_to_array(p_pattern, '.');
  if array_length(parts,1) > array_length(p_path,1) then return false; end if;
  -- prefix-illeszkedés: ha a minta rövidebb, a mélyebb út is védett
  for i in 1..array_length(parts,1) loop
    if parts[i] <> '*' and parts[i] <> p_path[i] then return false; end if;
  end loop;
  return true;
end;
$$;

-- A patch ÖSSZES levélútjának összegyűjtése — REKURZÍVAN.
-- Egy `{"phases":{"7":{"status":"done"}}}` patch útja: phases.7.status
-- A visszatérés PONT-JELÖLÉSŰ szövegek halmaza (text[]) — a beágyazott
-- tömbök (text[][]) PL/pgSQL-ben nem fűzhetők össze megbízhatóan.
create or replace function public.rpw__patch_paths(p_patch jsonb, p_prefix text default '')
returns text[]
language plpgsql immutable as $$
declare k text; v jsonb; out text[] := '{}'; sub text[]; cur text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    if p_prefix <> '' then return array[p_prefix]; end if;
    return out;
  end if;
  -- üres objektum: maga az út a levél
  if (select count(*) from jsonb_object_keys(p_patch)) = 0 then
    if p_prefix <> '' then return array[p_prefix]; end if;
    return out;
  end if;
  for k, v in select * from jsonb_each(p_patch) loop
    cur := case when p_prefix = '' then k else p_prefix || '.' || k end;
    if jsonb_typeof(v) = 'object' and (select count(*) from jsonb_object_keys(v)) > 0 then
      sub := rpw__patch_paths(v, cur);
      out := out || sub;
    else
      -- levél: skalár, tömb, null, vagy üres objektum
      out := out || array[cur];
      -- A KÖZBENSŐ utat is felvesszük: egy `{"phases": []}` patch a
      -- `phases` mezőt írja felül, tehát a `phases` minta is sérül.
    end if;
  end loop;
  return out;
end;
$$;

-- Mely utak sértenek védett mezőt?
create or replace function public.rpw__protected_hits(p_patch jsonb)
returns text[]
language plpgsql stable security definer set search_path = public, extensions, pg_temp
as $$
declare paths text[]; i int; p text; r record; hits text[] := '{}';
begin
  paths := rpw__patch_paths(p_patch);
  if array_length(paths,1) is null then return hits; end if;
  for i in 1..array_length(paths,1) loop
    p := paths[i];
    for r in select path_pattern from rpw_protected_fields where active loop
      if rpw__path_matches(string_to_array(p,'.'), r.path_pattern) then
        hits := hits || p;
        exit;
      end if;
    end loop;
  end loop;
  return hits;
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  2) PATCH-JOGOSULTSÁGI MODELL
-- ════════════════════════════════════════════════════════════════
create table if not exists public.rpw_patch_permissions (
  id                  bigserial primary key,
  json_path           text not null,   -- pont-jelölés, `*` megengedett
  required_capability text not null,   -- open|reception|work|close|override|delete|team|posts
  operation           text not null default 'write',
  active              boolean not null default true,
  schema_version      int not null default 6,
  unique (json_path, operation)
);

insert into public.rpw_patch_permissions (json_path, required_capability) values
  -- recepciós és ügyféladat
  ('client',       'reception'), ('phone',        'reception'),
  ('email',        'reception'), ('vin',          'reception'),
  ('plate',        'reception'), ('marca',        'reception'),
  ('model',        'reception'), ('an',           'reception'),
  ('proprietar',   'reception'), ('adresa',       'reception'),
  ('asigurator',   'reception'), ('nrDosar',      'reception'),
  ('docs',         'reception'), ('dosarActe',    'reception'),
  ('sosire',       'reception'), ('programare',   'reception'),
  ('damageType',   'reception'), ('flux',         'reception'),
  -- szakmai munkafázis-adat
  ('elements',     'work'), ('bodyRows',   'work'), ('paintRows', 'work'),
  ('photos',       'work'), ('evalData',   'work'), ('deviz',     'work'),
  ('reconst',      'work'), ('norme',      'work'), ('gapLog',    'work'),
  -- végellenőrzés és lezárás
  ('control',      'close'), ('closing',   'close'),
  -- felülbírálás
  ('overrideNote', 'override')
on conflict (json_path, operation) do nothing;

-- Mely jogok kellenek ehhez a patch-hez, és mi hiányzik?
create or replace function public.rpw__patch_needs(p_patch jsonb, p_can jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp
as $$
declare paths text[]; i int; p text; r record;
        need text := null; bad text[] := '{}'; needs text[] := '{}';
begin
  paths := rpw__patch_paths(p_patch);
  if array_length(paths,1) is null then
    return jsonb_build_object('ok', true);
  end if;
  for i in 1..array_length(paths,1) loop
    p := paths[i];
    for r in select json_path, required_capability from rpw_patch_permissions where active loop
      if rpw__path_matches(string_to_array(p,'.'), r.json_path) then
        if not coalesce((p_can->>r.required_capability)::boolean, false) then
          bad   := bad   || p;
          needs := needs || r.required_capability;
          if need is null then need := r.required_capability; end if;
        end if;
        exit;
      end if;
    end loop;
  end loop;
  if array_length(bad,1) is null then return jsonb_build_object('ok', true); end if;
  return jsonb_build_object('ok', false, 'need', need,
                            'fields', to_jsonb(bad), 'needs', to_jsonb(needs));
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  3) A MENTÉS ÚJRAÍRÁSA — védett mezők + jogosultság
-- ════════════════════════════════════════════════════════════════
create or replace function public.rpw_patch_v3(
  p_token text, p_id text, p_patch jsonb,
  p_expected_version integer default null, p_phase text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; me text; can jsonb; merged jsonb; new_ver int;
        exists_here boolean; hits text[]; perm jsonb;
begin
  e := rpw__ctx(p_token);
  if e is null then
    return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized'));
  end if;
  sid := (e->>'shop_id')::uuid; me := e->>'name'; can := e->'can';

  -- ── VÉDETT WORKFLOW-MEZŐK ──────────────────────────────────────
  -- Ez a normál mentési út. A workflow-állapotot KIZÁRÓLAG a
  -- rpw_transition változtathatja.
  hits := rpw__protected_hits(p_patch);
  if array_length(hits,1) is not null then
    begin
      insert into rpw_audit(job_id, tenant_id, actor, action, patch)
      values (p_id, sid, me, 'denied:protected_workflow_field',
              jsonb_build_object('fields', to_jsonb(hits)));   -- CSAK az utak, tartalom nélkül
    exception when others then null;
    end;
    return jsonb_build_object('ok', false, 'error', 'protected_workflow_field',
      'message', 'Câmpul de workflow poate fi modificat numai prin tranziția de fază.',
      'fields', to_jsonb(hits));
  end if;

  -- ── ÚJ DOSSZIÉ: az `open` jog ELŐBB dől el ─────────────────────
  -- Ha egyáltalán nem nyithat dossziét, felesleges a mezőket vizsgálni.
  if not exists (select 1 from rpw_jobs where id = p_id)
     and not coalesce((can->>'open')::boolean, false) then
    return jsonb_build_object('ok',false,'error','not_allowed',
      'message','Nu ai dreptul să deschizi un dosar nou.','need','open');
  end if;

  -- ── MEZŐSZINTŰ JOGOSULTSÁG ─────────────────────────────────────
  perm := rpw__patch_needs(p_patch, can);
  if not (perm->>'ok')::boolean then
    begin
      insert into rpw_audit(job_id, tenant_id, actor, action, patch)
      values (p_id, sid, me, 'denied:not_allowed',
              jsonb_build_object('fields', perm->'fields', 'need', perm->>'need'));
    exception when others then null;
    end;
    return jsonb_build_object('ok', false, 'error', 'not_allowed',
      'message', 'Nu ai dreptul să modifici aceste date.',
      'need', perm->>'need', 'fields', perm->'fields');
  end if;

  -- ── ÚJ MUNKA ───────────────────────────────────────────────────
  if not exists (select 1 from rpw_jobs where id = p_id) then
    if not coalesce((can->>'open')::boolean, false) then
      return jsonb_build_object('ok',false,'error','not_allowed',
        'message','Nu ai dreptul să deschizi un dosar nou.','need','open');
    end if;
    insert into rpw_jobs(id, shop_id, data, version) values (p_id, sid, p_patch, 1)
    on conflict (id) do nothing
    returning data, version into merged, new_ver;
    if merged is not null then
      insert into rpw_audit(job_id,tenant_id,actor,action,phase,patch,prev_version,new_version)
      values (p_id, sid, me, 'create', p_phase, p_patch, null, new_ver);
      return jsonb_build_object('ok',true,'data',merged,'version',new_ver);
    end if;
  end if;

  -- ── MEGLÉVŐ MUNKA: a verzió KÖTELEZŐ ───────────────────────────
  if p_expected_version is null then
    return rpw__deny(p_id, sid, me, null, 'patch', 'expected_version_required');
  end if;

  -- ATOMI: a verziófeltétel az UPDATE-ben
  update rpw_jobs
     set data = jsonb_deep_merge(data, p_patch),
         version = version + 1, updated_at = now()
   where id = p_id and shop_id = sid and deleted_at is null
     and version = p_expected_version
  returning data, version into merged, new_ver;

  if merged is null then
    select exists(select 1 from rpw_jobs where id=p_id and shop_id=sid and deleted_at is null)
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

-- ════════════════════════════════════════════════════════════════
--  4) rpw_job_trash — `delete` jogot kér
-- ════════════════════════════════════════════════════════════════
create or replace function public.rpw_job_trash(p_token text, p_id text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare e jsonb; sid uuid; n int;
begin
  e := rpw__ctx(p_token);
  if e is null then return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized')); end if;
  sid := (e->>'shop_id')::uuid;
  -- V3-ban ez HIÁNYZOTT: bárki kosárba tehetett bármit.
  if not coalesce((e->'can'->>'delete')::boolean,false) then
    begin
      insert into rpw_audit(job_id,tenant_id,actor,action,patch)
      values (p_id,sid,e->>'name','denied:not_allowed',jsonb_build_object('need','delete','op','trash'));
    exception when others then null;
    end;
    return jsonb_build_object('ok',false,'error','not_allowed',
      'message','Nu ai dreptul să muți dosarul în coș.','need','delete');
  end if;
  update rpw_jobs set deleted_at = now(), updated_at = now()
   where id=p_id and shop_id=sid and deleted_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    -- idegen, nem létező, VAGY már törölt — a létezés nem derülhet ki
    if exists(select 1 from rpw_jobs where id=p_id and shop_id=sid and deleted_at is not null) then
      return jsonb_build_object('ok',false,'error','already_trashed',
        'message','Dosarul este deja în coș.');
    end if;
    return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found'));
  end if;
  insert into rpw_audit(job_id,tenant_id,actor,action) values (p_id,sid,e->>'name','trash');
  return jsonb_build_object('ok',true,'data',jsonb_build_object('id',p_id));
end;
$$;

-- ════════════════════════════════════════════════════════════════
--  5) ÚJ TRANSITION SZIGNATÚRA — külön rework_id és note
-- ════════════════════════════════════════════════════════════════
--  A V3-ban a `p_reason` egyszerre volt rework-azonosító és emberi
--  indoklás. Ez két külön dolog.
create or replace function public.rpw_transition(
  p_token text, p_id text, p_phase int, p_action text,
  p_expected_version int default null, p_reason text default null,
  p_rework_id text default null, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare
  e jsonb; sid uuid; me text; can jsonb;
  j record; d jsonb; new_ver int; ph text;
  cur text; prev text; need text; miss jsonb; has_override boolean;
  exists_here boolean; MIN_REASON int := 5;
begin
  e := rpw__ctx(p_token);
  if e is null then
    return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized'));
  end if;
  sid := (e->>'shop_id')::uuid; me := e->>'name'; can := e->'can';
  has_override := coalesce((can->>'override')::boolean,false);

  select * into j from rpw_jobs where id=p_id and shop_id=sid and deleted_at is null;
  if not found then
    return jsonb_build_object('ok',false,'error','not_found','message',rpw__msg('not_found'));
  end if;
  d := j.data;

  if p_phase is null or p_phase < 1 or p_phase > 7 then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'bad_phase');
  end if;
  if p_action is null or p_action not in
     ('start','complete','skip','reopen','rework_open','rework_close') then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'bad_action');
  end if;
  if p_expected_version is null then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'expected_version_required');
  end if;

  -- ── ÉRDEMI INDOKLÁS kötelező (min. 5 karakter, trimelve) ───────
  if p_action in ('skip','reopen','rework_open')
     and length(btrim(coalesce(p_reason,''))) < MIN_REASON then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'reason_required');
  end if;
  -- rework lezárásához AZONOSÍTÓ kell, nem indoklás
  if p_action = 'rework_close' and btrim(coalesce(p_rework_id,'')) = '' then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'rework_id_required');
  end if;

  if coalesce(d->>'inchis','false')='true' and p_action <> 'reopen' then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'job_closed');
  end if;

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

  if p_action in ('start','complete') and prev not in ('done','skipped') and not has_override then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'prev_not_closed',
      jsonb_build_object('prev_phase',p_phase-1,'prev_status',prev));
  end if;

  if p_action='complete' and exists(
       select 1 from jsonb_array_elements(coalesce(d->'rework','[]'::jsonb)) r
       where coalesce(r->>'status','open')='open') and not has_override then
    return rpw__deny(p_id,sid,me,p_phase,p_action,'open_rework');
  end if;

  if p_action='complete' then
    miss := rpw__missing(sid, d, p_phase, 'complete', has_override);
    if jsonb_array_length(miss) > 0 then
      return rpw__deny(p_id,sid,me,p_phase,p_action,'requirements_missing',
                       jsonb_build_object('missing',miss));
    end if;
  end if;

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
      -- A 7. fázis lezárása ZÁRJA LE a dossziét. A kliens NEM küld
      -- külön {inchis:true} patch-et — nem is tudna.
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
         jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'phase',p_phase,
           'status','open','reason',p_reason,'by',coalesce(me,''),'at',now())));
  else -- rework_close: AZONOSÍTÓ alapján, külön lezárási megjegyzéssel
    if not exists (select 1 from jsonb_array_elements(coalesce(d->'rework','[]'::jsonb)) r
                   where r->>'id' = p_rework_id and coalesce(r->>'status','open')='open') then
      return rpw__deny(p_id,sid,me,p_phase,p_action,'rework_not_found');
    end if;
    d := jsonb_set(d,'{rework}', (
      select coalesce(jsonb_agg(case when r->>'id' = p_rework_id
             then r || jsonb_build_object('status','closed','closedBy',coalesce(me,''),
                                          'closedAt',now(),'note',coalesce(p_note,''))
             else r end), '[]'::jsonb)
      from jsonb_array_elements(coalesce(d->'rework','[]'::jsonb)) r));
  end if;

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
          jsonb_build_object('action',p_action,'reason',p_reason,'rework_id',p_rework_id),
          p_expected_version,new_ver);

  return jsonb_build_object('ok',true,'data',d,'version',new_ver);
end;
$$;

-- A régi, 6 paraméteres változat eltávolítása — egy szignatúra maradjon
drop function if exists public.rpw_transition(text,text,int,text,int,text);

-- ── Új hibaüzenetek ─────────────────────────────────────────────
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
    when 'already_trashed'           then 'Dosarul este deja în coș.'
    when 'reason_required'           then 'Motivul este obligatoriu (minim 5 caractere).'
    when 'rework_id_required'        then 'Identificatorul reworkului este obligatoriu.'
    when 'rework_not_found'          then 'Reworkul nu a fost găsit sau este deja închis.'
    when 'requirements_missing'      then 'Faza nu poate fi închisă.'
    when 'protected_workflow_field'  then 'Câmpul de workflow poate fi modificat numai prin tranziția de fază.'
    else 'Operațiunea a fost respinsă.' end;
$$;

-- ── Capability frissítés ────────────────────────────────────────
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
    'protected_fields', (select count(*) from rpw_protected_fields where active),
    'patch_permissions', (select count(*) from rpw_patch_permissions where active),
    'workflow_enforced', true,
    'storage_mode', 'private',
    'server_time', now()
  );
end;
$$;

-- ── Jogok az új szignatúrára ────────────────────────────────────
revoke all on function public.rpw__path_matches(text[],text)       from public, anon, authenticated;
revoke all on function public.rpw__patch_paths(jsonb,text)         from public, anon, authenticated;
revoke all on function public.rpw__protected_hits(jsonb)           from public, anon, authenticated;
revoke all on function public.rpw__patch_needs(jsonb,jsonb)        from public, anon, authenticated;
grant execute on function
  public.rpw_transition(text,text,int,text,int,text,text,text) to anon, authenticated;

alter table public.rpw_protected_fields   enable row level security;
alter table public.rpw_protected_fields   force  row level security;
alter table public.rpw_patch_permissions  enable row level security;
alter table public.rpw_patch_permissions  force  row level security;
revoke all on public.rpw_protected_fields  from anon, authenticated;
revoke all on public.rpw_patch_permissions from anon, authenticated;

update public.rpw_schema_version set version='006', migrated_at=now() where id=1;
commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS
-- ════════════════════════════════════════════════════════════════
-- 1) elvárt 25 védett minta
select count(*) as vedett_mezo from public.rpw_protected_fields where active;

-- 2) elvárt 33 jogosultsági szabály
select count(*) as patch_jog from public.rpw_patch_permissions where active;

-- 3) Csak EGY transition szignatúra van — elvárt 1 sor, 8 paraméterrel
select pg_get_function_identity_arguments(oid) as args
from pg_proc where proname='rpw_transition';

-- 4) A trash delete-jogot kér — elvárt: true
select pg_get_functiondef('public.rpw_job_trash(text,text)'::regprocedure)
       like '%can%delete%' as trash_jogot_ker;

-- 5) A patch védi a workflow-t — elvárt: true
select pg_get_functiondef('public.rpw_patch_v3(text,text,jsonb,integer,text)'::regprocedure)
       like '%protected_workflow_field%' as patch_vedett;

-- 6) elvárt: '006'
select version from public.rpw_schema_version;
