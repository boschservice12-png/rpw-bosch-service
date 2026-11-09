// ════════════════════════════════════════════════════════════════
//  RPW-003 — a kliens oldali tároló-adapter (rpw-photos.js → bucket())
//  A kapu döntéseit a test-storage-gateway.js méri; itt azt, hogy a
//  KLIENS tényleg a kapun megy, és hiba esetén NEM esik vissza a
//  közvetlen tárolóútra.
// ════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

const J1 = 'RPW-11111111-2222-4333-8444-555555555555';

function setup(cfg, gwReply){
  delete require.cache[require.resolve(path.join(ROOT, 'rpw-photos.js'))];
  const log = { fetch:[], direct:[], signedUp:[] };
  globalThis.RPW_CFG = Object.assign({ SB_URL:'https://p.supabase.co', SB_KEY:'ANON', BUCKET:'rpw-photos',
                                       STORAGE_PRIVATE:true, STORAGE_GATEWAY:true }, cfg || {});
  globalThis.RPWAuth = { token: () => 'W'.repeat(40) };
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    log.fetch.push({ url, headers:init.headers, body });
    const r = gwReply ? gwReply(body) : { status:200, body:{ ok:true, path:body.path, token:'UPTOK',
                                          urls:(body.paths||[]).map(p => ({ path:p, signedUrl:'https://signed/'+p })) } };
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  };
  const sb = { storage: { from: (b) => ({
    upload: async (p) => { log.direct.push(['upload', b, p]); return { data:{ path:p }, error:null }; },
    remove: async (ps) => { log.direct.push(['remove', b, ps]); return { data:[], error:null }; },
    createSignedUrl: async (p) => { log.direct.push(['sign', b, p]); return { data:{ signedUrl:'https://direct/'+p }, error:null }; },
    getPublicUrl: (p) => ({ data:{ publicUrl:'https://public/'+p } }),
    uploadToSignedUrl: async (p, t) => { log.signedUp.push([p, t]); return { data:{ path:p }, error:null }; }
  }) } };
  const P = require(path.join(ROOT, 'rpw-photos.js'));
  return { P, sb, log };
}

