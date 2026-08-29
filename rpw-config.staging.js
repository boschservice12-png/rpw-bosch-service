/* ════════════════════════════════════════════════════════════════
   rpw-config.STAGING.js — BIZTONSÁGOS KONFIGURÁCIÓ

   ⚠ EZ A FÁJL NEM AKTÍV. Használatba vételhez:
        cp rpw-config.staging.js rpw-config.js

   ELŐFELTÉTELEK — mind a négynek teljesülnie kell, különben az
   alkalmazás a production-őr miatt EL SEM INDUL (ez szándékos):

     1. _migrations/001_rls_lockdown.sql      lefuttatva
     2. _migrations/002_server_transitions.sql lefuttatva
     3. a fotó-bucket privát                   (STORAGE_PRIVATE)
     4. MINDEN aktív dolgozónak van PIN-je     ← EMBERI DÖNTÉS

   A 4. pont ma NEM teljesül: 11 aktív dolgozóból 1 tud belépni.
   Amíg nincs mindenkinek PIN-je, ez a konfiguráció kizárja a csapatot.

   Visszaállás: cp rpw-config.js.bak rpw-config.js  (majd a rollback SQL-ek)
   ════════════════════════════════════════════════════════════════ */
// RedAssistance Paint Workflow — KÖZPONTI KONFIG (egyetlen igazságforrás)
// DB / kulcs / bucket váltás KIZÁRÓLAG ITT. Minden oldal ezt tölti be.
// v1.0 — Fázis 1 (2026-07)
window.RPW_CFG = {
  SB_URL: 'https://pxypbbvqinbwesfikkdb.supabase.co',
  SB_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4eXBiYnZxaW5id2VzZmlra2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMjMwNzIsImV4cCI6MjA4NjU5OTA3Mn0.WZBdbr-YBxLq1ALnHY2weFQ7j2JhUUj6hOUGkuuErnQ',
  BUCKET: 'rpw-photos',
  // ── ERP-alapú hitelesítés (a MEGLÉVŐ RED ERP auth) ──────────────
  // Az RPW NEM tart fenn külön user/PIN/session rendszert. A dolgozó a
  // vállalati identitásával lép be: employee_login(SHOP_ID, PIN) → token,
  // amelyet a session_context(token) validál minden secure RPC-ben.
  // SHOP_ID: a szerviz azonosítója (RedAssistance). Központi konfig — NEM
  // oldalanként hardcode-olva. Felderítve 2026-08-18: minden RPW-dolgozó ide tartozik.
  SHOP_ID: 'bc39e3c1-696c-4590-a9ed-d3810df1c02d',
  // Hitelesítés-kényszer. ALAPBÓL KI (false) → semmi nem változik.
  // true-ra állítás CSAK a 0015 alkalmazása + a login-lánc staging-igazolása UTÁN.
  AUTH_REQUIRED: true,
  // Privát Storage kapcsoló (P0 #11). ALAPBÓL KI (false) → a fotó-URL réteg
  // szükség esetén publikus URL-re esik vissza (a bucket ma publikus).
  // true-ra állítás CSAK a 0009_storage_private_signed.FILE_ONLY.sql alkalmazása UTÁN:
  // ekkor NINCS publikus-URL fallback, csak időkorlátos aláírt URL.
  // P0.6 (2026-08-23): a bucket PRIVÁT. Minden fájlelérés időkorlátos
  // aláírt URL-lel megy; publikus fallback NINCS.
  STORAGE_PRIVATE: true,
  // A slice-patch RPC neve (Sprint 1). ALAP: rpw_patch_v2 (0006, alkalmazott).
  // A valódi verzió-zárhoz: 0013 (rpw_patch_v3) alkalmazása UTÁN → 'rpw_patch_v3'.
  PATCH_RPC: 'rpw_patch_v3',
  // Szerver-oldali fázisátmenetek (Sprint 5). ALAPBÓL KI (false) → a kliens
  // rpw-workflow.js commit útja fut. true-ra állítás CSAK a 0011+0014 alkalmazása
  // + AUTH_REQUIRED=true UTÁN: ekkor a kritikus átmenetek szerver-RPC-n mennek.
  SERVER_TRANSITIONS: true,
  // PRODUCTION-zár (rpw-guard.js). Az operátor állítja true-ra az ÉLESÍTÉS BEFEJEZÉSE UTÁN.
  // Ha true, a fenti négy security flag KÖTELEZŐEN a biztonságos értéken kell legyen,
  // különben az RPW NEM indul (PRODUCTION CONFIGURATION INVALID) — nincs silent insecure mód.
  PRODUCTION: true
};

