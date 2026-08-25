-- ════════════════════════════════════════════════════════════════
--  008 — MUNKALAP SZERVEROLDALI LÉTREHOZÁSA + RÉGI UTAK KIVEZETÉSE
--  (F-120 rpw_job_create; deprecated RPC-k EXECUTE jogának elvétele)
--
--  ELŐFELTÉTEL: 001..007 alkalmazva.
--  ⚠ EZ A MIGRÁCIÓ A CUTOVER RÉSZE: az alkalmazása UTÁN a régi
--    rpw_login / rpw_team / rpw_patch / rpw_patch_v2 /
--    rpw_next_job_number utak NEM hívhatók. A frontendnek ekkor már
--    a rpw2_* + rpw_patch_v3 + rpw_job_create utakon KELL járnia
--    (PATCH_RPC='rpw_patch_v3', AUTH_REQUIRED=true).
--  Visszavonás: 008_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

-- ── ELŐFELTÉTEL-ELLENŐRZÉS ──────────────────────────────────────
do $$ begin
  if to_regprocedure('public.rpw__ctx(text)') is null
     or to_regprocedure('public.rpw__protected_hits(jsonb)') is null
     or to_regprocedure('public.rpw2_pin_status(text)') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: futtasd előbb a 001–007 migrációkat';
  end if;
end $$;

-- ── F-120: rpw_job_create ────────────────────────────────────────
-- A szerver: token → ctx; `open` jog; tenant + actor a TOKENBŐL;
-- munkalapszám a szerveren; kezdő workflow-állapot a szerveren;
-- version=1; audit; idempotens (létező id → a meglévőt adja vissza,
-- nem ír semmit). A kliens NEM adhat át workflow-mezőt, se
-- shop_id/actor/version/audit mezőt — elutasítás, nem csendes szűrés.
-- p_id: kliens-oldali idempotencia-kulcs (RPWUtil.jobId())
-- p_data: CSAK normál mezők (client, plate, flux, …)
-- p_prefix: munkalapszám-előtag (pl. 'MS-26')
create or replace function public.rpw_job_create(
  p_token  text,
  p_id     text,
  p_data   jsonb default '{}'::jsonb,
  p_prefix text default 'RPW'
)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare
  e jsonb; sid uuid; me text; can jsonb;
  hits text[]; bad text[] := '{}';
  n int; v_number text; seeded jsonb; existing record; k text;
begin
  e := rpw__ctx(p_token);
  if e is null then
    return jsonb_build_object('ok',false,'error','unauthorized','message',rpw__msg('unauthorized'));
  end if;
  sid := (e->>'shop_id')::uuid; me := e->>'name'; can := e->'can';

  if coalesce((can->>'open')::boolean, false) is not true then
    begin
      insert into rpw_audit(job_id,tenant_id,actor,action)
      values (p_id, sid, me, 'denied:create_not_allowed');
    exception when others then null; end;
    return jsonb_build_object('ok',false,'error','not_allowed',
      'message','Nu ai dreptul de a deschide fișe.');
  end if;

  if p_id is null or length(trim(p_id)) < 6 or length(p_id) > 64 then
    return jsonb_build_object('ok',false,'error','bad_id','message','ID de fișă invalid.');
  end if;

  -- ── IDEMPOTENCIA: létező id → a meglévő fişă, írás nélkül ──────
  select id, data, version into existing
    from rpw_jobs where id = p_id and shop_id = sid;
  if found then
    return jsonb_build_object('ok',true,'existing',true,
      'data', existing.data, 'version', existing.version);
  end if;
  -- másik tenant azonos id-je: nem szivárogtatunk — ütközésként utasítjuk el
  if exists (select 1 from rpw_jobs where id = p_id) then
    return jsonb_build_object('ok',false,'error','id_taken','message','ID indisponibil.');
  end if;

  -- ── TILTOTT KLIENS-MEZŐK: elutasítás, nem szűrés ───────────────
  hits := rpw__protected_hits(coalesce(p_data,'{}'::jsonb));
  foreach k in array array['shop_id','actor','version','audit','number','id','created']
  loop
    if coalesce(p_data,'{}'::jsonb) ? k then bad := bad || k; end if;
  end loop;
  if array_length(hits,1) is not null or array_length(bad,1) is not null then
    begin
      insert into rpw_audit(job_id,tenant_id,actor,action,patch)
      values (p_id, sid, me, 'denied:create_protected_field',
              jsonb_build_object('fields', to_jsonb(coalesce(hits,'{}') || bad)));
    exception when others then null; end;
    return jsonb_build_object('ok',false,'error','protected_field',
      'message','Starea de workflow o generează serverul, nu clientul.',
      'fields', to_jsonb(coalesce(hits,'{}') || bad));
  end if;

  -- ── MUNKALAPSZÁM: a szerver adja ───────────────────────────────
  insert into rpw_job_counters(shop_id, prefix, n) values (sid, p_prefix, 1)
  on conflict (shop_id, prefix) do update set n = rpw_job_counters.n + 1
  returning rpw_job_counters.n into n;
  v_number := p_prefix || '-' || lpad(n::text, 3, '0');

  -- ── KEZDŐ ÁLLAPOT: a szerver generálja ─────────────────────────
  seeded := coalesce(p_data,'{}'::jsonb) || jsonb_build_object(
    'id', p_id,
    'number', v_number,
    'phase', 1,
    'phases', jsonb_build_object(
      '1', jsonb_build_object('status','pending'),
      '2', jsonb_build_object('status','pending'),
      '3', jsonb_build_object('status','pending'),
      '4', jsonb_build_object('status','pending'),
      '5', jsonb_build_object('status','pending'),
      '6', jsonb_build_object('status','pending'),
      '7', jsonb_build_object('status','pending')),
    'inchis', false,
    'created', now(),
    'version', 1
  );

  insert into rpw_jobs(id, shop_id, data, version) values (p_id, sid, seeded, 1);
  insert into rpw_audit(job_id,tenant_id,actor,action,phase,patch,prev_version,new_version)
  values (p_id, sid, me, 'create', null, seeded, null, 1);

  return jsonb_build_object('ok',true,'existing',false,'data',seeded,'version',1);
end;
$$;

grant execute on function public.rpw_job_create(text,text,jsonb,text) to anon, authenticated;

-- ── DEPRECATED UTAK: EXECUTE jog elvétele ────────────────────────
-- A 004 már csonkokra cserélte őket ({ok:false,'error':'deprecated'});
-- itt a hívhatóságuk is megszűnik. A frontendet a
-- test-rpc-consistency + test-registry őrzi, hogy ne hívja őket.
revoke execute on function public.rpw_patch(text,jsonb)              from anon, authenticated;
revoke execute on function public.rpw_login(uuid,text)               from anon, authenticated;
do $$ begin
  revoke execute on function public.rpw_next_job_number(text)        from anon, authenticated;
exception when undefined_function then null; end $$;
do $$ begin
  revoke execute on function public.rpw_team(text)                   from anon, authenticated;
exception when undefined_function then null; end $$;
do $$ begin
  -- v2: a v3 a kizárólagos normál mentési út a cutover után
  revoke execute on function public.rpw_patch_v2(text,jsonb,int,text,text) from anon, authenticated;
exception when undefined_function then null; end $$;

update public.rpw_schema_version set version='008', migrated_at=now() where id=1;
commit;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────
-- select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and proname='rpw_job_create';   -- 1 sor
