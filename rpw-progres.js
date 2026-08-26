/* ════════════════════════════════════════════════════════════════════
   rpw-progres.js — FOLYAMATJELZO (Ferenc dontese, 2026-08-26)

   Egy sav, ami megmutatja, hol tart egy ugy. A nehezseg nem a rajz:
   az RPW-ben HAROM kulonbozo folyamat fut, mas-mas hosszal es mas-mas
   "kesz" fogalommal.

     kardosszie   flux=doar_dosar      3 lepes,  valtozo iratszammal
     varakozas    sosire=programat     5 fogadasi feltetel (kapu: WhatsApp)
     javitas      sosire=sosit         7 fazis (pending/active/done)

   EZ A MODUL A LANC EGYETLEN FORRASA. A lista es a munkalapok UGYANEZT
   a fuggvenyt hivjak — igy a jelzo soha nem mondhat ketfelet ugyanarrol
   a munkarol. (Ferenc D-2 dontese: "mindketto, ugyanaz a fuggveny.")

   Ferenc dontesei:
     D-1  szegmens-sav (a lanc HOSSZA is informacio)
     D-2  listan ES munkalapon, ugyanabbol a fuggvenybol
     D-3  a kimaradt lepes KIHAGYOTTKENT jelolve — nem uresen, mert az
          ugy nezne ki, mintha elmaradt volna valami
     D-4  keses a savon: az aktualis szegmens borostyan, ha a fazis
          regebb ota all, mint a "megakadt" kuszob (Statistici lap)
     D-5  NEM kattinthato — a listaban a dupla kattintas mar foglalt
   ════════════════════════════════════════════════════════════════════ */
