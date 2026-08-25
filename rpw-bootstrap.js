/* ════════════════════════════════════════════════════════════════
   rpw-bootstrap.js — KÖZÖS INDÍTÁSI MODUL (a feladat 29. pontja)

   Egyetlen, ellenőrzött indulási sorrend minden oldalnak:
     config → auth → Supabase-kliens → RPWData → szerver-capabilities
     → oldal-inicializálás
   BÁRMELYIK lépés hibája FAIL-CLOSED: az oldal üzleti logikája nem
   indul el, a hívó pontos okot kap.

   Használat az oldalon (a modul-szkriptek betöltése után):
     RPWBootstrap.start({ requireJob:true, onReady:function(ctx){...},
                          onFail:function(err){...} });
   ctx: { sb, cfg, session, jobId }

   A modul NEM váltja le a meglévő oldalak kézi inicializálását
   egyetlen lépésben — az átállás oldalanként történik. Az őr-teszt
   (test-bootstrap.js) a modult magát rögzíti; a FUNCTION-GAPS.md
   sorolja fel, mely oldalak állnak még a régi kézi inicializáláson.
   ════════════════════════════════════════════════════════════════ */
(function(root){
  'use strict';

  function fail(code, message, extra){
    var e = { ok:false, code:code, message:message||code };
    if(extra) e.extra = extra;
    return e;
  }

  async function start(opts){
    opts = opts || {};
    var onFail = (typeof opts.onFail==='function') ? opts.onFail : function(){};

    // ── 1. CONFIG ────────────────────────────────────────────────
    var cfg = root.RPW_CFG;
    if(!cfg || !cfg.SB_URL || !cfg.SB_KEY){
      var e1 = fail('no_config','Configurația lipsește — aplicația nu pornește.');
      onFail(e1); return e1;
    }
    // production-zár: érvénytelen éles konfig → nem indulunk
    if(root.RPWGuard && root.RPWGuard.productionSafety){
      var ps = root.RPWGuard.productionSafety(cfg);
      if(!ps.ok){
        var e2 = fail('production_config_invalid','PRODUCTION CONFIGURATION INVALID',{invalid:ps.invalid});
        onFail(e2); return e2;
      }
    }

    // ── 2. AUTH ──────────────────────────────────────────────────
    var session = null;
    if(root.RPWAuth){
      session = root.RPWAuth.session();
      if(cfg.AUTH_REQUIRED===true && !session){
        var e3 = fail('no_session','Autentificare necesară.');
        try{
          if(typeof location!=='undefined')
            location.assign('rpw-login.html?next='+encodeURIComponent(location.pathname+location.search));
        }catch(_){}
        onFail(e3); return e3;
      }
    }

    // ── 3. SUPABASE-KLIENS ───────────────────────────────────────
    if(!root.supabase || typeof root.supabase.createClient!=='function'){
      var e4 = fail('no_supabase','Biblioteca Supabase nu s-a încărcat.');
      onFail(e4); return e4;
    }
    var sb = root.supabase.createClient(cfg.SB_URL, cfg.SB_KEY);

    // ── 4. RPWData ───────────────────────────────────────────────
    if(root.RPWData && typeof root.RPWData.init==='function'){
      try{ root.RPWData.init(sb, { onSync: opts.onSync||null }); }
      catch(e){
        var e5 = fail('data_init_failed', String(e&&e.message||e));
        onFail(e5); return e5;
      }
    }

    // ── 5. SZERVER-CAPABILITIES (fail-closed strict módban) ──────
    if(root.RPWGuard && root.RPWGuard.verifyServer){
      var vr = await root.RPWGuard.verifyServer(sb, cfg);
      // strict módban a guard halt()-olt és nullázta a configot:
      if(root.RPW_CFG == null){
        var e6 = fail('capabilities_failed',
          (vr&&vr.message)||'Serverul nu corespunde aplicației.', {problems:(vr&&vr.problems)||[]});
        onFail(e6); return e6;
      }
    }

    // ── 6. OLDAL-INICIALIZÁLÁS ───────────────────────────────────
    var jobId = null;
    try{
      if(typeof location!=='undefined')
        jobId = new URLSearchParams(location.search).get('job');
    }catch(_){}
    if(opts.requireJob && !jobId){
      var e7 = fail('no_job','Lipsește identificatorul fișei (?job=).');
      onFail(e7); return e7;
    }

    var ctx = { ok:true, sb:sb, cfg:cfg, session:session, jobId:jobId };
    if(typeof opts.onReady==='function'){
      try{ await opts.onReady(ctx); }
      catch(e){
        var e8 = fail('page_init_failed', String(e&&e.message||e));
        onFail(e8); return e8;
      }
    }
    return ctx;
  }

  var API = { start:start };
  if(typeof module!=='undefined' && module.exports){ module.exports = API; }
  root.RPWBootstrap = API;
})(typeof self!=='undefined' ? self : this);
