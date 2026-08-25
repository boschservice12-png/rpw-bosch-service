/* ============================================================
   rpw-classify.js — AZ IRATOK BESOROLÁSA (AI-javaslat, EMBERI DÖNTÉS)
   ------------------------------------------------------------
   MI EZ
   A biztosítós dosszié 19 rése ma egyesével töltendő: minden réshez
   külön gombnyomás, külön fájlválasztás. Húsz perc egy dossziéra.

   Ez a réteg egyetlen feltöltéssé teszi: a kolléga kijelöli az összes
   fényképet, a `classify` funkció megnézi mindegyiket, és MEGJAVASOLJA,
   melyik résbe való. A javaslatot EMBER hagyja jóvá.

   AMIT EZ A RÉTEG SOSEM TESZ
   Nem ír a dossziéba. A `plan()` egy JAVASLATLISTÁT ad vissza; a
   feltöltést a hívó oldal indítja, azután, hogy a felhasználó
   megerősítette. Az AI itt ugyanaz, mint a GAP-oknál: **kérdez,
   nem ítél**.

   MIÉRT KELL A KÉZI JÓVÁHAGYÁS
   Két irat egy fényképen ugyanúgy néz ki (a károsult és a vétkes
   személyi igazolványa), és a modell nem tudhatja, melyik kié. Ezt
   a rendszer nem TALÁLGATJA: a szabad rést ajánlja fel, és megjelöli,
   hogy a döntés emberé.

   Node + böngésző kompatibilis. Globál: window.RPWClassify
   ============================================================ */
