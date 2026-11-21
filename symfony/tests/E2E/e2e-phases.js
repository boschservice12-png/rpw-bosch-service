const OUT = process.env.E2E_OUT || require('path').resolve(__dirname, '../../var/e2e');
// A 2–7. fázis a VALÓDI oldalakon, szerepkörönként más belépett dolgozóval.
// Az adatot úgy állítjuk be, ahogy az oldal saját mezői tennék, a lezárást
// pedig az oldal SAJÁT gombfüggvénye végzi (commitCriticalTransition → szerver).
const fs = require('fs');
const { start, login, BASE } = require('./lib');
const JOB_ID = fs.readFileSync(OUT + '/job.txt', 'utf8').trim();
const out = [];
const shot = (p, n) => p.screenshot({ path: OUT + '/' + n + '.png' });

async function onPage(who, pin, page, fn) {
  const s = await start({ onDialog: d => d.accept(d.type() === 'prompt' ? who : undefined) });
  await login(s.p, who, pin);
  try {
    await s.p.goto(BASE + '/' + page + '?job=' + JOB_ID, { waitUntil: 'networkidle' });
    await s.p.waitForFunction(() => window.JOB && JOB.id, null, { timeout: 15000 });
    await s.p.waitForTimeout(500);
    await fn(s.p);
  } catch (e) {
    out.push('  !! HIBA: ' + e.message.split('\n')[0] + '  (url: ' + s.p.url() + ')');
    out.push('  oldal: ' + (await s.p.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '?')).replace(/\n+/g, ' | '));
  } finally {
    out.push(...s.log);
    await s.b.close();
  }
}
const step = t => out.push('\n### ' + t);
const state = async p => p.evaluate(() => JSON.stringify({ phase: JOB.phase, inchis: JOB.inchis, v: JOB.version,
  st: Object.fromEntries(Object.entries(JOB.phases).map(([k, v]) => [k, v.status])) }));

(async () => {
  step('2. Evaluare — Mihai Műszakvezető');
  await onPage('Mihai Műszakvezető', '6148', 'rpw-evaluare-red.html', async p => {
    await p.evaluate(() => {
      // egy lakatos- és egy fényezőtétel (a munkasorokat az oldalak ebből állítják elő)
      JOB.evalData = Object.assign(JOB.evalData || {}, { status: 'draft', comanda: [
        { id: 'c1', op: 'reparatie', elKey: 'fb', name: 'Bara fata', hours: 3 },
        { id: 'c2', op: 'vopsire', elKey: 'fb', name: 'Bara fata', hours: 2 }] });
      JOB.termenPredare = '2026-12-05';
      JOB.deviz = { oreTinichigerie: 3, oreVopsitorie: 2 };
    });
    await p.evaluate(() => advance());
    await p.waitForTimeout(3000);
    out.push('  url: ' + p.url());
  });

  step('4. Tinichigerie — Lajos Lakatos (a sor elvégzése a saját nevével)');
  await onPage('Lajos Lakatos', '7259', 'rpw-tinichigerie-red.html', async p => {
    out.push('  előtte: ' + await state(p));
    const n = await p.evaluate(() => (JOB.bodyRows || []).length);
    out.push('  munkasor: ' + n);
    for (let i = 0; i < n; i++) { await p.evaluate(i => setDone(i), i); await p.waitForTimeout(900); }
    await p.evaluate(() => advPh());
    await p.waitForTimeout(3000);
    out.push('  url: ' + p.url());
  });

  step('5. Vopsitorie — Vasile Festő');
  await onPage('Vasile Festő', '8361', 'rpw-vopsitorie-red.html', async p => {
    const n = await p.evaluate(() => (JOB.paintRows || []).length);
    out.push('  munkasor: ' + n);
    for (let i = 0; i < n; i++) { await p.evaluate(i => setDone(i), i); await p.waitForTimeout(900); }
    await p.evaluate(() => advPh());
    await p.waitForTimeout(3000);
    out.push('  url: ' + p.url());
  });

  step('6. Control — Mihai Műszakvezető (minden ellenőrzőpont OK)');
  await onPage('Mihai Műszakvezető', '6148', 'rpw-control-red.html', async p => {
    await p.evaluate(() => { JOB.controlChecks = {}; CHECKLIST.forEach(c => c.items.forEach(it => { JOB.controlChecks[it.id] = 'ok'; })); });
    await p.evaluate(() => advPh());
    await p.waitForTimeout(3000);
    out.push('  url: ' + p.url());
  });

  step('7a. Închidere — Lajos Lakatos NEM zárhatja le (nincs `close` joga)');
  await onPage('Lajos Lakatos', '7259', 'rpw-inchidere-red.html', async p => {
    const r = await p.evaluate(async () => {
      const res = await RPWData.__instance.serverTransition('close', { id: JOB.id, phase: 7, expectedVersion: JOB.version });
      return res.error && res.error.code;
    });
    out.push('  szerver válasza: ' + r);
  });

  step('7. Închidere — Mihai Műszakvezető (5 valódi záró fotó + átadási adatok)');
  await onPage('Mihai Műszakvezető', '6148', 'rpw-inchidere-red.html', async p => {
    for (let x = 0; x < 5; x++) {
      const inp = await p.$$(`input[type=file][onchange="addPh(${x},event)"]`);
      if (inp.length) { await inp[inp.length - 1].setInputFiles(OUT + '/car.png'); await p.waitForTimeout(900); }
    }
    await p.evaluate(() => {
      Object.assign(JOB.closing, { factura: 'F-2026-0187', devizRef: 'D-55', devizNotRequired: true, vehicleOperational: true,
        finalControlConfirmed: true, documentsDeliveredToOffice: true, handoverBy: 'Mihai Műszakvezető' });
    });
    await p.evaluate(() => closeJob());
    await p.waitForTimeout(3500);
    out.push('  url: ' + p.url());
    await shot(p, '07-closed');
  });

  step('Végállapot a szerverről');
  await onPage('Ferenc Admin', '4826', 'rpw-dosar.html', async p => {
    out.push('  ' + await state(p));
    // RPW-004: a dosszié a tárolóban lévő fotókat is mutatja (eddig 0/6 volt)
    await p.waitForTimeout(2500);   // a hydrate friss aláírt URL-eket kér
    const ph = await p.evaluate(() => {
      const badges = [...document.querySelectorAll('.sec-h')].map(h => h.innerText.replace(/\s+/g, ' '));
      const imgs = [...document.querySelectorAll('.pslot img, img[alt="talon"]')];
      return { badges: badges.filter(b => /Talon|ansamblu/i.test(b)), imgs: imgs.length,
        loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
    });
    out.push('  dosszié fotók: ' + JSON.stringify(ph));
    out.push(ph.imgs === 7 && ph.loaded === 7 && ph.badges.some(b => /6\/6/.test(b)) ? '  FOTÓK: OK' : '  FOTÓK: HIBA');
    const cl = await p.evaluate(() => (JOB.closingPhotos || []).map(c => c ? (c.path ? 'path' : (c.data ? 'base64' : '?')) : '-'));
    out.push('  záró fotók: ' + cl.join(','));
    out.push(cl.filter(x => x === 'path').length === 5 && cl.indexOf('base64') < 0 ? '  ZÁRÓ FOTÓK: OK (tárolóban)' : '  ZÁRÓ FOTÓK: HIBA');
    await p.evaluate(() => { tS('photos'); tS('talon'); });
    await p.waitForTimeout(1500);
    await shot(p, '08-dosar-final');
  });
  console.log(out.join('\n'));
})();
