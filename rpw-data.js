/* ============================================================
   rpw-data.js — KÖZPONTI KLIENS ADATRÉTEG (Sprint 1)
   ------------------------------------------------------------
   Egyetlen belépési pont az alkalmazás adat-műveleteihez.
   A RPWDb (auth-tudatos DB) + RPWSave + RPWPhotos + RPWWorkflow
   FÖLÉ épül, és két P0-hiányt zár be:

     P0 #6/#7  VALÓDI OPTIMISTA ZÁR
       • getJob() MINDIG visszaadja a szerver `version`-t;
       • patchJob(id, slice, expectedVersion) CSAK a megváltozott
         SZELETET küldi + expectedVersion-t;
       • ütközésnél (server {conflict:true}) NINCS felülírás — a hívó
         valódi konfliktus-eredményt kap (nem last-write-wins).

     P0 #8  ROLLBACK-PARITÁS
       • transitionJob() a RPWWorkflow.commitCriticalTransition-en
         keresztül fut, amely sikertelen/nem igazolt mentésnél a
         memóriát ÉS a localStorage-t is visszagörgeti.

   FONTOS (őszinteség): a kliens HELYESEN küldi az expectedVersion-t,
   de az ÉLŐ szerveren jelenleg a 0006 (rpw_patch_v2) DEEP-MERGE fut,
   amely a zárat SZÁNDÉKOSAN nem érvényesíti (whole-job korszakból).
   A tényleges szerver-oldali zárat a 0013 (rpw_patch_v3) alkalmazása +
   RPW_CFG.PATCH_RPC='rpw_patch_v3' kapcsolja be. Amíg ez nem történt
   meg élesben, a szerver-oldali zár NEM IGAZOLT (a kliensoldali fél
   egységteszttel igazolt, mock szerverrel).

   Keretrendszer-mentes, böngésző + Node kompatibilis.
   Globál: window.RPWData  /  module.exports = RPWData
   ============================================================ */
