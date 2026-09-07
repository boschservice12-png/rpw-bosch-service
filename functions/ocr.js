// RedAssistance Paint Workflow — Netlify Function: OCR proxy
// Hivja az Anthropic Claude API-t kepfelismeres celjabol.
// Input:  { image: base64_nyers (jpg/png), type: 'talon' | 'constatare' | 'buletin' }
// Output: { result: "JSON string" }
//
// Biztonsag:
//   - API kulcs csak szerver oldalon (Netlify env: ANTHROPIC_API_KEY)
//   - Kliens soha nem fer hozza
//   - CORS: barmilyen origin elfogadva (public endpoint)
//
// Model: claude-sonnet-5 ($2/$15 -> $2/$10 per M token, olcsobb ES pontosabb,
//        mint a korabbi claude-sonnet-4-5)
// Atlag koltseg: ~$0.002-0.004 / kep
//
// ⚠ MIERT VAN KIKAPCSOLVA A GONDOLKODAS ⚠
//   A Sonnet 5-on a gondolkodas ALAPBOL BEKAPCSOL, ha a keresben nincs
//   `thinking` mezo (a sonnet-4-5-on forditva volt: alapbol ki). Ket okbol
//   nem hagyhatjuk igy:
//     1. A Netlify szinkron fuggvenyre 10 masodperc jut (a netlify.toml nem
//        allit sajatot). A gondolkodas ezt atlepheti, es akkor nem hibas
//        valasz jon, hanem SEMMILYEN.
//     2. A gondolkodas tokenjei a max_tokens-bol mennek. 1500-nal a JSON
//        elmaradna, es a lenti ellenorzes 502-t adna vissza.
//   Egy talon leolvasasa nem igenyel gondolkodast, ezert: disabled.
//   Ha valaha bekapcsolod, a max_tokens-t is emeld, es szamolj a 10 mp-cel.

const H = require('./_shared.js');
let _evt = null;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1500;

// ───────────────────────────────────────────────────────────────
// PROMPTOK TIPUS SZERINT
// ───────────────────────────────────────────────────────────────

