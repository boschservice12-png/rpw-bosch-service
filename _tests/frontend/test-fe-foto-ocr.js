// ════════════════════════════════════════════════════════════════
//  FRONTEND — A FOTO-UT VERIFIKACIOJA (Ferenc kerese: "MOST VERIFIKALD")
//  ----------------------------------------------------------------
//  Ez a teszt NEM a forraskodot olvassa, hanem a VALODI lapokat futtatja
//  jsdom-ban, es igazi `File` objektummal inditja a lancot ugyanazokrol
//  a gombesemenyekrol, amiket a recepcios megnyom:
//
//    A) RECEPCIO      — talon foto feltoltes + OCR -> beirodnak-e a mezok
//    B) RECONSTATARE  — foto feltoltes -> bekerul-e a munkalapba
//    C) RECONSTATARE  — email kuldes -> mennek-e a fotok mellekletkent
//
//  Csak a HALOZAT HATARAT helyettesitjuk (Supabase Storage, fetch,
//  belepetes, PDF). Minden mas a lap sajat kodja.
//
//  Ket kepdekodolasi allapotot merunk kulon:
//    · dekodolhato kep  — a normal muhelyi eset
//    · NEM dekodolhato  — iPhone HEIC / PDF: EZ akadt el eddig NEMAN
// ════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path'), jsdom = require('jsdom');
const { JSDOM } = jsdom;
const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  x ' + m)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A lap sajat scriptjei valodiak; csak a szerver-fuggo retegeket vagjuk ki.
function inline(html){
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    if (/supabase/.test(src)) return '<script>window.supabase={createClient:()=>window.__sb}</' + 'script>';
    if (/rpw-(db|cache|guard|auth|queue|save|data|conflict|roles|workflow)\.js/.test(src)) return '';
    const f = path.join(ROOT, src);
    if (/^rpw-/.test(src) && fs.existsSync(f))
      return '<script>' + fs.readFileSync(f, 'utf8').replace(/<\/script>/g, '<\\/script>') + '</' + 'script>';
    return '';
  });
}

// Egy valodi JPEG-fajl (magic byte-okkal), ahogy a telefon adna.
function jpegFile(w){
  const bytes = new Uint8Array([0xFF,0xD8,0xFF,0xE0,0,0x10,0x4A,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,0xFF,0xD9]);
  return new w.File([bytes], 'talon.jpg', { type: 'image/jpeg' });
}
// Amit a bongeszo NEM tud dekodolni (iPhone HEIC) — ez akadt el nemán.
function heicFile(w){
  const bytes = new Uint8Array([0,0,0,0x18,0x66,0x74,0x79,0x70,0x68,0x65,0x69,0x63,0,0,0,0]);
  return new w.File([bytes], 'IMG_0001.HEIC', { type: 'image/heic' });
}

