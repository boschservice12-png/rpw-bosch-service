-- ════════════════════════════════════════════════════════════════
--  RPW — SÉMA PILLANATKÉP  ·  2026-08-23
--  Supabase: pxypbbvqinbwesfikkdb
--  Csak elemzéshez. A valódi forrás a supabase migrations.
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
--  RPW-SAJÁT TÁBLÁK
-- ─────────────────────────────────────────────────────────────

-- A munkák. A teljes állapot egy JSONB mezőben (data).
-- shop_id: 2026-08-23-án került rá — enélkül minden munka gazdátlan volt.
create table rpw_jobs (
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz,
  tenant_id   uuid,                 -- régi, használaton kívül
  version     integer not null,
  deleted_at  timestamptz,          -- puha törlés (Coș)
  shop_id     uuid not null         -- ← TÖBB-BÉRLŐS HORGONY
);

-- Minden mentés naplója. Az actor 2026-08-23 óta a bejelentkezett ember NEVE.
create table rpw_audit (
  id           bigint not null,
  job_id       text not null,
  tenant_id    uuid,
  actor        text,                -- előtte mindig 'service' volt
  action       text,
  phase        text,
  patch        jsonb,
  prev_version integer,
  new_version  integer,
  at           timestamptz not null
);

-- Atomi munkaszám. Két egyidejű nyitás sem ütközhet.
create table rpw_job_counters (
  prefix  text not null,
  last_no integer not null
);

-- POSZTOK cégenként. A poszt a szerkezet, az ember a betöltője.
-- Szabadon bővíthető: más szerviznél más a felállás.
create table rpw_posts (
  shop_id     uuid not null,
  code        text not null,        -- CONSULTANT, RECEPTIE, COORDONATOR, PIESE, …
  label       text not null,
  note        text,
  employee_id uuid,
  sort        integer not null,
  active      boolean not null,
  updated_at  timestamptz not null,
  primary key (shop_id, code)
);

-- Ki mikor kapott PIN-t. Az employees tábla a Red ERP-é, nem bővítjük.
create table rpw_pin_log (
  shop_id     uuid not null,
  employee_id uuid not null,
  set_by      uuid,
  self_set    boolean not null,
  at          timestamptz not null,
  primary key (shop_id, employee_id)
);

-- ─────────────────────────────────────────────────────────────
--  MEGOSZTOTT TÁBLÁK — a Red ERP-é. CSAK OLVASSUK.
--  Egyetlen kivétel: employees.pin_hash, mert a belépéshez kell.
-- ─────────────────────────────────────────────────────────────

create table employees (
  id            uuid not null,
  name          text not null,      -- FIGYELEM: szóközös nevek vannak benne
  role          text not null,      -- magyarul: Műszakvezető, Szerelő, Festő…
  hourly_rate   integer not null,
  is_active     boolean,
  created_at    timestamptz,
  department    text,
  company_rate  integer,
  shop_id       uuid,
  dept_admin    integer,
  dept_technic  integer,
  dept_body     integer,
  dept_transport integer,
  dept_auxiliar integer,
  manopera_rate numeric,
  pin_hash      text                -- bcrypt ($2a$, 60 karakter)
);

create table shops (
  id           uuid not null,
  shop_code    varchar(10) not null,
  name         varchar(100) not null,
  owner_name   varchar(100),
  email        varchar(100),
  phone        varchar(20),
  address      text,
  admin_pin    text,
  plan         varchar(20),
  plan_expires timestamptz,
  is_active    boolean,
  created_at   timestamptz,
  username     varchar(50),
  password     varchar(100)
);

-- Munkamenet. A nyers tokent SOHA nem tároljuk — csak sha256 hash-t.
create table app_session (
  token_hash   text not null,
  kind         text not null,       -- 'EMPLOYEE' | 'ADMIN'  (NAGYBETŰS!)
  shop_id      uuid not null,
  employee_id  uuid,
  admin_id     uuid,
  created_at   timestamptz not null,
  last_seen_at timestamptz not null,
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);

-- Ablakos zárolás: 10 rossz PIN / 15 perc → 15 perc zár.
create table pin_attempt (
  shop_id      uuid not null,
  attempts     integer not null,
  window_start timestamptz not null,
  locked_until timestamptz
);

-- ─────────────────────────────────────────────────────────────
--  RLS ÁLLAPOT (2026-08-23)
-- ─────────────────────────────────────────────────────────────
-- rpw_jobs   : RLS be, 1 szabály
-- employees  : RLS be, 0 szabály  → anon nem éri el (csak SECURITY DEFINER-en át)
-- shops, settings, jobs, rpw_audit : RLS be, 0 szabály
--
-- ⚠ A védelem ma KLIENSOLDALI szűrés (rpw-db.js scoped()). A valódi zár
--   az RPC-kbe és RLS-be tartozik — az a token-alapú shop_id-val jön.
