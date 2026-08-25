/* ============================================================
   rpw-guard.js — PRODUCTION CONFIGURATION SAFETY (item 27)
   ------------------------------------------------------------
   Megakadályozza, hogy egy rossz config-deployment VISSZANYISSA a
   biztonsági rést. Ha RPW_CFG.PRODUCTION===true, akkor MINDEN security
   flagnek a biztonságos értéken kell állnia — különben az app NEM indul,
   hanem „PRODUCTION CONFIGURATION INVALID"-ot mutat (hard fail).
   Alapból PRODUCTION=false → dormant (a jelenlegi élesítés-előtti app fut).

   Node + böngésző. Globál: window.RPWGuard
   ============================================================ */
(function(root){
  'use strict';
  // Tiszta függvény (tesztelhető): visszaadja, biztonságos-e a config prod módban.
  function productionSafety(cfg){
    cfg = cfg || root.RPW_CFG || {};
    if(cfg.PRODUCTION!==true) return {ok:true, production:false, invalid:[]};
    // ── 15 (v3) — MIND A KILENC FELTÉTEL ────────────────────────────
    // Az első négy kliensoldali beállítás. Az utolsó öt olyan tény,
    // amit CSAK ellenőrzés után szabad true-ra állítani — a nevük
    // szándékosan „VERIFIED"/„PASSED", nem „ENABLED".
    var bad=[];
    if(cfg.AUTH_REQUIRED!==true)                 bad.push('AUTH_REQUIRED');
    if(cfg.PATCH_RPC!=='rpw_patch_v3')           bad.push('PATCH_RPC');
    if(cfg.SERVER_TRANSITIONS!==true)            bad.push('SERVER_TRANSITIONS');
    if(cfg.STORAGE_PRIVATE!==true)               bad.push('STORAGE_PRIVATE');
    if(cfg.RLS_LOCKDOWN_VERIFIED!==true)         bad.push('RLS_LOCKDOWN_VERIFIED');
    if(cfg.RPC_CONSISTENCY_VERIFIED!==true)      bad.push('RPC_CONSISTENCY_VERIFIED');
    if(cfg.BUSINESS_GATES_SERVER_SIDE!==true)    bad.push('BUSINESS_GATES_SERVER_SIDE');
    if(cfg.INTEGRATION_TESTS_PASSED!==true)      bad.push('INTEGRATION_TESTS_PASSED');
    if(cfg.ALL_ACTIVE_EMPLOYEES_HAVE_PIN!==true) bad.push('ALL_ACTIVE_EMPLOYEES_HAVE_PIN');
    return {ok:bad.length===0, production:true, invalid:bad};
  }

  // ── 15 (v3) — A SZERVER IS MONDJA MEG, MIT TUD ────────────────────
  // A kliensoldali flag csak szándék. Ez a szervert kérdezi meg, és
  // ütközés esetén MEGÁLLÍTJA az alkalmazást — román üzenettel.
  var REQUIRED_RPCS = ['rpw_jobs_list','rpw_job_get','rpw_patch_v3','rpw_transition',
                       'rpw_job_trash','rpw_job_restore','rpw_job_purge',
                       'rpw2_session','rpw2_login','rpw_requirements'];
  var MIN_SCHEMA = '005';

  function checkCapabilities(cap, cfg){
    cfg = cfg || root.RPW_CFG || {};
    var problems = [];
    if(!cap || cap.ok !== true){
      return { ok:false, problems:['no_capabilities'],
               message:'Serverul nu răspunde la verificarea de versiune.' };
    }
    if(String(cap.schema_version||'') < MIN_SCHEMA){
      problems.push('schema_version:' + cap.schema_version + '<' + MIN_SCHEMA);
    }
    var have = cap.rpcs || [];
    REQUIRED_RPCS.forEach(function(r){
      if(have.indexOf(r) < 0) problems.push('missing_rpc:' + r);
    });
    if(cfg.PRODUCTION === true){
      if(cap.rls_locked !== true)                 problems.push('rls_not_locked');
      if(cap.business_gates_server_side !== true) problems.push('business_gates_client_only');
      if(cap.storage_mode !== 'private')          problems.push('storage_not_private');
    }
    return { ok: problems.length === 0, problems: problems,
             message: problems.length
               ? 'Versiunea serverului nu corespunde aplicației. Contactează administratorul.'
               : null,
             capabilities: cap };
  }

  // Induláskor hívandó. Ütközésnél megállítja az alkalmazást.
  async function verifyServer(sb, cfg){
    cfg = cfg || root.RPW_CFG || {};
    try{
      // időtúllépés: a válasz nélküli várakozás sem „rendben"
      var timeoutMs = cfg.CAPABILITY_TIMEOUT_MS || 8000;
      var res = await Promise.race([
        sb.rpc('rpw_server_capabilities', {}),
        new Promise(function(_, rej){
          setTimeout(function(){ rej(new Error('capability_timeout')); }, timeoutMs);
        })
      ]);
      var cap = res && res.data;
      if(typeof cap === 'string'){ try{ cap = JSON.parse(cap); }catch(e){ cap = null; } }
      var r = checkCapabilities(cap, cfg);
      if(!r.ok) halt(r.message, r.problems);
      return r;
    }catch(e){
      // ── 11 (v4) — PRODUCTION-BAN FAIL-CLOSED ────────────────────
      // A V3-ban a hálózati hiba NEM állította le az alkalmazást.
      // Csakhogy: ha nem tudjuk ellenőrizni, hogy a szerver biztonságos-e,
      // akkor NEM tudjuk, hogy biztonságos-e. Production módban ez
      // megállást jelent.
      var prod = (cfg || root.RPW_CFG || {}).PRODUCTION === true;
      if(prod){
        halt('Nu se poate verifica versiunea serverului. Aplicația s-a oprit.',
             ['capability_unreachable']);
        return { ok:false, problems:['capability_unreachable'], halted:true, error:e };
      }
      // Fejlesztői módban csak jelezzük — és NEM állítjuk magunkról,
      // hogy production vagyunk.
      return { ok:false, problems:['network'], production:false, message:null, error:e };
    }
  }

  function halt(message, problems){
    if(typeof document === 'undefined') return;
    var paint = function(){
      if(!document.body) return;
      var wrap = document.createElement('div');
      wrap.style.cssText='position:fixed;inset:0;background:#111;color:#fff;z-index:99999;'+
                         'display:flex;align-items:center;justify-content:center;text-align:center;padding:24px';
      var box = document.createElement('div');
      var t1 = document.createElement('div'); t1.style.cssText='font-size:40px'; t1.textContent='\u26D4';
      var t2 = document.createElement('div');
      t2.style.cssText='font-size:18px;font-weight:800;color:#ff5a5a;margin:12px 0';
      t2.textContent = message || 'Eroare de versiune.';
      var t3 = document.createElement('div');
      t3.style.cssText='font-size:12px;opacity:.7';
      t3.textContent = (problems||[]).join(', ');
      box.appendChild(t1); box.appendChild(t2); box.appendChild(t3);
      wrap.appendChild(box); document.body.appendChild(wrap);
    };
    root.RPW_CFG = null;   // nincs config → nincs DB-kliens
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',paint);
    else paint();
  }
  // Böngésző: ha prod-config érvénytelen, HARD FAIL (nem indul silent insecure módban).
  function enforce(){
    if(typeof location!=='undefined' && location.protocol==='file:') return {ok:true};
    var r=productionSafety(root.RPW_CFG);
    if(!r.ok && typeof document!=='undefined'){
      var msg='PRODUCTION CONFIGURATION INVALID: '+r.invalid.join(', ');
      var paint=function(){ if(document.body){ document.body.innerHTML=
        '<div style="position:fixed;inset:0;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;font-family:system-ui,Arial;padding:24px;z-index:2147483647">'
        +'<div><div style="font-size:40px">&#9940;</div><div style="font-size:18px;font-weight:800;color:#ff5a5a;margin:12px 0">PRODUCTION CONFIGURATION INVALID</div>'
        +'<div style="font-size:13px;opacity:.85">Hiányzó biztonságos beállítás: '+r.invalid.join(', ')+'<br>Az RPW NEM indul biztonságos mód nélkül.</div></div></div>'; } };
      root.RPW_CFG=null;   // nincs config → nincs DB-kliens → nincs silent insecure működés
      if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',paint); else paint();
      try{ console.error(msg); }catch(e){}
      return r;
    }
    return r;
  }
  var API={ productionSafety:productionSafety, enforce:enforce,
            checkCapabilities:checkCapabilities, verifyServer:verifyServer,
            REQUIRED_RPCS:REQUIRED_RPCS, MIN_SCHEMA:MIN_SCHEMA };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWGuard=API;
  // Böngészőben AZONNAL érvényesít (Node-ban nincs document → kihagyja).
  try{ if(typeof document!=='undefined') enforce(); }catch(e){}
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
