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
    var bad=[];
    if(cfg.AUTH_REQUIRED!==true)            bad.push('AUTH_REQUIRED');
    if(cfg.PATCH_RPC!=='rpw_patch_v3')      bad.push('PATCH_RPC');
    if(cfg.SERVER_TRANSITIONS!==true)       bad.push('SERVER_TRANSITIONS');
    if(cfg.STORAGE_PRIVATE!==true)          bad.push('STORAGE_PRIVATE');
    return {ok:bad.length===0, production:true, invalid:bad};
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
  var API={ productionSafety:productionSafety, enforce:enforce };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWGuard=API;
  // Böngészőben AZONNAL érvényesít (Node-ban nincs document → kihagyja).
  try{ if(typeof document!=='undefined') enforce(); }catch(e){}
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
