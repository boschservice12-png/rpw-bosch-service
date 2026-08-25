/* BUILD: RPW-CACHE-D1 2026-08-24 */
/* ════════════════════════════════════════════════════════════════
   rpw-cache.js — HELYI GYORSÍTÓTÁR, korlátokkal

   MIT JAVÍT
   Eddig a TELJES munkaobjektum ment a localStorage-ba (`rpw_job_<id>`),
   32 hívási helyen, benne: ügyfélnév, telefonszám, alvázszám, kárszám,
   fotó-hivatkozások. Következmények:
     · TTL nélkül — hónapokig ott maradt
     · szerviz és felhasználó szerint NEM volt elkülönítve: közös gépen
       a következő belépő is látta az előző adatait
     · kijelentkezéskor NEM törlődött

   MIT CSINÁL EZ A MODUL
     · minden bejegyzés a SZERVIZ és a DOLGOZÓ azonosítójához kötött
     · TTL (alapból 24 óra), lejárat után magától eldobja
     · `wipe()` kijelentkezéskor mindent töröl
     · `MIN` mód: csak a képernyőhöz szükséges mezőket tárolja
       (rendszám, munkaszám, dátum, fázis) — személyes adat NÉLKÜL

   MIÉRT NEM titkosítunk
   A kulcsnak is a böngészőben kellene lennie, tehát aki hozzáfér a
   tárolóhoz, a kulcshoz is hozzáfér. Ez látszatvédelem lenne. Helyette
   KEVESEBBET tárolunk, RÖVIDEBB ideig — az valódi védelem.
   ════════════════════════════════════════════════════════════════ */
