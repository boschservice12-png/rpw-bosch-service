// ════════════════════════════════════════════════════════════════
//  STATIKUS WORKFLOW-AUDIT   (a brief 10. pontja)
//  ----------------------------------------------------------------
//  Megkeresi, hol állít be a kód KÖZVETLENÜL kritikus workflow-mezőt.
//  Nem minden találat hiba — ezért van dokumentált engedélylista.
//
//  Az engedélylista CSAK ezekre használható:
//    · megjelenítési kód
//    · tesztadat
//    · szerverválasz alkalmazása
//    · inicializálás
//    · migrációs kompatibilitás
//
//  UI-gombkezelőben vagy normál mentési kódban NEM engedélyezett.
// ════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

// ── A keresett veszélyes minták ──────────────────────────────────
const MINTAK = [
  { re: /\b(?:JOB|job|j)\.phase\s*=(?!=)/g,                   mezo:'phase' },
  { re: /\b(?:JOB|job|j)\.inchis\s*=(?!=)/g,                  mezo:'inchis' },
  { re: /\bphases\s*\[[^\]]+\]\s*\.status\s*=(?!=)/g,         mezo:'phases[].status' },
  { re: /\.phases\s*\[[^\]]+\]\s*=(?!=)/g,                    mezo:'phases[]' },
  { re: /status\s*:\s*['"]done['"]/g,                         mezo:"status:'done'" },
  { re: /\brework\s*\[[^\]]+\]\s*\.status\s*=(?!=)/g,         mezo:'rework[].status' },
  // ⚠ Csak a JOB- és FÁZIS-szintű completedBy a workflow-mező.
  // A `r.completedBy` egy MUNKASOR (bodyRows/paintRows) mezője —
  // az normál szakmai adat, `work` joggal menthető patch-csel.
  { re: /\b(?:JOB|job)\.completedBy\s*=(?!=)/g,               mezo:'JOB.completedBy' },
  { re: /phases\s*\[[^\]]+\]\s*\.completedBy\s*=(?!=)/g,     mezo:'phases[].completedBy' }
];

