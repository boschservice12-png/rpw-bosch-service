// RedAssistance — sendmail (Resend) — KEMÉNYÍTETT (PHASE 2)
// Változás: CORS-allowlist, méret-korlát, rate-limit, opcionális auth,
// címzett/reply-to validáció, melléklet cap+kiterjesztés+méret, biztonságos hiba (nincs upstream-szivárgás),
// relé-tiltás (auth + cap). A fejléc-injekció tisztítás megmarad.
const H = require('./_shared.js');
const RESEND_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = process.env.SENDMAIL_FROM || 'dosar@redassistance.com';
const MAX_BODY = 12 * 1024 * 1024;   // ~12MB (PDF + fotók base64)
const MAX_RECIPIENTS = 5;
const MAX_ATTACH = 10;
const MAX_ATTACH_TOTAL = 10 * 1024 * 1024;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return H.resp(event, 204, {});
  if (event.httpMethod !== 'POST')    return H.resp(event, 405, { error: 'Method not allowed' });
  if (H.tooLarge(event, MAX_BODY))    return H.resp(event, 413, { error: 'Payload prea mare' });
  if (H.rateLimited(event, { max: 20, windowMs: 60000 })) return H.resp(event, 429, { error: 'Prea multe cereri, reîncearcă' });

  const auth = await H.requireAuth(event);
  if (!auth.ok) return H.resp(event, auth.code || 401, { error: auth.error });

  const key = process.env.RESEND_API_KEY;
  if (!key) return H.resp(event, 500, { error: 'Server neconfigurat' });

  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return H.resp(event, 400, { error: 'Invalid JSON' }); }
  if (!p.to || !p.subject) return H.resp(event, 400, { error: 'to + subject obligatoriu' });

  // Címzettek: valid e-mailek, cap
  var toList = (Array.isArray(p.to) ? p.to : [p.to]).map(x => String(x).trim()).filter(Boolean);
  if (!toList.length || toList.length > MAX_RECIPIENTS) return H.resp(event, 400, { error: 'Număr destinatari invalid (1–' + MAX_RECIPIENTS + ')' });
  if (!toList.every(H.validEmail)) return H.resp(event, 400, { error: 'Adresă destinatar invalidă' });

  var fromName = String(p.from_name || 'RedAssistance').replace(/[<>"\r\n]/g, '').trim() || 'RedAssistance';
  var payload = {
    from: fromName + ' <' + FROM_EMAIL + '>',
    to: toList,
    subject: String(p.subject).replace(/[\r\n]/g, ' ').slice(0, 200)
  };
  if (p.reply_to) { var rt = String(p.reply_to).replace(/[\r\n<>]/g, '').trim(); if (H.validEmail(rt)) payload.reply_to = rt; }
  if (p.html) payload.html = String(p.html);
  if (p.text) payload.text = String(p.text);
  if (!payload.html && !payload.text) payload.text = ' ';

  // Mellékletek: cap, kiterjesztés-allowlist, összméret
  if (Array.isArray(p.attachments) && p.attachments.length) {
    if (p.attachments.length > MAX_ATTACH) return H.resp(event, 400, { error: 'Prea multe atașamente (max ' + MAX_ATTACH + ')' });
    var safe = [], total = 0;
    for (var i = 0; i < p.attachments.length; i++) {
      var a = H.safeAttachment(p.attachments[i]);
      if (!a) return H.resp(event, 400, { error: 'Atașament invalid (doar pdf/jpg/png)' });
      total += Buffer.byteLength(a.content, 'utf8');
      if (total > MAX_ATTACH_TOTAL) return H.resp(event, 413, { error: 'Atașamente prea mari' });
      safe.push(a);
    }
    payload.attachments = safe;
  }

  try {
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('Resend error', r.status, data); return H.resp(event, 502, { error: 'Trimitere eșuată' }); } // nincs detail-szivárgás
    return H.resp(event, 200, { ok: true, id: data.id });
  } catch (e) {
    console.error('sendmail exception', e);
    return H.resp(event, 502, { error: 'Trimitere eșuată' });
  }
};
