/* ============================================================
   rpw-capabilities.js — KÖZPONTI capability/permission réteg (PHASE B)
   ------------------------------------------------------------
   A kliens ebből dönt gomb-tiltásról/elrejtésről (UX). A BIZTONSÁG
   VÉGSŐ ŐRE a SZERVER (0015 RPC-k: rpw_role_phase_ok + szerep-ellenőrzés).
   Nincs oldalankénti hardcode — MINDEN jogosultság-döntés innen jön.

   Épül: RPWRoles (kanonikus szerep + fázis-mátrix).
   Node + böngésző. Globál: window.RPWCaps
   ============================================================ */
(function(root){
  'use strict';
  function R(){ return root.RPWRoles; }

  // Capability-enum (a mandátum szerint)
  var CAPS=['job.read','job.create','job.edit','job.assign','job.change_deadline',
    'phase.start','phase.complete','phase.skip',
    'rework.create','rework.resolve',
    'control.perform','control.pass','control.nok',
    'hours.request_extra','hours.approve_extra',
    'job.close','override.request','override.approve'];

  // Fázistól FÜGGETLEN capability-k szerepenként (kanonikus szerep).
  var GLOBAL={
    receptie:   ['job.read','job.create','job.edit','hours.request_extra'],
    tinichigiu: ['job.read','hours.request_extra'],
    vopsitor:   ['job.read','hours.request_extra'],
    manager:    ['job.read','job.create','job.edit','job.assign','job.change_deadline',
                 'rework.create','control.perform','control.pass','control.nok',
                 'hours.request_extra','hours.approve_extra','job.close',
                 'override.request','override.approve'],
    admin:      CAPS.slice()   // admin: minden
  };
  // Fázishoz KÖTÖTT capability-k: csak akkor, ha a szerep az adott fázison dolgozhat.
  var PHASE_CAPS=['phase.start','phase.complete','phase.skip','job.edit'];

  function has(list, cap){ return list.indexOf(cap)>=0; }

  // can(role, capability, ctx?) — ctx.phase a fázishoz kötött jogokhoz;
  // ctx.toPhase a rework.resolve-hoz.
  function can(role, cap, ctx){
    ctx=ctx||{};
    var roles=R();
    if(!role || CAPS.indexOf(cap)<0) return false;
    if(roles && roles.isReadOnly && roles.isReadOnly(role)) return false;   // auditor: semmi írás
    var g=GLOBAL[role]||[];
    // admin/manager: a globális lista dönt (széles)
    if(role==='admin') return true;
    // fázishoz kötött jogok: a fázis-mátrix + (a szerep globálisan is bírja VAGY worker az adott fázison)
    if(PHASE_CAPS.indexOf(cap)>=0){
      var ph=ctx.phase;
      var onPhase = roles && ph!=null ? roles.canActOnPhase(role, ph) : false;
      if(cap==='job.edit') return onPhase || has(g,'job.edit');
      return onPhase;   // phase.start/complete/skip: csak ha az adott fázison jogosult
    }
    if(cap==='rework.resolve'){
      var tp=ctx.toPhase;
      return (roles && roles.canResolveRework) ? roles.canResolveRework(role, tp) : false;
    }
    return has(g, cap);
  }

  // Kényelmi lekérdezés: a szerep összes (fázistól független) joga.
  function list(role){ if(role==='admin') return CAPS.slice(); return (GLOBAL[role]||[]).slice(); }

  var API={ CAPS:CAPS, can:can, list:list };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWCaps=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
