/* ============================================================
   rpw-photos.js — FOTÓ-URL RÉTEG (aláírt URL + publikus fallback)
   ------------------------------------------------------------
   GDPR: a kárfotók/okmányok NE legyenek örökre nyilvános URL-en.
   Ez a réteg időkorlátos aláírt (signed) URL-t ad, ha a bucket
   PRIVÁT; ha még publikus (vagy a signolás nem érhető el), akkor
   biztonságosan visszaesik a publikus URL-re → semmi nem törik el.

   Aktiválás: a bucket priváttá tétele a supabase migrációval
   (0009_storage_private_signed.FILE_ONLY.sql) — utána ez a réteg
   automatikusan aláírt URL-eket ad.

   Node + böngésző kompatibilis. Globál: window.RPWPhotos
   ============================================================ */
(function(root){
  'use strict';

  function isFullUrl(s){ return typeof s==='string' && /^(https?:|data:|blob:)/i.test(s); }

  // ── RPW-003 (2026-11-08): A TÁROLÓ EGYETLEN KAPUJA ─────────────────
  // A kliens NEM nyúl közvetlenül a tárolóhoz. Minden fotó-művelet a
  // `rpw-storage` Edge Functionön megy: az ellenőrzi a munkamenetet és a
  // munka gazdáját, és csak egyetlen fájlra szóló, időkorlátos aláírt URL-t
  // ad. A `bucket(sb, név)` UGYANAZT a felületet adja, mint a
  // `sb.storage.from(név)` (upload / remove / createSignedUrl), ezért a
  // hívási pontok logikája változatlan — csak a forrás cserélődik.
  // Ki: STORAGE_GATEWAY=false (vagy a kapu nem érhető el) → a régi út.
  // Bekapcsolva NINCS csendes visszaesés a közvetlen útra (fail closed).
  function gatewayOn(){ return !!(root.RPW_CFG && root.RPW_CFG.STORAGE_GATEWAY); }
  function workerToken(){ try{ return (root.RPWAuth && typeof root.RPWAuth.token==='function') ? root.RPWAuth.token() : null; }catch(e){ return null; } }
  async function gw(op, payload, opts){
    opts=opts||{};
    var cfg=root.RPW_CFG||{};
    var f=opts.fetch||root.fetch;
    var h={'Content-Type':'application/json','apikey':cfg.SB_KEY,'Authorization':'Bearer '+cfg.SB_KEY};
    if(!opts.client){ var t=(opts.token!==undefined)?opts.token:workerToken(); if(t) h['x-rpw-token']=t; }
    var r, body=null;
    try{
      r=await f(String(cfg.SB_URL||'')+'/functions/v1/rpw-storage',
                {method:'POST', headers:h, body:JSON.stringify(Object.assign({op:op}, payload))});
    }catch(e){ return { error:{ message:'network', status:0 } }; }
    try{ body=await r.json(); }catch(e){ body=null; }
    if(!r.ok || !body || body.ok!==true){
      var err={ message:(body&&body.error)||('HTTP '+r.status), status:r.status };
      try{ console.warn('[RPW] tároló-kapu: '+op+' elutasítva', err); }catch(e){}
      return { error:err };
    }
    return { data:body };
  }
  function bucket(sb, name, opts){
    opts=opts||{};
    if(!gatewayOn()) return sb.storage.from(name);
    var client=!!opts.client;
    return {
      upload: async function(path, body, o){
        var s=await gw(client?'client-sign-upload':'sign-upload', {path:path}, opts);
        if(s.error) return { data:null, error:s.error };
        var up=await sb.storage.from(name).uploadToSignedUrl(s.data.path, s.data.token, body,
                                                             {contentType:(o&&o.contentType)||undefined});
        if(up && up.error) return { data:null, error:up.error };
        return { data:{ path:s.data.path }, error:null };
      },
      remove: async function(paths){
        if(client) return { data:null, error:{ message:'not_allowed', status:403 } };
        var r=await gw('remove', {paths:paths}, opts);
        return r.error ? { data:null, error:r.error } : { data:r.data, error:null };
      },
      createSignedUrl: async function(path){
        var r=await gw(client?'client-sign-read':'sign-read', {paths:[path]}, opts);
        if(r.error) return { data:null, error:r.error };
        var u=r.data.urls && r.data.urls[0];
        return (u && u.signedUrl) ? { data:{ signedUrl:u.signedUrl }, error:null }
                                  : { data:null, error:{ message:'not_found', status:404 } };
      },
      // privát tároló: publikus URL NINCS
      getPublicUrl: function(){ return { data:{ publicUrl:'' } }; }
    };
  }
  function bucketOf(opts){ return (opts&&opts.bucket) || (root.RPW_CFG&&root.RPW_CFG.BUCKET) || 'rpw-photos'; }
  // Privát-Storage kapcsoló (P0 #11): true → NINCS publikus-URL fallback (a 0009 élesítése után).
  function isPrivate(opts){ if(opts&&opts.private!=null) return !!opts.private; return !!(root.RPW_CFG&&root.RPW_CFG.STORAGE_PRIVATE); }

  // Aszinkron: aláírt URL egy storage-path-ra; hibánál publikus URL — DE ha
  // STORAGE_PRIVATE=true, akkor NEM esik vissza publikusra (GDPR: nincs örök nyilvános URL).
  async function signedUrl(sb, path, opts){
    opts=opts||{};
    if(!path) return '';
    if(isFullUrl(path)) return path;                 // már teljes URL → hagyjuk
    var b=bucketOf(opts);
    var expires=opts.expiresSec||3600;
    try{
      var res=await bucket(sb, b, opts).createSignedUrl(path, expires);
      if(res && !res.error && res.data && res.data.signedUrl) return res.data.signedUrl;
    }catch(e){ /* fallback lent */ }
    if(isPrivate(opts)) return '';                   // privát mód: NINCS publikus fallback
    // fallback: publikus URL (amíg a bucket publikus — 0009 előtt)
    try{
      var pub=sb.storage.from(b).getPublicUrl(path);
      return (pub && pub.data && pub.data.publicUrl) || '';
    }catch(e){ return ''; }
  }

  // ── ÍRÁS-oldal (P0 #11): base64/dataURL → privát Storage, visszaad REF-et ──
  // A JOB JSON ezt a ref-et tárolja (nem base64). now/actor injektálható (teszt).
  function mimeOf(dataUrl){ var m=/^data:([^;]+);base64,/.exec(String(dataUrl||'')); return m?m[1]:'image/jpeg'; }
  function extFromMime(mime){ var M={'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','application/pdf':'pdf'}; return M[mime]||'bin'; }
  async function storePhoto(sb, jobId, dataUrlOrBlob, opts){
    opts=opts||{};
    var bk=bucketOf(opts);
    var isData = (typeof dataUrlOrBlob==='string' && dataUrlOrBlob.indexOf('data:')===0);
    var mime = opts.mimeType || (isData?mimeOf(dataUrlOrBlob):'image/jpeg');
    var key = opts.key || ('p_'+(opts.seq!=null?opts.seq:Math.max(0,String(jobId).length)));
    var path = opts.path || (jobId+'/'+key+'.'+extFromMime(mime));
    var body = (isData && typeof opts.decode==='function') ? opts.decode(dataUrlOrBlob) : dataUrlOrBlob;
    try{
      var up = await bucket(sb, bk, opts).upload(path, body, {contentType:mime, upsert:(opts.upsert!==false)});
      if(up && up.error) return { ok:false, error:up.error };
      var okPath = up && up.data && (up.data.path || up.data.Key || path);
      var b64 = isData ? String(dataUrlOrBlob).replace(/^data:[^;]+;base64,/,'') : '';
      var ref = { path:okPath, mimeType:mime, size:(opts.size!=null?opts.size:(b64?Math.floor(b64.length*3/4):null)),
                  checksum:(opts.checksum||null), category:(opts.category||null),
                  createdBy:(opts.createdBy||opts.actor||null),
                  createdAt:(function(){ try{ return new Date(typeof opts.now==='function'?opts.now():(opts.now||Date.now())).toISOString(); }catch(e){ return null; } })() };
      return { ok:true, ref:ref, path:okPath };
    }catch(e){ return { ok:false, error:e }; }
  }

  function publicUrl(sb, path, opts){
    if(isFullUrl(path)) return path;
    try{ return sb.storage.from(bucketOf(opts)).getPublicUrl(path).data.publicUrl; }catch(e){ return ''; }
  }

  // Egy fotó-referenciából (objektum vagy string) a legjobb URL — aláírt, ha van path.
  async function resolveRef(sb, ref, opts){
    if(!ref) return '';
    if(typeof ref==='string') return isFullUrl(ref)?ref:await signedUrl(sb, ref, opts);
    if(ref.path) return await signedUrl(sb, ref.path, opts);
    if(ref.key && (opts&&opts.keyPrefix)) return await signedUrl(sb, opts.keyPrefix+ref.key, opts);
    if(ref.url) return ref.url;   // csak publikus URL van tárolva
    return '';
  }

  // DOM-hidratálás: minden <img data-rpw-path="..."> src-jét aláírt URL-re cseréli.
  // (A fázisoldalak kimenetébe elég a data-rpw-path attribútum — a megjelenítés nem változik.)
  async function hydrate(sb, opts){
    if(typeof document==='undefined') return;
    // KEPEK es LINKEK egyarant. A tarolt URL egy oraig el; a rekordban
    // maradt link egy nap mulva mar halott. Ezert a megjelenitéskor
    // MINDIG a path-bol irunk friss alairast — kepre az src-t, linkre
    // a href-et. (Ferenc, 2026-08-27: "a fotok hianyoznak".)
    var el=document.querySelectorAll('[data-rpw-path]:not([data-rpw-done])');
    for(var i=0;i<el.length;i++){
      (function(n){
        var p=n.getAttribute('data-rpw-path');
        if(!p){ n.setAttribute('data-rpw-done','1'); return; }
        signedUrl(sb, p, opts).then(function(u){
          if(u){ if(n.tagName==='IMG') n.src=u; else n.href=u; }
          n.setAttribute('data-rpw-done','1');
        });
      })(el[i]);
    }
  }

  var API={ isFullUrl:isFullUrl, signedUrl:signedUrl, publicUrl:publicUrl, resolveRef:resolveRef, hydrate:hydrate,
            storePhoto:storePhoto, isPrivate:isPrivate, bucket:bucket, gatewayOn:gatewayOn };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWPhotos=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