(function(root){
  'use strict';

  function _db(){ return root.RPWDb; }
  function _util(){ return root.RPWUtil; }
  function _photos(){ return root.RPWPhotos; }
  function _wf(){ return root.RPWWorkflow; }
  function _save(){ return root.RPWSave; }
  function _cfg(){ return root.RPW_CFG || {}; }

  function classify(err){
    var s=_save();
    if(s && typeof s.classify==='function') return s.classify(err);
    if(!err) return 'unknown';
    var msg=((err.message||'')+'').toLowerCase();
    if(msg.indexOf('permission')>=0) return 'permission';
    if(msg.indexOf('conflict')>=0)   return 'conflict';
    return 'error';
  }
  function nowISO(now){ try{ return new Date(now?now():Date.now()).toISOString(); }catch(e){ return null; } }

  // A kritikus (workflow-állapot) szeletet emeljük ki a jobból — a
  // transitionJob csak ezt a szeletet küldi, nem a teljes objektumot.
  var CRIT_KEYS=['phases','rework','workflowHistory','control','controlChecks','controlNote','production','overrideGrants','phase','evalData','closing'];
  function pickCrit(job){
    var slice={ id: job.id };
    CRIT_KEYS.forEach(function(k){ if(k in job) slice[k]=job[k]; });
    return slice;
  }

  // ── Példány egy adott supabase klienshez kötve ──────────────────────
  // Újraküldhető hibafajták (offline/hálózati/időtúllépés). conflict/permission NEM.
  var RETRYABLE = { network:1, timeout:1, error:1, offline:1 };

  // A sor saját szótára → amit az oldalak jelzője ismer (rpwSyncLabel).
  // Enélkül a felhasználó nyers `saved-local` feliratot látna.
  var QSTATE = { 'saved-local':'offline', waiting:'retry', syncing:'syncing',
                 synced:'synced', conflict:'conflict' };

  function create(sb, opts){
    opts = opts || {};
    var DB = opts.db || _db();
    if(!DB) throw new Error('RPWData: RPWDb hiányzik');
    var actor = opts.actor || null;
    // ── TARTÓS OFFLINE SOR ────────────────────────────────────────
    // 2026-08-25: a modul eddig KÉSZEN állt, de senki nem adta át. Mostantól
    // magától megtalálja a közös példányt, ha a lap betöltötte a rpw-queue.js-t.
    // `opts.queue:false` → kikapcsolva (teszt / szándékos).
    var queue = (opts.queue !== undefined)
      ? (opts.queue || null)
      : ((root.RPWQueue && root.RPWQueue.shared)
          ? root.RPWQueue.shared({ onState: function(jobId, st){ setSync(QSTATE[st] || st); } })
          : null);
    var syncState = 'idle';
    var pendingCount = 0;
    function setSync(s){ syncState=s; if(typeof opts.onState==='function'){ try{opts.onState(s);}catch(e){} } }

    // ---- OLVASÁS -----------------------------------------------------
    async function listJobs(){
      var res = await DB.listActive(sb);
      return { data:(res&&res.data)||[], error:res?res.error:null };
    }
    async function listTrashed(){
      var res = await DB.listTrashed(sb);
      return { data:(res&&res.data)||[], error:res?res.error:null };
    }
    // getJob: MINDIG visszaadja a verziót (optimista zárhoz kötelező)
    async function getJob(id){
      var res = await DB.getRow(sb, id, 'id,data,updated_at,version');
      if(res && res.error) return { data:null, version:null, error:res.error };
      var row = res ? res.data : null;
      if(!row) return { data:null, version:null, error:{message:'not found'} };
      var job = row.data || {};
      if(job.id==null) job.id = row.id;
      var version = (typeof row.version==='number') ? row.version
                  : (typeof job.version==='number' ? job.version : null);
      if(version!=null) job.version = version;
      return { data:job, version:version, error:null };
    }

    // ---- PRIVATE STORAGE WRITE-PATH (PHASE 4) ------------------------
    // Ha STORAGE_PRIVATE=true, a mentendő payload base64 képeit MENTÉS ELŐTT
    // átköltöztetjük privát Storage-ba, és a job JSON csak storage-referenciát
    // tárol (nincs data:image;base64 a business rekordban). A kliens-oldali
    // base64 így csak ÁTMENETI (capture/queue) — a szerver-végállapot referencia.
    // DORMANT: ha STORAGE_PRIVATE nincs bekapcsolva, ez NO-OP → nincs viselkedés-
    // változás (az élő app változatlanul base64-et ment, ahogy eddig).
    async function _migratePhotosIfPrivate(payload){
      try{
        if(!_cfg().STORAGE_PRIVATE) return payload;               // dormant → no-op
        var M = root.RPWMigrate;
        if(!M || typeof M.migrateJob!=='function') return payload; // migrációs réteg nélkül nem kockáztatunk
        // scan: van-e egyáltalán base64 a payloadban? (olcsó kilépés)
        var hasB64=false; try{ hasB64 = JSON.stringify(payload).indexOf('data:image')>=0; }catch(e){}
        if(!hasB64) return payload;
        var r = await M.migrateJob(payload, sb, { actor: actor });
        // ha minden feltöltés sikeres volt, véglegesítjük: a _b64 backupok törlése →
        // a persisted JSON már base64-mentes. Bármely hiba esetén NEM purge-olunk
        // (a base64 backup megmarad → nincs adatvesztés; a rekord piszkos marad,
        //  a verifyNoBase64 majd jelzi, és a hard-migration külön fut).
        if(r && r.errors===0 && r.migrated>0 && typeof M.purgeBackups==='function'){ M.purgeBackups(payload); }
        return payload;
      }catch(e){ return payload; }  // biztonság: soha ne blokkolja a mentést kivétel
    }

    // ---- ÍRÁS --------------------------------------------------------
    // createJob: új dosszié. Biztonságos (CSPRNG) id, ha nincs.
    async function createJob(job){
      job = job || {};
      if(!job.id){ job.id = (_util() ? _util().jobId() : ('RPW-'+String(nowISO()).replace(/\D/g,'').slice(-10))); }
      await _migratePhotosIfPrivate(job);   // PHASE 4: base64 → storage ref (flag-gated)
      pendingCount++; setSync('syncing');
      var res = await DB.patch(sb, job);   // create: nincs mit szeletelni
      pendingCount--;
      if(res && res.error){ setSync('failed'); return { ok:false, id:job.id, error:res.error, kind:classify(res.error) }; }
      setSync(pendingCount>0?'syncing':'synced');
      return { ok:true, id:job.id, data:res?res.data:null };
    }

    // patchJob: CSAK a megváltozott SZELETET küldi + expectedVersion.
    // Ütközésnél (server {conflict:true}) NINCS felülírás.
    async function patchJob(id, slice, expectedVersion){
      if(!id) return { ok:false, error:{message:'no id'} };
      if(!slice || typeof slice!=='object') return { ok:false, error:{message:'no slice'} };
      await _migratePhotosIfPrivate(slice);   // PHASE 4: base64 → storage ref (flag-gated)
      pendingCount++; setSync('syncing');
      var res = await DB.patchV2(sb, id, slice, {
        expected: (expectedVersion!=null ? expectedVersion : undefined),
        actor: actor,
        phase: (slice.phase!=null ? String(slice.phase) : null),
        rpc: opts.rpc
      });
      pendingCount--;
      if(res && res.error){
        var kind=classify(res.error);
        // Tartós sor (ha van): újraküldhető hibánál a szelet a sorba kerül, nem vész el.
        if(queue && RETRYABLE[kind]){
          try{ await queue.enqueue(id, slice, expectedVersion); }catch(e){}
          setSync('waiting');
          return { ok:false, queued:true, kind:kind, error:res.error };
        }
        setSync('failed'); return { ok:false, error:res.error, kind:kind };
      }
      var d = res ? res.data : null;
      if(d && d.conflict){                       // VALÓDI optimista zár: NE írj felül
        setSync('conflict');
        return { ok:false, conflict:true, serverVersion:d.server_version, kind:'conflict' };
      }
      // Siker: ha volt sorban ragadt rekord ehhez a dossziéhoz, töröljük (igazolt).
      if(queue){ try{ await queue.remove(id); }catch(e){} }
      setSync(pendingCount>0?'syncing':'synced');
      return { ok:true, data:(d&&d.data!==undefined)?d.data:d, version:(d?d.version:undefined) };
    }

    // transitionJob: kritikus fázisátmenet (mutáció + MEGERŐSÍTETT,
    // SZELET-alapú mentés + memória/localStorage rollback-paritás).
    // mutate: () => {ok:boolean,...}  (RPWWorkflow-műveletek adják)
    async function transitionJob(job, mutate, txOpts){
      txOpts = txOpts || {};
      var W = _wf();
      if(!W || typeof W.commitCriticalTransition!=='function'){
        return { ok:false, error:'no_workflow' };
      }
      var self = this;
      return await W.commitCriticalTransition(job, mutate, {
        ls: txOpts.ls,
        save: async function(){
          var slice = pickCrit(job);
          var ev = (typeof job.version==='number') ? job.version : undefined;
          var r = await patchJob(job.id, slice, ev);
          if(r && r.ok && typeof r.version==='number'){ job.version = r.version; }  // verzió-léptetés helyben
          return r;  // {ok:...} — saveConfirmed felismeri; conflict → ok:false → rollback
        }
      });
    }

    // ---- SZERVER-OLDALI FÁZISÁTMENETEK (Sprint 5, opt-in) -----------
    // A 0011+0014 tranzakciós RPC-ket hívja (session+szerep+verzió+audit szerveren).
    // Csak AUTH + SERVER_TRANSITIONS mellett használandó; a kliens rpw-workflow.js
    // marad UX-validáció. Egységes {ok|conflict|error} eredmény.
    function serverEnabled(){ return !!(_cfg().SERVER_TRANSITIONS); }
    function authToken(){ var a=root.RPWAuth; return a?a.token():null; }
    // ── 2 (v3) — EGYETLEN, TÉNYLEGESEN LÉTEZŐ SZERVEROLDALI API ──
    // KORÁBBAN hat külön RPC-nevet hívott ez a tábla:
    //   rpw_complete_phase · rpw_close_job · rpw_skip_phase
    //   rpw_create_rework · rpw_resolve_rework · rpw_manager_override
    // EGYIK SEM LÉTEZETT az adatbázisban, és nem is volt hozzájuk
    // migráció. Minden hívás elszállt volna, amint a SERVER_TRANSITIONS
    // bekapcsol.
    //
    // A végleges modell (003_business_requirements.sql):
    //   rpw_transition(p_token, p_id, p_phase, p_action,
    //                  p_expected_version, p_reason)
    //   p_action: start | complete | skip | reopen
    //             | rework_open | rework_close
    // A verzió MINDEN kritikus műveletnél KÖTELEZŐ.
    var TXN_ACTION = {
      complete:      'complete',
      start:         'start',
      close:         'complete',      // a 7. fázis lezárása = a munka lezárása
      skip:          'skip',
      reopen:        'reopen',
      override:      'reopen',        // a felülbírálás újranyitás, override joggal
      createRework:  'rework_open',
      resolveRework: 'rework_close',
      // v4: a tölcsér (commitCriticalTransition) a SZERVEROLDALI nevet
      // adja át. Mindkét írásmódot elfogadjuk, hogy a régi hívási
      // helyek se törjenek el.
      rework_open:   'rework_open',
      rework_close:  'rework_close'
    };
    function txnCall(kind, a){
      var action = TXN_ACTION[kind];
      if(!action) return null;
      // a fázis kiválasztása művelet szerint
      var phase = a.phase;
      if(phase == null) phase = (kind === 'close') ? 7
                              : (kind === 'override' || kind === 'createRework') ? a.toPhase
                              : a.fromPhase;
      // 006: a `p_reason` EMBERI INDOKLÁS, a `p_rework_id` AZONOSÍTÓ,
      // a `p_note` a rework lezárási megjegyzése. A V3-ban mindhárom
      // ugyanabba a paraméterbe ment — pedig két külön dolog.
      return ['rpw_transition', {
        p_token: a.token,
        p_id: a.id,
        p_phase: (phase != null ? Number(phase) : null),
        p_action: action,
        p_expected_version: (a.expectedVersion != null ? Number(a.expectedVersion) : null),
        p_reason:    (a.reason || null),
        p_rework_id: (a.reworkId || null),
        p_note:      (a.note || null)
      }];
    }
    var TXN_RPC = {};
    Object.keys(TXN_ACTION).forEach(function(k){
      TXN_RPC[k] = function(a){ return txnCall(k, a); };
    });
    async function serverTransition(kind, args){
      var build=TXN_RPC[kind];
      if(!build) return { ok:false, error:{message:'unknown_transition:'+kind} };
      args = args || {};
      if(args.token==null) args.token = authToken();
      var call = build(args);
      pendingCount++; setSync('syncing');
      var res;
      try{ res = await sb.rpc(call[0], call[1]); }
      catch(e){ pendingCount--; setSync('failed'); return { ok:false, error:e, kind:classify(e) }; }
      pendingCount--;
      if(res && res.error){ setSync('failed'); return { ok:false, error:res.error, kind:classify(res.error) }; }
      var d = res ? res.data : null;
      if(typeof d === 'string'){ try{ d = JSON.parse(d); }catch(e){ d = null; } }
      if(!d){ setSync('failed'); return { ok:false, error:{code:'empty', message:'Răspuns gol de la server.'}, kind:'error', rpc:call[0] }; }

      // ── 4 (v4) — A SZERVER ELUTASÍTÁSA NEM SIKER ────────────────
      // A V3-ban a {ok:false} válasz `ok:true`-ként ment vissza, mert
      // csak a transport-hibát néztük. Így a kliens LEZÁRTNAK mutatta
      // volna azt a fázist, amit a szerver elutasított.
      if(d.ok !== true){
        var kind = (d.error === 'version_conflict') ? 'conflict' : 'denied';
        setSync(kind === 'conflict' ? 'conflict' : 'failed');
        return {
          ok: false, kind: kind, rpc: call[0],
          conflict: (d.error === 'version_conflict'),
          serverVersion: (typeof d.server_version === 'number' ? d.server_version : null),
          error: {
            code:          d.error || 'denied',
            message:       d.message || 'Operațiunea a fost respinsă.',
            serverVersion: (typeof d.server_version === 'number' ? d.server_version : null),
            missing:       (Array.isArray(d.missing) ? d.missing : null),
            need:          d.need || null,
            fields:        (Array.isArray(d.fields) ? d.fields : null),
            details:       d
          }
        };
      }
      setSync(pendingCount>0?'syncing':'synced');
      return { ok:true, data:d.data, version:d.version, rpc:call[0] };
    }

    // ---- KOSÁR-műveletek --------------------------------------------
    async function softDeleteJob(id){ return await DB.softDelete(sb, id); }
    async function restoreJob(id){ return await DB.restore(sb, id); }
    async function permanentDeleteJob(id){ return await DB.purge(sb, id); }

    // ---- FÁJL / FOTÓ (privát storage) -------------------------------
    // uploadPrivateFile: feltöltés a privát bucketbe, visszaad {path}.
    // (Szerver-oldali privát bucket + aláírt URL a 0009 után; addig
    //  a publikus bucket viselkedés marad — NEM IGAZOLT élesben.)
    async function uploadPrivateFile(pathOrRef, fileBlob, upOpts){
      upOpts = upOpts || {};
      var bucket = upOpts.bucket || _cfg().BUCKET || 'rpw-photos';
      try{
        var res = await sb.storage.from(bucket).upload(pathOrRef, fileBlob, {
          upsert: (upOpts.upsert!==false),
          contentType: upOpts.contentType || undefined
        });
        if(res && res.error) return { ok:false, error:res.error };
        var p = (res && res.data && (res.data.path||res.data.Key)) || pathOrRef;
        return { ok:true, path:p, bucket:bucket };
      }catch(e){ return { ok:false, error:e }; }
    }
    async function getSignedFileUrl(path, urlOpts){
      var P=_photos();
      if(P && typeof P.signedUrl==='function') return await P.signedUrl(sb, path, urlOpts);
      // fallback: publikus URL
      // P0.6: privát bucketnél NINCS publikus fallback — inkább üres, mint halott link.
      if(_cfg().STORAGE_PRIVATE===true) return '';
      try{ return sb.storage.from((urlOpts&&urlOpts.bucket)||_cfg().BUCKET||'rpw-photos').getPublicUrl(path).data.publicUrl; }
      catch(e){ return ''; }
    }

    // ---- SZINKRON-ÁLLAPOT -------------------------------------------
    // Az írások itt awaitoltak (nincs debounce-sor), ezért a flush a
    // jelenlegi állapotot adja vissza; ha van saver injektálva, azt is.
    async function flushPendingWrites(){
      // Tartós sor (ha van): a sorban lévő szeleteket FIFO-ban újraküldi a
      // szerverre; a rekord CSAK igazolt siker után törlődik.
      if(queue && typeof queue.flush==='function'){
        try{
          return await queue.flush(async function(rec){
            var r = await DB.patchV2(sb, rec.jobId, rec.patch, {
              expected: (rec.expectedVersion!=null?rec.expectedVersion:undefined),
              actor: actor, rpc: opts.rpc
            });
            if(r && r.error) return { ok:false, kind:classify(r.error) };
            var d=r?r.data:null;
            if(d && d.conflict) return { ok:false, conflict:true, serverVersion:d.server_version };
            return { ok:true };
          });
        }catch(e){ return { ok:false, error:e }; }
      }
      if(opts.saver && typeof opts.saver.flush==='function'){
        try{ return await opts.saver.flush(); }catch(e){ return { ok:false, error:e }; }
      }
      return { ok:(pendingCount===0), pending:pendingCount };
    }
    function getSyncState(){
      if(opts.saver && typeof opts.saver.getSyncState==='function') return opts.saver.getSyncState();
      return syncState;
    }
    // Aszinkron, sor-tudatos állapot (aggregált) — a getSyncState szinkron marad.
    async function getQueueState(jobId){
      if(queue && typeof queue.getSyncState==='function') return await queue.getSyncState(jobId);
      return getSyncState();
    }

    return {
      sb: sb,
      listJobs: listJobs,
      listTrashed: listTrashed,
      getJob: getJob,
      createJob: createJob,
      patchJob: patchJob,
      transitionJob: transitionJob,
      softDeleteJob: softDeleteJob,
      restoreJob: restoreJob,
      permanentDeleteJob: permanentDeleteJob,
      uploadPrivateFile: uploadPrivateFile,
      getSignedFileUrl: getSignedFileUrl,
      flushPendingWrites: flushPendingWrites,
      getSyncState: getSyncState,
      getQueueState: getQueueState,
      serverTransition: serverTransition,
      serverEnabled: serverEnabled,
      queue: queue
    };
  }

  // v4: az oldalak egy KÖZÖS példányt használnak. A `init()` egyszer
  // hozza létre; a `commitViaServer` ezen keresztül éri el.
  var _inst = null, _online = false;
  function init(sb, opts){
    if(!_inst){
      _inst = create(sb, opts);
      _resume(_inst);          // ÚJRATÖLTÉS UTÁN: ami a sorban maradt, elindul
    }
    return _inst;
  }

  // ── ÚJRATÖLTÉS UTÁNI HELYREÁLLÍTÁS ────────────────────────────────
  // A sor túléli az oldalfrissítést — de valakinek el kell indítania.
  // Eddig senki nem indította: a rekord ott feküdt, és a munka sosem ért
  // el a szerverre. Itt indul, egy helyen, minden lapnak.
  function _resume(inst){
    if(!inst || !inst.queue) return;
    var go = function(){
      try{
        if(typeof navigator!=='undefined' && navigator.onLine===false) return;
        inst.flushPendingWrites();
      }catch(e){}
    };
    // indulás: a hálózatot nem várjuk meg, csak a lap életre kelését
    try{ setTimeout(go, 1200); }catch(e){}
    // és amikor visszatér a hálózat
    if(!_online && typeof root.addEventListener==='function'){
      _online = true;
      try{ root.addEventListener('online', go); }catch(e){}
    }
  }
  var API = { create:create, init:init, pickCrit:pickCrit, _resume:_resume,
              CRIT_KEYS:CRIT_KEYS, classify:classify, QSTATE:QSTATE,
              get __instance(){ return _inst; } };
  if(typeof module!=='undefined' && module.exports){ module.exports = API; }
  root.RPWData = API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
