/* BUILD: AUTH-LIVE-L2A 2026-08-23 */
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
  // Szerver-oldali kijelentkezes: a token visszavonasa. Hiba eseten is
  // toroljuk helyben — a felhasznalo szandeka az elsodleges.
  async function logoutServer(sb, opts){
    var t=token(opts);
    logout(opts);
    if(!t||!sb)return {ok:true};
    try{ await sb.rpc('rpw_logout',{p_token:t}); }catch(e){}
    return {ok:true};
  }
  // A munkamenet ellenorzese a szerveren (a helyi lejarat mellett).
  async function verify(sb, opts){
    var t=token(opts);
    if(!t)return {ok:false, error:'no_token'};
    try{
      var r=await sb.rpc('rpw_session',{p_token:t});
      var out=r&&r.data;
      if(typeof out==='string'){ try{out=JSON.parse(out)}catch(e){out=null} }
      if(!out||out.ok!==true){ logout(opts); return {ok:false, error:(out&&out.error)||'invalid'}; }
      return {ok:true, employee:out.employee};
    }catch(e){ return {ok:true, offline:true}; }   // halozat nelkul a helyi session marad
  }
  // A cég csapata — a bejelentkezett dolgozó szervizéből.
  async function team(sb, opts){
    var t=token(opts);
    if(!t)return {ok:false, error:'no_token'};
    try{
      var r=await sb.rpc('rpw_team',{p_token:t});
      var out=r&&r.data;
      if(typeof out==='string'){ try{out=JSON.parse(out)}catch(e){out=null} }
      if(!out||out.ok!==true)return {ok:false, error:(out&&out.error)||'invalid'};
      return {ok:true, team:out.team||[]};
    }catch(e){ return {ok:false, error:'network'}; }
  }

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
      // Nev + PIN (opts.employeeId) — igy nem lehet PIN-utkozes ket ember kozott.
      // employeeId nelkul a regi, csak-PIN-es ut fut (visszafele kompatibilitas).
      var res = opts.employeeId
        ? await sb.rpc('rpw_login_named',{p_shop_id:shop, p_employee_id:opts.employeeId, p_pin:pPin})
        : await sb.rpc('rpw_login',      {p_shop_id:shop, p_pin:pPin});
      if(res && res.error) return {ok:false, error:'server'};
      var out=res && res.data;
      if(typeof out==='string'){ try{out=JSON.parse(out)}catch(e){out=null} }
      if(!out || out.ok!==true) return {ok:false, error:(out&&out.error)||'invalid',
                                        seconds:(out&&out.seconds)||null};
      var emp=out.employee||{};
      var canon = root.RPWRoles ? RPWRoles.mapEmployeeRole(emp.role) : null;
      var ttlMs=(opts.ttlHours||12)*3600*1000;        // a szerver-session 12 óra
      var nm=String(emp.name||'').trim();          // az ERP-ben szokozos nevek vannak
      var rec={ token:out.token, role:canon, rawRole:emp.role, name:nm,
                employeeId:emp.id, shopId:emp.shop_id, dept:emp.department,
                exp: nowMs(opts)+ttlMs };
      ((opts.store)||defStore()).set(KEY, JSON.stringify(rec));
      return {ok:true, role:canon, rawRole:emp.role, name:nm, hasRpwAccess:(canon!=null)};
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

  // Az AUDIT szereploje: a bejelentkezett ember NEVE. Ha nincs bejelentkezve,
  // 'service' — hogy a regi viselkedes ne torjon el.
  function actor(opts){ var n=name(opts); return (n&&String(n).trim())||'service'; }

  var API={ required:required, session:session, role:role, rawRole:rawRole, name:name, token:token,
            employeeId:employeeId, shopId:shopId, login:login, logout:logout, guard:guard,
            logoutServer:logoutServer, verify:verify, team:team, actor:actor, KEY:KEY };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWAuth=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