const PROMPTS = {
  talon: `Analizeaza acest talon auto romanesc (Certificat de inmatriculare).
Returneaza DOAR JSON valid, fara explicatii:
{
  "plate": "numarul de inmatriculare exact din campul A (ex: MS-50-BSS) sau null",
  "vin": "VIN din campul E, EXACT 17 caractere alfanumerice (doar litere mari si cifre, FARA O/I/Q) sau null",
  "brand": "marca din campul D.1 (ex: DACIA, FIAT, VW, BMW) sau null",
  "model": "model din campul D.3 (ex: LOGAN, ADRIATIK, GOLF) sau null",
  "year": "anul de prima inmatriculare din campul B, DOAR cele 4 cifre ale anului (ex: din 21.05.2009 extragi 2009) sau null",
  "capacitate": "capacitate cilindrica din campul P.1, doar numar cm3 (ex: 2287, 1598) sau null",
  "owner": "proprietarul din campul C.2.1 (numele complet: persoana sau firma ex: SZKALICZKI SERVICE S.R.L., POPESCU IOAN) sau null"
}

REGULI CRITICE:
1. VIN: EXACT 17 caractere. Daca citesti mai multe sau mai putine, ai gresit - reverifica. Nu contine litere O, I, Q.
2. YEAR: NU folosi anul din campul K (e1*2001/116*0386*03 este COD DE OMOLOGARE, nu an). Foloseste DOAR campul B care contine data de prima inmatriculare.
3. OWNER: Folosi DOAR campul C.2.1 (numele firmei sau persoanei). NU confunda cu campul C.2.3 (adresa - strada, localitate).
4. Daca un camp nu este clar citibil, pune null (nu ghici).`,

  buletin: `Buletin de identitate romanesc (CI).
Extrage si returneaza DOAR JSON:
{
  "name": "numele complet sau null",
  "address": "adresa completa (oras, judet, strada) sau null",
  "cnp": "CNP 13 cifre sau null"
}
Doar JSON.`,

  constatare: `Analizeaza acest document romanesc: Constatare amiabila, Proces verbal de dauna, sau Deviz de la asigurator.
Extrage toate informatiile relevante.

Returneaza DOAR JSON in acest format exact:
{
  "nrDosar": "numar dosar sau null",
  "proprietar": "numele proprietarului/pagubitului sau null",
  "asigurator": "numele asiguratorului (ALLIANZ, GROUPAMA, OMNIASIG, EUROINS, ASIROM, GENERALI, CITY INSURANCE, etc) sau null",
  "daune": [
    {
      "element": "numele piesei exact cum apare (ex: bara fata, aripa dreapta fata, far dreapta, parbriz)",
      "actiune": "inlocuire sau reparatie sau vopsire sau revopsire sau null",
      "ore": numar_sau_null
    }
  ]
}

REGULI pentru "actiune":
- "inlocuire" = inlocuire, schimbare, schimb, nou (piesa noua)
- "reparatie" = reparatie, reparatii, reparat, indreptare (se repara piesa existenta)
- "vopsire" = vopsire, vopsit (se vopseste piesa inlocuita/reparata sau extern)
- "revopsire" = revopsire, revopsit
- daca nu e clar, pune null

REGULI pentru "ore":
- DOAR pentru actiune="reparatie" se completeaza orele normate (ex: 1.5, 3.0)
- Pentru inlocuire / vopsire / revopsire pune null
- Daca nu apare numarul de ore langa piesa, pune null

REGULI pentru "element":
- Pastreaza exact denumirea din document in romana
- Include TOATE piesele mentionate (caroserie: bara, aripa, usa, capota, portbagaj, plafon, prag, stalp, oglinda; si non-caroserie: far, lampa, parbriz, luneta, geam, amortizor, airbag, roata, janta, etc)

Doar JSON, fara explicatii.`,

  audatex: `Analizeaza acest deviz / calculatie Audatex (AudaPad) pentru reparatie auto.
Extrage DOAR orele totale de manopera pe categorii si sumele. Returneaza DOAR JSON valid:
{
  "nr_dosar": "numarul dosarului (ex: GO10124) sau null",
  "ore_tinichigerie": numar_zecimal_sau_null,
  "ore_vopsitorie": numar_zecimal_sau_null,
  "pret_ora": numar_sau_null,
  "total_manopera_ron": numar_sau_null,
  "total_vopsitorie_ron": numar_sau_null,
  "total_piese_ron": numar_sau_null,
  "total_cu_tva": numar_sau_null
}

REGULI:
1. ore_tinichigerie = suma orelor de manopera (caroserie/mecanica) din sectiunea 'CALCULATIE FINALA': aduna 'TOTAL CL 1 ... ORE' + 'TOTAL CL 2 ... ORE' + 'TOTAL CL 3 ... ORE' (ex: 4.5+0.6+1.1 = 6.2). Daca nu gasesti liniile CL, calculeaza: total_manopera_ron / pret_ora.
2. ore_vopsitorie = numarul de la linia 'TOTAL VOPSITORIE 1 ORA : X.X ORE' (ex: 5.0). ATENTIE: NU lua '10UL/ORE' (acela e alt numar, ex 50.0). Daca nu gasesti, calculeaza: cost_manopera_vopsitorie / pret_ora.
3. total_manopera_ron = 'TOTAL MANOPERA' in RON (ex: 744.00).
4. total_vopsitorie_ron = 'TOTAL VOPSITORIE' in RON (ex: 1482.79).
5. total_piese_ron = 'TOTAL PIESE' in RON (ex: 8012.44).
6. total_cu_tva = 'COST REPARATIE CU TVA' (ex: 12389.47).
7. Toate numerele cu punct zecimal, FARA separator de mii (scrie 8012.44 nu '8 012.44').
8. Daca un camp nu e gasit, pune null. Nu inventa valori.`
};