(async () => {
  console.log('\n══ RPW-003 — kliens tároló-adapter ══');

  console.log('\n1. Dolgozói feltöltés a kapun át');
  {
    const { P, sb, log } = setup();
    const r = await P.bucket(sb, 'rpw-photos').upload(J1 + '/talon.jpg', 'BLOB', { contentType:'image/jpeg' });
    ok(!r.error && r.data.path === J1 + '/talon.jpg', 'sikeres, a kapu útvonalával tér vissza');
    ok(log.fetch.length === 1 && log.fetch[0].body.op === 'sign-upload', 'a kaputól kért feltöltési engedélyt');
    ok(/\/functions\/v1\/rpw-storage$/.test(log.fetch[0].url), 'a rpw-storage függvényt hívta');
    ok(log.fetch[0].headers['x-rpw-token'] === 'W'.repeat(40), 'a munkamenet-token fejlécben megy (nem a törzsben)');
    ok(log.signedUp.length === 1 && log.signedUp[0][1] === 'UPTOK', 'a fájl az aláírt feltöltési URL-re ment');
    ok(log.direct.length === 0, 'közvetlen tárolóhívás NEM történt');
  }

  console.log('\n2. Ügyfél-feltöltés: ügyfél-művelet, token nélkül');
  {
    const { P, sb, log } = setup();
    await P.bucket(sb, 'rpw-photos', { client:true }).upload(J1 + '/client_1730000000000_ab12.jpg', 'B', {});
    ok(log.fetch[0].body.op === 'client-sign-upload', 'client-sign-upload');
    ok(!('x-rpw-token' in log.fetch[0].headers), 'az ügyfél-oldal a dolgozói tokent akkor sem küldi, ha a gépen van');
    const rm = await P.bucket(sb, 'rpw-photos', { client:true }).remove([J1 + '/a.jpg']);
    ok(rm.error && rm.error.status === 403 && log.fetch.length === 1, 'ügyfél nem törölhet — a kaput sem hívja');
  }

  console.log('\n3. A kapu elutasít → hiba, és NINCS visszaesés a közvetlen útra');
  {
    const { P, sb, log } = setup({}, () => ({ status:403, body:{ ok:false, error:'not_allowed' } }));
    const w = console.warn; let figy = 0; console.warn = () => figy++;
    const r = await P.bucket(sb, 'rpw-photos').upload(J1 + '/a.jpg', 'B', {});
    const u = await P.signedUrl(sb, J1 + '/a.jpg');
    const rm = await P.bucket(sb, 'rpw-photos').remove([J1 + '/a.jpg']);
    console.warn = w;
    ok(r.error && r.error.message === 'not_allowed', 'feltöltés: a hiba a hívóhoz ér');
    ok(u === '', 'aláírt URL: üres (privát módban nincs publikus tartalék)');
    ok(rm.error, 'törlés: hiba');
    ok(log.direct.length === 0 && log.signedUp.length === 0, 'semmi nem ment a tárolóba közvetlenül');
    ok(figy >= 3, 'minden elutasítás naplózva (nem néma)');
  }

  console.log('\n4. Hálózati hiba → hiba, nem kivétel és nem hamis siker');
  {
    const { P, sb, log } = setup();
    globalThis.fetch = async () => { throw new Error('offline'); };
    const r = await P.bucket(sb, 'rpw-photos').upload(J1 + '/a.jpg', 'B', {});
    ok(r.error && r.error.message === 'network' && log.signedUp.length === 0, 'network hiba, feltöltés nem történt');
  }

  console.log('\n5. Olvasás és storePhoto a kapun át');
  {
    const { P, sb, log } = setup();
    ok(await P.signedUrl(sb, J1 + '/talon.jpg') === 'https://signed/' + J1 + '/talon.jpg', 'signedUrl a kaputól jön');
    ok(log.fetch[0].body.op === 'sign-read', 'sign-read');
    const s = await P.storePhoto(sb, J1, 'BLOB', { key:'p1', mimeType:'image/jpeg' });
    ok(s.ok && s.path === J1 + '/p1.jpg' && log.signedUp.length === 1, 'storePhoto is a kapun tölt fel');
    ok(log.direct.length === 0, 'közvetlen tárolóhívás NEM történt');
  }

  console.log('\n6. Kapu kikapcsolva → a régi út (visszaállási lehetőség)');
  {
    const { P, sb, log } = setup({ STORAGE_GATEWAY:false });
    await P.bucket(sb, 'rpw-photos').upload(J1 + '/a.jpg', 'B', {});
    ok(log.fetch.length === 0 && log.direct.length === 1, 'STORAGE_GATEWAY=false → közvetlen');
  }

  console.log('\n7. Statikus őr: a kiszolgált fájlok közül csak a rpw-photos.js nyúlhat a tárolóhoz');
  {
    const fajlok = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f) && f !== 'rpw-photos.js'
                                                && f !== 'rpw-config.staging.js');
    const sertok = [];
    for (const f of fajlok){
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      // engedett: a két modul tartaléka, ha a RPWPhotos nincs betöltve
      const tiszta = src.replace(/\(root\.RPWPhotos&&root\.RPWPhotos\.bucket\)\?root\.RPWPhotos\.bucket\(sb,bucket\):sb\.storage\.from\(bucket\)/g, '');
      const m = tiszta.match(/storage\.from\([^)]*\)\.(upload|remove|createSignedUrl|createSignedUrls|list|move|copy|update|download)\b/g);
      if (m) sertok.push(f + ': ' + m.join(', '));
    }
    ok(sertok.length === 0, 'nincs közvetlen tároló-írás/olvasás' + (sertok.length ? ' — ' + sertok.join(' | ') : ''));
    const cfg = fs.readFileSync(path.join(ROOT, 'rpw-config.js'), 'utf8');
    ok(/STORAGE_GATEWAY:\s*true/.test(cfg), 'élesben a kapu be van kapcsolva');
    const minden = fajlok.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    ok(!/service_role|SERVICE_ROLE_KEY/.test(minden), 'a service-kulcs neve sem szerepel kiszolgált fájlban');
  }

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
