-- ════════════════════════════════════════════════════════════════
--  001 — ALAPSÉMA
--  ----------------------------------------------------------------
--  Tiszta adatbázison ez hozza létre a szerkezetet. Éles rendszeren
--  minden lépés `if not exists` — nem bánt meglévő adatot.
--
--  ELŐFELTÉTEL: pgcrypto (a PIN-lenyomatokhoz)
--  ELLENŐRZÉS a fájl végén.   ROLLBACK: 001_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

create extension if not exists pgcrypto;

-- ── Szervizek ────────────────────────────────────────────────────
create table if not exists public.shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ── Szerepkörök: a NÉV a szervizé, a JOG kapcsolókból ────────────
create table if not exists public.rpw_roles (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  code        text not null,
  label       text not null,
  can         jsonb not null default '{}'::jsonb,
  sort_order  int  not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (shop_id, code)
);

-- ── Dolgozók ─────────────────────────────────────────────────────
create table if not exists public.rpw_employees (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  name        text not null,
  role_code   text,
  phone       text,
  pin_hash    text,
  pin_set_at  timestamptz,
  active      boolean not null default true,
  left_at     timestamptz,
  last_login  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists rpw_employees_shop_idx on public.rpw_employees(shop_id) where active;

-- ── Munkamenetek ─────────────────────────────────────────────────
create table if not exists public.rpw_sessions (
  token_hash  text primary key,
  employee_id uuid not null references public.rpw_employees(id) on delete cascade,
  shop_id     uuid not null references public.shops(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
create index if not exists rpw_sessions_emp_idx on public.rpw_sessions(employee_id);

-- ── Rossz PIN-kísérletek ─────────────────────────────────────────
create table if not exists public.rpw_pin_attempt (
  employee_id uuid not null,
  window_start timestamptz not null default now(),
  n           int not null default 0,
  primary key (employee_id)
);

-- ── Munkák ───────────────────────────────────────────────────────
create table if not exists public.rpw_jobs (
  id          text primary key,
  shop_id     uuid not null references public.shops(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  version     int  not null default 1,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists rpw_jobs_shop_idx on public.rpw_jobs(shop_id) where deleted_at is null;

-- ── Audit ────────────────────────────────────────────────────────
create table if not exists public.rpw_audit (
  id           bigserial primary key,
  job_id       text,
  tenant_id    uuid,
  actor        text,
  action       text not null,
  phase        text,
  patch        jsonb,
  prev_version int,
  new_version  int,
  created_at   timestamptz not null default now()
);
create index if not exists rpw_audit_job_idx on public.rpw_audit(job_id, created_at desc);

-- ── Munkaszám-számláló (atomi) ───────────────────────────────────
create table if not exists public.rpw_job_counters (
  shop_id  uuid not null,
  prefix   text not null,
  n        int  not null default 0,
  primary key (shop_id, prefix)
);

-- ── Posztok ──────────────────────────────────────────────────────
create table if not exists public.rpw_posts (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  code        text not null,
  label       text not null,
  note        text,
  employee_id uuid references public.rpw_employees(id) on delete set null,
  sort_order  int not null default 100,
  active      boolean not null default true,
  unique (shop_id, code)
);

-- ── PIN-napló ────────────────────────────────────────────────────
create table if not exists public.rpw_pin_log (
  id          bigserial primary key,
  shop_id     uuid not null,
  employee_id uuid not null,
  set_by      uuid,
  self_set    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── JSONB mély összefésülés ──────────────────────────────────────
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb language sql immutable as $$
  select case
    when a is null then b
    when b is null then a
    when jsonb_typeof(a) <> 'object' or jsonb_typeof(b) <> 'object' then b
    else (
      select coalesce(jsonb_object_agg(k,
               case when a ? k and b ? k then public.jsonb_deep_merge(a->k, b->k)
                    when b ? k then b->k else a->k end), '{}'::jsonb)
      from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) s
    )
  end;
$$;

-- ── Séma-verzió (a capability-RPC olvassa) ───────────────────────
create table if not exists public.rpw_schema_version (
  id          int primary key default 1,
  version     text not null,
  migrated_at timestamptz not null default now(),
  check (id = 1)
);
insert into public.rpw_schema_version(id, version) values (1, '001')
on conflict (id) do update set version = '001', migrated_at = now();

commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — elvárt: 11 sor (minden tábla megvan)
-- ════════════════════════════════════════════════════════════════
select table_name from information_schema.tables
where table_schema='public'
  and table_name in ('shops','rpw_roles','rpw_employees','rpw_sessions','rpw_pin_attempt',
                     'rpw_jobs','rpw_audit','rpw_job_counters','rpw_posts','rpw_pin_log',
                     'rpw_schema_version')
order by 1;

-- elvárt: '001'
select version from public.rpw_schema_version;
