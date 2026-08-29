/* BUILD: OWN-STAFF-L3A 2026-08-23 */
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

  // A tarolot is a `root`-on keresztul erjuk el (self===window a bongeszoben).
  function ls(){ try{ return root.localStorage||null }catch(e){ return null } }
  function defStore(){
    return {
      get:function(k){ try{ var s=ls(); return s?s.getItem(k):null; }catch(e){ return null; } },
      set:function(k,v){ try{ var s=ls(); if(s) s.setItem(k,v); }catch(e){} },
      del:function(k){ try{ var s=ls(); if(s) s.removeItem(k); }catch(e){} }
    };
  }
  function nowMs(opts){ return (opts&&opts.now)?opts.now():Date.now(); }
  function cfg(opts){ return (opts&&opts.cfg)||root.RPW_CFG||{}; }

  function required(opts){ return cfg(opts).AUTH_REQUIRED===true; }

  // ── P0.1 (2026-08-23) — SZIGORÍTOTT munkamenet-ellenőrzés ────────
  // Korábban két rés volt:
  //   1) `if(o.exp && ...)` — LEJÁRAT NÉLKÜLI rekord soha nem járt le
  //   2) `if(!o.token)`     — egyetlen karakternyi token is átment
  // Így a localStorage-ba kézzel írt {token:"x"} örökre megnyitotta
  // a védett oldalakat. A szerver elutasította volna a hívásokat, de
  // az oldal (és az adminfelület) látszott.
  var TOKEN_MIN=32;                     // a szerver 64 hex karaktert ad
  function session(opts){
    var store=(opts&&opts.store)||defStore();
    var raw=store.get(KEY); if(!raw) return null;
    var o; try{ o=JSON.parse(raw); }catch(e){ return null; }
    if(!o || typeof o!=='object') return null;
    if(typeof o.token!=='string' || o.token.length<TOKEN_MIN) return null;
    if(typeof o.exp!=='number' || !isFinite(o.exp)) return null;   // lejárat KÖTELEZŐ
    if(nowMs(opts) > o.exp) return null;                            // lejárt
    return o;
  }
  function role(opts){ var s=session(opts); return s?s.role:null; }       // KANONIKUS RPW szerep (leképzett)
  function rawRole(opts){ var s=session(opts); return s?s.rawRole:null; }  // valós ERP munkakör (HU)
  function name(opts){ var s=session(opts); return s?s.name:null; }
  function token(opts){ var s=session(opts); return s?s.token:null; }
  function employeeId(opts){ var s=session(opts); return s?s.employeeId:null; }
  function shopId(opts){ var s=session(opts); return s?s.shopId:null; }
  function logout(opts){
    ((opts&&opts.store)||defStore()).del(KEY);
    // D (2026-08-24): a helyi gyorsítótár is ürül — közös gépen a
    // következő belépő ne lássa az előző munkáit.
    try{ if(root.RPWCache) root.RPWCache.wipe(); }catch(e){}
  }
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
      var r=await sb.rpc('rpw2_session',{p_token:t});
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
      // ── ÖNÁLLÓ SZEMÉLYZET (2026-08-23) ─────────────────────────────
      // Az RPW saját rpw_employees / rpw_roles tábláiból dolgozik: egy
      // berlini szerviznek nincs Red ERP-je, neki magának kell felvinnie
      // az embereit. A régi (ERP-alapú) út tartalékként megmarad.
      var res = opts.employeeId
        ? await sb.rpc('rpw2_login',{p_shop_id:shop, p_employee_id:opts.employeeId, p_pin:pPin})
        : await sb.rpc('rpw_login', {p_shop_id:shop, p_pin:pPin});   // régi tartalék
      if(res && res.error) return {ok:false, error:'server'};
      var out=res && res.data;
      if(typeof out==='string'){ try{out=JSON.parse(out)}catch(e){out=null} }
      if(!out || out.ok!==true) return {ok:false, error:(out&&out.error)||'invalid',
                                        seconds:(out&&out.seconds)||null};
      var emp=out.employee||{};
      var canon = root.RPWRoles ? RPWRoles.mapEmployeeRole(emp.role) : null;
      var ttlMs=(opts.ttlHours||12)*3600*1000;        // a szerver-session 12 óra
      var nm=String(emp.name||'').trim();
      // A JOGOSULTSÁG kapcsolókból jön, NEM a szerepkör nevéből: a szerviz
      // "Werkstattleiter"-nek is hívhatja, a rendszer akkor is tudja, mit tehet.
      var rec={ token:out.token, role:canon, rawRole:emp.role, name:nm,
                employeeId:emp.id, shopId:emp.shop_id, dept:emp.department,
                roleCode:emp.role_code||null, can:(emp.can||null),
                exp: nowMs(opts)+ttlMs };
      ((opts.store)||defStore()).set(KEY, JSON.stringify(rec));
      return {ok:true, role:canon, rawRole:emp.role, name:nm, hasRpwAccess:(canon!=null)};
    }catch(e){ return {ok:false, error:'network'}; }
  }

  // ── RPW-001 (2026-08-29) — A BUKOTT OR ALLITSA MEG A LAPOT ───────
  // Eddig a guard() csak ELINDITOTTA az atiranyitast es visszaadott
  // false-t — amit egyetlen hivo sem nezett meg (`try{...}catch(e){}`).
  // Az atiranyitas viszont NEM azonnali: a lap tovabb futott, felepitette
  // a Supabase-klienst, lekerte a listat es kirajzolta az ugyfeleket.
  // Lassu halon ez masodpercekig lathato volt. Mostantol a bukott or
  // elrejti a lapot MEG az elso kepkocka elott, es megjelol egy allapotot,
  // amire az adatreteg (rpw-db.js) is fail-closed modon reagal.
  var _blocked=false;
  function blocked(){ return _blocked===true; }
  // A `root`-on keresztul hivatkozunk a lapra: bongeszoben ez ugyanaz az
  // objektum (self===window), teszteles kozben viszont kovetheto.
  function hidePage(){
    var doc = root.document; if(!doc) return;
    // A `html{display:none}` mar a <head>-ben hat: nincs mit kirajzolni.
    try{
      var st=doc.createElement('style');
      st.setAttribute('data-rpw-block','1');
      st.textContent='html{display:none!important}';
      (doc.head||doc.documentElement).appendChild(st);
    }catch(e){}
    // Kiuritjuk a torzset — de a lapok kozos tartojat (#app) MEGHAGYJUK.
    // Enelkul a lap sajat render()-e a hianyzo tartora hasalna el, mielott
    // az atiranyitas megtortenik: a felhasznalo ebbol semmit nem lat, de a
    // hiba elfedi a valodi okot, es a teszteket is megoli.
    var urit=function(){
      try{
        if(!doc.body) return;
        doc.body.textContent='';
        if(!doc.getElementById('app')){
          var app=doc.createElement('div'); app.id='app'; doc.body.appendChild(app);
        }
      }catch(e){}
    };
    urit();
    if(doc.readyState==='loading') doc.addEventListener('DOMContentLoaded',urit);
  }
  // Böngésző-őr: ha kötelező az auth és nincs (érvényes) munkamenet → login oldalra.
  function guard(opts){
    opts=opts||{};
    if(!required(opts)) return true;             // KI → nincs hatás
    if(session(opts)) return true;
    _blocked=true;
    hidePage();
    // Az `opts.location` ugyanaz a befecskendezheto minta, mint az
    // `opts.store` es az `opts.now` — igy a lezaras tesztelheto.
    var loc = (opts && opts.location) || root.location;
    if(loc){
      // `replace`, nem `assign`: a Vissza gomb ne vigyen a vedett lapra.
      try{ loc.replace('rpw-login.html?next='+encodeURIComponent(loc.pathname+loc.search)); }catch(e){}
    }
    return false;
  }

  // ── RPW-001 — LEJART VAGY VISSZAVONT TOKEN: AZONNALI KILEPTETES ──
  // A verify() letezett, de SEHOL nem hivtuk meg. Egy szerveren mar
  // visszavont token igy a helyi 12 oras lejaratig ervenyes maradt.
  // Halozati hibanal szandekosan NEM leptetunk ki (offline munka),
  // csak akkor, ha a szerver hatarozottan ervenytelennek mondja.
  async function enforceSession(sb, opts){
    if(!required(opts)) return {ok:true, skipped:true};
    if(!session(opts)){ guard(opts); return {ok:false, error:'no_session'}; }
    var r=await verify(sb, opts);
    if(r && r.ok) return r;                      // offline eseten is ervenyes
    logout(opts);                                // a verify mar torolt, de legyen biztos
    guard(opts);
    return {ok:false, error:(r&&r.error)||'invalid'};
  }

  // Az AUDIT szereploje: a bejelentkezett ember NEVE. Ha nincs bejelentkezve,
  // 'service' — hogy a regi viselkedes ne torjon el.
  function actor(opts){ var n=name(opts); return (n&&String(n).trim())||'service'; }

  // ── JOGOSULTSÁG-KAPCSOLÓK ────────────────────────────────────────
  // team · posts · open · reception · work · close · override · delete
  function can(perm, opts){
    var s=session(opts); if(!s) return false;
    var c=s.can; if(!c) return false;
    return c[perm]===true;
  }
  function perms(opts){ var s=session(opts); return (s&&s.can)||null; }

  // ── P0.7 (2026-08-23) — a Netlify funkciok hitelesito fejlece ────
  // Az OCR / classify / sendmail mostantol KOTELEZOEN tokent var.
  // Egy helyen keszitjuk, hogy ne maradjon ki sehol.
  function fnHeaders(extra, opts){
    var h = extra || {};
    if(!h['Content-Type']) h['Content-Type']='application/json';
    var t = token(opts);
    if(t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  var API={ required:required, session:session, role:role, rawRole:rawRole, name:name, token:token,
            employeeId:employeeId, shopId:shopId, login:login, logout:logout, guard:guard,
            blocked:blocked, enforceSession:enforceSession,
            logoutServer:logoutServer, verify:verify, team:team, actor:actor, can:can, perms:perms, fnHeaders:fnHeaders, KEY:KEY };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWAuth=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
