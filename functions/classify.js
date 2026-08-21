// RedAssistance — classify (Anthropic) — KEMÉNYÍTETT (PHASE 2)
// Változás: CORS-allowlist, méret-korlát, rate-limit, opcionális auth,
// magic-byte média-detektálás (nem mindig JPEG), ismeretlen formátum elutasítva,
// szigorú kimenet-validáció, biztonságos hiba (nincs upstream-szivárgás).
const H = require('./_shared.js');
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 200;
const MAX_BODY = 8 * 1024 * 1024;

const CLASSIFY_PROMPT = `Analizeaza aceasta imagine dintr-un service auto. Returneaza DOAR JSON valid:
{ "type": "talon"|"buletin"|"constatare"|"foto_fata"|"foto_spate"|"foto_lateral_stg"|"foto_lateral_dr"|"foto_elem"|"altceva", "confidence": 0.0-1.0, "label": "descriere scurta in romana" }
- talon=certificat inmatriculare; buletin=CI; constatare=constatare/deviz asigurator; foto_*=fotografii auto; altceva=orice altceva.
- confidence>0.85 doar daca esti sigur. DOAR JSON.`;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return H.resp(event, 204, {});
  if (event.httpMethod !== 'POST')    return H.resp(event, 405, { error: 'POST only' });
  if (H.tooLarge(event, MAX_BODY))    return H.resp(event, 413, { error: 'Imagine prea mare' });
  if (H.rateLimited(event, { max: 40, windowMs: 60000 })) return H.resp(event, 429, { error: 'Prea multe cereri' });

  const auth = await H.requireAuth(event);
  if (!auth.ok) return H.resp(event, auth.code || 401, { error: auth.error });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return H.resp(event, 500, { error: 'Server neconfigurat' });

  let image;
  try { image = JSON.parse(event.body || '{}').image; } catch (e) { return H.resp(event, 400, { error: 'Invalid JSON' }); }
  if (!image || typeof image !== 'string') return H.resp(event, 400, { error: 'Missing image' });

  const media = H.detectMedia(image);
  if (!media || media.kind !== 'image') return H.resp(event, 400, { error: 'Format imagine nesuportat (doar jpg/png/webp/gif)' });
  const cleanImage = image.replace(/^data:[^;]+;base64,/, '');

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: media.media, data: cleanImage } },
          { type: 'text', text: CLASSIFY_PROMPT }
        ] }]
      })
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); console.error('Anthropic classify error', res.status, t); return H.resp(event, 502, { error: 'AI indisponibil' }); }
    const data = await res.json();
    const textContent = (data.content && data.content[0] && data.content[0].text) || '';
    let parsed;
    try { const m = textContent.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; } catch (e) { parsed = {}; }
    return H.resp(event, 200, H.validateClassify(parsed));   // szigorú séma-validáció
  } catch (err) {
    console.error('classify exception', err);
    return H.resp(event, 500, { error: 'Eroare internă' });
  }
};