// ── v1.1 — file://-őr (adatvédelem) ─────────────────────────────
// Ha az oldal LETÖLTÖTT MÁSOLATBÓL fut (file://), NEM engedünk DB-írást:
// semlegesítjük a configot (nincs Supabase-kliens) és figyelmeztetünk.
// ÉLŐ https:// oldalon EZ A BLOKK NEM FUT LE (azonnal visszatér).
(function(){
  if (location.protocol !== 'file:') return;   // <-- élő oldalon nincs hatása
  window.RPW_CFG = null;                        // nincs DB-kliens -> nincs írás
  function show(){
    if(!document.body){document.addEventListener('DOMContentLoaded',show);return;}
    document.body.innerHTML =
      '<div style="position:fixed;inset:0;background:#FAF8F5;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:system-ui,Segoe UI,Arial,sans-serif;z-index:2147483647">'
      + '<div style="max-width:440px">'
      + '<div style="font-size:44px">&#9888;&#65039;</div>'
      + '<div style="font-size:19px;font-weight:800;color:#C81E33;margin:12px 0 6px">Copie descarcata local</div>'
      + '<div style="font-size:14px;color:#3F4956;line-height:1.6">Rulezi o copie VECHE descarcata pe calculator (file://).<br>De aici NU se scrie nimic in baza de date.<br>Deschide sistemul LIVE:</div>'
      + '<a href="https://rpw-bosch-service.netlify.app/" style="display:inline-block;margin-top:16px;background:#E11D2E;color:#fff;text-decoration:none;padding:13px 22px;border-radius:9px;font-weight:800;font-size:14px">Deschide site-ul live &rarr;</a>'
      + '</div></div>';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
})();

// ── DOSAR DE DAUNĂ — kötelező akták/fotók (EGYETLEN IGAZSÁGFORRÁS) ──
// Biztosítós (asig) dosszié megnyitásához szükséges dokumentumok és fotók.
// Minden oldal (dosar + ügyfél-feltöltő) ebből építkezik.
// group.either:true  -> a csoport TELJES, ha BÁRMELYIK eleme feltöltve (constatare VAGY PV)
// item/group.multi:true -> több fájl is tölthető ugyanabba a résbe (avarii)
window.RPW_DAUNA_DOCS = [
  { key:'constatare', req:['deschid','deschis'], label:'Constatare / Proces verbal', either:true, items:[
    { key:'constatare_amiabila', label:'Constatare amiabilă' },
    { key:'proces_verbal',       label:'Proces verbal poliție' }
  ]},
  { key:'pagubit', req:['deschid'], label:'Acte păgubit', items:[
    { key:'pag_buletin',     label:'Buletin' },
    { key:'pag_talon_fata',  label:'Talon față' },
    { key:'pag_talon_verso', label:'Talon verso' },
    { key:'pag_permis_fata', label:'Permis față' },
    { key:'pag_permis_verso',label:'Permis verso' }
  ]},
  { key:'declaratie', req:['deschid'], label:'Declarație daună', items:[
    { key:'declaratie_dauna', label:'Declarație daună' }
  ]},
  { key:'polita', req:['deschid'], label:'Poliță asigurare', items:[
    { key:'polita_rca', label:'Poliță RCA / CASCO' }
  ]},
  { key:'imputernicire', label:'Împuternicire', optional:true, items:[
    { key:'imputernicire_doc', label:'Împuternicire (firmă / leasing)' }
  ]},
  { key:'vinovat', req:['deschid'], label:'Acte vinovat', items:[
    { key:'vin_buletin', label:'Buletin' },
    { key:'vin_talon',   label:'Talon' },
    { key:'vin_permis',  label:'Permis' }
  ]},
  { key:'foto_auto', req:['deschid','deschis'], label:'Foto auto (4 poziții)', photo:true, items:[
    { key:'foto_fata',    label:'Față' },
    { key:'foto_spate',   label:'Spate' },
    { key:'foto_stanga',  label:'Stânga' },
    { key:'foto_dreapta', label:'Dreapta' }
  ]},
  { key:'foto_serie', req:['deschid','deschis'], label:'Foto serie caroserie', photo:true, items:[
    { key:'foto_serie_caroserie', label:'Serie caroserie (VIN)' }
  ]},
  { key:'foto_avarii', label:'Foto poziții avariate', photo:true, req:['deschid','deschis'], multi:true, items:[
    { key:'foto_avarii', label:'Poziții avariate', multi:true }
  ]}
];

// ── BUILD-BÉLYEG (azonosításhoz) ──
window.RPW_BUILD = 'RPW · 2026-08-22 · DOSAR-GATE-L1F';
try{ console.log('%cRPW build: '+window.RPW_BUILD, 'background:#E11D2E;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700'); }catch(e){}
