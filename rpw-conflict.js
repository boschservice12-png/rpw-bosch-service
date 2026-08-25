/* BUILD: RPW-CONFLICT-6 2026-08-24 */
/* ════════════════════════════════════════════════════════════════
   rpw-conflict.js — VERZIÓÜTKÖZÉS KEZELÉSE

   A brief 6. pontja:
     · a kliens MUTASSA MEG, hogy másik felhasználó módosította
     · a helyi módosítás NE VESSZEN EL
     · a felhasználó DÖNTHESSEN újratöltésről vagy újraalkalmazásról
     · fázislezárásnál automatikus merge TILOS

   Ez a modul csak megjelenít és kérdez — nem dönt a felhasználó helyett.
   ════════════════════════════════════════════════════════════════ */
(function(root){
  'use strict';

  var T = {
    ro: { title:'Alt coleg a modificat dosarul',
          body:'Cineva a salvat modificări în acest dosar cât timp lucrai. Modificările tale NU s-au pierdut.',
          mine:'Modificările tale',  theirs:'Pe server acum',
          reload:'Reîncarcă de pe server',  reapply:'Aplică din nou modificările mele',
          cancel:'Rămân aici',
          warnPhase:'La închiderea unei faze nu se face îmbinare automată. Verifică datele înainte.',
          lost:'Modificările tale au fost salvate local — le poți aplica din nou după reîncărcare.' },
    hu: { title:'Egy kolléga módosította a dossziét',
          body:'Valaki mentett ebbe a dossziéba, amíg dolgoztál rajta. A te módosításaid NEM vesztek el.',
          mine:'A te módosításaid',  theirs:'A szerveren most',
          reload:'Újratöltés a szerverről',  reapply:'A módosításaim újraalkalmazása',
          cancel:'Itt maradok',
          warnPhase:'Fáziszáráskor NINCS automatikus összefésülés. Ellenőrizd az adatokat.',
          lost:'A módosításaid helyben elmentve — újratöltés után újraalkalmazhatod.' },
    en: { title:'A colleague modified this job',
          body:'Someone saved changes while you were working. Your changes were NOT lost.',
          mine:'Your changes',  theirs:'On the server now',
          reload:'Reload from server',  reapply:'Re-apply my changes',
          cancel:'Stay here',
          warnPhase:'No automatic merge when closing a phase. Check the data first.',
          lost:'Your changes are stored locally — you can re-apply them after reloading.' }
  };
  function L(){
    try{ var l=(root.localStorage&&root.localStorage.getItem('rpw_lang'))||'ro';
         return T[l]||T.ro; }catch(e){ return T.ro; }
  }

  // A helyi módosítás megőrzése — hogy semmiképp ne vesszen el
  var PENDING = {};
  function keep(jobId, patch){
    PENDING[jobId] = { patch:patch, at:Date.now() };
    try{ if(root.RPWCache) root.RPWCache.set('conflict:'+jobId, {at:Date.now()}, 60*60*1000); }catch(e){}
    return PENDING[jobId];
  }
  function pending(jobId){ return PENDING[jobId]||null; }
  function clear(jobId){ delete PENDING[jobId];
    try{ if(root.RPWCache) root.RPWCache.del('conflict:'+jobId); }catch(e){} }

  // Mely mezők térnek el — csak a NEVÜK, tartalom nélkül a listában
  function diffFields(mine, theirs){
    var out=[], k;
    mine=mine||{}; theirs=theirs||{};
    for(k in mine){
      if(!Object.prototype.hasOwnProperty.call(mine,k)) continue;
      if(k==='version'||k==='updated_at') continue;
      var a=JSON.stringify(mine[k]), b=JSON.stringify(theirs[k]);
      if(a!==b) out.push(k);
    }
    return out;
  }

  /* Megjeleníti a döntést. Nem dönt helyetted.
     opts: { jobId, mine, theirs, serverVersion, isPhaseClose,
             onReload:fn, onReapply:fn, onCancel:fn } */
  function show(opts){
    opts = opts||{};
    var t = L();
    var d = root.document;
    if(!d) return null;

    keep(opts.jobId, opts.mine);

    var ov = d.createElement('div');
    ov.className = 'rpw-conflict-ov';
    ov.setAttribute('role','dialog');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;'+
                       'display:flex;align-items:center;justify-content:center;padding:16px';

    var box = d.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;max-width:480px;width:100%;'+
                        'padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-size:14px';

    function line(txt, css){
      var e = d.createElement('div');
      e.textContent = txt;                       // textContent — soha nem HTML
      if(css) e.style.cssText = css;
      box.appendChild(e); return e;
    }

    line(t.title, 'font-weight:700;font-size:16px;margin-bottom:8px;color:#C81E33');
    line(t.body,  'color:#374151;line-height:1.5;margin-bottom:12px');

    if(opts.isPhaseClose) line(t.warnPhase,
      'background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:8px 10px;'+
      'margin-bottom:12px;color:#92400E;font-size:13px');

    var fields = diffFields(opts.mine, opts.theirs);
    if(fields.length){
      var fl = d.createElement('div');
      fl.style.cssText='background:#F3F4F6;border-radius:8px;padding:8px 10px;margin-bottom:14px;font-size:13px';
      var h = d.createElement('div');
      h.textContent = t.mine + ' (' + fields.length + '):';
      h.style.cssText='font-weight:600;margin-bottom:4px';
      fl.appendChild(h);
      var ul = d.createElement('div');
      ul.textContent = fields.slice(0,8).join(', ') + (fields.length>8 ? ' …' : '');
      ul.style.cssText='color:#4B5563;word-break:break-word';
      fl.appendChild(ul); box.appendChild(fl);
    }

    var row = d.createElement('div');
    row.style.cssText='display:flex;flex-direction:column;gap:8px';

    function btn(label, bg, fg, fn){
      var b=d.createElement('button');
      b.textContent=label;
      b.style.cssText='padding:11px 14px;border-radius:8px;border:1px solid '+
                      (bg==='#fff'?'#D1D5DB':bg)+';background:'+bg+';color:'+fg+
                      ';font-size:14px;font-weight:600;cursor:pointer;width:100%';
      b.onclick=function(){ try{ ov.remove(); }catch(e){} if(fn) fn(); };
      row.appendChild(b); return b;
    }

    btn(t.reload,  '#2A6FDB', '#fff', function(){
      // A helyi módosítás MEGMARAD — újratöltés után újraalkalmazható
      if(opts.onReload) opts.onReload(pending(opts.jobId));
    });
    btn(t.reapply, '#fff', '#111827', function(){
      // Frissítjük a várt verziót a szerverére, és újraküldjük
      if(opts.onReapply) opts.onReapply(pending(opts.jobId), opts.serverVersion);
    });
    btn(t.cancel,  '#fff', '#6B7280', function(){ if(opts.onCancel) opts.onCancel(); });

    box.appendChild(row);
    line(t.lost, 'margin-top:12px;font-size:12px;color:#6B7280;text-align:center');
    ov.appendChild(box);
    d.body.appendChild(ov);
    return ov;
  }

  var API = { show:show, keep:keep, pending:pending, clear:clear, diffFields:diffFields, T:T };
  if(typeof module!=='undefined' && module.exports) module.exports=API;
  root.RPWConflict = API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
