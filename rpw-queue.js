/* ============================================================
   rpw-queue.js — TARTÓS OFFLINE ÍRÁS-SOR (P0 #9, Sprint 2)
   ------------------------------------------------------------
   Dossziénként elkülönített, TARTÓS (IndexedDB) pending-queue:
     • oldal-újratöltés után MEGMARAD (nem csak memóriában);
     • online visszatéréskor SORRENDHELYESEN újraküld;
     • dossziénként ÖSSZEVONJA a patch-eket (egy aktív rekord/job,
       deep-merge) — két KÜLÖN dosszié NEM írja felül egymást;
     • a pending jelző CSAK IGAZOLT szerver-siker után törlődik;
     • sync-állapotok: saved-local / waiting / syncing / conflict / synced.

   Backend injektálható (teszt): opts.backend vagy opts.idb (IndexedDB
   factory). Böngészőben alapból a valódi IndexedDB.

   Node + böngésző kompatibilis. Globál: window.RPWQueue
   ============================================================ */
(function(root){
  'use strict';

  var DB_NAME='rpw_queue_db', STORE='ops', DB_VERSION=1;

  // ---- deep-merge (objektumok mélyen, tömb/skalár felülír) ----
  function isObj(x){ return x && typeof x==='object' && !Array.isArray(x); }
  function deepMerge(a, b){
    if(!isObj(a)) a={};
    if(!isObj(b)) return b;
    var out={}; var k;
    for(k in a){ if(Object.prototype.hasOwnProperty.call(a,k)) out[k]=a[k]; }
    for(k in b){ if(!Object.prototype.hasOwnProperty.call(b,k)) continue;
      out[k] = isObj(b[k]) && isObj(out[k]) ? deepMerge(out[k], b[k]) : b[k];
    }
    return out;
  }

  // ---- IndexedDB backend (böngésző) — keyPath: 'jobId' ----
  function idbBackend(idbFactory, dbName){
    var idb = idbFactory || (typeof root.indexedDB!=='undefined' ? root.indexedDB : null);
    dbName = dbName || DB_NAME;
    if(!idb) return null;
    function open(){
      return new Promise(function(res,rej){
        var rq=idb.open(dbName, DB_VERSION);
        rq.onupgradeneeded=function(){
          var db=rq.result;
          if(!db.objectStoreNames.contains(STORE)){ db.createObjectStore(STORE,{keyPath:'jobId'}); }
        };
        rq.onsuccess=function(){ res(rq.result); };
        rq.onerror=function(){ rej(rq.error); };
      });
    }
    function store(mode){ return open().then(function(db){ return db.transaction(STORE,mode).objectStore(STORE); }); }
    function req(r){ return new Promise(function(res,rej){ r.onsuccess=function(){res(r.result);}; r.onerror=function(){rej(r.error);}; }); }
    return {
      kind:'indexeddb',
      put:function(rec){ return store('readwrite').then(function(os){ return req(os.put(rec)); }); },
      get:function(id){ return store('readonly').then(function(os){ return req(os.get(id)); }); },
      getAll:function(){ return store('readonly').then(function(os){ return req(os.getAll()); }); },
      del:function(id){ return store('readwrite').then(function(os){ return req(os.delete(id)); }); },
      clear:function(){ return store('readwrite').then(function(os){ return req(os.clear()); }); }
    };
  }

  // ---- memória backend (fallback / egyszerű teszt) ----
  // Megjegyzés: NEM tartós; a tartósságot a böngészőben az IndexedDB adja.
  function memBackend(seed){
    var m = seed || {};
    return {
      kind:'memory',
      put:function(rec){ m[rec.jobId]=JSON.parse(JSON.stringify(rec)); return Promise.resolve(true); },
      get:function(id){ return Promise.resolve(m[id]?JSON.parse(JSON.stringify(m[id])):undefined); },
      getAll:function(){ return Promise.resolve(Object.keys(m).map(function(k){ return JSON.parse(JSON.stringify(m[k])); })); },
      del:function(id){ delete m[id]; return Promise.resolve(true); },
      clear:function(){ Object.keys(m).forEach(function(k){ delete m[k]; }); return Promise.resolve(true); },
      _store:m
    };
  }

  function create(opts){
    opts = opts || {};
    var backend = opts.backend || idbBackend(opts.idb, opts.dbName) || memBackend();
    var now = opts.now || function(){ try{ return Date.now(); }catch(e){ return 0; } };
    var onState = (typeof opts.onState==='function') ? opts.onState : null;
    var seq = 0;        // globális sorrend-számláló (FIFO a dossziék között)
    var resynced = false;

    function emit(jobId, state){ if(onState){ try{ onState(jobId, state); }catch(e){} } }

    // enqueue: egy dossziéhoz tartozó patch-et hozzáad; ha már van pending
    // rekord ehhez a jobId-hez, ÖSSZEVONJA (deep-merge). Az expectedVersion
    // az ELSŐ (bázis) verzió marad, hogy a teljes összevont változás a
    // beolvasott bázisra alkalmazódjon.
    async function enqueue(jobId, patch, expectedVersion){
      if(!jobId) return { ok:false, error:'no jobId' };
      if(!patch || typeof patch!=='object') return { ok:false, error:'no patch' };
      if(!resynced){ await _resync(); resynced=true; }   // újratöltés utáni sorrend-helyreállítás
      var existing = await backend.get(jobId);
      var rec;
      if(existing){
        rec = {
          jobId: jobId,
          patch: deepMerge(existing.patch||{}, patch),
          expectedVersion: (existing.expectedVersion!==undefined && existing.expectedVersion!==null)
                            ? existing.expectedVersion
                            : (expectedVersion!==undefined?expectedVersion:null),
          seq: existing.seq,                 // sorrend: az első megjelenés
          firstTs: existing.firstTs,
          lastTs: now(),
          state: 'saved-local'
        };
      } else {
        rec = {
          jobId: jobId,
          patch: patch,
          expectedVersion: (expectedVersion!==undefined?expectedVersion:null),
          seq: (seq++),
          firstTs: now(),
          lastTs: now(),
          state: 'saved-local'
        };
      }
      await backend.put(rec);
      emit(jobId, 'saved-local');
      return { ok:true, record:rec };
    }

    async function pending(jobId){
      var all = await backend.getAll();
      all.sort(function(a,b){ return (a.seq||0)-(b.seq||0); });
      return jobId ? all.filter(function(r){ return r.jobId===jobId; }) : all;
    }
    async function hasPending(jobId){ return (await pending(jobId)).length>0; }
    async function size(){ return (await backend.getAll()).length; }

    async function getSyncState(jobId){
      if(jobId){ var r=await backend.get(jobId); return r?r.state:'synced'; }
      var all=await backend.getAll();
      if(!all.length) return 'idle';
      if(all.some(function(r){ return r.state==='conflict'; })) return 'conflict';
      if(all.some(function(r){ return r.state==='syncing'; })) return 'syncing';
      return 'waiting';
    }

    // flush: FIFO-sorrendben újraküld. sendFn(record) → Promise<{ok:true}|
    // {ok:false, conflict?, kind?}>. A rekord CSAK IGAZOLT ok:true után törlődik.
    // Ütközés → megmarad, state:'conflict' (kézi feloldás/újratöltés kell).
    // Egyéb (hálózat/offline) → megmarad, state:'waiting'.
    // Dossziék FÜGGETLENEK: egyik ütközése nem blokkolja a többit.
    async function flush(sendFn){
      if(typeof sendFn!=='function') return { ok:false, error:'no sendFn' };
      var recs = await pending();     // seq szerint rendezve
      var sent=0, conflicts=0, kept=0;
      for(var i=0;i<recs.length;i++){
        var rec = recs[i];
        rec.state='syncing'; await backend.put(rec); emit(rec.jobId,'syncing');
        var res;
        try{ res = await sendFn(rec); }catch(e){ res={ ok:false, kind:'error' }; }
        if(res && res.ok===true){
          await backend.del(rec.jobId); sent++; emit(rec.jobId,'synced');       // pending TÖRÖLVE — igazolt siker
        } else if(res && res.conflict){
          rec.state='conflict'; await backend.put(rec); conflicts++; emit(rec.jobId,'conflict');  // MEGMARAD
        } else {
          rec.state='waiting'; await backend.put(rec); kept++; emit(rec.jobId,'waiting');          // MEGMARAD
        }
      }
      return { ok:(conflicts===0 && kept===0), sent:sent, conflicts:conflicts, kept:kept, remaining:(conflicts+kept) };
    }

    async function remove(jobId){ await backend.del(jobId); return { ok:true }; }
    async function clear(){ await backend.clear(); return { ok:true }; }

    // A számláló újratöltés utáni helyreállítása (max seq + 1), hogy az új
    // elemek a meglévők UTÁN sorolódjanak (a perzisztált sorrend megmarad).
    async function _resync(){
      var all = await backend.getAll();
      var max = -1; all.forEach(function(r){ if((r.seq||0)>max) max=r.seq; });
      seq = max+1;
      return seq;
    }

    return {
      backend: backend,
      enqueue: enqueue,
      pending: pending,
      hasPending: hasPending,
      size: size,
      getSyncState: getSyncState,
      flush: flush,
      remove: remove,
      clear: clear,
      _resync: _resync
    };
  }

  // ── KÖZÖS PÉLDÁNY ────────────────────────────────────────────────
  // Egy lapon EGY sor van. Ha minden hívó sajátot csinálna, ugyanarra a
  // dossziéra két rekord születne, és a sorrend elveszne.
  var _shared = null;
  function shared(opts){
    if(!_shared) _shared = create(opts||{});
    return _shared;
  }

  var API = { create:create, shared:shared, idbBackend:idbBackend, memBackend:memBackend,
              deepMerge:deepMerge, DB_NAME:DB_NAME, STORE:STORE,
              get __shared(){ return _shared; },
              __resetShared: function(){ _shared=null; } };
  if(typeof module!=='undefined' && module.exports){ module.exports = API; }
  root.RPWQueue = API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
