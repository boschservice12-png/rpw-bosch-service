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
  function bucketOf(opts){ return (opts&&opts.bucket) || (root.RPW_CFG&&root.RPW_CFG.BUCKET) || 'rpw-photos'; }
  // Privát-Storage kapcsoló (P0 #11): true → NINCS publikus-URL fallback (a 0009 élesítése után).
  function isPrivate(opts){ if(opts&&opts.private!=null) return !!opts.private; return !!(root.RPW_CFG&&root.RPW_CFG.STORAGE_PRIVATE); }

  // Aszinkron: aláírt URL egy storage-path-ra; hibánál publikus URL — DE ha
  // STORAGE_PRIVATE=true, akkor NEM esik vissza publikusra (GDPR: nincs örök nyilvános URL).
  async function signedUrl(sb, path, opts){
    opts=opts||{};
    if(!path) return '';
    if(isFullUrl(path)) return path;                 // már teljes URL → hagyjuk
    var bucket=bucketOf(opts);
    var expires=opts.expiresSec||3600;
    try{
      var res=await sb.storage.from(bucket).createSignedUrl(path, expires);
      if(res && !res.error && res.data && res.data.signedUrl) return res.data.signedUrl;
    }catch(e){ /* fallback lent */ }
    if(isPrivate(opts)) return '';                   // privát mód: NINCS publikus fallback
    // fallback: publikus URL (amíg a bucket publikus — 0009 előtt)
    try{
      var pub=sb.storage.from(bucket).getPublicUrl(path);
      return (pub && pub.data && pub.data.publicUrl) || '';
    }catch(e){ return ''; }
  }

  // ── dataURL → Blob, HÁLÓZAT NÉLKÜL ────────────────────────────────
  // 2026-09-03 (Ferenc: „upload failed to fetch" — a telefonon):
  // a feltöltés eddig `await fetch(dataUrl)`-lel csinált Blob-ot. Egy
  // `data:` URL fetch-elése KAPCSOLATNAK számít, tehát a CSP
  // `connect-src`-je szabályozza — abban pedig (helyesen) NINCS `data:`.
  // A böngésző blokkolta, és a dobott hiba szó szerint:
  //   TypeError: Failed to fetch
  // Ugyanez a sor CSP nélkül is elhasalt volna a telefonon: több
  // megabájtos data: URL fetch-elése mobilon memóriaigényes.
  //
  // A megoldás NEM a CSP tágítása (az gyengítené a védelmet), hanem
  // hogy egyáltalán ne hálózaton keresztül dekódoljunk: a base64-ből
  // helyben állítjuk elő a bájtokat. Így nincs CSP-függés, és nincs
  // mobil memória-korlát sem.
  function dataUrlToBlob(dataUrl){
    var s=String(dataUrl||'');
    var m=/^data:([^;,]*)(;base64)?,/i.exec(s);
    if(!m) throw new Error('Nu este dataURL');
    var mime=m[1]||'application/octet-stream';
    var body=s.slice(m[0].length), bytes, i;
    if(m[2]){
      var bin=atob(body);
      bytes=new Uint8Array(bin.length);
      for(i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    }else{
      var txt=decodeURIComponent(body);
      bytes=new Uint8Array(txt.length);
      for(i=0;i<txt.length;i++) bytes[i]=txt.charCodeAt(i)&0xFF;
    }
    return new Blob([bytes],{type:mime});
  }

  // ── FÁJL → dataURL, EGYETLEN HELYEN ──────────────────────────────
  // 2026-09-04 (Ferenc: „a fotók az avizare daună felén működnek, a
  // recepción és a reconstatare-n nem — hiányzik a megoldás a
  // rendszerből"). Igaza volt, és a kód meg is mutatta, miért:
  //
  //   rpw-upload.html (avizare daună) — MŰKÖDIK:
  //       createObjectURL + img.onerror-ág + a Blob KÖZVETLEN feltöltése
  //   rpw-recepcio  — `fetch(dataUrl)`  → a CSP blokkolta
  //   rpw-reconstatare — saját `resize()`, HIBAÁG NÉLKÜL → néma elakadás,
  //       és a lap a rpw-photos.js-t be sem töltötte
  //
  // Minden oldal újraírta a magáét, és elsodródtak. Ez az EGY
  // implementáció a működő minta alapján készült:
  //   · a dekódolás objectURL-ről megy (nincs több megabájtos data: URL)
  //   · ha nem dekódolható (HEIC, PDF, sérült kép), az EREDETI fájl megy
  //     tovább dataURL-ként — nem akad el némán
  //   · időkorlát: nem vár örökké
  function fileToDataUrl(file, opts){
    opts = opts || {};
    var max = opts.maxSide || 1600, q = opts.quality || 0.85, ms = opts.timeoutMs || 20000;
    return new Promise(function(res, rej){
      var done = false, url = null, tm = null;
      function cleanup(){ if(url){ try{ URL.revokeObjectURL(url); }catch(e){} url=null; } clearTimeout(tm); }
      function finish(v){ if(done) return; done=true; cleanup(); res(v); }
      function fail(m){ if(done) return; done=true; cleanup(); rej(new Error(m)); }
      // Visszaesés: az EREDETI fájl, változtatás nélkül, dataURL-ként.
      function eredeti(){
        var r = new FileReader();
        r.onerror = function(){ fail('Fisierul nu a putut fi citit'); };
        r.onload  = function(e){
          var s = e.target.result;
          if(typeof s === 'string' && s.indexOf('data:') === 0) finish(s);
          else fail('Format de fisier necunoscut');
        };
        try{ r.readAsDataURL(file); }catch(e){ fail('Fisierul nu a putut fi citit'); }
      }
      tm = setTimeout(function(){ fail('Fisierul nu a putut fi citit (timeout)'); }, ms);
      var img = new Image();
      try{ url = URL.createObjectURL(file); }catch(e){ eredeti(); return; }
      img.onerror = function(){ eredeti(); };
      img.onload = function(){
        try{
          var w = img.width||0, h = img.height||0;
          if(!w || !h){ eredeti(); return; }
          var sc = Math.min(1, max/Math.max(w,h));
          var c = document.createElement('canvas');
          c.width  = Math.max(1, Math.round(w*sc));
          c.height = Math.max(1, Math.round(h*sc));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var out = c.toDataURL('image/jpeg', q);
          if(out && out.length > 1000) finish(out); else eredeti();
        }catch(e){ eredeti(); }
      };
      img.src = url;
    });
  }

  // ── ÍRÁS-oldal (P0 #11): base64/dataURL → privát Storage, visszaad REF-et ──
  // A JOB JSON ezt a ref-et tárolja (nem base64). now/actor injektálható (teszt).
  function mimeOf(dataUrl){ var m=/^data:([^;]+);base64,/.exec(String(dataUrl||'')); return m?m[1]:'image/jpeg'; }
  function extFromMime(mime){ var M={'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','application/pdf':'pdf'}; return M[mime]||'bin'; }
  async function storePhoto(sb, jobId, dataUrlOrBlob, opts){
    opts=opts||{};
    var bucket=bucketOf(opts);
    var isData = (typeof dataUrlOrBlob==='string' && dataUrlOrBlob.indexOf('data:')===0);
    var mime = opts.mimeType || (isData?mimeOf(dataUrlOrBlob):'image/jpeg');
    var key = opts.key || ('p_'+(opts.seq!=null?opts.seq:Math.max(0,String(jobId).length)));
    var path = opts.path || (jobId+'/'+key+'.'+extFromMime(mime));
    var body = (isData && typeof opts.decode==='function') ? opts.decode(dataUrlOrBlob) : dataUrlOrBlob;
    try{
      var up = await sb.storage.from(bucket).upload(path, body, {contentType:mime, upsert:(opts.upsert!==false)});
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
            storePhoto:storePhoto, isPrivate:isPrivate, dataUrlToBlob:dataUrlToBlob, fileToDataUrl:fileToDataUrl };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWPhotos=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