(function(root){
  'use strict';

  var PREFIX   = 'rpwc:';           // minden bejegyzés ezzel kezdődik
  var TTL_MS   = 24*60*60*1000;     // 24 óra
  // Kijelentkezéskor ezek is törlődnek (a brief 10. pontja):
  // konfliktusban megőrzött helyi payload, offline sor, ideiglenes OCR.
  // ── RÉGI, TTL NÉLKÜLI GYORSÍTÓTÁR ────────────────────────────────
  // Ezt takarítjuk induláskor is: munkaadat, ami TTL nélkül feküdt a
  // gépen (közös gépen a következő belépő is látta volna).
  var LEGACY_CACHE = ['rpw_job_','rpw_job_ts_','rpw_jobs_list','rpw_norme','rpw_config',
                      'rpw_queue','rpw_offline','rpw_ocr','rpw_conflict','rpw_pending'];

  // ── A MUNKAMENET — INDULÁSKOR NEM SZABAD BÁNTANI ─────────────────
  // 2026-08-25: ez a három kulcs a fenti listában ült, a `migrateLegacy()`
  // pedig MINDEN oldalbetöltéskor lefut. Következmény: a bejelentkezés és
  // az admin-kapcsoló minden betöltésnél eltűnt — a felhasználó folyamatosan
  // kiesett, és „nem tudok törölni"-t látott, mert az `isAdmin()` a
  // munkamenetből dolgozik. KIZÁRÓLAG kijelentkezéskor (`wipe`) törlendők.
  var LEGACY_SESSION = ['rpw_auth','rpw_last_who','rpw_admin'];

  // A kijelentkezés mindent visz; az indulási takarítás csak a gyorsítótárat.
  var LEGACY = LEGACY_CACHE.concat(LEGACY_SESSION);

  function store(){
    try{ return (typeof localStorage!=='undefined') ? localStorage : null; }catch(e){ return null; }
  }
  function now(){ return Date.now(); }

  // A bérlő + dolgozó azonosítója a munkamenetből. Ha nincs bejelentkezve,
  // 'anon' — az ilyen bejegyzések a következő belépéskor eldobódnak.
  function scope(){
    try{
      var A=root.RPWAuth;
      if(A && typeof A.session==='function'){
        var s=A.session();
        if(s) return String(s.shopId||'?')+':'+String(s.employeeId||'?');
      }
    }catch(e){}
    return 'anon';
  }
  function key(name){ return PREFIX+scope()+':'+name; }

  // ── Írás ────────────────────────────────────────────────────────
  function set(name, value, ttlMs){
    var st=store(); if(!st) return false;
    try{
      st.setItem(key(name), JSON.stringify({
        v: value,
        e: now() + (typeof ttlMs==='number' ? ttlMs : TTL_MS)
      }));
      return true;
    }catch(e){
      // tele a tároló → előbb takarítunk, aztán egyszer újrapróbáljuk
      try{ sweep(); st.setItem(key(name), JSON.stringify({v:value, e:now()+TTL_MS})); return true; }
      catch(e2){ return false; }
    }
  }

  // ── Olvasás — lejárt bejegyzést NEM ad vissza ───────────────────
  function get(name){
    var st=store(); if(!st) return null;
    var raw;
    try{ raw=st.getItem(key(name)); }catch(e){ return null; }
    if(!raw) return null;
    var o; try{ o=JSON.parse(raw); }catch(e){ del(name); return null; }
    if(!o || typeof o!=='object' || typeof o.e!=='number'){ del(name); return null; }
    if(now() > o.e){ del(name); return null; }      // lejárt
    return o.v;
  }

  function del(name){
    var st=store(); if(!st) return;
    try{ st.removeItem(key(name)); }catch(e){}
  }

  // ── Lejárt bejegyzések eldobása (minden hatókörből) ─────────────
  function sweep(){
    var st=store(); if(!st) return 0;
    var drop=[], i, k, raw, o, n=0;
    try{
      for(i=0;i<st.length;i++){
        k=st.key(i); if(!k || k.indexOf(PREFIX)!==0) continue;
        raw=st.getItem(k);
        try{ o=JSON.parse(raw); }catch(e){ drop.push(k); continue; }
        if(!o || typeof o.e!=='number' || now()>o.e) drop.push(k);
      }
      for(i=0;i<drop.length;i++){ st.removeItem(drop[i]); n++; }
    }catch(e){}
    return n;
  }

  // ── Kijelentkezés: MINDEN gyorsítótár törlése ───────────────────
  // A régi (prefix nélküli) kulcsokat is takarítja.
  function wipe(){
    var st=store(); if(!st) return 0;
    var drop=[], i, k, j, n=0;
    try{
      for(i=0;i<st.length;i++){
        k=st.key(i); if(!k) continue;
        if(k.indexOf(PREFIX)===0){ drop.push(k); continue; }
        for(j=0;j<LEGACY.length;j++){
          if(k.indexOf(LEGACY[j])===0){ drop.push(k); break; }
        }
      }
      for(i=0;i<drop.length;i++){ st.removeItem(drop[i]); n++; }
    }catch(e){}
    return n;
  }

  // ── A régi, korlátlan bejegyzések egyszeri takarítása ───────────
  function migrateLegacy(){
    var st=store(); if(!st) return 0;
    var drop=[], i, k, j;
    try{
      for(i=0;i<st.length;i++){
        k=st.key(i); if(!k) continue;
        for(j=0;j<LEGACY_CACHE.length;j++){       // CSAK a gyorsítótár
          if(k.indexOf(LEGACY_CACHE[j])===0){ drop.push(k); break; }
        }
      }
      for(i=0;i<drop.length;i++) st.removeItem(drop[i]);
    }catch(e){}
    return drop.length;
  }

  // ── MIN mód: csak a listához kell, személyes adat nélkül ────────
  // A teljes munka a szerverről jön; a gyorsítótár csak azért van,
  // hogy hálózat nélkül is legyen mit mutatni.
  // ── 10 (v3) — A RENDSZÁM MASZKOLVA ──────────────────────────────
  // A rendszám személyhez KAPCSOLHATÓ adat: a forgalmi nyilvántartásból
  // azonosítja a tulajdonost. A listához viszont kell, hogy a dolgozó
  // felismerje az autót.
  // MEGOLDÁS: maszkolt változatot tárolunk — `MS-01-ABC` → `MS-…-ABC`.
  // A teljes rendszám a szerverről jön, amikor a munka megnyílik.
  // A `nrDosar` (kárszám) és az `asigurator` KIKERÜLT a listából:
  // biztosítói ügyadat, a listán nem kell.
  var MIN_FIELDS = ['id','number','sosire','flux','inchis','phase',
                    'damageType','dosarStatus'];

  function maskPlate(p){
    var s = String(p||'').trim();
    if(!s) return '';
    // az első és az utolsó szegmens marad, a szám kitakarva
    var parts = s.split(/[\s-]+/);
    if(parts.length >= 3) return parts[0] + '-…-' + parts[parts.length-1];
    if(s.length > 5) return s.slice(0,2) + '…' + s.slice(-3);
    return s;
  }
  function minimal(job){
    if(!job || typeof job!=='object') return null;
    var out={}, i, f;
    for(i=0;i<MIN_FIELDS.length;i++){
      f=MIN_FIELDS[i];
      if(job[f]!==undefined) out[f]=job[f];
    }
    if(job.plate) out.plateMasked = maskPlate(job.plate);   // MASZKOLVA
    // az előjegyzésből csak a dátum és az idő — jegyzet és előzmény NEM
    if(job.programare && typeof job.programare==='object'){
      out.programare={ date:job.programare.date||'', time:job.programare.time||'',
                       reprogramari:job.programare.reprogramari||0 };
    }
    // a fázisállapotok státusza — időbélyeg és „ki csinálta" NEM
    if(job.phases && typeof job.phases==='object'){
      out.phases={};
      for(i=1;i<=7;i++){
        var p=job.phases[i]||job.phases[String(i)];
        if(p) out.phases[i]={status:p.status||'pending'};
      }
    }
    return scrub(out);
  }
  // A KIHAGYOTT mezők — ezek SOHA nem kerülnek helyi tárolóba:
  //   client, phone, vin, docs, dosarActe, photos, photoKeys, elements,
  //   rework, deviz, evalData, reconst, closing, conditions, gapLog
  // A brief 10. pontjának teljes listája — ezek SOHA nem kerülnek
  // helyi tárolóba, sem közvetlenül, sem beágyazva.
  var NEVER_CACHED = ['client','phone','email','vin','cnp','docs','dosarActe',
                      'photos','photoKeys','elements','rework','deviz','evalData',
                      'reconst','closing','gapLog','ocr','ocrRaw','ocrResult',
                      'buletin','proprietar','adresa','nrDosar','asigurator',
                      'plate','pin','token'];

  // Védőháló: ha egy jövőbeli mező mégis átcsúszna, itt kiszűrjük.
  function scrub(o){
    if(!o || typeof o!=='object') return o;
    var k;
    for(k in o){
      if(!Object.prototype.hasOwnProperty.call(o,k)) continue;
      if(NEVER_CACHED.indexOf(k) >= 0){ delete o[k]; continue; }
      if(o[k] && typeof o[k]==='object') scrub(o[k]);
    }
    return o;
  }

  function setJob(job, ttlMs){
    if(!job || !job.id) return false;
    return set('job:'+job.id, minimal(job), ttlMs);
  }
  function getJob(id){ return get('job:'+id); }

  var API={ set:set, get:get, del:del, sweep:sweep, wipe:wipe, scrub:scrub, maskPlate:maskPlate,
            migrateLegacy:migrateLegacy, minimal:minimal,
            setJob:setJob, getJob:getJob, scope:scope,
            TTL_MS:TTL_MS, PREFIX:PREFIX,
            LEGACY_CACHE:LEGACY_CACHE, LEGACY_SESSION:LEGACY_SESSION,
            MIN_FIELDS:MIN_FIELDS, NEVER_CACHED:NEVER_CACHED };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWCache=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