// ───────────────────────────────────────────────────────────────
// HTTP HANDLER
// ───────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  _evt = event;
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H.corsHeaders(event), body: '' };
  if (H.tooLarge(event, 8*1024*1024)) return response(413, { error: 'Imagine prea mare' });
  if (H.rateLimited(event, { max: 40, windowMs: 60000 })) return response(429, { error: 'Prea multe cereri' });
  const _auth = await H.requireAuth(event); if (!_auth.ok) return response(_auth.code||401, { error: _auth.error });

  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Method not allowed' });
  }

  // API kulcs ellenorzes
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return response(500, { error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  // Body parse
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return response(400, { error: 'Invalid JSON body' });
  }

  const { image, type } = payload;

  // Validacio
  if (!image || typeof image !== 'string') {
    return response(400, { error: 'Missing "image" (base64 string)' });
  }

  if (!type || !PROMPTS[type]) {
    return response(400, { error: 'Invalid "type". Must be: talon, constatare, buletin, or audatex' });
  }

  // Meretellenorzes (5 MB limit)
  if (image.length > 7_000_000) {
    return response(413, { error: 'Image too large (max ~5MB)' });
  }

  // ── C4 (2026-08-24) — a formátumot ELLENŐRIZZÜK, nem feltételezzük ──
  // KORÁBBAN: `let mediaType = 'image/jpeg'` volt az alapértelmezés, és
  // ismeretlen tartalom is jpeg-ként ment tovább az AI-nak. Most a közös
  // detectMedia dönt, és ismeretlen formátumnál ELUTASÍTUNK.
  const det = H.detectMedia(image);
  if (!det) {
    return response(415, { error: 'Format nerecunoscut. Acceptăm: JPEG, PNG, WebP, GIF, PDF.' });
  }
  const isPdf = det.kind === 'pdf';
  const mediaType = det.media;

  // ────── Hivas az Anthropic API-t ──────
  try {
    const anthropicResp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'disabled' },      // lasd a fejlec magyarazatat
        messages: [
          {
            role: 'user',
            content: [
              (isPdf
                ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } }
                : { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } }),
              { type: 'text', text: PROMPTS[type] }
            ]
          }
        ]
      })
    });

    const data = await anthropicResp.json();

    if (!anthropicResp.ok) {
      console.error('Anthropic API error:', anthropicResp.status, data);
      console.error('Anthropic OCR error', anthropicResp.status, data);
      return response(502, { error: 'AI indisponibil' });
    }

    // Szoveg kinyer. NEM data.content[0]-bol: ha valaha bekapcsol a
    // gondolkodas, az elso blokk egy `thinking` blokk, aminek nincs `.text`
    // mezoje — a regi kod ilyenkor csendben ures szoveget kapott volna.
    const blocks = Array.isArray(data.content) ? data.content : [];
    const first  = blocks.find(function(b){ return b && b.type === 'text'; });
    const text   = (first && first.text) || '';

    // JSON tisztitas (ha Claude markdown kodbloccal adna)
    let cleaned = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();

    // ── 13 (2026-08-24) — HIBÁS AI-VÁLASZ NEM SIKERES VÁLASZ ──────
    // KORÁBBAN: érvénytelen JSON esetén csak `console.warn` futott, és a
    // válasz 200-zal ment vissza „result" néven. A kliens így szemetet
    // kapott sikerként. Most az értelmezhetetlen válasz 502.
    var parsed = null;
    try { parsed = JSON.parse(cleaned); }
    catch (e) {
      console.warn('OCR: az AI nem JSON-t adott:', cleaned.slice(0, 200));
      return response(502, { error: 'Răspuns AI invalid. Încearcă din nou sau introdu manual.',
                             code: 'ai_invalid_json' });
    }

    // Séma-ellenőrzés: ismeretlen mezőket eldobunk, üres eredményt elutasítunk
    var val = H.validateOcr(parsed, type);
    if (!val.ok) {
      console.warn('OCR: séma-hiba', val.error, Object.keys(parsed || {}));
      return response(502, { error: 'Răspuns AI neconform. Verifică documentul sau introdu manual.',
                             code: 'ai_schema_' + val.error });
    }

    // A kockázatos mezők EMBERI MEGERŐSÍTÉST kérnek (vin, cnp, rendszám,
    // kárszám, összegek, órák). Az AI eredménye SOHA nem vált fázist —
    // ezt a kliens dönti el, a felhasználó jóváhagyása után.
    return response(200, {
      result: JSON.stringify(val.data),
      fields: val.data,
      uncertain: H.flagUncertain(val.data),
      ignored: val.ignored,
      needsHumanReview: true,
      model: MODEL
    });
  } catch (e) {
    console.error('OCR proxy exception:', e);
    return response(500, { error: 'Server error: ' + (e.message || 'unknown') });
  }
};

// ───────────────────────────────────────────────────────────────
// UTIL: response helper CORS-szal
// ───────────────────────────────────────────────────────────────

function response(statusCode, body) {
  return { statusCode, headers: H.corsHeaders(_evt), body: JSON.stringify(body) };
}
