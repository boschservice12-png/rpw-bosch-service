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

  // ── KÓDREVIEW #10 (2026-08-29) — A HIBA NE „NINCS MUNKA" LEGYEN ──
  // A fázislapok betöltése eddig így végződött:
  //     }catch(e){ if(!JOB) JOB=null }  → render() → „Nu există lucrare"
  // Hálózati hiba, lejárt munkamenet és jogosultság-megtagadás tehát
  // UGYANAZT az üzenetet adta, mint egy tényleg nem létező munka. Az
  // operátor természetes reakciója erre: felveszi újra a dossziét —
  // amitől duplikátum keletkezik, épp az ellenkezője annak, amit a
  // rendszer poka-yoke szabályai máshol védenek.
  //
  // Ez a képernyő MEGKÜLÖNBÖZTET: megmondja, hogy a munka nem tűnt el,
  // csak nem sikerült betölteni, és felkínálja az újrapróbálást.
  var HIBA_SZOVEG = {
    cim:      { ro:'Nu s-a putut încărca',        hu:'Nem sikerült betölteni',      en:'Could not load' },
    magyarazat:{ro:'Lucrarea NU a dispărut. Verifică conexiunea și încearcă din nou. Nu crea dosar nou.',
                hu:'A munka NEM tűnt el. Ellenőrizd a kapcsolatot, és próbáld újra. Ne vegyél fel új dossziét.',
                en:'The job has NOT disappeared. Check your connection and try again. Do not create a new file.' },
    ujra:     { ro:'Încearcă din nou',            hu:'Újra',                        en:'Retry' },
    vissza:   { ro:'Dashboard',                   hu:'Dashboard',                   en:'Dashboard' },
    lejart:   { ro:'Sesiunea a expirat. Autentifică-te din nou.',
                hu:'A munkamenet lejárt. Lépj be újra.',
                en:'Session expired. Please sign in again.' }
  };
  function _sz(k, ln){ var m=HIBA_SZOVEG[k]||{}; return m[ln]||m.ro; }

  // Lejárt munkamenet? Akkor a belépés a teendő, nem az újrapróbálás.
  function _lejart(err){
    var kod=String((err&&(err.code||err.name))||'');
    var uz =String((err&&err.message)||'').toLowerCase();
    return kod==='auth_required' || uz.indexOf('sesiune')>=0 ||
           uz.indexOf('jwt')>=0 || uz.indexOf('expired')>=0;
  }

  function betoltesHibaHtml(err, ln){
    ln = ln || 'ro';
    var lejart=_lejart(err);
    return '<div class="loading" style="text-align:center;padding:24px">' +
      '<div style="font-size:34px;line-height:1">⚠</div>' +
      '<div style="font-weight:700;margin-top:8px">' + esc(_sz('cim',ln)) + '</div>' +
      '<div style="margin-top:8px;max-width:34em;margin-left:auto;margin-right:auto">' +
        esc(lejart ? _sz('lejart',ln) : _sz('magyarazat',ln)) + '</div>' +
      '<div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
        '<button type="button" data-rpw-ujra="1" style="padding:10px 24px;border:none;border-radius:10px;background:#E11D2E;color:#fff;font-weight:700;font-family:inherit;cursor:pointer">' +
          esc(_sz('ujra',ln)) + '</button>' +
        '<button type="button" data-rpw-vissza="1" style="padding:10px 24px;border:1px solid #ccc;border-radius:10px;background:#fff;color:#333;font-weight:700;font-family:inherit;cursor:pointer">' +
          esc(_sz('vissza',ln)) + '</button>' +
      '</div></div>';
  }

  // Kirajzolja a hibaképernyőt az #app-ba, és beköti a két gombot.
  // A gombok NEM inline handlerrel mennek: így szigorú CSP mellett is
  // működnek (lásd a review #18-as pontját).
  function mutasdBetoltesHibat(err, ln){
    if(typeof document==='undefined') return false;
    var app=document.getElementById('app'); if(!app) return false;
    app.innerHTML = betoltesHibaHtml(err, ln);
    var u=app.querySelector('[data-rpw-ujra]');
    if(u) u.addEventListener('click', function(){ try{ location.reload(); }catch(e){} });
    var v=app.querySelector('[data-rpw-vissza]');
    if(v) v.addEventListener('click', function(){ try{ location.assign('index.html'); }catch(e){} });
    return true;
  }

  var API={ uuid:uuid, jobId:jobId, esc:esc, escAttr:escAttr, escUrl:escUrl, safeName:safeName,
            betoltesHibaHtml:betoltesHibaHtml, mutasdBetoltesHibat:mutasdBetoltesHibat };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWUtil=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
