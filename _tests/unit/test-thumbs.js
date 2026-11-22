// RPW-005 (2026-11-22) — előnézet (400 px) és kötegelt képbetöltés
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const J = 'RPW-11111111-2222-4333-8444-555555555555';

function load(cfg){
  delete require.cache[require.resolve(path.join(ROOT, 'rpw-photos.js'))];
  globalThis.RPW_CFG = Object.assign({ SB_URL:'https://rpw.example', SB_KEY:'rpw-symfony', BUCKET:'rpw-photos', STORAGE_PRIVATE:true, STORAGE_GATEWAY:true }, cfg);
  globalThis.RPWAuth = { token: () => 'W'.repeat(40) };
  return require(path.join(ROOT, 'rpw-photos.js'));
}

(async () => {
  console.log('\n══ előnézet + kötegelt betöltés ══');
  { const P = load({});
    ok(P.thumbPath(J + '/ov_0.jpg') === J + '/ov_0.t.jpg', 'ov_0.jpg → ov_0.t.jpg');
    ok(P.thumbPath(J + '/acte/acta_x_1_ab.JPEG') === J + '/acte/acta_x_1_ab.t.jpg', 'alkönyvtárban is');
    ok(P.thumbPath(J + '/ov_0.t.jpg') === null, 'előnézetnek nincs előnézete');
    ok(P.thumbPath(J + '/deviz_file.pdf') === null, 'PDF-nek nincs előnézete');
  }

  // feltöltés: THUMBS be → a fotó után az előnézet is felmegy; ki → nem; az előnézet hibája nem számít
  for (const [thumbs, failThumb] of [[true, false], [false, false], [true, true]]) {
    const P = load({ THUMBS: thumbs });
    const signs = [], puts = [];
    const fetch = async (url, init) => {
      if (init.method === 'PUT') { puts.push(url); return { ok: !(failThumb && url.includes('.t.jpg')), status: 200 }; }
      const b = JSON.parse(init.body); signs.push(b.path);
      return { ok:true, status:200, json: async () => ({ ok:true, path:b.path, direct:true, contentType:'image/jpeg', token:'', signedUrl:'https://s3.example/' + b.path }) };
    };
    const r = await P.bucket({}, 'rpw-photos', { fetch, makeThumb: async () => ({ size: 7 }) }).upload(J + '/ov_0.jpg', { size: 1000 });
    await new Promise(res => setTimeout(res, 20));
    ok(r.error === null, `a fotó feltöltése sikeres (THUMBS=${thumbs}${failThumb ? ', előnézet hibás' : ''})`);
    ok(thumbs ? signs.includes(J + '/ov_0.t.jpg') : signs.length === 1, thumbs ? 'az előnézet is felment' : 'kikapcsolva: nincs előnézet');
  }

  // kötegelt hidratálás: EGY kérés, előnézet ahol van, eredeti ahol nincs; a nagyítás az eredetit adja
  { const dom = new JSDOM(`<div>
      <img id="a" data-rpw-path="${J}/ov_0.jpg" data-rpw-thumb="1">
      <img id="b" data-rpw-path="${J}/ov_1.jpg" data-rpw-thumb="1">
      <img id="c" data-rpw-path="${J}/acte/talon.jpg">
      <a id="d" data-rpw-path="${J}/deviz_file.pdf">deviz</a></div>`);
    globalThis.document = dom.window.document;
    const P = load({ THUMBS: true });
    const calls = [];
    globalThis.fetch = async (url, init) => {
      const b = JSON.parse(init.body); calls.push(b);
      return { ok:true, status:200, json: async () => ({ ok:true, urls: b.paths.map(p => ({ path:p,
        signedUrl: p.endsWith('ov_1.t.jpg') ? null : 'https://s3.example/' + p + '?sig' })) }) };
    };
    await P.hydrate({});
    const $ = (id) => dom.window.document.getElementById(id);
    ok(calls.length === 1 && calls[0].op === 'sign-read', 'egyetlen kérés a teljes oldalra (nem elemenként)');
    ok($('a').src.includes('ov_0.t.jpg'), 'van előnézet → az látszik');
    ok($('b').src.includes('ov_1.jpg') && !$('b').src.includes('.t.jpg'), 'régi fotó, nincs előnézet → az eredeti');
    ok($('c').src.includes('talon.jpg'), 'előnézet nélküli kép → eredeti');
    ok($('d').href.includes('deviz_file.pdf'), 'link is friss aláírást kap');
    ok(['a', 'b', 'c', 'd'].every(i => $(i).getAttribute('data-rpw-done') === '1'), 'mind kész');
    globalThis.fetch = async (url, init) => { const b = JSON.parse(init.body);
      return { ok:true, status:200, json: async () => ({ ok:true, urls: b.paths.map(p => ({ path:p, signedUrl:'https://s3.example/' + p + '?full' })) }) }; };
    const full = await P.fullSrc({}, $('a'));
    ok(full.includes('ov_0.jpg?full'), 'nagyítás: az EREDETI, nem az előnézet');
    ok((await P.fullSrc({}, $('c'))) === $('c').src, 'ha nem előnézet látszik, a meglévő src');
    delete globalThis.document;
  }

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