(function(root){
  'use strict';

  var CSS_ID='rpw-progres-css';
  var CSS=''
   +'.pr-wrap{display:inline-flex;flex-direction:column;gap:4px;min-width:96px}'
   +'.pr-segs{display:flex;gap:3px;align-items:center}'
   +'.pr-seg{width:15px;height:7px;border-radius:2px;background:#d0d0d0;flex:0 0 auto}'
   +'.pr-seg.pr-done{background:#16a34a}'
   +'.pr-seg.pr-now{background:#2563eb}'
   +'.pr-seg.pr-late{background:#ca8a04}'
   +'.pr-seg.pr-block{background:#ca8a04}'
   /* D-3: a kihagyott lepes NEM ures — atlos savozas mutatja, hogy nem
      hiba, hanem nem is kellett. */
   +'.pr-seg.pr-skip{background:repeating-linear-gradient(45deg,#d0d0d0 0 2px,transparent 2px 4px);'
   +'border:1px solid #d0d0d0;height:7px}'
   +'.pr-lbl{font-size:10.5px;font-weight:700;color:#555;line-height:1.25;white-space:nowrap;'
   +'font-variant-numeric:tabular-nums}'
   +'.pr-lbl .pr-cnt{color:#999;font-weight:600}'
   +'.pr-lbl.pr-l-late{color:#92400e}'
   /* nagy valtozat a munkalapokon */
   +'.pr-big .pr-seg{width:100%;height:10px;border-radius:3px}'
   +'.pr-big .pr-segs{gap:4px;width:100%}'
   +'.pr-big{min-width:0;width:100%;gap:7px}'
   +'.pr-big .pr-lbl{font-size:13px;white-space:normal}';

  function injectCss(doc){
    try{
      if(!doc || doc.getElementById(CSS_ID)) return;
      var st=doc.createElement('style');
      st.id=CSS_ID; st.textContent=CSS;
      (doc.head||doc.documentElement).appendChild(st);
    }catch(e){}
  }

  /* ── segedek ──────────────────────────────────────────────────── */
  function isDosar(j){
    return (j.flux==='doar_dosar') || (j.flux==null && j.doarDosar===true);
  }
  function daysSince(iso){
    if(!iso) return 0;
    var t=Date.parse(iso); if(!t) return 0;
    return Math.floor((Date.now()-t)/86400000);
  }
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  /* ── A LANC — a modul szive ───────────────────────────────────── */
  /* opts: {T:fn, acteCount:fn, threshold:number, lateProg:bool} */
  function chain(job, opts){
    opts=opts||{};
    var T=opts.T||function(k){return k};
    var TH=opts.threshold||5;
    var j=job||{};

    /* ── 1. KARDOSSZIE ─────────────────────────────────────────── */
    if(isDosar(j)){
      var st = j.inchis ? 3 : (j.dosarPredat ? 2 : 1);
      var steps=[
        {label:T('dd_s1'), state: st>1?'done':'now'},
        {label:T('dd_s2'), state: st>2?'done':(st===2?'now':'todo')},
        {label:T('dd_s3'), state: st===3?'done':'todo'}
      ];
      var cnt='';
      if(st===1 && typeof opts.acteCount==='function'){
        var ac=opts.acteCount(j)||{};
        cnt=(ac.done||0)+' / '+(ac.total||0)+' '+T('pr_acte');
      }else{
        cnt=st+' / 3 '+T('pr_lepes');
      }
      return {kind:'dosar', steps:steps, label:steps[st-1].label,
              counter:cnt, late:false, done:st-1, total:3};
    }

    /* ── 2. VARAKOZAS — az auto meg nem jott be ─────────────────── */
    if(j.sosire==='programat'){
      var c=j.conditions||{};
      var piese=(c.piese==='livrat')||(c.piese===true);
      var raw=[
        {label:T('cond_programare'), ok:!!c.programare},
        {label:T('cond_loc'),        ok:!!c.loc},
        {label:T('cond_om'),         ok:!!c.om},
        {label:T('cond_piese'),      ok:piese},
        {label:T('cond_whatsapp'),   ok:!!c.whatsapp, gate:true}
      ];
      var n=0;
      var st2=raw.map(function(r){
        if(r.ok){n++; return {label:r.label, state:'done'}}
        /* A KAPU a WhatsApp — csak az blokkol, a tobbi tajekoztat. */
        return {label:r.label, state: r.gate?'block':'todo'};
      });
      var kapu=!!c.whatsapp;
      return {kind:'astept', steps:st2,
              label: kapu ? T('pr_gata') : T('pr_var_wa'),
              counter:n+' / 5 '+T('pr_feltetel'),
              late: !!opts.lateProg, done:n, total:5};
    }

    /* ── 3. JAVITAS FOLYAMATBAN ────────────────────────────────── */
    var PH=['ph1','ph2','ph3','ph4','ph5','ph6','ph7'];
    var phs=j.phases||{};
    var cur=0;
    for(var p=1;p<=7;p++){ if((phs[p]||{}).status==='active'){cur=p; break} }
    if(!cur){
      /* nincs aktiv: a lezart munka a 7-en all, egyebkent a job.phase */
      cur = j.inchis ? 7 : (j.phase||1);
    }
    /* A FAZIS-ALLAPOT FORRASA A KOZPONTI WORKFLOW, ha elerheto — igy a
       lista es a munkalap fazis-sava SOHA nem mondhat mast ugyanarrol a
       fazisrol. (A munkalap phase-nav-ja is ezt olvassa.) Ha a modul
       nincs betoltve, a nyers phases[] a tartalek. */
    var WF=(root.RPWWorkflow && typeof root.RPWWorkflow.phaseStatus==='function')
             ? root.RPWWorkflow : null;
    var doneN=0;
    var st3=PH.map(function(k,i){
      var idx=i+1;
      var s = WF ? WF.phaseStatus(j,idx) : ((phs[idx]||{}).status||'pending');
      if(s==='done'){doneN++; return {label:T(k), state:'done'}}
      /* D-3: a KIHAGYOTT lepes nem ures es nem is kesz — sajat jelolest
         kap, hogy latszodjon: nem hiba, csak nem kellett. */
      if(s==='skipped') return {label:T(k), state:'skip'};
      if(s==='active'||s==='rework') return {label:T(k), state:'now'};
      if(idx===cur)  return {label:T(k), state:'now'};
      /* A heurisztika CSAK a workflow-modul nelkuli esetre valo: ha a
         modul betoltodott, O mondja meg, mi a kihagyott ('skipped') —
         a sajat tippunk rateve ellentmondana neki. */
      if(!WF && idx<cur) return {label:T(k), state:'skip'};
      return {label:T(k), state:'todo'};
    });
    /* D-4: keses — az aktualis fazis regebb ota all, mint a kuszob. */
    var startedD=daysSince((phs[cur]||{}).started);
    var kesik=(!j.inchis && startedD>=TH);
    return {kind:'lucru', steps:st3, label:T(PH[cur-1]),
            counter:cur+' / 7 '+T('pr_fazis'),
            late:kesik, days:startedD, done:doneN, total:7};
  }

  /* ── A RAJZ — mindket helyen ugyanez ──────────────────────────── */
  function html(job, opts){
    opts=opts||{};
    var ch=chain(job,opts);
    var big=opts.big?' pr-big':'';
    var h='<div class="pr-wrap'+big+'">';
    h+='<div class="pr-segs" role="img" aria-label="'+esc(ch.label+' — '+ch.counter)+'">';
    ch.steps.forEach(function(s){
      var cls=s.state==='done' ?'pr-done'
             :s.state==='now'  ?(ch.late?'pr-late':'pr-now')
             :s.state==='block'?'pr-block'
             :s.state==='skip' ?'pr-skip':'';
      h+='<span class="pr-seg '+cls+'" title="'+esc(s.label)+'"></span>';
    });
    h+='</div>';
    h+='<div class="pr-lbl'+(ch.late?' pr-l-late':'')+'">'+esc(ch.label)
      +' <span class="pr-cnt">· '+esc(ch.counter)+'</span></div>';
    h+='</div>';
    return h;
  }

  var api={chain:chain, html:html, injectCss:injectCss, CSS:CSS};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  root.RPWProgres=api;
  if(typeof document!=='undefined') injectCss(document);
})(typeof window!=='undefined'?window:globalThis);
