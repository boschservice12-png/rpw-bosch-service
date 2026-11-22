// RPW-005 (2026-11-22) — a reconstatare fotói a TÁROLÓBA mennek, nem base64-ként a munkába.
// Ok: a mentés a TELJES munkát küldi, az új szerver 2 MB fölött nem fogad — ~9 fotó után elakadt volna.
// A VALÓDI oldalkód segédfüggvényei futnak (a forrásból kiemelve), valódi rpw-photos.js / rpw-util.js mellett.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const src = fs.readFileSync(path.join(ROOT, 'rpw-reconstatare-red.html'), 'utf8');
const J = 'RPW-11111111-2222-4333-8444-555555555555';
const PNG1 = 'data:image/jpeg;base64,' + Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]).toString('base64');

function ctx(opts){
  const toasts = [], puts = [];
  const c = { console, Blob, FileReader: class { readAsDataURL(b){ b.arrayBuffer().then(ab => { this.result = 'data:image/jpeg;base64,' + Buffer.from(ab).toString('base64'); this.onload(); }); } },
    setTimeout, atob: (s) => Buffer.from(s, 'base64').toString('binary'), Uint8Array, Promise, Math, Date, String, JSON, Array, Object, Error, RegExp };
  c.window = c; c.self = c; c.globalThis = c;
  c.RPW_CFG = { SB_URL:'https://rpw.example', SB_KEY:'rpw-symfony', BUCKET:'rpw-photos', STORAGE_PRIVATE:true, STORAGE_GATEWAY: opts.gateway !== false };
  c.RPWAuth = { token: () => 'W'.repeat(40) };
  c.fetch = async (url, init) => {
    if (init && init.method === 'PUT') { puts.push(url); return { ok: !opts.putFails, status: opts.putFails ? 503 : 200 }; }
    if (!init) return { ok:true, status:200, blob: async () => new Blob([Buffer.from([0xFF, 0xD8, 0xFF, 9])]) };   // tárolt kép letöltése
    const b = JSON.parse(init.body);
    if (b.op === 'sign-read') return { ok:true, status:200, json: async () => ({ ok:true, urls: b.paths.map(p => ({ path:p, signedUrl:'https://s3.example/' + p })) }) };
    return { ok:true, status:200, json: async () => ({ ok:true, path:b.path, direct:true, contentType:'image/jpeg', token:'', signedUrl:'https://s3.example/' + b.path }) };
  };
  c.toast = (m) => toasts.push(m);
  c.escU = (s) => String(s).replace(/"/g, '&quot;');
  c.JOB = { id: J };
  c.sb = {};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'rpw-util.js'), 'utf8'), c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'rpw-photos.js'), 'utf8'), c);
  const block = src.slice(src.indexOf('// ── RPW-005 (2026-11-22): a reconstatare'), src.indexOf('\nfunction render(){'));
  vm.runInContext(block, c);
  return { c, toasts, puts };
}

(async () => {
  console.log('\n══ reconstatare: fotók a tárban ══');
  { const { c, puts } = ctx({});
    const ref = await c.rcStore(PNG1, 'ov');
    ok(ref.path && new RegExp('^' + J + '/reconst_ov_\\d+_[a-z0-9]+\\.jpg$').test(ref.path) && !ref.data, 'a fotó a tárba ment, a munkában csak az út: ' + ref.path);
    ok(puts.length >= 1 && puts[0].includes(ref.path), 'a kép a tárba ment (PUT)');
    ok(/data-rpw-path="RPW-[^"]+\.jpg" data-rpw-thumb="1"/.test(c.rcImg(ref)), 'megjelenítés: tárból, előnézettel');
    ok(c.rcImg(PNG1).startsWith('src="data:image/jpeg'), 'régi base64-es fotó: változatlanul megjelenik');
    ok(c.rcImg({ data:'javascript:alert(1)' }) === '', 'nem kép séma: nem kerül src-be');
    ok((await c.rcB64(PNG1)) === PNG1.split(',')[1], 'e-mail: régi fotó base64-e');
    const b64 = await c.rcB64(ref);
    ok(b64 && Buffer.from(b64, 'base64')[0] === 0xFF, 'e-mail: a tárolt fotó letöltve, base64-ként csatolható');
  }
  { const { c, toasts } = ctx({ putFails: true });
    const ref = await c.rcStore(PNG1, 'el');
    ok(ref.data === PNG1 && !ref.path, 'tár nem érhető el → a fotó helyben marad (bizonyíték, nem vész el)');
    ok(toasts.length === 1, 'és a dolgozó tudja');
  }
  { const { c } = ctx({ gateway: false });
    ok((await c.rcStore(PNG1, 'ov')).data === PNG1, 'régi rendszeren (kapu nélkül): a régi viselkedés');
  }

  console.log('\n══ a mentés mérete — miért kellett ══');
  { const photo = 'data:image/jpeg;base64,' + 'A'.repeat(220 * 1024);   // ~160 KB-os fotó (1100 px, 70%) base64-ként
    const old = JSON.stringify({ id:J, reconstPhotos: Array.from({ length: 12 }, () => ({ data: photo, ts: 'x' })) });
    const neu = JSON.stringify({ id:J, reconstPhotos: Array.from({ length: 12 }, (_, i) => ({ path: J + '/reconst_ov_1732200000000_ab' + i + '.jpg', ts: '2026-11-22T20:00:00.000Z' })) });
    ok(old.length > 2000000, '12 fotó base64-ként: ' + (old.length / 1e6).toFixed(1) + ' MB → az új szerver elutasítaná (max. 2 MB)');
    ok(neu.length < 5000, '12 fotó tárban: ' + neu.length + ' bájt a munkában');
  }

  console.log('\n══ a lap bekötése (statikus) ══');
  ok(/<script src="rpw-photos\.js"><\/script>/.test(src), 'a lap betölti a rpw-photos.js-t');
  ok(!/src="'\+phs\[p\]\+'"/.test(src), 'a sor-fotók nem nyers src-vel (rcImg)');
  ok(/var ref=await rcStore\(d,'ov'\)/.test(src) && /var ref=await rcStore\(d,'el'\)/.test(src), 'mindkét fotógomb a tárba ment');
  ok(/await rcB64\(photos\[x\]\)/.test(src) && /await rcB64\(rp\[pi\]\)/.test(src), 'az e-mail mindkét fotófajtát a tárból is csatolja');
  ok(/RPWPhotos\.hydrate\(sb\)/.test(src), 'kirajzolás után a tárolt képek betöltődnek');

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
