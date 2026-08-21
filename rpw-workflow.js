/* ============================================================
   rpw-workflow.js — RPW KÖZPONTI WORKFLOW-MODUL (EGYETLEN IGAZSÁGFORRÁS)
   ------------------------------------------------------------
   Ez az egyetlen hely, ahol a fázisállapotok és fázisátmenetek
   szabályai élnek. Az összes HTML-oldal ezt hívja — NINCS
   oldalankénti eltérő workflow-logika.

   Keretrendszer-mentes, böngésző + Node kompatibilis.
   Globál: window.RPWWorkflow  /  module.exports = RPWWorkflow

   Fázisok: 1 Recepție · 2 Evaluare · 3 Reconstatare · 4 Tinichigerie
            5 Vopsitorie · 6 Control · 7 Închidere
   Állapotok: pending active blocked waiting rework done skipped
   ============================================================ */
(function(root){
  'use strict';

  var PHASES = [1,2,3,4,5,6,7];
  var PHASE_META = {
    1:{key:'recepcio',   ro:'Recepție',    hu:'Recepció',    en:'Reception'},
    2:{key:'evaluare',   ro:'Evaluare',    hu:'Felmérés',    en:'Assessment'},
    3:{key:'reconstatare',ro:'Reconstatare',hu:'Újrafelmérés',en:'Re-assessment'},
    4:{key:'tinichigerie',ro:'Tinichigerie',hu:'Lakatos',    en:'Bodywork'},
    5:{key:'vopsitorie', ro:'Vopsitorie',  hu:'Fényezés',    en:'Paint'},
    6:{key:'control',    ro:'Control',     hu:'Kontroll',    en:'Final check'},
    7:{key:'inchidere',  ro:'Închidere',   hu:'Lezárás',     en:'Closing'}
  };
  var STATES = ['pending','active','blocked','waiting','rework','done','skipped'];

  // ---- Többnyelvű üzenetek (RO/HU/EN) ---------------------------------
  var MSG = {
    wf_blocked_title:       {ro:'Faza nu poate fi deschisă încă.', hu:'A fázis még nem nyitható meg.', en:'This phase cannot be opened yet.'},
    wf_blocking_list:       {ro:'Condiții de blocare:', hu:'Blokkoló feltételek:', en:'Blocking conditions:'},
    wf_prev_not_closed:     {ro:'faza anterioară nu este închisă', hu:'az előző fázis nincs lezárva', en:'the previous phase is not closed'},
    wf_eval_not_accepted:   {ro:'evaluarea nu este acceptată', hu:'az értékelés nincs elfogadva', en:'the assessment is not accepted'},
    wf_reconst_waiting:     {ro:'reconstatarea așteaptă răspunsul asigurătorului', hu:'a reconstatare biztosítói válaszra vár', en:'re-assessment awaits the insurer response'},
    wf_future_phase:        {ro:'faza este în viitor față de stadiul curent', hu:'a fázis a jelenlegi állapothoz képest jövőbeli', en:'the phase is ahead of the current stage'},
    wf_no_work_item:        {ro:'nu există niciun articol de lucru aprobat', hu:'nincs legalább egy jóváhagyott munkatétel', en:'no approved work item'},
    wf_missing_op:          {ro:'lipsește denumirea operației', hu:'hiányzik a művelet megnevezése', en:'operation name is missing'},
    wf_missing_hours:       {ro:'ora de manoperă necesară lipsește', hu:'a szükséges munkaóra nincs megadva', en:'required labour hours missing'},
    wf_missing_termen:      {ro:'lipsește termenul de predare', hu:'nincs átadási határidő', en:'no delivery deadline'},
    wf_eval_not_final:      {ro:'evaluarea este doar ciornă/trimisă', hu:'az értékelés csak draft/sent állapotú', en:'assessment is only draft/sent'},
    wf_reconst_no_response: {ro:'reconstatarea nu are răspuns (accept/refuz)', hu:'a reconstatare nincs lezárva válasszal', en:'re-assessment has no response'},
    wf_reconst_need_note:   {ro:'la refuz sunt obligatorii nota și data răspunsului', hu:'elutasításnál kötelező a válaszmegjegyzés és -dátum', en:'rejection requires response note and date'},
    wf_row_incomplete:      {ro:'există linii de lucru incomplete', hu:'van hiányos munkasor', en:'there are incomplete work rows'},
    wf_row_not_completed:   {ro:'nu toate liniile sunt executate', hu:'nem minden sor van elvégezve', en:'not all rows are completed'},
    wf_row_no_executor:     {ro:'lipsește executantul la o linie', hu:'hiányzik a végrehajtó egy sornál', en:'a row has no executor'},
    wf_open_rework:         {ro:'există remediere (rework) deschisă', hu:'van nyitott javítás (rework)', en:'there is an open rework'},
    wf_control_incomplete:  {ro:'controlul nu este complet', hu:'a kontroll nincs teljesen kitöltve', en:'the control is not complete'},
    wf_control_nok:         {ro:'controlul are rezultat NOK', hu:'a kontroll NOK eredményű', en:'the control result is NOK'},
    wf_no_invoice:          {ro:'lipsește numărul facturii', hu:'nincs számlaszám', en:'invoice number missing'},
    wf_no_deviz:            {ro:'lipsește referința devizului', hu:'nincs deviz hivatkozás', en:'deviz reference missing'},
    wf_no_deviz_file:       {ro:'devizul nu e încărcat și nici marcat ca nefiind necesar', hu:'a devizfájl nincs feltöltve és nincs „nem szükséges”-nek jelölve', en:'deviz file not uploaded nor marked not-required'},
    wf_photos_not_five:     {ro:'nu există 5 fotografii finale reale', hu:'nincs 5 valóban létező végső fotó', en:'there are not 5 real final photos'},
    wf_not_operational:     {ro:'vehiculul nu e marcat funcțional', hu:'a jármű nincs működőképesnek jelölve', en:'vehicle not marked operational'},
    wf_final_control:       {ro:'controlul final nu e confirmat', hu:'a végleges kontroll nincs megerősítve', en:'final control not confirmed'},
    wf_docs_not_delivered:  {ro:'documentele nu sunt predate biroului', hu:'a dokumentumok nincsenek az irodának átadva', en:'documents not delivered to office'},
    wf_no_handover:         {ro:'lipsește responsabilul de predare', hu:'nincs átadási felelős rögzítve', en:'no handover responsible recorded'},
    wf_talon_missing:       {ro:'talonul nu e încărcat', hu:'a talon nincs feltöltve', en:'registration card not uploaded'},
    wf_overview_missing:    {ro:'lipsesc cele 6 fotografii de ansamblu', hu:'hiányzik a 6 áttekintő fotó', en:'the 6 overview photos are missing'},
    wf_elements_incomplete: {ro:'nu toate elementele de caroserie au status', hu:'nem minden karosszériaelem státusza kitöltött', en:'not all body elements have status'},
    wf_proof_photo_missing: {ro:'element avariat/recomandat fără foto dovadă', hu:'sérült/ajánlott elemhez hiányzik a bizonyító fotó', en:'damaged/suggested element without proof photo'},
    wf_kar_doc_missing:     {ro:'lipsește documentul de daună / numărul dosarului', hu:'hiányzik a kárdokumentum / kárszám', en:'damage document / claim number missing'},
    wf_worktype_missing:    {ro:'tipul lucrării nu este setat', hu:'a munkatípus nincs megadva', en:'work type not set'},
    wf_damage_report_missing:{ro:'raportul de daună nu este creat', hu:'a damage report nincs létrehozva', en:'damage report not created'},
    wf_override_reason_short:{ro:'motivul override trebuie să aibă min. 10 caractere', hu:'a felülbírálás indoklása legalább 10 karakter legyen', en:'override reason must be at least 10 characters'},
    wf_override_fields:     {ro:'override incomplet (from/to/actor/motiv)', hu:'hiányos felülbírálás (honnan/hova/végrehajtó/indok)', en:'incomplete override (from/to/actor/reason)'},
    wf_saved_not_synced:    {ro:'Salvat local, dar NU este sincronizat cu serverul. Faza următoare nu e încă disponibilă pe alt dispozitiv. Reîncercați.',
                             hu:'Helyben elmentve, de NINCS szinkronizálva a szerverrel. A következő fázis másik eszközön még nem érhető el. Próbáld újra.',
                             en:'Saved locally but NOT synced to the server. The next phase is not yet available on another device. Please retry.'},
    wf_no_work_rows:        {ro:'nu există linii de lucru pentru acest sector (folosiți „omite / skipped")', hu:'nincs munkasor ehhez a műhelyhez (használd a „kihagyás / skipped"-et)', en:'no work rows for this shop (use skip)'},
    wf_rw_category:         {ro:'categoria remedierii este obligatorie', hu:'a rework kategória kötelező', en:'rework category required'},
    wf_rw_desc:             {ro:'descrierea trebuie să aibă min. 10 caractere', hu:'a leírás legalább 10 karakter legyen', en:'description must be at least 10 characters'},
    wf_rw_assignee:         {ro:'responsabilul (assignedTo) este obligatoriu', hu:'a felelős (assignedTo) kötelező', en:'assignee is required'},
    wf_rw_createdby:        {ro:'creatorul (createdBy) este obligatoriu', hu:'a létrehozó (createdBy) kötelező', en:'createdBy is required'},
    wf_rw_target:           {ro:'faza țintă a remedierii este invalidă', hu:'a rework célfázisa érvénytelen', en:'invalid rework target phase'},
    wf_rw_resolver:         {ro:'executant real obligatoriu la finalizare', hu:'a lezáráshoz valós végrehajtói név kell', en:'real executor name required to resolve'},
    wf_rw_note:             {ro:'nota de rezolvare este obligatorie', hu:'a lezárási megjegyzés kötelező', en:'resolution note required'},
    wf_rw_placeholder:      {ro:'nume executant generic neacceptat', hu:'általános/placeholder végrehajtói név nem fogadható el', en:'generic/placeholder executor name not accepted'},
    wf_skipped_no_body:     {ro:'fără lucrări de tinichigerie — fază omisă', hu:'nincs lakatosmunka — fázis kihagyva', en:'no bodywork — phase skipped'},
    wf_skipped_no_paint:    {ro:'fără lucrări de vopsitorie — fază omisă', hu:'nincs fényezés — fázis kihagyva', en:'no paintwork — phase skipped'},
    wf_readonly:            {ro:'🔒 Fază închisă — doar citire (audit). Modificările nu sunt permise.', hu:'🔒 Lezárt fázis — csak olvasás (audit). Módosítás nem engedélyezett.', en:'🔒 Closed phase — read-only (audit). Edits are not allowed.'}
  };
  function t(key, lang){ var m=MSG[key]; if(!m) return key; return m[lang]||m.ro||key; }
  function phaseName(phase, lang){ var m=PHASE_META[phase]; if(!m) return String(phase); return m[lang]||m.ro; }

  // ---- Kis segédfüggvények -------------------------------------------
  function isNum(v){ return typeof v==='number' && !isNaN(v); }
  function pos(v){ var n=parseFloat(v); return !isNaN(n) && n>0; }
  function nonEmpty(v){ return v!=null && String(v).trim()!==''; }
  function arr(v){ return Array.isArray(v)?v:[]; }

  // Valódi fotó: nem null, van data / url / storage-path — NEM a tömb hossza!
  function isRealPhoto(p){
    if(!p || typeof p!=='object') return false;
    if(nonEmpty(p.data)) return true;
    if(nonEmpty(p.url))  return true;
    if(nonEmpty(p.key))  return true;
    if(nonEmpty(p.path)) return true;
    if(nonEmpty(p.ref))  return true;
    return false;
  }
  function realPhotoCount(list){ return arr(list).filter(isRealPhoto).length; }

  // Placeholder / generikus végrehajtói név elutasítása
  var PLACEHOLDER_NAMES = ['lakatos','vopsitor','worker','admin','test','user','n/a','na','-','xxx','asd','aaa'];
  function isRealPerson(name){
    if(name==null) return false;
    var s=String(name).trim();
    if(s.length<3) return false;
    if(PLACEHOLDER_NAMES.indexOf(s.toLowerCase())>=0) return false;
    return true;
  }

  // ---- Fázis-állapot elérése -----------------------------------------
  function ph(job, n){
    if(!job.phases) job.phases={};
    if(!job.phases[n] || typeof job.phases[n]!=='object') job.phases[n]={status:'pending'};
    return job.phases[n];
  }
  function setState(job, n, status, extra){
    var p=ph(job,n); p.status=status; p.lastChangedAt=nowISO(job);
    if(extra){ for(var k in extra) p[k]=extra[k]; }
    return p;
  }
  function nowISO(job){
    // Node-tesztben Date determinisztikus lehet; élesben valós idő.
    try{ return new Date().toISOString(); }catch(e){ return null; }
  }

  // ---- Backward-compatible migráció ----------------------------------
  // Régi dossziék hiányzó mezőit visszafelé kompatibilisen kiegészíti.
  function migrateJob(job){
    if(!job || typeof job!=='object') return {job:job, changed:false};
    var changed=false;
    if(!job.phases){ job.phases={}; changed=true; }
    var current = isNum(job.phase)?job.phase:1;
    for(var i=0;i<PHASES.length;i++){
      var n=PHASES[i];
      var p=job.phases[n];
      if(!p || typeof p!=='object'){
        // következtetés a régi job.phase alapján
        var st = n<current ? 'done' : (n===current ? 'active' : 'pending');
        job.phases[n]={status:st}; changed=true; p=job.phases[n];
      }
      // teljes mezőkészlet biztosítása (visszafelé kompatibilis)
      ['status','started','finished','completedBy','blockedReason','skippedReason','lastChangedAt'].forEach(function(f){
        if(!(f in p)){ p[f] = (f==='status'? (p.status||'pending') : null); changed=true; }
      });
      if(!p.status){ p.status='pending'; changed=true; }
    }
    // auto (privát) munka: nincs reconstatare → skipped, dokumentált okkal
    if(job.damageType==='auto'){
      var p3=job.phases[3];
      if(p3 && p3.status!=='skipped' && p3.status!=='done'){
        p3.status='skipped';
        if(!p3.skippedReason) p3.skippedReason='auto:no-reconstatare';
        p3.lastChangedAt=nowISO(job); changed=true;
      }
    }
    if(!Array.isArray(job.rework)){ job.rework=[]; changed=true; }
    if(!Array.isArray(job.workflowHistory)){ job.workflowHistory=[]; changed=true; }
    if(!Array.isArray(job.overrideGrants)){ job.overrideGrants=[]; changed=true; }
    if(!job.closing || typeof job.closing!=='object'){ job.closing={}; changed=true; }
    // új lezárási mezők — csak ha hiányoznak (nem írjuk felül a meglévőt)
    ['vehicleOperational','finalControlConfirmed','documentsDeliveredToOffice','handoverBy','handoverAt'].forEach(function(f){
      if(!(f in job.closing)){ job.closing[f]=null; changed=true; }
    });
    if(!job.control || typeof job.control!=='object'){ job.control={results:{},history:[],allDone:false,lastResult:null}; changed=true; }
    if(!Array.isArray(job.control.history)){ job.control.history=[]; changed=true; }
    // job.phase = az AKTUÁLIS aktív fázis (nem az utoljára lezárt) — inkonzisztencia javítása
    var cur=currentActivePhase(job);
    if(cur!=null && job.phase!==cur){ job.phase=cur; changed=true; }
    job.workflowVersion=1;
    return {job:job, changed:changed};
  }

  // Az aktuális aktív fázis a státuszokból: első nem done/skipped fázis
  // (a nem-lezárt állapotok — active/rework/blocked/waiting/pending — közül a legkisebb).
  function currentActivePhase(job){
    if(!job.phases) return null;
    for(var i=0;i<PHASES.length;i++){
      var st=(job.phases[PHASES[i]]||{}).status;
      if(st!=='done' && st!=='skipped') return PHASES[i];
    }
    return 7; // minden lezárt/kihagyott → a lezárásnál marad
  }

  // ---- Termelési sorok (lakatos/festő) --------------------------------
  function bodyRows(job){ return arr(job.production && job.production.body).length ? job.production.body : arr(job.bodyRows); }
  function paintRows(job){ return arr(job.production && job.production.paint).length ? job.production.paint : arr(job.paintRows); }

  // ---- Reconstatare: elfogadott pluszmunkák a termelésbe -------------
  function reconstApprovedItems(job){
    var r=job.reconst||{};
    if((r.status||r.response)==='rejected') return [];
    if((r.status||r.response)==='accepted') return arr(r.rows);
    return []; // draft/sent → még nincs termelésben
  }

  // ---- Rework segédek -------------------------------------------------
  function openReworks(job){ return arr(job.rework).filter(function(r){return r.status==='open';}); }
  function openReworkForPhase(job, phase){ return openReworks(job).filter(function(r){return r.sourcePhase===phase;}); }
  function hasOpenRework(job){ return openReworks(job).length>0; }

  // ====================================================================
  //  BELÉPÉSI ELLENŐRZÉS — canEnterPhase
  // ====================================================================
  function canEnterPhase(job, phase){
    migrateJob(job);
    var reasons=[];
    if(phase<=1) return {allowed:true, reasons:reasons};
    // minden korábbi (nem skipped) fázisnak done-nak kell lennie
    for(var n=1;n<phase;n++){
      var st=ph(job,n).status;
      if(st==='skipped' || st==='done') continue;
      // van blokkoló előző fázis
      if(n===2 && (job.evalData&&job.evalData.status)!=='accepted') reasons.push('wf_eval_not_accepted');
      else if(n===3 && job.damageType!=='auto'){
        var rs=(job.reconst&&(job.reconst.status||job.reconst.response))||'draft';
        if(rs==='draft'||rs==='sent') reasons.push('wf_reconst_waiting');
        else reasons.push('wf_prev_not_closed');
      }
      else reasons.push('wf_prev_not_closed');
    }
    // dedup
    reasons = reasons.filter(function(v,i){return reasons.indexOf(v)===i;});
    // TARTÓS vezetői override: ha van érvényes grant erre a fázisra, a belépés engedélyezett
    if(reasons.length && hasOverrideGrant(job, phase)){
      return {allowed:true, reasons:[], override:true};
    }
    if(reasons.length){ reasons.unshift('wf_future_phase'); reasons=reasons.filter(function(v,i){return reasons.indexOf(v)===i;}); }
    return {allowed:reasons.length===0, reasons:reasons};
  }

  // ====================================================================
  //  LEZÁRÁSI ELLENŐRZÉS — canCompletePhase (fázisonként)
  // ====================================================================
  function overviewPhotoCount(job){
    var pk=job.photoKeys||{}, c=0;
    // 1) indexelt kulcsok ov_0..ov_5
    for(var i=0;i<6;i++){ if(pk['ov_'+i]) c++; }
    // 2) nevesített kulcsok
    if(c===0){ ['ov_front','ov_back','ov_left','ov_right','ov_serieCaros','ov_km'].forEach(function(k){ if(pk[k]) c++; }); }
    // 3) legacy photos tömb (type:'overview')
    if(c===0){ c=realPhotoCount(arr(job.photos).filter(function(p){return p&&p.type==='overview';})); }
    return c;
  }
  function elemStatus(e){ return e ? (e.statusV2 || e.status) : null; }
  function isDamagedStatus(s){ return s==='damaged'||s==='avariata'||s==='suggested'||s==='recomandata'; }
  function elemHasProof(job, key, e){
    var pk=job.photoKeys||{};
    if(pk['elem_'+key]) return true;
    if(nonEmpty(e && e.photo)) return true;
    if(e && isRealPhoto(e.photo)) return true;
    if(e && e.photoRef) return true;
    return false;
  }
  function elementsComplete(job){
    var el=job.elements||{}, keys=Object.keys(el);
    if(!keys.length) return {ok:false, proofOk:true};
    var ok=true, proofOk=true;
    keys.forEach(function(k){
      var e=el[k]; var s=elemStatus(e);
      if(!nonEmpty(s)) ok=false;
      if(isDamagedStatus(s) && !elemHasProof(job,k,e)) proofOk=false;
    });
    return {ok:ok, proofOk:proofOk};
  }

  function checkPhase1(job){
    var m=[];
    if(!nonEmpty(job.damageType) && !nonEmpty(job.workType)) m.push('wf_worktype_missing');
    var pk=job.photoKeys||{};
    var hasTalon = !!pk.talon || !!pk.photo_talon || realPhotoCount(arr(job.photos).filter(function(p){return p&&p.type==='talon';}))>0;
    if(!hasTalon) m.push('wf_talon_missing');
    if(job.damageType==='asig'){
      var nrDosar = nonEmpty(job.nrDosar)||nonEmpty(job.reconst&&job.reconst.nrDosar);
      var karDoc = !!(pk.doc_constatare) || arr(job.docs).some(function(d){return d&&/constatare|proces/i.test(d.type||'');}) || (job.dosarActe&&Object.keys(job.dosarActe).length);
      if(!nrDosar || !karDoc) m.push('wf_kar_doc_missing');
    }
    if(overviewPhotoCount(job)<6) m.push('wf_overview_missing');
    var ec=elementsComplete(job);
    if(!ec.ok) m.push('wf_elements_incomplete');
    if(!ec.proofOk) m.push('wf_proof_photo_missing');
    // damage report: objektum VAGY legacy flag VAGY kitöltött elemek
    var hasReport = (job.damageReport && typeof job.damageReport==='object') || job.damageReportCreated ||
                    (Object.keys(job.elements||{}).length>0 && ec.ok);
    if(!hasReport) m.push('wf_damage_report_missing');
    return m;
  }

  // Az értékelés ELFOGADHATÓSÁGA (a mezők teljessége) — a "Trimite în producție" ehhez kötött
  function canAcceptEval(job){
    var m=[];
    var ed=job.evalData||{};
    var items=arr(ed.comanda);
    var approved=items; // a comanda a jóváhagyott fő munka
    if(approved.length<1){ m.push('wf_no_work_item'); }
    var anyOp=true, anyHours=true;
    approved.forEach(function(r){
      if(!nonEmpty(r.op)) anyOp=false;
      if(!pos(r.hours)) anyHours=false;
    });
    if(approved.length>=1){
      if(!anyOp) m.push('wf_missing_op');
      if(!anyHours) m.push('wf_missing_hours');
    }
    if(!nonEmpty(job.termenPredare)) m.push('wf_missing_termen');
    return m;
  }

  function checkPhase2(job){
    var m = canAcceptEval(job);
    if((job.evalData&&job.evalData.status)!=='accepted'){
      if(m.indexOf('wf_eval_not_final')<0) m.push('wf_eval_not_final');
    }
    return m;
  }

  function checkPhase3(job){
    var m=[];
    if(job.damageType==='auto') return m; // skipped, nincs lezárási feltétel
    var r=job.reconst||{};
    var rs=r.status||r.response||'draft';
    if(rs==='draft'||rs==='sent'){ m.push('wf_reconst_no_response'); return m; }
    if(rs==='rejected'){
      if(!nonEmpty(r.responseNote) || !nonEmpty(r.responseDate)) m.push('wf_reconst_need_note');
    }
    return m;
  }

  function checkExecRows(job, rows, phase){
    var m=[];
    // A ténylegesen végrehajtandó (nem not_required) sorok
    var exec=arr(rows).filter(function(r){ return !(r.notRequired || r.status==='not_required'); });
    // ÜRES fázis: nincs végrehajtandó sor → NEM lezárható „done"-ként, kihagyás (skip) szükséges
    if(exec.length===0) return ['wf_no_work_rows'];
    exec.forEach(function(r){
      var nmv = (r.name && r.name!=='') ? r.name : (r.denumire||r.elKey);
      var opv = r.op||r.bodyType||r.paintType||r.workType;
      if(!nonEmpty(nmv)) m.push('wf_row_incomplete');
      if(!nonEmpty(opv)) m.push('wf_row_incomplete');
      if(!pos(r.hours)) m.push('wf_row_incomplete');
      if(r.approved===false) m.push('wf_row_incomplete');
      if(r.completed!==true) m.push('wf_row_not_completed');
      else if(!isRealPerson(r.completedBy)) m.push('wf_row_no_executor');
    });
    if(openReworkForPhase(job, phase).length) m.push('wf_open_rework');
    return m.filter(function(v,i){return m.indexOf(v)===i;});
  }
  // Van-e egyáltalán végrehajtandó (nem not_required) munkasor a műhelyben?
  function hasExecutableWork(job, phase){
    var rows = phase===4?bodyRows(job):paintRows(job);
    return arr(rows).some(function(r){ return !(r.notRequired||r.status==='not_required'); });
  }

  function checkPhase4(job){ return checkExecRows(job, bodyRows(job), 4); }
  function checkPhase5(job){ return checkExecRows(job, paintRows(job), 5); }

  function checkPhase6(job){
    var m=[];
    var c=job.control||{};
    if(!c.allDone) m.push('wf_control_incomplete');
    if(c.lastResult==='nok') m.push('wf_control_nok');
    if(hasOpenRework(job)) m.push('wf_open_rework');
    return m;
  }

  function checkPhase7(job){
    var m=[];
    if(ph(job,6).status!=='done') m.push('wf_prev_not_closed');
    if(hasOpenRework(job)) m.push('wf_open_rework');
    var cl=job.closing||{};
    if(!nonEmpty(cl.factura)) m.push('wf_no_invoice');
    if(!nonEmpty(cl.devizRef)) m.push('wf_no_deviz');
    if(!nonEmpty(cl.devizFileUrl) && cl.devizNotRequired!==true) m.push('wf_no_deviz_file');
    if(realPhotoCount(job.closingPhotos) < 5) m.push('wf_photos_not_five');
    if(cl.vehicleOperational!==true) m.push('wf_not_operational');
    if(cl.finalControlConfirmed!==true) m.push('wf_final_control');
    if(cl.documentsDeliveredToOffice!==true) m.push('wf_docs_not_delivered');
    if(!nonEmpty(cl.handoverBy)) m.push('wf_no_handover');
    return m;
  }

  var CHECKERS={1:checkPhase1,2:checkPhase2,3:checkPhase3,4:checkPhase4,5:checkPhase5,6:checkPhase6,7:checkPhase7};

  function canCompletePhase(job, phase){
    migrateJob(job);
    if(job.damageType==='auto' && phase===3) return {ok:true, missing:[]}; // skipped
    var fn=CHECKERS[phase];
    var missing = fn?fn(job):[];
    return {ok:missing.length===0, missing:missing};
  }

  function validatePhase(job, phase){
    // egységes validáció: belépés + (ha aktív) lezárási hiányok
    var enter=canEnterPhase(job, phase);
    var complete=canCompletePhase(job, phase);
    return {
      phase:phase,
      canEnter:enter.allowed,
      enterReasons:enter.reasons,
      canComplete:complete.ok,
      missing:complete.missing,
      status:ph(job,phase).status
    };
  }

  function getBlockingReasons(job, phase){
    var enter=canEnterPhase(job, phase);
    if(!enter.allowed) return enter.reasons.slice();
    var c=canCompletePhase(job, phase);
    return c.missing.slice();
  }

  // ====================================================================
  //  ÁTMENETEK
  // ====================================================================
  function nextAfter(job, phase){
    var n=phase+1;
    if(job.damageType==='auto' && n===3){
      setState(job,3,'skipped',{skippedReason:'auto:no-reconstatare'});
      n=4;
    }
    return n<=7?n:null;
  }
  function getNextPhase(job){
    migrateJob(job);
    // aktuális aktív/legmagasabb nem-done fázis
    var cur=null;
    for(var i=0;i<PHASES.length;i++){
      var st=ph(job,PHASES[i]).status;
      if(st==='active'||st==='rework'||st==='blocked'||st==='waiting'){ cur=PHASES[i]; break; }
    }
    if(cur==null){
      // minden done/skipped/pending → első nem lezárt
      for(var j=0;j<PHASES.length;j++){ var s=ph(job,PHASES[j]).status; if(s!=='done'&&s!=='skipped'){ return PHASES[j]; } }
      return null;
    }
    return cur;
  }

  function completePhase(job, phase, context){
    context=context||{};
    var chk=canCompletePhase(job, phase);
    if(!chk.ok) return {ok:false, missing:chk.missing, job:job};
    setState(job, phase, 'done', {finished:nowISO(job), completedBy:context.actor||null});
    var next=nextAfter(job, phase);   // auto-3 esetén 3-at skipped-re állítja, és 4-et ad vissza
    var activePhase=null;
    if(next!=null){
      if(ph(job,next).status==='skipped'){
        var after=nextAfter(job,next);
        if(after!=null){ if(ph(job,after).status==='pending') setState(job,after,'active',{started:nowISO(job)}); activePhase=after; }
      } else {
        if(ph(job,next).status==='pending') setState(job,next,'active',{started:nowISO(job)});
        activePhase=next;
      }
    }
    // job.phase = az ÚJ aktuális aktív fázis (nem a lezárt); 7 lezárása után marad 7
    job.phase = (activePhase!=null) ? activePhase : phase;
    logHistory(job, {action:'complete', fromPhase:phase, toPhase:activePhase, reason:context.reason||'', actor:context.actor||null});
    return {ok:true, missing:[], job:job, nextPhase:activePhase};
  }

  function skipPhase(job, phase, reason, context){
    context=context||{};
    setState(job, phase, 'skipped', {skippedReason:reason||'skipped'});
    var next=nextAfter(job, phase);
    if(next!=null && ph(job,next).status==='pending') setState(job,next,'active',{started:nowISO(job)});
    logHistory(job, {action:'skip', fromPhase:phase, toPhase:next, reason:reason||'', actor:context.actor||null});
    return {ok:true, job:job, nextPhase:next};
  }

  // ====================================================================
  //  REWORK (NOK javítási ciklus)
  // ====================================================================
  // Rework célfázis meghatározása a kategóriából (karosszéria=4, fényezés=5)
  function reworkTarget(data){
    if(data.category==='tinichigerie'||data.category==='bodywork') return 4;
    if(data.category==='vopsitorie'||data.category==='paint') return 5;
    if(data.category==='manager') return 6;
    if(isNum(data.targetPhase)) return data.targetPhase;
    if(isNum(data.sourcePhase)) return data.sourcePhase;
    return null;
  }
  function createRework(job, data){
    migrateJob(job);
    data=data||{};
    var errors=[];
    if(!nonEmpty(data.category)) errors.push('wf_rw_category');
    if(!nonEmpty(data.description) || String(data.description).trim().length<10) errors.push('wf_rw_desc');
    if(!nonEmpty(data.assignedTo)) errors.push('wf_rw_assignee');
    if(!nonEmpty(data.createdBy)) errors.push('wf_rw_createdby');
    var target=reworkTarget(data);
    if(!(isNum(target) && target>=1 && target<=7)) errors.push('wf_rw_target');
    // karosszéria→4, fényezés→5 kikényszerítése
    if(data.category==='tinichigerie' && target!==4) errors.push('wf_rw_target');
    if(data.category==='vopsitorie' && target!==5) errors.push('wf_rw_target');
    if(errors.length) return {ok:false, errors:errors};   // ÉRVÉNYTELEN → nincs mutáció

    var rw={
      id: data.id || ('rw_'+ (arr(job.rework).length+1) + '_' + (data.seed||PHASES.length)),
      sourcePhase: target,      // ide küldjük vissza javításra (4=lakatos, 5=festő; 6=manager-út)
      category: data.category,
      description: String(data.description).trim(),
      assignedTo: data.assignedTo,
      createdAt: data.createdAt||nowISO(job),
      createdBy: data.createdBy,
      relatedControlAt: (job.control&&job.control.lastAt)||null,
      status: 'open',
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: ''
    };
    if(!Array.isArray(job.rework)) job.rework=[];
    job.rework.push(rw);
    if(data.category==='manager'){
      // Dokumentált vezetői út: a kontroll VÁRAKOZIK (waiting), nem „blocked"-deadlock
      setState(job, 6, 'waiting', {blockedReason:'manager'});
    } else {
      setState(job, 6, 'blocked', {blockedReason:'rework'});
      setState(job, target, 'rework', {});
    }
    logHistory(job, {action:'rework_create', fromPhase:6, toPhase:target, reason:rw.description, actor:rw.createdBy});
    return {ok:true, rework:rw};
  }

  function resolveRework(job, reworkId, data){
    migrateJob(job);
    data=data||{};
    var rw=arr(job.rework).filter(function(r){return r.id===reworkId;})[0];
    if(!rw) return {ok:false, errors:['not_found']};
    var errors=[];
    if(!isRealPerson(data.resolvedBy)){ errors.push(nonEmpty(data.resolvedBy)?'wf_rw_placeholder':'wf_rw_resolver'); }
    if(!nonEmpty(data.resolutionNote)) errors.push('wf_rw_note');
    if(errors.length) return {ok:false, errors:errors};   // érvénytelen lezárás → nincs mutáció

    rw.status='done';
    rw.resolvedAt=data.resolvedAt||nowISO(job);
    rw.resolvedBy=String(data.resolvedBy).trim();
    rw.resolutionNote=String(data.resolutionNote).trim();
    var target=rw.sourcePhase;
    if(!openReworkForPhase(job, target).length && target>=1 && target<=7 && target!==6){
      setState(job, target, 'done', {finished:nowISO(job)});
    }
    // ha globálisan nincs több nyitott rework → ÚJ kontrollkör: archiválás + ürítés + újra kitöltendő
    if(!hasOpenRework(job)){
      if(!job.control) job.control={};
      if(!Array.isArray(job.control.history)) job.control.history=[];
      job.control.history.push({
        checks: job.controlChecks||{},
        note: job.controlNote||'',
        result: job.control.lastResult||null,
        at: job.control.lastAt||nowISO(job),
        by: job.control.lastBy||null,
        reworkIds: arr(job.rework).filter(function(r){return r.status==='done';}).map(function(r){return r.id;})
      });
      job.controlChecks={};           // korábbi „megfelelt" jelölések NEM öröklődnek
      job.controlNote='';
      job.control.allDone=false;
      job.control.lastResult=null;
      setState(job, 6, 'active', {blockedReason:null});
    }
    logHistory(job, {action:'rework_resolve', fromPhase:target, toPhase:6, reason:rw.resolutionNote, actor:rw.resolvedBy});
    return {ok:true, rework:rw, job:job};
  }

  // ====================================================================
  //  VEZETŐI FELÜLBÍRÁLÁS (dokumentált kivétel — NEM valódi auth)
  // ====================================================================
  function managerOverride(job, data){
    migrateJob(job);
    data=data||{};
    var errors=[];
    if(!isNum(data.fromPhase) || !isNum(data.toPhase) || !nonEmpty(data.actor)) errors.push('wf_override_fields');
    if(!nonEmpty(data.reason) || String(data.reason).trim().length<10) errors.push('wf_override_reason_short');
    if(errors.length) return {ok:false, errors:errors, error:errors[0]};
    var at=nowISO(job);
    // TARTÓS grant — a canEnterPhase felismeri; csak erre az átmenetre érvényes; nem hamisít befejezettséget
    if(!Array.isArray(job.overrideGrants)) job.overrideGrants=[];
    job.overrideGrants.push({fromPhase:data.fromPhase, toPhase:data.toPhase, actor:data.actor, reason:String(data.reason).trim(), at:at});
    logHistory(job, {action:'override', fromPhase:data.fromPhase, toPhase:data.toPhase, reason:String(data.reason).trim(), actor:data.actor});
    // dokumentált kivételként megnyitja a célfázist — NEM állítja done-ra a hiányos előzőt, NEM töröl adatot
    if(data.toPhase>=1 && data.toPhase<=7 && ph(job,data.toPhase).status!=='done'){
      setState(job, data.toPhase, 'active', {started:at});
      job.phase=data.toPhase;
    }
    return {ok:true, job:job};
  }
  function hasOverrideGrant(job, phase){
    return arr(job.overrideGrants).some(function(g){ return g.toPhase===phase; });
  }

  function logHistory(job, entry){
    if(!Array.isArray(job.workflowHistory)) job.workflowHistory=[];
    job.workflowHistory.push({
      action: entry.action,
      fromPhase: entry.fromPhase!=null?entry.fromPhase:null,
      toPhase: entry.toPhase!=null?entry.toPhase:null,
      reason: entry.reason||'',
      actor: entry.actor||null,
      at: entry.at||nowISO(job)
    });
  }

  // ====================================================================
  //  MENTÉSI EREDMÉNY ÉRTELMEZÉSE (kritikus fázisváltásnál kötelező)
  // ====================================================================
  // A saveJ()/RPWSave eredménye alapján: valóban a szerveren van-e?
  function saveConfirmed(res){
    if(res===true) return true;
    if(!res || typeof res!=='object') return false;
    if(res.failed===true) return false;
    if(res.ok===false) return false;
    if(res.kind==='offline'||res.queued===true) return false;
    if(res.ok===true) return true;
    if('data' in res || 'version' in res) return true;
    return false;
  }

  // ---- Kritikus átmenet: mutáció + MEGERŐSÍTETT mentés ----------------
  // 1) pre-state snapshot → 2) validált mutáció → 3) mentés → 4) mentés-ellenőrzés
  // → csak igazolt mentés után „siker". Nem igazolt mentésnél VISSZAGÖRGET (nem látszik lezártnak).
  var CRIT_KEYS=['phases','rework','workflowHistory','control','controlChecks','controlNote','production','overrideGrants','phase','evalData','closing'];
  function snapshotCrit(job){
    var s={};
    CRIT_KEYS.forEach(function(k){ if(k in job){ try{ s[k]=JSON.parse(JSON.stringify(job[k])); }catch(e){ s[k]=job[k]; } } else s[k]=undefined; });
    return s;
  }
  function restoreCrit(job, snap){
    CRIT_KEYS.forEach(function(k){ if(snap[k]===undefined){ delete job[k]; } else { job[k]=snap[k]; } });
  }

  // ---- localStorage rollback-paritás (P0 #8) -------------------------
  // A mentőréteg (rpw-save.js localWrite / commitConfirmed) a MUTÁLT jobot
  // azonnal kiírja a localStorage-be (rpw_job_<id>). Ha a szervermentés
  // NEM igazolt, a memóriát visszagörgetjük — de a localStorage-másolat
  // a fejlettebb (pl. 'done'/'closedAt') állapotot tartaná, így ÚJRATÖLTÉS
  // UTÁN HAMISAN lezártnak tűnne. Ezért a localStorage snapshotot is
  // vissza kell állítani ugyanarra az előállapotra.
  // Az `ls` store injektálható (teszt); böngészőben a valódi localStorage.
  function defaultLS(){
    try{ if(typeof localStorage!=='undefined') return localStorage; }catch(e){}
    return null;
  }
  function lsKeysFor(id){ return ['rpw_job_'+id, 'rpw_job_ts_'+id, 'rpw_pending_'+id]; }
  function snapshotLS(id, ls){
    ls = ls || defaultLS();
    var snap={ _ls:ls, vals:{} };
    if(!ls || id==null) return snap;
    lsKeysFor(id).forEach(function(k){
      try{ var v=ls.getItem(k); snap.vals[k]=(v===undefined?null:v); }catch(e){ snap.vals[k]=null; }
    });
    return snap;
  }
  function restoreLS(snap){
    var ls=snap && snap._ls; if(!ls) return;
    var vals=snap.vals||{};
    Object.keys(vals).forEach(function(k){
      try{
        if(vals[k]==null){ if(ls.removeItem) ls.removeItem(k); }
        else if(ls.setItem){ ls.setItem(k, vals[k]); }
      }catch(e){}
    });
  }

  async function commitCriticalTransition(job, mutate, opts){
    opts=opts||{};
    migrateJob(job);
    var snap=snapshotCrit(job);
    var lsSnap=snapshotLS(job.id, opts.ls);   // előállapot a localStorage-ből is
    var result;
    try{ result = (typeof mutate==='function') ? mutate() : mutate; }
    catch(e){ restoreCrit(job, snap); restoreLS(lsSnap); return {ok:false, error:'mutate_threw', result:{ok:false, errors:[String(e&&e.message||e)]}}; }
    if(!result || result.ok===false){ restoreCrit(job, snap); restoreLS(lsSnap); return {ok:false, saved:false, result:result||{ok:false}}; }
    if(typeof opts.save==='function'){
      var saveRes;
      try{ saveRes = await opts.save(); }catch(e){ saveRes={failed:true}; }
      if(!saveConfirmed(saveRes)){
        restoreCrit(job, snap);   // memória-visszagörgetés
        restoreLS(lsSnap);        // + localStorage-visszagörgetés → nincs hamis 'done' újratöltés után
        return {ok:false, saved:false, notSynced:true, result:result};
      }
    }
    return {ok:true, saved:true, result:result};
  }

  // ---- Százalékos teljesítettség (UI) --------------------------------
  function completionPercent(job, phase){
    // egyszerű heurisztika: ha done→100, ha nincs blokkoló hiány→100, egyébként a teljesített feltételek aránya
    if(ph(job,phase).status==='done') return 100;
    if(ph(job,phase).status==='skipped') return 100;
    var missing=canCompletePhase(job, phase).missing;
    if(job.damageType==='auto' && phase===3) return 100;
    // becsült feltételszám fázisonként
    var TOTAL={1:8,2:4,3:1,4:3,5:3,6:2,7:9};
    var tot=TOTAL[phase]||1;
    var done=Math.max(0, tot-missing.length);
    return Math.round(done/tot*100);
  }

  // ---- Állapotnevek + UI-üzenetek (RO/HU/EN) -------------------------
  var STATE_NAMES={
    pending:{ro:'În așteptare',hu:'Várakozik',en:'Pending'},
    active: {ro:'Activ',hu:'Aktív',en:'Active'},
    blocked:{ro:'Blocat',hu:'Blokkolva',en:'Blocked'},
    waiting:{ro:'Așteaptă',hu:'Válaszra vár',en:'Waiting'},
    rework: {ro:'Remediere',hu:'Javítás',en:'Rework'},
    done:   {ro:'Închis',hu:'Lezárva',en:'Done'},
    skipped:{ro:'Omis',hu:'Kihagyva',en:'Skipped'}
  };
  var UIMSG={
    bar_status:{ro:'Stare',hu:'Állapot',en:'Status'},
    bar_progress:{ro:'Completare',hu:'Teljesítettség',en:'Progress'},
    bar_blocking:{ro:'Blocaje',hu:'Blokkoló',en:'Blocking'},
    bar_responsible:{ro:'Responsabil',hu:'Felelős',en:'Responsible'},
    bar_closed:{ro:'Închis',hu:'Lezárva',en:'Closed'},
    bar_rework:{ro:'Rework deschis',hu:'Nyitott rework',en:'Open rework'},
    bar_none:{ro:'—',hu:'—',en:'—'}
  };
  function um(k,lang){var m=UIMSG[k];return m?(m[lang]||m.ro):k;}
  function stateName(st,lang){var m=STATE_NAMES[st];return m?(m[lang]||m.ro):st;}

  function reasonsText(reasons, lang){
    var out=t('wf_blocked_title',lang)+'\n'+t('wf_blocking_list',lang)+'\n';
    arr(reasons).forEach(function(r){ if(r==='wf_future_phase')return; out+='– '+t(r,lang)+';\n'; });
    return out;
  }

  // ---- Böngésző: fázisoldal-őr + állapotsáv ---------------------------
  function pathnamePhase(pathname){
    var map={recepcio:1,evaluare:2,reconstatare:3,tinichigerie:4,vopsitorie:5,control:6,inchidere:7};
    for(var k in map){ if(pathname.indexOf('rpw-'+k)>=0) return map[k]; }
    return null;
  }
  function statusBarHtml(job, phase, lang){
    lang=lang||'ro';
    var st=ph(job,phase).status;
    var pct=completionPercent(job, phase);
    var blocking = st==='done'||st==='skipped' ? [] : canCompletePhase(job,phase).missing;
    var resp = ph(job,phase).completedBy || '—';
    var closed = ph(job,phase).finished || '';
    var rwc = openReworks(job).length;
    var col = st==='done'?'#1E9D55':(st==='blocked'||st==='rework'?'#E11D2E':(st==='skipped'?'#6b7280':'#E9A700'));
    var bl = blocking.length ? blocking.map(function(r){return t(r,lang);}).join('; ') : um('bar_none',lang);
    var h='';
    h+='<div style="display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;font:600 12px system-ui,Segoe UI,Arial;padding:8px 12px;background:#fff;border-bottom:2px solid '+col+'">';
    h+='<span style="color:'+col+';font-weight:800">'+phaseName(phase,lang)+' · '+stateName(st,lang)+'</span>';
    h+='<span>'+um('bar_progress',lang)+': <b>'+pct+'%</b></span>';
    h+='<span style="flex:1;min-width:160px;color:#7a1420">'+um('bar_blocking',lang)+': '+bl+'</span>';
    h+='<span>'+um('bar_responsible',lang)+': '+resp+'</span>';
    if(closed) h+='<span>'+um('bar_closed',lang)+': '+String(closed).slice(0,16).replace('T',' ')+'</span>';
    h+='<span style="color:'+(rwc?'#E11D2E':'#6b7280')+'">'+um('bar_rework',lang)+': <b>'+rwc+'</b></span>';
    h+='</div>';
    return h;
  }

  // Lezárt/kihagyott fázis = csak olvasható (audit): utólag NEM módosítható
  function isPhaseReadOnly(job, phase){
    var st=ph(job,phase).status;
    return st==='done' || st==='skipped';
  }
  // Mutáló gomb-kezelők mintája (ezeket tiltjuk read-only módban; a nav/nyelv/nyomtatás marad)
  var MUT_HANDLERS=/\b(advPh|closeJob|closeR|sendToProd|advance|mkRework|resolveRw|setChk|setChkNote|setDone|setEvalSt|uCl|uJob|uJobFlag|addRow|delRow|setHrs|setName|setNote|setBType|setPType|setVops|toggleAppr|addPh|delPh|delClosePhoto|addDevizFile|uploadActa|delActa|setRcSt|rcResponse|upPiesa|addPiesa|delPiesa|importAudatex|delAudatex|upTermen|trimiteLinkUpload|reactiveaza)\s*\(/;
  function applyReadOnly(lang){
    if(typeof document==='undefined') return;
    var app=document.getElementById('app'); if(!app) return;
    // banner egyszer
    var b=document.getElementById('rpw-ro-banner');
    if(!b){ b=document.createElement('div'); b.id='rpw-ro-banner';
      b.style.cssText='position:sticky;top:0;z-index:70;background:#111;color:#fff;font:800 12px system-ui,Segoe UI,Arial;padding:8px 12px;text-align:center';
      if(document.body) document.body.insertBefore(b, document.body.firstChild);
    }
    b.textContent=t('wf_readonly', lang);
    // mezők zárolása
    app.querySelectorAll('input,textarea,select').forEach(function(el){ try{ el.disabled=true; el.readOnly=true; }catch(e){} });
    // mutáló gombok zárolása (nav/nyomtatás/nyelv marad)
    app.querySelectorAll('button').forEach(function(bt){
      var oc=bt.getAttribute('onclick')||'';
      if(MUT_HANDLERS.test(oc)){ try{ bt.disabled=true; bt.style.opacity='.4'; bt.style.cursor='not-allowed'; }catch(e){} }
    });
  }

  // Egyetlen közös oldal-őr: minden -red fázisoldal ezt hívja.
  // - jövőbeli fázis közvetlen megnyitása → figyelmeztetés + átirányítás (nem megkerülhető render-rel);
  // - goPhase előre-lépés csak engedélyezett fázisra;
  // - fix állapotsáv a lap tetején (status/%/blokkoló/felelős/rework).
  function installPageGuard(opts){
    opts=opts||{};
    if(typeof document==='undefined') return;
    var phase = opts.phase || pathnamePhase((typeof location!=='undefined'?location.pathname:'')||'');
    if(!phase) return;
    var getJob = opts.getJob || function(){ return (typeof window!=='undefined')?window.JOB:null; };
    var lang = opts.lang || function(){ try{return localStorage.getItem('rpw_lang')||'ro';}catch(e){return 'ro';} };
    function L(){ return typeof lang==='function'?lang():lang; }

    // goPhase becsomagolása (előre-lépés gátlása)
    function wrapGoPhase(){
      if(typeof window==='undefined' || typeof window.goPhase!=='function' || window.goPhase.__rpwWrapped) return;
      var orig=window.goPhase;
      var w=function(i){
        var job=getJob();
        var target=(typeof i==='number')?i+1:phase; // SHELL 0-index → fázisszám
        if(job && target>phase){
          migrateJob(job);
          var can=canEnterPhase(job, target);
          if(!can.allowed){ try{alert(reasonsText(can.reasons, L()));}catch(e){} return; }
        }
        return orig.apply(this, arguments);
      };
      w.__rpwWrapped=true; window.goPhase=w;
    }

    var blocked=false;
    function enforce(){
      var job=getJob();
      if(!job) return;
      migrateJob(job);
      wrapGoPhase();
      // állapotsáv kirajzolása/frissítése (a lap render()-jétől függetlenül)
      renderBar(job);
      // Lezárt/kihagyott fázis → csak olvasható (audit-zár), a render után újra alkalmazva
      if(isPhaseReadOnly(job, phase)){ try{ applyReadOnly(L()); }catch(e){} }
      if(blocked) return;
      var can=canEnterPhase(job, phase);
      if(!can.allowed){
        blocked=true;
        try{ alert(reasonsText(can.reasons, L())); }catch(e){}
        var id=job.id||'';
        try{ location.assign('rpw-dosar.html?job='+encodeURIComponent(id)); }catch(e){}
      }
    }
    function renderBar(job){
      if(typeof document==='undefined') return;
      var bar=document.getElementById('rpw-wfbar');
      if(!bar){ bar=document.createElement('div'); bar.id='rpw-wfbar';
        bar.style.cssText='position:sticky;top:0;z-index:60';
        if(document.body) document.body.insertBefore(bar, document.body.firstChild);
      }
      try{ bar.innerHTML=statusBarHtml(job, phase, L()); }catch(e){}
    }

    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ enforce(); });
    else enforce();
    // JOB aszinkron tölthet → periodikus ellenőrzés (max ~12s), majd sáv-frissítés
    var ticks=0, iv=setInterval(function(){ ticks++; enforce(); if(blocked||ticks>60) clearInterval(iv); }, 250);
    // háttér-frissítés a sávhoz
    setInterval(function(){ var j=getJob(); if(j) renderBar(j); }, 3000);
  }

  // ---- Nyilvános API -------------------------------------------------
  var API = {
    PHASES: PHASES,
    PHASE_META: PHASE_META,
    STATES: STATES,
    t: t,
    phaseName: phaseName,
    migrateJob: migrateJob,
    isRealPhoto: isRealPhoto,
    realPhotoCount: realPhotoCount,
    reconstApprovedItems: reconstApprovedItems,
    canAcceptEval: function(job){ return {ok:canAcceptEval(job).length===0, missing:canAcceptEval(job)}; },
    validatePhase: validatePhase,
    canEnterPhase: canEnterPhase,
    canCompletePhase: canCompletePhase,
    completePhase: completePhase,
    skipPhase: skipPhase,
    createRework: createRework,
    resolveRework: resolveRework,
    managerOverride: managerOverride,
    getBlockingReasons: getBlockingReasons,
    getNextPhase: getNextPhase,
    openReworks: openReworks,
    hasOpenRework: hasOpenRework,
    saveConfirmed: saveConfirmed,
    completionPercent: completionPercent,
    phaseStatus: function(job,phase){ return ph(job,phase).status; },
    reasonsText: reasonsText,
    statusBarHtml: statusBarHtml,
    pathnamePhase: pathnamePhase,
    stateName: stateName,
    installPageGuard: installPageGuard,
    currentActivePhase: currentActivePhase,
    hasExecutableWork: hasExecutableWork,
    isRealPerson: isRealPerson,
    hasOverrideGrant: hasOverrideGrant,
    commitCriticalTransition: commitCriticalTransition,
    isPhaseReadOnly: isPhaseReadOnly
  };

  if(typeof module!=='undefined' && module.exports){ module.exports = API; }
  root.RPWWorkflow = API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
