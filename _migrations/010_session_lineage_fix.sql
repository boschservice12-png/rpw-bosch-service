-- ════════════════════════════════════════════════════════════════
--  010 — A MUNKAMENET KÉT VONALA (a beléptetés előfeltétele)
--  ----------------------------------------------------------------
--  A HIBA, AHOGY ÉLESBEN JELENTKEZETT (2026-08-29):
--  Ferenc bejelentkezett, és a panel ÜRES lett. Minden más rendben volt.
--
--  Az `app_session` táblán KÉT munkamenet-vonal fut egymás mellett:
--
--    RÉGI (ERP)  : employee_id     → employees      (a cég ERP-je)
--    ÚJ  (RPW2)  : rpw_employee_id → rpw_employees  (az RPW saját személyzete)
--
--  A `rpw2_login` — amit a belépő lap hív — az ÚJ vonalra ír:
--  `rpw_employee_id` kitöltve, `employee_id` NULL.
--  A `rpw_session` — amit a `rpw__ctx`, és rajta keresztül a
--  `rpw_jobs_list`, `rpw_job_get`, `rpw_patch_v3` használ — viszont
--  CSAK a régi vonalat ismerte: `join employees e on e.id = a.employee_id`.
--
--  Következmény: a munkamenet érvényes, de a szerver nem találja meg →
--  `rpw__ctx` null → a lista egyetlen sort sem ad vissza. Ez a hiba
--  KIZÁRÓLAG bekapcsolt beléptetésnél jelentkezik, ezért maradt rejtve.
--
--  A JAVÍTÁS: a régi út VÁLTOZATLAN marad, és csak akkor lép be a
--  második ág, ha az első nem talált. Így egyetlen meglévő munkamenet
--  viselkedése sem változik.
--
--  ELŐFELTÉTEL: app_session, rpw_employees.     ROLLBACK: 010_rollback.sql
-- ════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regclass('public.app_session') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: public.app_session';
  end if;
  if to_regclass('public.rpw_employees') is null then
    raise exception 'ELŐFELTÉTEL HIÁNYZIK: public.rpw_employees';
  end if;
end $$;

create or replace function public.rpw_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  h          text;
  v_emp_id   uuid;
  v_shop_id  uuid;
  v_exp      timestamptz;
  v_name     text;
  v_role     text;
  v_dept     text;
  v_active   boolean;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false, 'error', 'no_token');
  end if;
  h := encode(digest(p_token,'sha256'),'hex');

  -- ── 1) RÉGI (ERP) VONAL — a korábbi viselkedés, változatlanul ──
  select a.employee_id, a.shop_id, a.expires_at, e.name, e.role, e.department, e.is_active
    into v_emp_id, v_shop_id, v_exp, v_name, v_role, v_dept, v_active
  from app_session a
  join employees e on e.id = a.employee_id
  where a.token_hash = h and a.revoked_at is null
  limit 1;

  -- ── 2) ÚJ (RPW2) VONAL — csak ha az első nem talált ─────────────
  -- A szerep a rpw_roles LABEL-je (pl. 'Műszakvezető'), mert a kliens
  -- szerep-leképezése (RPWRoles.mapEmployeeRole) ezt a magyar munkakört
  -- várja — ugyanazt, amit a rpw2_roster és a rpw2_login is ad.
  --
  -- Az `active` NYERSEN megy tovább (nem coalesce-oljuk true-ra): lentebb a
  -- `coalesce(v_active,false)=false` ellenőrzés a NULL-t is ELUTASÍTJA. Így
  -- ugyanaz a szigor, mint a régi ERP ágon és a rpw2_session-ben. Ma az
  -- `active` NOT NULL DEFAULT true, tehát nem fordulhat elő — de a védelem
  -- nem támaszkodhat egy másik tábla kényszerére, ami holnap eltűnhet.
  if v_emp_id is null then
    select a.rpw_employee_id, a.shop_id, a.expires_at,
           re.name, coalesce(rr.label, re.role_code), null::text, re.active
      into v_emp_id, v_shop_id, v_exp, v_name, v_role, v_dept, v_active
    from app_session a
    join rpw_employees re on re.id = a.rpw_employee_id
    left join rpw_roles rr on rr.code = re.role_code and rr.shop_id = re.shop_id
    where a.token_hash = h and a.revoked_at is null
    limit 1;
  end if;

  if v_emp_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_exp < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if coalesce(v_active,false) = false then
    return jsonb_build_object('ok', false, 'error', 'inactive');
  end if;

  update app_session
     set last_seen_at = now(),
         expires_at   = greatest(expires_at, now() + interval '4 hours')
   where token_hash = h;

  return jsonb_build_object('ok', true,
    'employee', jsonb_build_object(
      'id', v_emp_id, 'name', btrim(v_name), 'role', v_role,
      'department', v_dept, 'shop_id', v_shop_id));
end;
$function$;

commit;

-- ════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — futtasd a migráció UTÁN
-- ════════════════════════════════════════════════════════════════

-- 1) Érvénytelen token — elvárt: ok=false, error=no_token
select public.rpw_session('rovid') as rovid_token;

-- 2) Nem létező (de elég hosszú) token — elvárt: ok=false, error=invalid
select public.rpw_session(repeat('z',64)) as nincs_ilyen;

-- 3) Hány ÉLŐ munkamenetet talál meg mostantól a szerver?
--    Elvárt: az RPW2-vonalú munkamenetek is látszanak (rpw_employee_id).
select count(*) filter (where employee_id     is not null) as regi_vonal,
       count(*) filter (where rpw_employee_id is not null) as rpw2_vonal
from public.app_session where expires_at > now() and revoked_at is null;