async function lap(fajl, job, opts){
  opts = opts || {};
  const NET = [];            // minden fetch-hivas
  const UPLOAD = [];         // minden Storage-feltoltes
  const PATCH = [];          // minden mentes
  const raw = fs.readFileSync(path.join(ROOT, fajl), 'utf8');
  const vc = new jsdom.VirtualConsole();
  ['jsdomError','error'].forEach(e => vc.on(e, (...a) => {
    if (process.env.DBG) console.log('  [' + e + '] ' + String((a[0] && a[0].message) || a[0] || '').slice(0,200));
  }));

  const dom = new JSDOM(inline(raw), {
    virtualConsole: vc,
    url: 'https://rpw.teszt/' + fajl + '?job=J1',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w){
      // ── A kepdekodolas allapota: a jsdom nem tolt kepet, ezert MI
      //    dontjuk el, hogy a bongeszo tudna-e dekodolni. Igy a ket
      //    valos eset kulon merheto.
      w.__decodeOk = !!opts.decodeOk;
      Object.defineProperty(w.HTMLImageElement.prototype, 'src', {
        configurable: true,
        get(){ return this.__src || ''; },
        set(v){
          this.__src = v; const self = this;
          setTimeout(function(){
            if (w.__decodeOk){ self.setAttribute('width','2400'); self.setAttribute('height','1200');
                               if (self.onload) self.onload(); }
            else { if (self.onerror) self.onerror(); }
          }, 0);
        }
      });
      w.HTMLCanvasElement.prototype.getContext = function(){ return { drawImage(){} }; };
      w.HTMLCanvasElement.prototype.toDataURL  = function(){
        return 'data:image/jpeg;base64,/9j/' + 'A'.repeat(4000);
      };
      w.URL.createObjectURL = () => 'blob:teszt';
      w.URL.revokeObjectURL = () => {};

      // ── Halozat: MINDEN fetch-hivast rogzitunk ────────────────────
      w.fetch = async function(url, o){
        const u = String(url); NET.push({ url: u, opts: o });
        if (/\/functions\/ocr/.test(u)){
          // A VALODI szerveroldali szuro fut le (functions/_shared.js), nem
          // egy masolat: igy a sema-hiba is vegig merheto. Ha a szuro
          // eldobja a mezoket, a lap ugyanugy ureset kap, mint elesben.
          const H = require(path.join(ROOT, 'functions', '_shared.js'));
          const tipus = JSON.parse(o.body).type;
          const val = H.validateOcr(opts.ocr || {}, tipus);
          if (!val.ok) return { ok:false, status:502,
            json: async () => ({ error:'Raspuns AI neconform', code:'ai_schema_'+val.error }) };
          return { ok:true, status:200, json: async () => ({
            result: JSON.stringify(val.data), fields: val.data, needsHumanReview:true }) };
        }
        if (/\/functions\/sendmail/.test(u))
          return { ok:true, status:200, json: async () => ({ ok:true }) };
        if (/^data:/i.test(u)) throw new TypeError('Failed to fetch'); // a CSP igy viselkedik
        return { ok:true, status:200, json: async () => ({}), blob: async () => new w.Blob([]) };
      };

      // ── Supabase Storage: a feltoltest rogzitjuk ──────────────────
      w.__sb = {
        rpc: () => Promise.resolve({ data:{ok:true}, error:null }),
        from: () => { const q = { eq:()=>q, is:()=>q, single:()=>Promise.resolve({data:null,error:null}),
                                  order:()=>Promise.resolve({data:[],error:null}) }; return { select:()=>q }; },
        storage: { from: (bucket) => ({
          upload: async (p, blob, o) => { UPLOAD.push({ bucket, path:p, blob, opts:o }); return { data:{path:p}, error:null }; },
          remove: async () => ({ data:null, error:null }),
          createSignedUrl: async (p) => ({ data:{ signedUrl:'https://sig/' + p }, error:null }),
          getPublicUrl: (p) => ({ data:{ publicUrl:'https://pub/' + p } })
        })}
      };

      w.RPWAuth = { guard(){}, required(){return false;}, session(){return {ok:true};},
                    token(){return 'T'.repeat(40);}, name(){return 'Teszt';}, role(){return 'admin';},
                    actor(){return {name:'Teszt'};}, can(){return true;}, perms(){return null;},
                    fnHeaders(x){ const h = x||{}; h['Content-Type']='application/json';
                                  h['Authorization']='Bearer '+'T'.repeat(40); return h; } };
      w.RPWDb = {
        getRow: async () => ({ data:{ data:JSON.parse(JSON.stringify(job)), version:1,
                                      updated_at:new Date().toISOString() }, error:null }),
        patch:  async (sb, j) => { PATCH.push(JSON.parse(JSON.stringify(j))); return {ok:true}; },
        patchV2:async (sb, id, p) => { PATCH.push(p); return {ok:true}; }
      };
      w.RPWCache = { getJob:()=>null, setJob(){}, migrateLegacy(){}, sweep(){} };
      w.RPWQueue = { add(){}, flush(){} };
      w.RPWSave  = { save: async()=>({ok:true}) };
      w.RPWRoles = { can:()=>true };
      w.RPWWorkflow = { ask: async()=>true, canAdvance:()=>({ok:true}) };
    }
  });
  const w = dom.window;
  for (let i=0; i<200 && !w.JOB; i++) await sleep(20);
  await sleep(60);
  return { w, NET, UPLOAD, PATCH };
}

