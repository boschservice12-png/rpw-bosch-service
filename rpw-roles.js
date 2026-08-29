/* ============================================================
   rpw-roles.js — SZEREP-MÁTRIX (kliens tükör, P0 #2, Sprint 6)
   ------------------------------------------------------------
   A szerver-oldali `_rpw_role_phase_ok` (0011) KLIENS TÜKRE — UX-hoz:
   gombok tiltása/elrejtése, mielőtt a szerver 403-at adna. A tényleges
   kikényszerítés SZERVEROLDALON van (0011/0014 + RLS/0008); ez csak UX.

   Szerepek: admin, manager, receptie, evaluator, tinichigiu, vopsitor,
             control, auditor.
   Mátrix (fő fázis):
     receptie→1 · evaluator→2,3 · tinichigiu→4 · vopsitor→5 · control→6
     inchidere(7): control/manager/admin · manager/admin→minden + override
     auditor→CSAK olvasás · admin→végleges törlés
   Node + böngésző. Globál: window.RPWRoles
   ============================================================ */
(function(root){
  'use strict';

  var ROLES=['admin','manager','receptie','evaluator','tinichigiu','vopsitor','control','auditor'];
  var PHASE_ROLE={ 1:['receptie'], 2:['evaluator'], 3:['evaluator'], 4:['tinichigiu'], 5:['vopsitor'], 6:['control'], 7:['control'] };

  // ── VALÓS employees.role (HU) → RPW kanonikus szerep ──────────────
  // A prod meglévő auth-jában (session_context + employees.role) a szerep
  // magyar munkakör. Ez a leképezés köti össze a workflow-mátrixszal.
  // Ferenc döntése (2026-08-17): Recepció→1 · Műszakvezető→manager(2,3,6,7+override/close)
  //   Karosszéria→4 · Festő→5 · Irodavezető→admin(teljes) · többi→nincs RPW-jog.
  var EMPLOYEE_ROLE_MAP={
    'Recepció':'receptie',
    'Karosszéria':'tinichigiu',
    'Festő':'vopsitor',
    'Műszakvezető':'manager',
    'Irodavezető':'admin',
    // ── 2026-08-29 — Ferenc dontese ──────────────────────────────
    // A szerelok HASZNALJAK a panelt (tajekozodasra: mi a mai dolog, hol
    // tart egy auto), de fazist NEM leptetnek. Az `auditor` pontosan ezt
    // jelenti a rendszerben: belep, mindent lat, semmit nem ir.
    // Enelkul a belepetes kizarta volna oket (11 emberbol 6-ot).
    'Szerelő':'auditor'
    // Gyakorló / Sofőr / RENT A CAR / Egyéb → tovabbra sincs (null)
  };
  function mapEmployeeRole(realRole){
    if(realRole==null) return null;
    return EMPLOYEE_ROLE_MAP[String(realRole)] || null;
  }

  function isRole(r){ return ROLES.indexOf(r)>=0; }
  function isReadOnly(r){ return r==='auditor'; }          // auditor: csak olvasás
  function isManager(r){ return r==='manager'||r==='admin'; }

  // A szerver `_rpw_role_phase_ok` pontos tükre.
  function canActOnPhase(r, phase){
    if(isReadOnly(r)) return false;
    if(isManager(r)) return true;
    var allow=PHASE_ROLE[phase]||[];
    return allow.indexOf(r)>=0;
  }
  // Végleges lezárás (phase 7): control/manager/admin
  function canClose(r){ return r==='control'||isManager(r); }
  // Rework nyitás: control/manager/admin (0014)
  function canCreateRework(r){ return r==='control'||isManager(r); }
  // Rework feloldás: a to_phase-re jogosult VAGY manager/admin
  function canResolveRework(r, toPhase){ return isManager(r) || canActOnPhase(r, toPhase); }
  // Manager override: manager/admin
  function canOverride(r){ return isManager(r); }
  // Végleges (fizikai) törlés: csak admin
  function canPermanentDelete(r){ return r==='admin'; }
  // Bármilyen írás egyáltalán (auditor sosem)
  function canWrite(r){ return isRole(r) && !isReadOnly(r); }

  // Melyik fázisokon dolgozhat a szerep (UX: navigáció)
  function allowedPhases(r){
    if(isReadOnly(r)) return [];
    if(isManager(r)) return [1,2,3,4,5,6,7];
    var out=[]; for(var p=1;p<=7;p++){ if(canActOnPhase(r,p)) out.push(p); } return out;
  }

  var API={ ROLES:ROLES, isRole:isRole, isReadOnly:isReadOnly, isManager:isManager,
            canActOnPhase:canActOnPhase, canClose:canClose, canCreateRework:canCreateRework,
            canResolveRework:canResolveRework, canOverride:canOverride,
            canPermanentDelete:canPermanentDelete, canWrite:canWrite, allowedPhases:allowedPhases,
            mapEmployeeRole:mapEmployeeRole, EMPLOYEE_ROLE_MAP:EMPLOYEE_ROLE_MAP };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWRoles=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