// ── ENGEDÉLYLISTA — mindegyikhez INDOK és BIZTONSÁGOS ÚTVONAL ────
const ENGEDELY = [
  // ── Szerverválasz alkalmazása ────────────────────────────────
  { fajl:'.html', ok:'szerverválasz alkalmazása',
    minta:/JOB\s*=\s*res\.data\.data|JOB\s*=\s*r\.data\.data|JOB\s*=\s*JSON\.parse\(cached\)/,
    ut:'a szerverről (vagy a gyorsítótárból) betöltött teljes állapot átvétele' },
  // ── Új munka létrehozása ─────────────────────────────────────
  { fajl:'.html', ok:'ÚJ munka létrehozása — a szerveren még nem létezik',
    minta:/phases\s*:\s*\{\s*1\s*:|if\(typeof job\.phase!=='number'\|\|job\.phase<1\)|if\(!job\.phases\[p\]\)|if\(job\.phases\[1\]\.status==='pending'\)/,
    ut:'rpw_patch_v3 `open` joggal — az INSERT ágon a védelem nem alkalmazandó, '
       + 'mert nincs mit megkerülni; a szerver ekkor a teljes objektumot beszúrja' },

  // ── Inicializálás ────────────────────────────────────────────
  { fajl:'.html', ok:'inicializálás — hiányzó fázisok kitöltése',
    minta:/if\(!JOB\.phases\[p\]\)|if\(!JOB\.phases\)JOB\.phases=\{\}/,
    ut:'üres váz létrehozása; státuszt csak a rpw_transition ír' },
  // ── Megjelenítés ─────────────────────────────────────────────
  { fajl:'.html', ok:'megjelenítési kód — a JOB-ot nem módosítja',
    minta:/(status\s*:\s*['"]done['"])\s*[,}\)]?\s*(\?|:|\||&|\))|===\s*['"]done['"]|render|innerHTML|textContent|\bh\s*\+?=/,
    ut:'olvasás, nem írás' },
  // ── Munkasor-mezők (NEM workflow) ────────────────────────────
  { fajl:'.html', ok:'munkasor (bodyRows/paintRows) mezője — normál szakmai adat',
    minta:/\br\.(completed|completedBy|completedAt)\s*=|completedBy:\s*r\.completedBy/,
    ut:'rpw_patch_v3 `work` joggal — a szerver ezt NEM tekinti workflow-mezőnek' },
  { fajl:'rpw-workflow.js', ok:'szerverválasz alkalmazása',
    minta:/for\(k in res\.data\)|job\[k\] = res\.data\[k\]/,
    ut:'commitViaServer — a SZERVER által visszaadott állapot átvétele' },
  { fajl:'rpw-workflow.js', ok:'a helyi UX-előnézet és a fejlesztői (szerver nélküli) út',
    minta:/./,
    ut:'a rpw-workflow.js a kliensoldali modell. Élesben (SERVER_TRANSITIONS=true) '
       + 'a commitCriticalTransition NEM futtatja a helyi mutációt — a rpw_transition dönt. '
       + 'Ezt a frontend-integrációs teszt bizonyítja: a mutate() kivételt dob, és nem következik be.' },
  { fajl:'rpw-data.js', ok:'inicializálás és a szerverhívás összeállítása',
    minta:/txnCall|TXN_ACTION|serverTransition/,
    ut:'rpw_transition RPC' },
  { fajl:'rpw-cache.js', ok:'megjelenítési kód — csak a státusz betűjét tárolja',
    minta:/out\.phases\[i\]=\{status:/,
    ut:'nem ír a JOB-ba, csak olvassa' },
  { fajl:'_tests/', ok:'tesztadat', minta:/./, ut:'—' }
];

// A `commitCriticalTransition(JOB, function(){ ... })` MUTATE-törzse:
// élesben (SERVER_TRANSITIONS=true) NEM fut le — a szerver dönt.
// Ezt a frontend-integrációs teszt bizonyítja: a mutate() kivételt dob,
// és a kivétel nem következik be.
function mutateTorzsben(sorok, i){
  for (let k = Math.max(0, i-12); k < i; k++) {
    if (/commitCriticalTransition\(/.test(sorok[k])) {
      // a törzs a `}, {` sorig tart
      for (let j = k; j <= i; j++) if (/^\s*\},\s*\{/.test(sorok[j])) return false;
      return true;
    }
  }
  return false;
}

function engedelyezett(fajl, sor){
  for (const e of ENGEDELY) {
    if (fajl.indexOf(e.fajl) < 0) continue;
    if (e.minta.test(sor) || e.fajl === '_tests/') return e;
  }
  return null;
}

// ── Az érintett fájlok ───────────────────────────────────────────
function fajlok(){
  const out = [];
  fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f)).forEach(f => out.push(f));
  return out;
}

// ── Az audit ─────────────────────────────────────────────────────
const talalatok = [];
for (const f of fajlok()) {
  const sorok = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  sorok.forEach((sor, i) => {
    if (/^\s*(\/\/|\*|<!--)/.test(sor)) return;         // komment
    for (const m of MINTAK) {
      m.re.lastIndex = 0;
      if (!m.re.test(sor)) continue;
      let eng = engedelyezett(f, sor);
      if (!eng && mutateTorzsben(sorok, i)) {
        eng = { ok:'a commitCriticalTransition mutate() törzse',
                ut:'élesben NEM fut le — a rpw_transition dönt (bizonyítva a frontend-tesztben)' };
      }
      talalatok.push({ fajl:f, sor:i+1, mezo:m.mezo,
                       ok: eng ? eng.ok : null,
                       ut: eng ? eng.ut : null,
                       szoveg: sor.trim().slice(0,90) });
    }
  });
}

const engedett = talalatok.filter(t => t.ok);
const tiltott  = talalatok.filter(t => !t.ok);

console.log('\n  STATIKUS WORKFLOW-AUDIT');
console.log('  ─────────────────────────────────────────────');
console.log('  átvizsgált fájl : ' + fajlok().length);
console.log('  találat         : ' + talalatok.length);
console.log('    engedélyezett : ' + engedett.length);
console.log('    TILTOTT       : ' + tiltott.length);

if (tiltott.length) {
  console.log('\n  TILTOTT KÖZVETLEN MÓDOSÍTÁSOK:');
  console.log('  ' + 'fájl'.padEnd(28) + 'sor'.padStart(5) + '  ' + 'mező'.padEnd(18) + 'kód');
  tiltott.forEach(t => {
    console.log('  ' + t.fajl.padEnd(28) + String(t.sor).padStart(5) + '  ' +
                t.mezo.padEnd(18) + t.szoveg);
  });
}

// Az engedélyezettek dokumentálva
if (engedett.length) {
  console.log('\n  ENGEDÉLYEZETT (dokumentált indokkal):');
  const csop = {};
  engedett.forEach(t => {
    const k = t.fajl + ' | ' + t.ok;
    csop[k] = (csop[k] || 0) + 1;
  });
  Object.keys(csop).sort().forEach(k => {
    const [f, o] = k.split(' | ');
    const e = ENGEDELY.find(x => f.indexOf(x.fajl) >= 0 && x.ok === o);
    console.log('  ' + csop[k] + '× ' + f);
    console.log('      indok: ' + o);
    console.log('      biztonságos útvonal: ' + (e ? e.ut : '—'));
  });
}

console.log('');
ok(tiltott.length === 0,
   'nincs engedély nélküli közvetlen workflow-módosítás' +
   (tiltott.length ? ' — ' + tiltott.length + ' találat' : ''));

// Külön: a HTML-oldalak gombkezelőiben SEMMI nem engedélyezett
const htmlTiltott = talalatok.filter(t => /\.html$/.test(t.fajl) && !t.ok);
ok(htmlTiltott.length === 0,
   'a HTML-oldalak nem módosítanak közvetlenül workflow-mezőt' +
   (htmlTiltott.length ? ' — ' + htmlTiltott.map(t=>t.fajl+':'+t.sor).join(', ') : ''));

// Gépi jelentés
fs.writeFileSync(path.join(__dirname, 'audit-result.json'),
  JSON.stringify({ generated:new Date().toISOString(),
                   files:fajlok().length, total:talalatok.length,
                   allowed:engedett.length, forbidden:tiltott.length,
                   findings:talalatok }, null, 2));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
