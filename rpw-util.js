/* ============================================================
   rpw-util.js — BIZTONSÁGI SEGÉDFÜGGVÉNYEK (ID + XSS-escaping)
   ------------------------------------------------------------
   - uuid(): kriptográfiailag erős azonosító (crypto.randomUUID / getRandomValues).
     NEM használ Date.now()/Math.random gyenge azonosítót.
   - esc()/escAttr()/escUrl(): context-aware escaping a felhasználói és OCR-adatok
     biztonságos DOM-ba illesztéséhez (XSS ellen).
   Node + böngésző kompatibilis. Globál: window.RPWUtil
   ============================================================ */
(function(root){
  'use strict';
  var _c = (typeof crypto!=='undefined') ? crypto : (typeof require==='function' ? (function(){try{return require('crypto').webcrypto||require('crypto');}catch(e){return null;}})() : null);

  function uuid(){
    if(_c && typeof _c.randomUUID==='function') return _c.randomUUID();
    // fallback: RFC4122 v4 getRandomValues-ből
    if(_c && typeof _c.getRandomValues==='function'){
      var b=new Uint8Array(16); _c.getRandomValues(b);
      b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80;
      var h=[]; for(var i=0;i<16;i++) h.push((b[i]+0x100).toString(16).slice(1));
      return h[0]+h[1]+h[2]+h[3]+'-'+h[4]+h[5]+'-'+h[6]+h[7]+'-'+h[8]+h[9]+'-'+h[10]+h[11]+h[12]+h[13]+h[14]+h[15];
    }
    throw new Error('no CSPRNG available'); // szándékosan NEM esünk vissza Math.random-ra
  }
  // Dosszié-azonosító: stabil prefix + uuid (ütközésbiztos, kitalálhatatlan)
  function jobId(){ return 'RPW-'+uuid(); }

  var HTML={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'};
  function esc(s){ return String(s==null?'':s).replace(/[&<>"'`]/g, function(c){return HTML[c];}); }
  // Attribútum-kontextus (idézőjelek közé): ugyanaz + backtick
  function escAttr(s){ return esc(s); }
  // URL/href/src: csak biztonságos sémák; minden más → '#'
  function escUrl(s){
    var v=String(s==null?'':s).trim();
    if(/^(https?:|blob:)/i.test(v)) return v.replace(/"/g,'%22').replace(/'/g,'%27');
    if(/^data:image\//i.test(v)) return v;         // csak kép data-URL engedett
    if(/^[\w./-]+$/.test(v)) return v;             // storage path (nincs séma)
    return '#';
  }
  // Fájlnév: veszélyes karakterek eltávolítása (megjelenítéshez + tároláshoz)
  function safeName(s){ return String(s==null?'':s).replace(/\.\.+/g,'_').replace(/[\/\<>:"'`|?* -]+/g,'_').slice(0,180); }

  var API={ uuid:uuid, jobId:jobId, esc:esc, escAttr:escAttr, escUrl:escUrl, safeName:safeName };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWUtil=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