const OCR_TALON = { plate:'MS-50-BSS', vin:'W0L0AHL0864099999', brand:'DACIA',
                    model:'LOGAN', year:'2009', capacitate:'1598',
                    owner:'SZKALICZKI SERVICE S.R.L.' };

const JOB_REC = { id:'J1', number:'MS-26-100', plate:'', vin:'', brand:'', auto:'', client:'',
                  damageType:'auto', phase:1, inchis:false, version:1,
                  photos:[], docs:[], panels:{}, elements:{}, alteParti:[], materials:[],
                  phases:{1:{status:'active'},2:{status:'pending'},3:{status:'pending'},
                          4:{status:'pending'},5:{status:'pending'},6:{status:'pending'},7:{status:'pending'}} };

const JOB_RC = { id:'J1', number:'MS-26-100', plate:'MS-50-BSS', brand:'DACIA', damageType:'asig',
                 phase:3, inchis:false, version:1, photos:[], docs:[], elements:{}, materials:[],
                 reconstPhotos:[], reconst:{ nrDosar:'GO10124', emailInsp:'dauna@allianz.ro',
                                             status:'draft', rows:[], docs:{} },
                 phases:{1:{status:'done'},2:{status:'done'},3:{status:'active'},4:{status:'pending'},
                         5:{status:'pending'},6:{status:'pending'},7:{status:'pending'}} };

