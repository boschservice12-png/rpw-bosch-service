/* ============================================================
   rpw-save.js — RPW robusztus mentőréteg (PHASE 1)
   Célok (a megbízás #2 pontja):
     - azonnali lokális recovery-másolat
     - VALÓDI Promise: await megvárja a (debounce-olt) szerverírást
     - csak megerősített szerver-siker után resolve; hibán strukturált eredmény
     - explicit {data,error} + hálózat/timeout/permission/conflict/offline ág
     - látható szinkron-állapotok onState() callbackkel
     - offline sor + KORLÁTOS exponenciális backoff (nincs végtelen ciklus)
     - flushPendingWrites(), getSyncState(), hasPending()
     - beforeunload védelem segéd (bindBeforeUnload)
   Keretrendszer-mentes, böngésző+node kompatibilis (globált ad: RPWSave).
   ============================================================ */
(function(root){
  'use strict';
  var LS = (typeof localStorage!=='undefined') ? localStorage : null;
  function lsSet(k,v){ try{ if(LS) LS.setItem(k,v); }catch(e){} }
  function lsGet(k){ try{ return LS?LS.getItem(k):null; }catch(e){ return null; } }
  function lsDel(k){ try{ if(LS) LS.removeItem(k); }catch(e){} }
  function online(){ return (typeof navigator==='undefined' || navigator.onLine!==false); }

  // Supabase/PostgREST hiba osztályozás → felhasználói állapot
  function classify(error){
    if(!error) return 'unknown';
    var code = (error.code||'') + '';
    var msg  = ((error.message||'') + '').toLowerCase();
    if(code==='42501' || msg.indexOf('permission')>=0 || msg.indexOf('rls')>=0 || msg.indexOf('policy')>=0) return 'permission';
    if(code==='23505' || msg.indexOf('conflict')>=0 || msg.indexOf('duplicate')>=0) return 'conflict';
    if(msg.indexOf('jwt')>=0 || msg.indexOf('auth')>=0 || code==='401') return 'auth';
    if(msg.indexOf('timeout')>=0) return 'timeout';
    if(msg.indexOf('network')>=0 || msg.indexOf('fetch')>=0 || msg.indexOf('failed to fetch')>=0) return 'network';
    return 'error';
  }
  var RETRYABLE = { network:1, timeout:1, error:1 };  // permission/conflict/auth NEM; offline külön (poll)

  // ── VÉDETT WORKFLOW-MEZŐK (a 006-os migráció listája) ──────────────
  // A szerver az EGÉSZ patch-et elutasítja, ha ilyen mező szerepel benne —
  // akkor is, ha az ÉRTÉKE változatlan:
  //     {"ok":false,"error":"protected_workflow_field",
  //      "fields":["phase","inchis","phases.1.status"]}
  // A normál mentés a TELJES munkaobjektumot küldi, amiben ezek MINDIG
  // benne vannak. Enélkül a szűrés nélkül a 006 után egyetlen mentés sem
  // menne át. Az igazság forrása a SZERVER (`rpw_protected_fields`); ez a
  // lista csak azért van, hogy ne küldjünk eleve elutasítandó kérést.
  // A workflow-mezőket kizárólag a `rpw_transition` írhatja.
  var PROTECTED_TOP = ['phase','phases','inchis','rework','completedBy','finished',
                       'started','reopened','skipReason','override','transition',
                       'workflowState','history'];
  var PROTECTED_IN_CLOSING = ['status','closed','completed'];
  function stripProtected(job){
    var out={}, k;
    if(!job || typeof job!=='object') return job;
    for(k in job){
      if(!Object.prototype.hasOwnProperty.call(job,k)) continue;
      if(PROTECTED_TOP.indexOf(k)>=0) continue;
      out[k]=job[k];
    }
    // A `closing` marad — csak a három védett kulcsa nem (closedAt/handoverAt igen).
    if(out.closing && typeof out.closing==='object' && !Array.isArray(out.closing)){
      var c={}, ck;
      for(ck in out.closing){
        if(!Object.prototype.hasOwnProperty.call(out.closing,ck)) continue;
        if(PROTECTED_IN_CLOSING.indexOf(ck)>=0) continue;
        c[ck]=out.closing[ck];
      }
      out.closing=c;
    }
    return out;
  }

  // ── A SZERVER `{ok:false}` VÁLASZA NEM SIKER ──────────────────────
  // A `rpw_patch_v3` az elutasítást a VÁLASZ TÖRZSÉBEN adja vissza, nem
  // hibaként. Enélkül az elutasított mentés „✓ Salvat pe server"-ként
  // jelent meg: a felhasználó zöld pipát látott, a szerveren viszont
  // nem volt ott az adat.
  function serverRejection(d){
    if(!d || typeof d!=='object') return null;
    if(d.conflict) return { kind:'conflict', serverVersion:d.server_version };
    if(d.ok === false){
      var code=String(d.error||'');
      var kind = (code==='version_conflict') ? 'conflict'
               : (code==='unauthorized'||code==='not_allowed') ? 'permission'
               : 'rejected';                       // protected_workflow_field, expected_version_required, …
      return { kind:kind, code:code, message:d.message, serverVersion:d.server_version,
               fields:d.fields||null };
    }
    return null;
  }

  function createSaver(opts){
    opts = opts || {};
    var sb        = opts.sb;                        // supabase kliens (rpc-t hív)
    var rpc       = opts.rpcName || 'rpw_patch_v2'; // optimista zár + audit (v2); 'rpw_patch' a régi
    var useLock   = (opts.optimisticLock===true);   // ALAPBÓL KI: egész-job patch mellett a verzió-zár hamis konfliktust okoz; a védelmet a szerver-oldali deep-merge adja
    var actor     = opts.actor || null;             // audithoz (opcionális)
    var onState   = typeof opts.onState==='function' ? opts.onState : function(){};
    var debounceMs= opts.debounceMs!=null ? opts.debounceMs : 800;
    var timeoutMs = opts.timeoutMs || 8000;
    var maxRetry  = opts.maxRetry  || 5;
    var backoffBase = opts.backoffBase || 500;      // 500,1000,2000,4000,8000 (cap 15s)
    var isOnline  = typeof opts.online==='function' ? opts.online : online;  // injektálható (teszt)

    var state='idle', pendingJob=null, timer=null, retry=0, waiters=[], flushing=false;

    // ── TARTÓS SOR ────────────────────────────────────────────────
    // Enélkül a nem elküldött mentés csak a memóriában él: oldalfrissítés
    // után senki nem küldi újra, és a munka némán helyben marad.
    // A sor IndexedDB-ben tárol, tehát TÚLÉLI az újratöltést.
    function Q(){
      if(opts.queue !== undefined) return opts.queue;              // teszt: injektálható
      try{ return (root.RPWQueue && root.RPWQueue.shared) ? root.RPWQueue.shared() : null; }
      catch(e){ return null; }
    }
    function enqueue(job, kind){
      var q=Q(); if(!q) return;
      try{ q.enqueue(job.id, stripProtected(job),
                     (typeof job.version==='number'?job.version:null)); }catch(e){}
    }
    function dequeue(id){
      var q=Q(); if(!q) return;
      try{ q.remove(id); }catch(e){}
    }

    function setState(s, info){ state=s; try{ onState(s, info||null); }catch(e){} }
    function localWrite(job){
      lsSet('rpw_job_'+job.id, JSON.stringify(job));
      lsSet('rpw_job_ts_'+job.id, new Date(opts.now?opts.now():Date.now()).toISOString());
      lsSet('rpw_pending_'+job.id, '1');   // szinkronizálatlan jelző (recovery + beforeunload)
    }
    function clearPending(id){ lsDel('rpw_pending_'+id); }

    function settle(ok, payload){
      var w=waiters; waiters=[];
      w.forEach(function(fn){ try{ fn(ok, payload); }catch(e){} });
    }

    async function pushOnce(job){
      if(!isOnline()) return { ok:false, kind:'offline' };
      var timeoutP = new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('timeout')); }, timeoutMs); });
      try{
        // A normál mentés SOHA nem visz workflow-mezőt (lásd stripProtected).
        var patch = stripProtected(job);
        var useRpc=rpc, params = { p_id: job.id, p_patch: patch };
        // AUTH-tudatos: token esetén a token-ellenőrzött secure útvonal
        var _a=root.RPWAuth;
        // J (2026-08-24): a verziózár MINDKÉT úton működik.
        // Korábban `else if` volt: amint volt token, a zár ága sosem futott le.
        if(_a && _a.required && _a.required() && _a.token && _a.token()){
          useRpc='rpw_patch_v3';
          // A `rpw_patch_v3` KÖTELEZŐEN kéri a verziót: nélküle
          // `expected_version_required`. Ezért itt nem az `useLock` dönt.
          params={ p_id: job.id, p_patch: patch, p_token: _a.token(),
                   p_expected_version: (typeof job.version==='number') ? job.version : null,
                   p_phase: (job.phase != null) ? String(job.phase) : null };
        } else if(rpc === 'rpw_patch_v2'){
          params.p_expected_version = (useLock && typeof job.version === 'number') ? job.version : null;
          params.p_actor = actor;
          params.p_phase = (job.phase != null) ? String(job.phase) : null;
        }
        var res = await Promise.race([ sb.rpc(useRpc, params), timeoutP ]);
        if(res && res.error) return { ok:false, kind:classify(res.error), error:res.error };
        var d = res ? res.data : null;
        var rej = serverRejection(d);
        if(rej) return { ok:false, kind:rej.kind, code:rej.code, error:rej,
                         serverVersion:rej.serverVersion };
        return { ok:true, data: (d && d.data !== undefined) ? d.data : d, version: (d ? d.version : undefined) };
      }catch(e){
        return { ok:false, kind: (e && e.message==='timeout') ? 'timeout' : 'network', error:e };
      }
    }

    async function attempt(){
      if(!pendingJob) return;
      var job = pendingJob;
      setState('syncing');
      var r = await pushOnce(job);
      if(r.ok){
        retry=0;
        if(typeof r.version === 'number') job.version = r.version;   // optimista: helyi verzió frissítése
        // csak akkor tekintjük kész-nek, ha közben nem érkezett újabb változás ugyanarra a jobra
        if(pendingJob===job){ pendingJob=null; clearPending(job.id); dequeue(job.id);
          setState('synced'); settle(true,{data:r.data, version:r.version}); }
        else { schedule(0); } // időközben új változás jött → újra
        return;
      }
      // offline: NEM hiba, nem égeti a retry-ket — periodikus poll, amíg vissza nem tér a hálózat
      if(r.kind==='offline'){
        enqueue(job, 'offline');        // TARTÓSAN eltesszük — az újratöltést is túléli
        setState('offline', {});
        // az await-elő hívó NE lógjon: azonnal strukturált 'offline' eredmény,
        // a munka a lokális cache-ben + pending jelzőben marad, a háttér-poll folytatódik
        settle(false, { kind:'offline', queued:true });
        timer = setTimeout(attempt, Math.min(opts.offlinePollMs||3000, 5000));
        return;
      }
      // hiba
      if(RETRYABLE[r.kind] && retry < maxRetry){
        retry++;
        var wait = Math.min(backoffBase * Math.pow(2, retry-1), 15000);
        setState(r.kind==='offline' ? 'offline' : 'retry', { attempt:retry, wait:wait, kind:r.kind });
        timer = setTimeout(attempt, wait);
      }else{
        // Kimerült a retry, de a hiba ÚJRAPRÓBÁLHATÓ fajta (hálózat/időtúllépés):
        // a sorba tesszük, hogy később — akár újratöltés után — elmenjen.
        // A `permission`/`conflict`/`auth`/`rejected` NEM kerül sorba: azt az
        // újraküldés sem javítaná meg, csak örökre ott ragadna.
        if(RETRYABLE[r.kind]) enqueue(job, r.kind);
        // nem újrapróbálható (permission/conflict/auth) VAGY kimerült a retry
        setState(r.kind==='permission' ? 'permission'
               : r.kind==='conflict'   ? 'conflict'
               : r.kind==='auth'       ? 'auth'
               : 'failed', { kind:r.kind, code:r.code, error:r.error,
                             attempts:retry, serverVersion:r.serverVersion });
        settle(false, { kind:r.kind, error:r.error, serverVersion:r.serverVersion });
        // a lokális példány + pending jelző MEGMARAD → nem vész el a munka
      }
    }

    function schedule(delay){
      if(timer){ clearTimeout(timer); }
      timer = setTimeout(attempt, delay!=null?delay:debounceMs);
    }

    // Fő API: save(job) → valódi Promise, ami a szerver-eredményre oldódik
    function save(job){
      if(!job || !job.id) return Promise.reject(new Error('no job id'));
      localWrite(job);                 // azonnali recovery
      setState('saving_local');
      pendingJob = job;
      retry = 0;
      schedule(debounceMs);
      return new Promise(function(resolve, reject){
        waiters.push(function(ok, payload){ ok ? resolve(payload) : resolve({ failed:true, ...payload }); });
        // Megjegyzés: szándékosan resolve strukturált hibával (nem reject), hogy a hívó
        // await-je ne dobjon — a state már jelzi a hibát; aki reject-et akar, a payload.failed-et nézi.
      });
    }

    // Azonnali kiírás (pl. fázisváltás/oldalzárás előtt)
    async function flush(){
      if(timer){ clearTimeout(timer); timer=null; }
      if(!pendingJob) return { ok:true, empty:true };
      var p = new Promise(function(resolve){ waiters.push(function(ok,payload){ resolve({ ok:ok, ...payload }); }); });
      attempt();
      return p;
    }

    function hasPending(){ return !!pendingJob; }
    function getSyncState(){ return state; }

    return { save:save, flush:flush, hasPending:hasPending, getSyncState:getSyncState, _classify:classify };
  }

  // beforeunload védő + best-effort sendBeacon
  function bindBeforeUnload(saver, warnText){
    if(typeof window==='undefined') return;
    window.addEventListener('beforeunload', function(e){
      if(saver.hasPending()){
        try{ saver.flush(); }catch(_){}
        e.preventDefault(); e.returnValue = warnText || '';
        return warnText || '';
      }
    });
    // ha visszatér a hálózat, próbáljuk üríteni
    if(typeof window!=='undefined' && window.addEventListener){
      window.addEventListener('online', function(){ if(saver.hasPending()){ try{ saver.flush(); }catch(_){}}});
    }
  }

  // Egyszeri, MEGERŐSÍTETT szerver-mentés (kritikus fázisváltáshoz). Awaitolt.
  // Visszaad: {ok:true} igazolt szerver-siker esetén, különben {ok:false, kind}.
  async function commitConfirmed(sb, job, opts){
    opts=opts||{};
    var rpc=opts.rpcName||'rpw_patch';
    var timeoutMs=opts.timeoutMs||8000;
    // lokális recovery-másolat előbb
    lsSet('rpw_job_'+job.id, JSON.stringify(job));
    lsSet('rpw_job_ts_'+job.id, new Date().toISOString());
    if(!online()) return {ok:false, kind:'offline'};
    var timeoutP=new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('timeout')); }, timeoutMs); });
    try{
      var useRpc=rpc, params={ p_id: job.id, p_patch: job };
      var _a=root.RPWAuth;
      // J: a hitelesített út is verziózárral (lásd fent)
      if(_a && _a.required && _a.required() && _a.token && _a.token()){
        useRpc='rpw_patch_v3';
        params={ p_id: job.id, p_patch: job, p_token: _a.token(),
                 p_expected_version:(typeof job.version==='number'?job.version:null),
                 p_phase:(job.phase!=null?String(job.phase):null) };
      } else if(rpc==='rpw_patch_v2'){ params.p_expected_version=null; params.p_actor=opts.actor||null; params.p_phase=(job.phase!=null?String(job.phase):null); }
      var res=await Promise.race([ sb.rpc(useRpc, params), timeoutP ]);
      if(res && res.error) return {ok:false, kind:classify(res.error), error:res.error};
      var d=res?res.data:null;
      // Ez a KRITIKUS mentés (helyi fázisváltás után) — itt SEM siker az
      // `{ok:false}`. Ez a mentés szándékosan viszi a workflow-mezőket,
      // ezért csak akkor futhat, ha a szerveroldali átmenet KI van kapcsolva.
      var rej=serverRejection(d);
      if(rej) return {ok:false, kind:rej.kind, code:rej.code, error:rej};
      lsDel('rpw_pending_'+job.id);
      return {ok:true, data:(d&&d.data!==undefined)?d.data:d};
    }catch(e){
      return {ok:false, kind:(e&&e.message==='timeout')?'timeout':'network', error:e};
    }
  }

  // ── KÓDREVIEW #6 (2026-08-29) — A FÜGGŐ MENTÉS NE VESSZEN EL ──────
  // A fázislapok `saveJ()`-e 500-600 ms-ra késlelteti a mentést. A
  // `bindBeforeUnload` csak FIGYELMEZTET; a lapok pedig nem is azt
  // használják, hanem saját `setTimeout`-ot. Aki fél másodpercen belül
  // zárja be a fület a számlaszám megadása után, az csendben elveszti a
  // szerkesztést — és a UI már mutatta az új értéket. Ez a legrosszabb
  // fajta veszteség: a felhasználó biztos benne, hogy mentve van.
  //
  // Itt egy közös kijárat van: a lapok bejelentik a saját ürítőjüket, és
  // MI kötjük be egyszer. A `visibilitychange` azért kell a `pagehide`
  // mellé, mert telefonon a fül bezárása helyett az alkalmazás-váltás a
  // gyakori, és ott a `pagehide` nem mindig fut le.
  var _kijarat = [];
  function onExit(fn){ if(typeof fn === 'function') _kijarat.push(fn); }
  function _uritsMindent(){
    for(var i=0;i<_kijarat.length;i++){ try{ _kijarat[i](); }catch(e){} }
  }
  if(typeof window !== 'undefined' && window.addEventListener){
    try{
      window.addEventListener('pagehide', _uritsMindent);
      if(typeof document !== 'undefined' && document.addEventListener){
        document.addEventListener('visibilitychange', function(){
          if(document.visibilityState === 'hidden') _uritsMindent();
        });
      }
    }catch(e){}
  }

  var api = { createSaver:createSaver, bindBeforeUnload:bindBeforeUnload, classify:classify,
              onExit:onExit, flushExit:_uritsMindent,
              commitConfirmed:commitConfirmed, stripProtected:stripProtected,
              serverRejection:serverRejection, PROTECTED_TOP:PROTECTED_TOP };
  if(typeof module!=='undefined' && module.exports){ module.exports = api; }
  root.RPWSave = api;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