(function(root){
  'use strict';

  // ── A modell szótára → a dosszié réskulcsai ────────────────────
  // Ami közvetlenül megfeleltethető. Ami NEM, az alább, a személyhez
  // kötött iratoknál dől el (károsult vagy vétkes).
  var DIRECT = {
    constatare_amiabila:  'constatare_amiabila',
    proces_verbal:        'proces_verbal',
    declaratie_dauna:     'declaratie_dauna',
    polita_rca:           'polita_rca',
    imputernicire:        'imputernicire_doc',
    foto_fata:            'foto_fata',
    foto_spate:           'foto_spate',
    foto_stanga:          'foto_stanga',
    foto_dreapta:         'foto_dreapta',
    foto_serie_caroserie: 'foto_serie_caroserie',
    foto_avarii:          'foto_avarii'
  };

  // Személyhez kötött iratok: [károsult rés, vétkes rés]
  // A vétkesnél nincs külön talon-verso és permis-verso — a biztosító
  // sem kéri. Ha a károsulté foglalt, ezeknek nincs hova menniük:
  // a döntés az emberé.
  var PERSON = {
    buletin:      ['pag_buletin',      'vin_buletin'],
    talon_fata:   ['pag_talon_fata',   'vin_talon'],
    talon_verso:  ['pag_talon_verso',  null],
    permis_fata:  ['pag_permis_fata',  'vin_permis'],
    permis_verso: ['pag_permis_verso', null]
  };

  // A régi, szűkebb szótár — hogy egy korábbi válasz se vesszen el.
  var ALIAS = {
    talon:            'talon_fata',
    constatare:       'constatare_amiabila',
    foto_lateral_stg: 'foto_stanga',
    foto_lateral_dr:  'foto_dreapta',
    foto_elem:        'foto_avarii'
  };

  // E fölött tekintjük a javaslatot előválaszthatónak. Alatta a rés
  // ÜRESEN marad a listán: a kolléga választ. A küszöb ugyanaz, amit a
  // funkció prompja is megkövetel a modelltől.
  var THRESHOLD = 0.85;

  function mapType(t){
    t = String(t||'').trim();
    return ALIAS[t] || t;
  }

  // A dosszié egy résében lévő fájlok. A tároló alak megengedő:
  // lehet tömb, egyetlen objektum, vagy hiányzó.
  function filesIn(acte, key){
    if(!acte || !key) return [];
    var a = acte[key];
    if(!a) return [];
    return Array.isArray(a) ? a : [a];
  }

  // A konfigurációból derül ki, melyik rés fogad több fájlt.
  function isMulti(key, docs){
    var D = docs || root.RPW_DAUNA_DOCS || [];
    for(var i=0;i<D.length;i++){
      var g = D[i];
      if(g.multi && (g.items||[]).some(function(it){ return it.key===key })) return true;
      var it2 = (g.items||[]).filter(function(it){ return it.key===key })[0];
      if(it2 && it2.multi) return true;
    }
    return false;
  }

  function isFree(acte, key, docs){
    if(!key) return false;
    if(isMulti(key, docs)) return true;          // gyűjtőrés: mindig fogad
    return filesIn(acte, key).length === 0;
  }

  // A `constatare` csoport `either`: elég az egyik. Ha a testvér már
  // megvan, nem tukmáljuk rá a másikat — de nem is tiltjuk.
  function eitherSibling(key, docs){
    var D = docs || root.RPW_DAUNA_DOCS || [];
    for(var i=0;i<D.length;i++){
      var g = D[i];
      if(!g.either) continue;
      var keys = (g.items||[]).map(function(it){ return it.key });
      if(keys.indexOf(key) < 0) continue;
      return keys.filter(function(k){ return k!==key });
    }
    return [];
  }

  /* ── A JAVASLAT ────────────────────────────────────────────────
     Visszaad: { slot, type, low, reason }
       slot   a javasolt réskulcs, vagy null
       low    igaz, ha a modell bizonytalan → NINCS előválasztás
       reason 'ok' | 'ocupat' | 'ambiguu' | 'necunoscut' | 'nesigur'
     A `reason` a FELÜLETNEK szól: emberi nyelven megmondható, miért
     nincs javaslat. „Nem tudom" helyett „a rés már foglalt".         */
  function suggestSlot(res, acte, opts){
    opts = opts || {};
    var docs = opts.docs || root.RPW_DAUNA_DOCS || [];
    var type = mapType(res && res.type);
    var conf = Number(res && res.confidence);
    if(!(conf >= 0 && conf <= 1)) conf = 0;

    if(!type || type === 'altceva') return { slot:null, type:'altceva', low:true, reason:'necunoscut' };

    var slot = null, ocupat = false;

    if(DIRECT[type]){
      slot = DIRECT[type];
      if(!isFree(acte, slot, docs)){
        // `either` csoport: ha a testvér szabad, oda javasoljuk
        var sib = eitherSibling(slot, docs).filter(function(k){ return isFree(acte, k, docs) })[0];
        if(sib) slot = sib; else ocupat = true;
      }
    } else if(PERSON[type]){
      var pair = PERSON[type];
      if(isFree(acte, pair[0], docs))              slot = pair[0];
      else if(pair[1] && isFree(acte, pair[1], docs)) slot = pair[1];
      else { slot = pair[0]; ocupat = true; }
    } else {
      return { slot:null, type:type, low:true, reason:'necunoscut' };
    }

    if(ocupat) return { slot:null, type:type, low:true, reason:'ocupat', taken:slot };
    if(conf < THRESHOLD) return { slot:slot, type:type, low:true, reason:'nesigur' };
    return { slot:slot, type:type, low:false, reason:'ok' };
  }

  // ── A funkció hívása ──────────────────────────────────────────
  // A tokent a közös fejléc-készítő adja: a `classify` KÖTELEZŐEN
  // hitelesítést vár (P0.7). Token nélkül el sem indulunk.
  function fnHeaders(){
    try{ if(root.RPWAuth && RPWAuth.fnHeaders) return RPWAuth.fnHeaders(); }catch(e){}
    return { 'Content-Type':'application/json' };
  }

  async function classifyImage(dataUrl, opts){
    opts = opts || {};
    var f = opts.fetch || root.fetch;
    if(typeof f !== 'function') return { type:'altceva', confidence:0, label:'', error:'no_fetch' };
    try{
      var r = await f('/.netlify/functions/classify', {
        method:'POST', headers:fnHeaders(),
        body:JSON.stringify({ image:dataUrl })
      });
      if(!r || !r.ok) return { type:'altceva', confidence:0, label:'', error:'http_'+((r&&r.status)||0) };
      var d = await r.json();
      // A szerver már validált; itt csak a saját szótárunkra fordítunk.
      return { type:mapType(d && d.type), confidence:Number(d&&d.confidence)||0,
               label:String((d&&d.label)||'') };
    }catch(e){
      return { type:'altceva', confidence:0, label:'', error:'exception' };
    }
  }

  /* ── A TERV ────────────────────────────────────────────────────
     Bemenet: a besorolási eredmények sorrendben (fájlonként egy).
     Kimenet: fájlonként egy javaslat — ÉS a már kiosztott rések
     figyelembevétele. Enélkül két „talon față" ugyanabba a résbe
     mutatna, és a második csendben felülírná az elsőt.               */
  function plan(results, acte, opts){
    opts = opts || {};
    var docs = opts.docs || root.RPW_DAUNA_DOCS || [];
    // A meglévő állapot MÁSOLATA — az eredetihez nem nyúlunk.
    var foglalt = {};
    Object.keys(acte||{}).forEach(function(k){ foglalt[k] = filesIn(acte, k).slice(); });

    return (results||[]).map(function(res, i){
      var s = suggestSlot(res, foglalt, { docs:docs });
      if(s.slot && !s.low){
        // a javasolt rés mostantól foglalt a KÖVETKEZŐ fájl szemében
        if(!foglalt[s.slot]) foglalt[s.slot] = [];
        foglalt[s.slot].push({ __planned:true });
      }
      return { index:i, slot:s.slot, type:s.type, low:s.low, reason:s.reason,
               taken:s.taken||null, confidence:Number(res&&res.confidence)||0,
               label:String((res&&res.label)||'') };
    });
  }

  // A felület számára: minden rés, csoportosítva — a legördülőhöz.
  function slotOptions(docs){
    var D = docs || root.RPW_DAUNA_DOCS || [];
    var out = [];
    D.forEach(function(g){
      (g.items||[]).forEach(function(it){
        out.push({ key:it.key, label:it.label, group:g.label, multi:!!(it.multi||g.multi) });
      });
    });
    return out;
  }

  var api = { mapType:mapType, suggestSlot:suggestSlot, plan:plan,
              classifyImage:classifyImage, slotOptions:slotOptions,
              isFree:isFree, isMulti:isMulti, filesIn:filesIn,
              THRESHOLD:THRESHOLD, DIRECT:DIRECT, PERSON:PERSON, ALIAS:ALIAS };

  if(typeof module!=='undefined' && module.exports) module.exports = api;
  root.RPWClassify = api;

})(typeof window!=='undefined' ? window : globalThis);
