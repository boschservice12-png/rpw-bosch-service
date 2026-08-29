/* BUILD: P0.7-FN-AUTH-MANDATORY 2026-08-23 */
// RPW Netlify functions — közös keményítő helper (PHASE 2)
// CORS-allowlist, méret/typus-validáció, biztonságos hiba, e-mail/melléklet ellenőrzés,
// magic-byte média-detektálás, best-effort rate-limit, opcionális JWT-auth hook.

// ── 2026-08-29 — KET ELO OLDAL VAN, MINDKETTOT ISMERNI KELL ─────
// A csapatban ket Netlify-oldal all ugyanerre a repora:
//   beamish-arithmetic-e52bce  (regi cim, a config is ezt hirdeti)
//   rpw-bosch-service          (ide epul ma a main)
// A lista eddig CSAK a regit ismerte, ezert az uj cimen az OCR, a
// classify es a levelkuldes CORS-hibaval elhalt volna — nemán, mert a
// bongeszo blokkolja, nem a szerver. Amig el nem dol, melyik marad,
// mindketto rajta van. (Az ALLOWED_ORIGINS kornyezeti valtozo felulirja.)
const DEFAULT_ORIGINS = [
  // ELSO = az ELO cim. Ismeretlen origin eseten ezt tukrozzuk vissza,
  // amitol a bongeszo blokkol — tehat a sorrend nem kozombos.
  'https://rpw-bosch-service.netlify.app',
  'https://main--rpw-bosch-service.netlify.app',
  // ATMENETI: a regi cim, amig le nem all. Ne ragadjon be senki, aki
  // meg a regi konyvjelzot nyitja meg. Ha a regi oldal megszunt, torolheto.
  'https://beamish-arithmetic-e52bce.netlify.app',
  'https://main--beamish-arithmetic-e52bce.netlify.app'
];
function allowedOrigins(){
  var env = (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  return env.length ? env : DEFAULT_ORIGINS;
}
// CORS: az Origin-t visszatükrözi, ha allowlistán van; különben az első engedélyezettet (böngésző blokkol).
function corsHeaders(event){
  var origin = (event && event.headers && (event.headers.origin||event.headers.Origin)) || '';
  var allow = allowedOrigins();
  var use = allow.indexOf(origin) >= 0 ? origin : allow[0];
  return {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin': use,
    'Vary':'Origin',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, Authorization, x-rpw-key',
    'Access-Control-Max-Age':'86400'
  };
}
function resp(event, statusCode, body){ return { statusCode, headers: corsHeaders(event), body: JSON.stringify(body) }; }

// Body-méret korlát (byte). Netlify base64 body-t is átenged; a hossz jó közelítés.
function tooLarge(event, maxBytes){
  var len = event && event.body ? Buffer.byteLength(event.body,'utf8') : 0;
  return len > maxBytes;
}

// E-mail validáció (egyszerű, de szigorú)
var EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
function validEmail(e){ return typeof e==='string' && EMAIL_RE.test(e.trim()); }

// Fájlnév-tisztítás melléklethez (path-mentes, biztonságos karakterek, kiterjesztés-allowlist)
var ALLOWED_EXT = { pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png' };
function safeAttachment(a){
  if(!a || !a.filename || !a.content) return null;
  var name = String(a.filename).replace(/[\\/\r\n\0]/g,'').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,120);
  var ext = (name.split('.').pop()||'').toLowerCase();
  if(!ALLOWED_EXT[ext]) return null;                 // csak pdf/jpg/png
  if(typeof a.content!=='string') return null;
  return { filename:name, content:a.content };
}

// Base64 magic-byte → média típus (nem bízunk a bejelentett típusban)
function detectMedia(b64){
  if(typeof b64!=='string') return null;
  var s = b64.replace(/^data:[^;]+;base64,/,'');
  if(s.startsWith('JVBER')) return { kind:'pdf',  media:'application/pdf' };
  if(s.startsWith('iVBOR')) return { kind:'image',media:'image/png' };
  if(s.startsWith('/9j/'))  return { kind:'image',media:'image/jpeg' };
  if(s.startsWith('UklGR')) return { kind:'image',media:'image/webp' };
  if(s.startsWith('R0lGOD')) return { kind:'image',media:'image/gif' };
  return null; // ismeretlen → elutasítjuk
}

// OCR/classify AI-kimenet szigorú validálása (soha nem bízunk vakon az AI-ban)
// A szotar a DOSSZIE RESEIT koveti (RPW_DAUNA_DOCS), nem forditva.
// A regi, szukebb szotar (talon, constatare, foto_lateral_*) tovabbra is
// elfogadott — az ALIAS forditja at. Igy egy regebbi kliens valasza sem vesz el.
var CLASSIFY_TYPES = ['constatare_amiabila','proces_verbal',
  'buletin','talon_fata','talon_verso','permis_fata','permis_verso',
  'declaratie_dauna','polita_rca','imputernicire',
  'foto_fata','foto_spate','foto_stanga','foto_dreapta',
  'foto_serie_caroserie','foto_avarii','altceva'];
var CLASSIFY_ALIAS = { talon:'talon_fata', constatare:'constatare_amiabila',
  foto_lateral_stg:'foto_stanga', foto_lateral_dr:'foto_dreapta', foto_elem:'foto_avarii' };
function validateClassify(obj){
  if(!obj || typeof obj!=='object') return { type:'altceva', confidence:0, label:'invalid' };
  var raw  = CLASSIFY_ALIAS[obj.type] || obj.type;
  var type = CLASSIFY_TYPES.indexOf(raw)>=0 ? raw : 'altceva';
  var c = Number(obj.confidence); if(!(c>=0 && c<=1)) c=0;
  var label = typeof obj.label==='string' ? obj.label.slice(0,120) : '';
  return { type, confidence:c, label };
}
// VIN/CNP mezők jelölése emberi megerősítésre (nem léptet fázist AI alapján)
function flagUncertain(fields){
  var out = {}; fields = fields||{};
  // 13 (2026-08-24) — MINDEN kockázatos mező emberi megerősítést kér.
  // Az `ok:false` azt jelenti: a felületen JELÖLNI kell, és a felhasználónak
  // meg kell erősítenie. Az `ok:true` sem „biztos" — csak formailag helyes.
  if(fields.vin){ out.vin = { value:fields.vin, needsConfirm:true,
    ok:/^[A-HJ-NPR-Z0-9]{17}$/.test(String(fields.vin).toUpperCase()) }; }
  if(fields.cnp){ out.cnp = { value:fields.cnp, needsConfirm:true,
    ok:/^\d{13}$/.test(String(fields.cnp)) }; }
  // rendszám (RO): MS 12 ABC / B 123 ABC
  if(fields.plate||fields.nr){ var pl=String(fields.plate||fields.nr);
    out.plate = { value:pl, needsConfirm:true,
      ok:/^[A-Z]{1,2}\s?\d{2,3}\s?[A-Z]{3}$/i.test(pl.replace(/-/g,' ').trim()) }; }
  // kárszám: sosem tekintjük biztosnak
  if(fields.nrDosar||fields.claim){ var cl=String(fields.nrDosar||fields.claim);
    out.nrDosar = { value:cl, needsConfirm:true, ok:cl.length>=4 }; }
  // pénzügyi összegek: mindig megerősítendők
  ['total','totalFaraTva','manopera','piese','vopsea','suma'].forEach(function(k){
    if(fields[k]!==undefined && fields[k]!==null && fields[k]!==''){
      var v=Number(String(fields[k]).replace(/[^\d.,-]/g,'').replace(',','.'));
      out[k]={ value:fields[k], needsConfirm:true, ok:isFinite(v)&&v>=0 };
    }
  });
  // órák (Audatex)
  ['oreManopera','oreVopsire','oreTinichigerie'].forEach(function(k){
    if(fields[k]!==undefined && fields[k]!==null && fields[k]!==''){
      var v=Number(String(fields[k]).replace(',','.'));
      out[k]={ value:fields[k], needsConfirm:true, ok:isFinite(v)&&v>=0&&v<1000 };
    }
  });
  return out;
}

// ── 13: OCR KIMENET SZIGORÚ SÉMA-ELLENŐRZÉSE ────────────────────
// Az AI szövegmodell — a válasza NEM megbízható szerkezet. Ha nem
// értelmezhető objektum, az NEM sikeres válasz (a hívó 502-t ad).
var OCR_SCHEMA = {
  talon:      ['vin','plate','nr','marca','model','an','proprietar','serie','categorie','masaMax','culoare'],
  buletin:    ['cnp','nume','prenume','serie','numar','adresa','emis','valabil'],
  constatare: ['nrDosar','asigurator','dataConstatare','vinovat','plateVinovat','elemente','observatii','plate','vin'],
  audatex:    ['nrDosar','total','totalFaraTva','manopera','piese','vopsea',
               'oreManopera','oreVopsire','oreTinichigerie','pozitii','moneda']
};
function validateOcr(obj, type){
  if(obj===null || typeof obj!=='object' || Array.isArray(obj)){
    return { ok:false, error:'not_an_object' };
  }
  var allowed = OCR_SCHEMA[type];
  if(!allowed) return { ok:false, error:'unknown_type' };
  var clean={}, extra=[], k;
  for(k in obj){
    if(!Object.prototype.hasOwnProperty.call(obj,k)) continue;
    if(allowed.indexOf(k)>=0){
      var v=obj[k];
      // csak egyszerű értékek és tömbök — beágyazott objektum nem várt
      if(v===null || typeof v==='string' || typeof v==='number' ||
         typeof v==='boolean' || Array.isArray(v)) clean[k]=v;
      else extra.push(k);
    } else extra.push(k);
  }
  // ha EGYETLEN várt mező sincs, az AI nem azt csinálta, amit kértünk
  if(Object.keys(clean).length===0) return { ok:false, error:'no_known_fields' };
  return { ok:true, data:clean, ignored:extra };
}

// Best-effort rate-limit (per-instance memória; cold startnál resetel — NEM globális).
// A valódi rate-limit külső tárolót igényel (PHASE 3+). Ez a durva abúzus ellen jó.
var _buckets = {};
function rateLimited(event, opts){
  opts = opts || {}; var max = opts.max||30, windowMs = opts.windowMs||60000;
  var ip = (event.headers && (event.headers['x-nf-client-connection-ip']||event.headers['client-ip']||event.headers['x-forwarded-for'])) || 'unknown';
  ip = String(ip).split(',')[0].trim();
  var now = Date.now(), b = _buckets[ip];
  if(!b || now - b.start > windowMs){ _buckets[ip] = { start:now, n:1 }; return false; }
  b.n++; return b.n > max;
}

// ── P0.7 (2026-08-23) — KÖTELEZŐ HITELESÍTÉS ─────────────────────
// KÉT hiba volt itt:
//   1) `if(!process.env.REQUIRE_FN_AUTH) return {ok:true}` — a hitelesítés
//      egy be nem állított környezeti változótól függött, tehát MINDEN
//      hívás átment. Token nélkül futott az OCR és a levélküldés.
//   2) Supabase Auth JWT-t ellenőrzött (`/auth/v1/user`), mi viszont SAJÁT
//      munkamenet-tokent használunk (rpw_login → app_session). A kettő nem
//      ugyanaz: a mi tokenünket ez SOHA nem fogadta volna el.
// MOSTANTÓL: a saját rpw_session RPC dönt, és a hitelesítés KÖTELEZŐ.
// A CORS nem jogosultság — az csak azt mondja meg, melyik oldal HÍVHAT.
async function requireAuth(event){
  var h = (event.headers && (event.headers.authorization||event.headers.Authorization)) || '';
  var token = h.replace(/^Bearer\s+/i,'').trim();
  if(!token || token.length < 32) return { ok:false, code:401, error:'Autentificare necesară' };
  var url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if(!url || !key){
    // Hiányzó szerverkonfig: NEM engedünk át. Inkább áll a funkció,
    // mint hogy csendben hitelesítés nélkül fusson.
    return { ok:false, code:500, error:'Configurare server incompletă' };
  }
  try{
    var r = await fetch(url + '/rest/v1/rpc/rpw2_session', {   // önálló személyzet
      method:'POST',
      headers:{ 'apikey':key, 'Authorization':'Bearer '+key, 'Content-Type':'application/json' },
      body: JSON.stringify({ p_token: token })
    });
    if(!r.ok) return { ok:false, code:401, error:'Token invalid' };
    var out = await r.json();
    if(typeof out === 'string'){ try{ out = JSON.parse(out); }catch(e){ out = null; } }
    if(!out || out.ok !== true) return { ok:false, code:401, error:'Sesiune expirată' };
    var emp = out.employee || {};
    if(!emp.shop_id) return { ok:false, code:401, error:'Sesiune invalidă' };
    // A tokent VISSZAADJUK, mert az ownsJob-nak szüksége van rá.
    // KORÁBBAN `auth.__token`-t olvasott, amit SOHA senki nem állított be
    // → a munka-tulajdonjog ellenőrzése csendben mindig elbukott.
    return { ok:true, user:emp, shopId:emp.shop_id, name:emp.name, role:emp.role,
             can:emp.can||null, token:token };
  }catch(e){ return { ok:false, code:401, error:'Auth eșuat' }; }
}

// A hívott munka a hívó szervizéhez tartozik-e? (OCR/classify csak saját munkán)
async function ownsJob(auth, jobId){
  if(!jobId) return true;                      // munkához nem kötött hívás
  var url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if(!url || !key) return false;
  try{
    var r = await fetch(url + '/rest/v1/rpc/rpw_job_get', {
      method:'POST',
      headers:{ 'apikey':key, 'Authorization':'Bearer '+key, 'Content-Type':'application/json' },
      body: JSON.stringify({ p_token: (auth && auth.token) || null, p_id: jobId })
    });
    if(!r.ok) return false;
    var out = await r.json();
    if(typeof out === 'string'){ try{ out = JSON.parse(out); }catch(e){ out = null; } }
    return !!(out && out.ok === true);
  }catch(e){ return false; }
}

module.exports = { corsHeaders, resp, tooLarge, validEmail, safeAttachment, detectMedia, validateClassify, validateOcr, OCR_SCHEMA, flagUncertain, rateLimited, requireAuth, ownsJob, allowedOrigins, ALLOWED_EXT, CLASSIFY_TYPES, CLASSIFY_ALIAS };
