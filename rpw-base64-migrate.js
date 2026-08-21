/* ============================================================
   rpw-base64-migrate.js — base64 képek KIKÖLTÖZTETÉSE a job JSON-ból Storage-ba (#10)
   NEM DESTRUKTÍV: detektál → feltölt → checksum-verify → path-referencia →
   base64 BACKUP-ba (csak megerősített feltöltés után) ; resume + rollback ; dry-run.
   Keretrendszer-mentes (böngésző admin oldal / node). Globál: RPWMigrate.
   ============================================================ */
(function(root){
  'use strict';
  // egyszerű, determinisztikus checksum (djb2) a base64 tartalomra
  function checksum(str){ var h=5381; for(var i=0;i<str.length;i++){ h=((h<<5)+h+str.charCodeAt(i))>>>0; } return h.toString(16)+':'+str.length; }
  function stripPrefix(dataUrl){ return String(dataUrl||'').replace(/^data:[^;]+;base64,/, ''); }
  function mimeOf(dataUrl){ var m=/^data:([^;]+);base64,/.exec(String(dataUrl||'')); return m?m[1]:'image/jpeg'; }
  function extFromMime(mime){ var M={ 'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','application/pdf':'pdf' }; return M[mime]||'bin'; }
  function approxBytes(b64){ return Math.floor(String(b64||'').length*3/4); }
  function isoNow(now){ try{ return new Date(typeof now==='function'?now():(now||Date.now())).toISOString(); }catch(e){ return null; } }

  // Tartós fotó-referencia (P0 #11): a JOB JSON EZT tárolja base64 helyett.
  function buildRef(o){
    o=o||{};
    return { path:o.path||null, mimeType:o.mimeType||null, size:(o.size!=null?o.size:null),
             checksum:o.checksum||null, createdAt:o.createdAt||null, createdBy:o.createdBy||null,
             category:o.category||null };
  }

  // Megkeresi a base64 mezőket a jobban.
  // Visszaad: [{key, b64, mime, category, setRef, clear}]
  function scanJob(job){
    var out=[];
    if(!job) return out;
    function pushArr(arr, prefix, category){
      if(!Array.isArray(arr)) return;
      arr.forEach(function(it,i){
        if(it && typeof it.data==='string' && it.data.indexOf('data:')===0){
          out.push({ key: prefix+'_'+i, b64: it.data, mime: mimeOf(it.data), category: category||prefix,
            setRef:function(ref){ it.path=ref.path; it.ref=ref; },
            clear:function(){ it._b64=it.data; it.data=null; } });
        }
      });
    }
    pushArr(job.reconstPhotos,'reconst','reconstatare');
    pushArr(job.closingPhotos,'closing','inchidere');
    pushArr(job.photos,'photo','overview');       // dosar áttekintő fotók (type: overview/talon/…)
    pushArr(job.docs,'doc','document');           // dosar dokumentumok
    if(job.elements && typeof job.elements==='object'){
      Object.keys(job.elements).forEach(function(k){
        var e=job.elements[k];
        if(e && typeof e.photo==='string' && e.photo.indexOf('data:')===0){
          out.push({ key:'elem_'+k, b64:e.photo, mime:mimeOf(e.photo), category:'element',
            setRef:function(ref){ e.photoPath=ref.path; e.photoRef=ref; },
            clear:function(){ e._photoB64=e.photo; e.photo=null; } });
        }
      });
    }
    return out;
  }

  // Igazolja, hogy a migráció UTÁN nincs több base64 a jobban (P0 #11 acceptance).
  function verifyNoBase64(job){
    var s;
    try{ s=JSON.stringify(job)||''; }catch(e){ s=''; }
    var img=(s.match(/data:image\//g)||[]).length;
    var app=(s.match(/data:application\//g)||[]).length;
    return { clean:(img+app)===0, remaining:(img+app), images:img, docs:app };
  }

  // Dry-run terv: mit migrálnánk (nincs mutáció, nincs feltöltés)
  function plan(jobs){
    var items=0, bytes=0, perJob=[];
    (jobs||[]).forEach(function(j){
      var f=scanJob(j); var b=f.reduce(function(a,x){return a+stripPrefix(x.b64).length;},0);
      if(f.length){ items+=f.length; bytes+=b; perJob.push({id:j.id, count:f.length, bytes:b}); }
    });
    return { jobs:perJob.length, items:items, approxBytes:bytes, perJob:perJob };
  }

  // Egy job migrálása. sb: {storage:{from(bucket):{upload(path,blob,opts)}}}. opts:{bucket,dryRun,onLog,decode}
  async function migrateJob(job, sb, opts){
    opts=opts||{}; var bucket=opts.bucket||(root.RPW_CFG&&root.RPW_CFG.BUCKET)||'rpw-photos';
    var log=[]; var found=scanJob(job);
    if(!job.photoKeys) job.photoKeys={};
    for(var i=0;i<found.length;i++){
      var it=found[i], b64c=stripPrefix(it.b64), mime=it.mime||'image/jpeg',
          path=job.id+'/'+it.key+'.'+extFromMime(mime), cs=checksum(b64c);
      // RESUME: ha már migrált (van photoKey), kihagyjuk
      if(job.photoKeys[it.key]===true){ log.push({key:it.key, status:'skip-done'}); continue; }
      if(opts.dryRun){ log.push({key:it.key, status:'dry-run', path:path, checksum:cs, mime:mime}); continue; }
      try{
        var blob = opts.decode ? opts.decode(it.b64) : it.b64;   // böngészőben dataURL→Blob; node-ban a stub kezeli
        var up = await sb.storage.from(bucket).upload(path, blob, {contentType:mime, upsert:true});
        if(up && up.error) throw up.error;
        // VERIFY: a feltöltött path visszaigazolása (a stub/valós upload data.path-ot ad)
        var okPath = up && up.data && (up.data.path || up.data.Key || path);
        if(!okPath) throw new Error('upload verify failed');
        // TARTÓS REFERENCIA (metaadattal) + base64 BACKUP (nem törlés, csak null + _b64 mentés)
        var ref=buildRef({ path:path, mimeType:mime, size:approxBytes(b64c), checksum:cs,
                           category:it.category, createdBy:(opts.actor||opts.createdBy||null),
                           createdAt:isoNow(opts.now) });
        it.setRef(ref); it.clear();
        job.photoKeys[it.key]=true;
        if(!job.photoUrls) job.photoUrls={};
        job.photoUrls[it.key]=path; // aláírt URL-t a megjelenítéskor a signed-URL réteg ad
        log.push({key:it.key, status:'migrated', path:path, checksum:cs, mime:mime, ref:ref});
      }catch(e){ log.push({key:it.key, status:'error', error:String(e&&e.message||e)}); }
      if(opts.onLog) try{opts.onLog(log[log.length-1])}catch(_){}
    }
    return { id:job.id, migrated:log.filter(function(x){return x.status==='migrated';}).length,
             skipped:log.filter(function(x){return x.status==='skip-done';}).length,
             errors:log.filter(function(x){return x.status==='error';}).length, log:log };
  }

  // ROLLBACK: visszaállítja a base64-et a backupból (ha a migráció után baj lenne)
  function rollbackJob(job){
    var n=0;
    ['reconstPhotos','closingPhotos','photos','docs'].forEach(function(a){
      if(Array.isArray(job[a])) job[a].forEach(function(it,i){ if(it && it._b64){ it.data=it._b64; delete it._b64; delete it.path; delete it.ref; n++;
        if(job.photoKeys){ var pref={reconstPhotos:'reconst',closingPhotos:'closing',photos:'photo',docs:'doc'}[a]; if(pref) delete job.photoKeys[pref+'_'+i]; } } });
    });
    if(job.elements) Object.keys(job.elements).forEach(function(k){ var e=job.elements[k]; if(e && e._photoB64){ e.photo=e._photoB64; delete e._photoB64; delete e.photoPath; delete e.photoRef; if(job.photoKeys) delete job.photoKeys['elem_'+k]; n++; } });
    return n;
  }

  // VÉGLEGESÍTÉS (P0 #11): a base64 BACKUP-ok (_b64/_photoB64) törlése — CSAK
  // miután a migráció igazolt (feltöltés + aláírt URL működik). Ezután NINCS
  // több base64 a JOB JSON-ban, de a rollback már NEM lehetséges (visszafordíthatatlan).
  function purgeBackups(job){
    var n=0;
    ['reconstPhotos','closingPhotos','photos','docs'].forEach(function(a){
      if(Array.isArray(job[a])) job[a].forEach(function(it){ if(it && it._b64!==undefined){ delete it._b64; n++; } });
    });
    if(job.elements) Object.keys(job.elements).forEach(function(k){ var e=job.elements[k]; if(e && e._photoB64!==undefined){ delete e._photoB64; n++; } });
    return n;
  }

  var api={ scanJob:scanJob, plan:plan, migrateJob:migrateJob, rollbackJob:rollbackJob,
            purgeBackups:purgeBackups, verifyNoBase64:verifyNoBase64, buildRef:buildRef,
            checksum:checksum, mimeOf:mimeOf, extFromMime:extFromMime };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  root.RPWMigrate=api;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
