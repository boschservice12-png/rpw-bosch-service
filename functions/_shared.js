// RPW Netlify functions — közös keményítő helper (PHASE 2)
// CORS-allowlist, méret/typus-validáció, biztonságos hiba, e-mail/melléklet ellenőrzés,
// magic-byte média-detektálás, best-effort rate-limit, opcionális JWT-auth hook.

const DEFAULT_ORIGINS = [
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
var CLASSIFY_TYPES = ['talon','buletin','constatare','foto_fata','foto_spate','foto_lateral_stg','foto_lateral_dr','foto_elem','altceva'];
function validateClassify(obj){
  if(!obj || typeof obj!=='object') return { type:'altceva', confidence:0, label:'invalid' };
  var type = CLASSIFY_TYPES.indexOf(obj.type)>=0 ? obj.type : 'altceva';
  var c = Number(obj.confidence); if(!(c>=0 && c<=1)) c=0;
  var label = typeof obj.label==='string' ? obj.label.slice(0,120) : '';
  return { type, confidence:c, label };
}
// VIN/CNP mezők jelölése emberi megerősítésre (nem léptet fázist AI alapján)
function flagUncertain(fields){
  var out = {}; fields = fields||{};
  if(fields.vin){ out.vin = { value:fields.vin, ok:/^[A-HJ-NPR-Z0-9]{17}$/.test(String(fields.vin).toUpperCase()) }; }
  if(fields.cnp){ out.cnp = { value:fields.cnp, ok:/^\d{13}$/.test(String(fields.cnp)) }; }
  return out;
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

// Opcionális JWT-auth (PHASE 3 kapcsolja be a REQUIRE_FN_AUTH env-vel).
// Alapból KI van kapcsolva, hogy a jelenlegi kliens ne törjön. Ha be van kapcsolva,
// a Supabase auth tokent várja Authorization: Bearer fejlécben.
async function requireAuth(event){
  if(!process.env.REQUIRE_FN_AUTH) return { ok:true, skipped:true };
  var h = (event.headers && (event.headers.authorization||event.headers.Authorization)) || '';
  var token = h.replace(/^Bearer\s+/i,'').trim();
  if(!token) return { ok:false, code:401, error:'Autentificare necesară' };
  try{
    var url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
    var r = await fetch(url + '/auth/v1/user', { headers:{ 'apikey':key, 'Authorization':'Bearer '+token } });
    if(!r.ok) return { ok:false, code:401, error:'Token invalid' };
    var u = await r.json();
    return { ok:true, user:u };
  }catch(e){ return { ok:false, code:401, error:'Auth eșuat' }; }
}

module.exports = { corsHeaders, resp, tooLarge, validEmail, safeAttachment, detectMedia, validateClassify, flagUncertain, rateLimited, requireAuth, allowedOrigins, ALLOWED_EXT, CLASSIFY_TYPES };