(async function(){

// ══════════════════════════════════════════════════════════════
console.log('\nA) RECEPCIO — talon foto feltoltes + OCR (dekodolhato kep)');
{
  const { w, NET, UPLOAD } = await lap('rpw-recepcio-red.html', JOB_REC, { decodeOk:true, ocr:OCR_TALON });
  ok(!!w.JOB, 'a lap elindult es betoltotte a munkalapot');
  ok(typeof w.upTalon === 'function', 'a talon-feltolto gomb kezeloje letezik');

  w.upTalon({ target:{ files:[ jpegFile(w) ], value:'x' } });
  // Nem akadhat el: legfeljebb 3 masodpercen belul le kell futnia.
  for (let i=0; i<150 && !UPLOAD.length; i++) await sleep(20);
  await sleep(250);

  ok(UPLOAD.length === 1, 'a foto FELTOLTODOTT a Storage-ba (' + UPLOAD.length + ' hivas)');
  if (UPLOAD.length){
    ok(UPLOAD[0].path === 'J1/talon.jpg', 'a tarolasi ut helyes: ' + UPLOAD[0].path);
    ok(UPLOAD[0].opts && UPLOAD[0].opts.contentType === 'image/jpeg',
       'a tartalomtipus helyes: ' + (UPLOAD[0].opts && UPLOAD[0].opts.contentType));
    ok(UPLOAD[0].blob && UPLOAD[0].blob.size > 0, 'a feltoltott tartalom NEM ures (' +
       (UPLOAD[0].blob && UPLOAD[0].blob.size) + ' bajt)');
  }

  // Egyetlen data: URL-t sem fetch-eltunk — ez volt az "upload failed to fetch"
  const dataFetch = NET.filter(c => /^data:/i.test(c.url));
  ok(dataFetch.length === 0, 'EGYETLEN data: URL-t sem fetch-elt (' + dataFetch.length + ')');

  // Az OCR elindult, es nyers base64-et kapott
  const ocr = NET.filter(c => /\/functions\/ocr/.test(c.url));
  ok(ocr.length === 1, 'az OCR PONTOSAN egyszer futott (' + ocr.length + ')');
  if (ocr.length){
    const body = JSON.parse(ocr[0].opts.body);
    ok(body.type === 'talon', 'az OCR tipusa: ' + body.type);
    ok(typeof body.image === 'string' && body.image.indexOf('data:') !== 0,
       'az OCR NYERS base64-et kapott (nem dataURL-t)');
    ok(body.image.length > 100, 'a kep tenylegesen benne van (' + body.image.length + ' karakter)');
    ok(/Bearer /.test(ocr[0].opts.headers.Authorization || ''), 'a hivas hitelesitve ment');
  }

  // ── A LENYEG: az OCR eredmenye BEIRODOTT a munkalapba ──────────
  const J = w.JOB;
  ok(J.plate === 'MS-50-BSS',                     'rendszam beirva: ' + J.plate);
  ok(J.vin === 'W0L0AHL0864099999',               'VIN beirva: ' + J.vin);
  ok(J.brand === 'DACIA',                         'MARKA beirva: ' + J.brand);
  ok(J.year === '2009',                           'EVJARAT beirva: ' + J.year);
  ok(J.capacitate === '1598',                     'HENGERURTARTALOM beirva: ' + J.capacitate);
  ok(J.proprietar === 'SZKALICZKI SERVICE S.R.L.','TULAJDONOS beirva: ' + J.proprietar);
  ok(J.auto === 'DACIA LOGAN',                    'marka+modell osszefuzve: ' + J.auto);
  ok(!!(J.photoKeys && J.photoKeys.talon),        'a munkalap megjegyezte a fotot');
  ok(!!(J.ocrTs && J.ocrTs.talon),                'az OCR idobelyege rogzult');
}

// ══════════════════════════════════════════════════════════════
console.log('\nA2) RECEPCIO — NEM dekodolhato fajl (iPhone HEIC): NEM akad el');
{
  const { w, NET, UPLOAD } = await lap('rpw-recepcio-red.html', JOB_REC, { decodeOk:false, ocr:OCR_TALON });
  w.upTalon({ target:{ files:[ heicFile(w) ], value:'x' } });
  for (let i=0; i<150 && !UPLOAD.length; i++) await sleep(20);
  await sleep(250);

  ok(UPLOAD.length === 1, 'a nem dekodolhato fajl is ATMENT (nincs nema elakadas)');
  if (UPLOAD.length){
    ok(UPLOAD[0].opts.contentType === 'image/heic',
       'a VALODI tipussal tarolodott: ' + UPLOAD[0].opts.contentType);
    ok(UPLOAD[0].path === 'J1/talon.heic',
       'a valodi kiterjesztessel: ' + UPLOAD[0].path);
  }
  ok(NET.filter(c => /^data:/i.test(c.url)).length === 0, 'itt sem fetch-elt data: URL-t');
}

// ══════════════════════════════════════════════════════════════
console.log('\nB) RECONSTATARE — foto feltoltes');
{
  const { w, NET } = await lap('rpw-reconstatare-red.html', JOB_RC, { decodeOk:true });
  ok(!!w.JOB, 'a reconstatare lap elindult');
  ok(typeof w.addPh === 'function', 'a foto-gomb kezeloje letezik');
  ok(!!(w.RPWPhotos && w.RPWPhotos.fileToDataUrl), 'a KOZOS foto-reteg betoltodott (eddig hianyzott!)');

  w.addPh(0, { target:{ files:[ jpegFile(w) ], value:'x' } });
  for (let i=0; i<150 && !(w.JOB.reconstPhotos && w.JOB.reconstPhotos.length); i++) await sleep(20);
  await sleep(150);

  const ph = w.JOB.reconstPhotos || [];
  ok(ph.length === 1, 'a foto bekerult a munkalapba (' + ph.length + ')');
  ok(ph[0] && typeof ph[0].data === 'string' && ph[0].data.indexOf('data:image/') === 0,
     'a foto dataURL-kent tarolodik');
  ok(ph[0] && !!ph[0].ts, 'idobelyeggel');
  ok(NET.filter(c => /^data:/i.test(c.url)).length === 0, 'nem fetch-elt data: URL-t');
}

console.log('\nB2) RECONSTATARE — NEM dekodolhato fajl: NEM akad el');
{
  const { w } = await lap('rpw-reconstatare-red.html', JOB_RC, { decodeOk:false });
  w.addPh(0, { target:{ files:[ heicFile(w) ], value:'x' } });
  for (let i=0; i<150 && !(w.JOB.reconstPhotos && w.JOB.reconstPhotos.length); i++) await sleep(20);
  await sleep(150);
  const ph = w.JOB.reconstPhotos || [];
  ok(ph.length === 1, 'a HEIC is bekerult (nincs nema elakadas)');
  ok(ph[0] && ph[0].data.indexOf('data:image/heic') === 0,
     'az EREDETI fajl ment tovabb, valodi tipussal');
}

// ══════════════════════════════════════════════════════════════
console.log('\nC) RECONSTATARE — email kuldes a fotokkal');
{
  const { w, NET } = await lap('rpw-reconstatare-red.html', JOB_RC, { decodeOk:true });
  // A PDF-generalas CDN-rol tolt jsPDF-et — az nem ennek a tesztnek a targya.
  w.buildReconstPdf = async () => 'JVBERi0xLjQK' + 'QUFB'.repeat(20);

  w.addPh(0, { target:{ files:[ jpegFile(w) ], value:'x' } });
  w.addPh(1, { target:{ files:[ jpegFile(w) ], value:'x' } });
  for (let i=0; i<150 && (w.JOB.reconstPhotos||[]).length < 2; i++) await sleep(20);
  await sleep(120);
  ok((w.JOB.reconstPhotos||[]).length === 2, 'ket foto all a jelentesen');

  await w.emailReconst();
  await sleep(150);

  const mail = NET.filter(c => /\/functions\/sendmail/.test(c.url));
  ok(mail.length === 1, 'az email PONTOSAN egyszer ment ki (' + mail.length + ')');
  if (mail.length){
    const b = JSON.parse(mail[0].opts.body);
    ok(b.to === 'dauna@allianz.ro', 'a cimzett a biztosito: ' + b.to);
    ok(/Nota de reconstatare/.test(b.subject || ''), 'a targy helyes: ' + b.subject);
    ok(/GO10124/.test(b.subject || ''), 'a targyban ott a dossziészam');
    ok(Array.isArray(b.attachments), 'vannak mellekletek');
    ok(b.attachments.length === 3, 'PDF + 2 foto = 3 melleklet (' + b.attachments.length + ')');
    const fotok = b.attachments.filter(a => /^foto_\d+\.jpg$/.test(a.filename));
    ok(fotok.length === 2, 'mind a KET foto csatolva (' + fotok.length + ')');
    ok(fotok.every(a => typeof a.content === 'string' && a.content.indexOf('data:') !== 0
                        && a.content.length > 100),
       'a fotok NYERS base64-kent mennek (nem dataURL, nem uresen)');
    ok(b.attachments[0].filename.indexOf('.pdf') > 0, 'az elso melleklet a PDF-jelentes');
    ok(/Bearer /.test(mail[0].opts.headers.Authorization || ''), 'a levelkuldes hitelesitve ment');
  }
  ok(NET.filter(c => /^data:/i.test(c.url)).length === 0,
     'a levelkuldes SEM fetch-elt data: URL-t (ez blokkolt volna)');
  ok(w.JOB.reconst.status === 'sent', 'a jelentes allapota "sent"-re valtott');
}

// ══════════════════════════════════════════════════════════════
console.log('\nD) RECONSTATARE — fotok megosztasa (ez is data: URL-t fetch-elt)');
{
  const { w, NET } = await lap('rpw-reconstatare-red.html', JOB_RC, { decodeOk:true });
  const SHARE = [];
  Object.defineProperty(w.navigator, 'canShare', { configurable:true, value: () => true });
  Object.defineProperty(w.navigator, 'share', { configurable:true,
    value: async (d) => { SHARE.push(d); } });

  w.addPh(0, { target:{ files:[ jpegFile(w) ], value:'x' } });
  w.addPh(1, { target:{ files:[ jpegFile(w) ], value:'x' } });
  for (let i=0; i<150 && (w.JOB.reconstPhotos||[]).length < 2; i++) await sleep(20);
  await sleep(120);

  await w.shareReconst();
  await sleep(120);

  ok(SHARE.length === 1, 'a megosztas elindult (' + SHARE.length + ')');
  if (SHARE.length){
    const f = SHARE[0].files || [];
    ok(f.length === 2, 'mind a KET foto atadva megosztasra (' + f.length + ')');
    ok(f.every(x => x && x.size > 0), 'egyik fajl sem ures');
    ok(f.every(x => /^reconst_\d+\.jpg$/.test(x.name)), 'a fajlnevek helyesek');
  }
  ok(NET.filter(c => /^data:/i.test(c.url)).length === 0,
     'a megosztas SEM fetch-elt data: URL-t');
}

console.log('\n──────────────────────────────────────────');
console.log('  Foto+OCR verifikacio:  ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
})();
