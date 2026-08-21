/* ============================================================
   rpw-auth.js — PIN + szerep alapú kliens-hitelesítés (opt-in)
   ------------------------------------------------------------
   A szerver-oldal (0008_rpw_auth_pin.FILE_ONLY.sql) token-alapú:
   rpw_login(name,pin) -> token; a token a kritikus RPC-khez megy.

   ALAPBÓL KIKAPCSOLVA: RPW_CFG.AUTH_REQUIRED !== true → semmi nem változik.
   Aktiválás: a migráció alkalmazása + tagok felvétele + AUTH_REQUIRED=true.

   Node + böngésző kompatibilis. Globál: window.RPWAuth
   ============================================================ */
(function(root){
  'use strict';
  var KEY='rpw_auth';

  function defStore(){
    return {
      get:function(k){ try{ return (typeof localStorage!=='undefined')?localStorage.getItem(k):null; }catch(e){ return null; } },
      set:function(k,v){ try{ if(typeof localStorage!=='undefined') localStorage.setItem(k,v); }catch(e){} },
      del:function(k){ try{ if(typeof localStorage!=='undefined') localStorage.removeItem(k); }catch(e){} }
    };
  }
  function nowMs(opts){ return (opts&&opts.now)?opts.now():Date.now(); }
  function cfg(opts){ return (opts&&opts.cfg)||root.RPW_CFG||{}; }

  function required(opts){ return cfg(opts).AUTH_REQUIRED===true; }

  function session(opts){
    var store=(opts&&opts.store)||defStore();
    var raw=store.get(KEY); if(!raw) return null;
    var o; try{ o=JSON.parse(raw); }catch(e){ return null; }
    if(!o || !o.token) return null;
    if(o.exp && nowMs(opts)>o.exp){ return null; }   // lejárt
    return o;
  }
  function role(opts){ var s=session(opts); return s?s.role:null; }       // KANONIKUS RPW szerep (leképzett)
  function rawRole(opts){ var s=session(opts); return s?s.rawRole:null; }  // valós ERP munkakör (HU)
  function name(opts){ var s=session(opts); return s?s.name:null; }
  function token(opts){ var s=session(opts); return s?s.token:null; }
  function employeeId(opts){ var s=session(opts); return s?s.employeeId:null; }
  function shopId(opts){ var s=session(opts); return s?s.shopId:null; }
  function logout(opts){ ((opts&&opts.store)||defStore()).del(KEY); }

  // ── BEJELENTKEZÉS a MEGLÉVŐ ERP auth-tal (employee_login) ──────────
  // Egy dolgozó = egy vállalati identitás. NINCS külön RPW user/PIN/session.
  // employee_login(SHOP_ID, PIN) → sor {id,name,role,...,token}. A tokent a
  // session_context(token) validálja szerver-oldalon minden secure RPC-ben.
  // A szerep KANONIKUS RPW-szerepre képződik (RPWRoles.mapEmployeeRole) — ha az
  // ERP munkakörnek nincs RPW-joga, hasRpwAccess=false (belépett, de nem dolgozhat RPW-ben).
  async function login(sb, pPin, opts){
    opts=opts||{};
    var shop=opts.shopId || cfg(opts).SHOP_ID;
    if(!shop) return {ok:false, error:'no_shop'};
    try{
      var res=await sb.rpc('employee_login',{p_shop:shop, p_pin:pPin});
      if(res && res.error) return {ok:false, error:'server'};
      var rows=res && res.data;
      var row=Array.isArray(rows) ? rows[0] : rows;   // RETURNS TABLE → tömb
      if(!row || !row.token) return {ok:false, error:'invalid'};   // rossz PIN vagy zárolás
      var canon = root.RPWRoles ? RPWRoles.mapEmployeeRole(row.role) : null;
      var ttlMs=(opts.ttlHours||12)*3600*1000;        // a szerver-session 12 óra
      var rec={ token:row.token, role:canon, rawRole:row.role, name:row.name,
                employeeId:row.id, shopId:row.shop_id, exp: nowMs(opts)+ttlMs };
      ((opts.store)||defStore()).set(KEY, JSON.stringify(rec));
      return {ok:true, role:canon, rawRole:row.role, name:row.name, hasRpwAccess:(canon!=null)};
    }catch(e){ return {ok:false, error:'network'}; }
  }

  // Böngésző-őr: ha kötelező az auth és nincs (érvényes) munkamenet → login oldalra.
  function guard(opts){
    opts=opts||{};
    if(!required(opts)) return true;             // KI → nincs hatás
    if(session(opts)) return true;
    if(typeof location!=='undefined'){
      try{ location.assign('rpw-login.html?next='+encodeURIComponent(location.pathname+location.search)); }catch(e){}
    }
    return false;
  }

  var API={ required:required, session:session, role:role, rawRole:rawRole, name:name, token:token,
            employeeId:employeeId, shopId:shopId, login:login, logout:logout, guard:guard, KEY:KEY };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWAuth=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
