// RedAssistance — classify (Anthropic) — KEMÉNYÍTETT (PHASE 2)
// Változás: CORS-allowlist, méret-korlát, rate-limit, opcionális auth,
// magic-byte média-detektálás (nem mindig JPEG), ismeretlen formátum elutasítva,
// szigorú kimenet-validáció, biztonságos hiba (nincs upstream-szivárgás).
const H = require('./_shared.js');
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
// A Sonnet 5-on a gondolkodas alapbol bekapcsol, ha nincs `thinking` mezo.
// Itt a max_tokens 200 — a gondolkodas ezt egymaga felenne, es ures valasz
// jonne. Egy iratfajta felismerese nem igenyel gondolkodast: disabled.
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 200;
const MAX_BODY = 8 * 1024 * 1024;

const CLASSIFY_PROMPT = `Analizeaza aceasta imagine dintr-un dosar de dauna auto (service auto din Romania).
Returneaza DOAR JSON valid, fara alt text:
{ "type": "<tip>", "confidence": 0.0-1.0, "label": "descriere scurta in romana" }

Tipurile permise si ce inseamna:
  constatare_amiabila  - constatare amiabila de accident / constatare asigurator / deviz
  proces_verbal        - proces verbal de politie
  buletin              - carte de identitate (CI) a unei persoane
  talon_fata           - certificat de inmatriculare (talon), FATA
  talon_verso          - certificat de inmatriculare (talon), VERSO
  permis_fata          - permis de conducere, FATA
  permis_verso         - permis de conducere, VERSO
  declaratie_dauna     - declaratie de dauna completata
  polita_rca           - polita de asigurare RCA sau CASCO
  imputernicire        - imputernicire (firma / leasing)
  foto_fata            - fotografie a masinii din FATA
  foto_spate           - fotografie a masinii din SPATE
  foto_stanga          - fotografie a masinii din LATERAL STANGA
  foto_dreapta         - fotografie a masinii din LATERAL DREAPTA
  foto_serie_caroserie - fotografie a seriei de caroserie (VIN) stantate sau de pe eticheta
  foto_avarii          - prim-plan cu zona avariata (indoitura, zgarietura, element rupt)
  altceva              - orice altceva, sau daca nu esti sigur ce document este

REGULI:
- NU decide daca actul apartine pagubitului sau vinovatului. Nu poti sti. Alege doar TIPUL.
- fata/verso: fata are fotografia si numele; verso are rubricile si stampilele.
- confidence > 0.85 doar daca esti sigur. Daca eziti intre doua tipuri, pune confidence sub 0.85.
- Daca imaginea e neclara, taiata sau nu recunosti documentul: "altceva".
- DOAR JSON.`;

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
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: media.media, data: cleanImage } },
          { type: 'text', text: CLASSIFY_PROMPT }
        ] }]
      })
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); console.error('Anthropic classify error', res.status, t); return H.resp(event, 502, { error: 'AI indisponibil' }); }
    const data = await res.json();
    const _blocks = Array.isArray(data.content) ? data.content : [];
    const _first  = _blocks.find(function (b) { return b && b.type === 'text'; });
    const textContent = (_first && _first.text) || '';
    let parsed;
    try { const m = textContent.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; } catch (e) { parsed = {}; }
    return H.resp(event, 200, H.validateClassify(parsed));   // szigorú séma-validáció
  } catch (err) {
    console.error('classify exception', err);
    return H.resp(event, 500, { error: 'Eroare internă' });
  }
};
