#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   run-all.js — HÁROMKATEGÓRIÁS TESZTFUTTATÓ   (a brief 12. pontja)

     unit         — kliensoldali feldolgozás, cache, UI, XSS
     integration  — VALÓDI PostgreSQL: tenant, RLS, verziózár, kapuk
     frontend     — VALÓDI oldalkód jsdom-ban, UI-eseménytől indulva
     static       — statikus workflow-audit
     staging      — kézi, valódi környezetben (EMBER futtatja)

   A jelentés KÜLÖN írja ki a három kategóriát. „Minden teszt
   sikeres" NEM állítható, ha az integrációs vagy a staging nem futott.

     node _tests/run-all.js               minden
     node _tests/run-all.js --unit        csak unit
     node _tests/run-all.js --integration csak integrációs
   ════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR  = __dirname;
const ROOT = path.resolve(DIR, '..');
const args = process.argv.slice(2);
const only = args.find(a => /^--(unit|integration|frontend|static)$/.test(a));
const ONLY = only ? only.replace('--','') : null;

function list(sub){
  const d = path.join(DIR, sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => /^test-.*\.js$/.test(f)).sort()
           .map(f => ({ cat: sub, file: f, full: path.join(d, f) }));
}

let jsdomVer = null;
try { jsdomVer = require(path.join(ROOT,'node_modules','jsdom','package.json')).version; } catch(e){}
let pgVer = null;
try { pgVer = require(path.join(ROOT,'node_modules','embedded-postgres','package.json')).version; } catch(e){}

const KATEGORIAK = ['unit', 'integration', 'frontend', 'static'];
const targets = KATEGORIAK
  .filter(k => !ONLY || ONLY === k)
  .reduce((acc, k) => acc.concat(list(k)), []);

const results = [];
const started = Date.now();

console.log('\n══════════════════════════════════════════════════════');
console.log('  RPW — tesztfuttatás');
console.log('══════════════════════════════════════════════════════');
console.log('  Node              : ' + process.version);
console.log('  jsdom             : ' + (jsdomVer || 'NINCS'));
console.log('  embedded-postgres : ' + (pgVer || 'NINCS'));
console.log('  ideje             : ' + new Date().toISOString());
console.log('──────────────────────────────────────────────────────');

let lastCat = null;
for (const t of targets) {
  if (t.cat !== lastCat) { console.log('\n  [' + t.cat.toUpperCase() + ']'); lastCat = t.cat; }
  const src = fs.readFileSync(t.full, 'utf8');
  const t0 = Date.now();

  if (/jsdom/.test(src) && !jsdomVer) {
    results.push(Object.assign({}, t, { status:'NEM_INDULT', pass:0, fail:0, ms:0,
                                        reason:'jsdom hiányzik — npm ci' }));
    console.log('  x NEM INDULT  ' + t.file.padEnd(28) + 'jsdom hiányzik');
    continue;
  }
  if (t.cat === 'integration' && !pgVer) {
    results.push(Object.assign({}, t, { status:'NEM_INDULT', pass:0, fail:0, ms:0,
                                        reason:'embedded-postgres hiányzik — npm ci' }));
    console.log('  x NEM INDULT  ' + t.file.padEnd(28) + 'embedded-postgres hiányzik');
    continue;
  }

  const timeout = t.cat === 'integration' ? 300000 : 120000;
  const r = spawnSync(process.execPath, [t.full], {
    cwd: path.dirname(t.full), encoding:'utf8', timeout,
    env: Object.assign({}, process.env, { NODE_PATH: path.join(ROOT,'node_modules') })
  });
  const ms = Date.now() - t0;
  const out = (r.stdout||'') + (r.stderr||'');
  const m = out.match(/(\d+)\s*pass\s*\/\s*(\d+)\s*fail/i);

  if (r.error && r.error.code === 'ETIMEDOUT') {
    results.push(Object.assign({}, t, { status:'NEM_INDULT', pass:0, fail:0, ms,
                                        reason:'időtúllépés' }));
    console.log('  x NEM INDULT  ' + t.file.padEnd(28) + 'időtúllépés');
    continue;
  }
  if (!m) {
    results.push(Object.assign({}, t, { status:'NEM_INDULT', pass:0, fail:0, ms,
      reason:'nincs értelmezhető összegzés',
      tail: out.trim().split('\n').slice(-2).join(' | ').slice(0,180) }));
    console.log('  x NEM INDULT  ' + t.file.padEnd(28) + 'nincs összegzés');
    continue;
  }
  const p = +m[1], f = +m[2];
  const status = (f === 0 && r.status === 0) ? 'OK' : 'BUKOTT';
  results.push(Object.assign({}, t, { status, pass:p, fail:f, ms }));
  console.log('  ' + (status==='OK'?'v':'x') + ' ' + status.padEnd(11) + t.file.padEnd(28) +
              String(p).padStart(4) + ' pass  ' + String(f).padStart(3) + ' fail  ' +
              String(ms).padStart(6) + ' ms');
}

function summarize(cat){
  const rs = results.filter(r => r.cat === cat);
  const nemIndult = rs.filter(r => r.status === 'NEM_INDULT').length;
  const bukott    = rs.filter(r => r.status === 'BUKOTT').length;
  const assertions = rs.reduce(function(s,r){ return s+r.pass+r.fail; }, 0);
  const passed     = rs.reduce(function(s,r){ return s+r.pass; }, 0);
  const failed     = rs.reduce(function(s,r){ return s+r.fail; }, 0);
  let verdict;
  if (!rs.length)            verdict = 'NOT RUN';
  else if (nemIndult)        verdict = 'NOT RUN';
  else if (bukott || failed) verdict = 'FAIL';
  else                       verdict = 'PASS';
  return { cat:cat, files: rs.length, nemIndult:nemIndult, bukott:bukott,
           assertions:assertions, passed:passed, failed:failed, verdict:verdict };
}

const U = summarize('unit');
const I = summarize('integration');
const F = summarize('frontend');
const S = summarize('static');

// A staging kategóriát EMBER futtatja — a gép nem állíthatja igazoltnak.
const stagingFile = path.join(ROOT, 'STAGING-VERIFIED.json');
let stagingVerdict = 'NOT VERIFIED';
let stagingNote = 'a MANUAL-STAGING-CHECKLIST.md nincs kitöltve';
if (fs.existsSync(stagingFile)) {
  try {
    const s = JSON.parse(fs.readFileSync(stagingFile,'utf8'));
    if (s.verified === true) { stagingVerdict = 'VERIFIED'; stagingNote = s.by + ' — ' + s.date; }
    else stagingNote = s.note || stagingNote;
  } catch(e){ stagingNote = 'a STAGING-VERIFIED.json nem olvasható'; }
}

const totalMs = Date.now() - started;
console.log('\n──────────────────────────────────────────────────────');
function sor(nev, x){
  console.log('  ' + nev.padEnd(22) + ': ' + x.verdict.padEnd(10) + x.files + ' fájl, ' +
              x.assertions + ' állítás, ' + x.failed + ' hibás' +
              (x.nemIndult ? ', ' + x.nemIndult + ' EL SEM INDULT' : ''));
}
sor('Unit', U);
sor('Database integration', I);
sor('Frontend integration', F);
sor('Static workflow audit', S);
console.log('  ' + 'Staging'.padEnd(22) + ': ' + stagingVerdict.padEnd(10) + stagingNote);
console.log('──────────────────────────────────────────────────────');
console.log('  futási idő  : ' + (totalMs/1000).toFixed(1) + ' s');
console.log('──────────────────────────────────────────────────────');

const nemIndultak = results.filter(function(r){ return r.status === 'NEM_INDULT'; });
if (nemIndultak.length) {
  console.log('\n  EL SEM INDULT:');
  nemIndultak.forEach(function(r){ console.log('    - [' + r.cat + '] ' + r.file + ' — ' + r.reason); });
}
const bukottak = results.filter(function(r){ return r.status === 'BUKOTT'; });
if (bukottak.length) {
  console.log('\n  BUKOTT:');
  bukottak.forEach(function(r){ console.log('    - [' + r.cat + '] ' + r.file + ' — ' + r.fail + ' hibás állítás'); });
}

let npmv = null;
try { npmv = spawnSync('npm',['-v'],{encoding:'utf8'}).stdout.trim(); } catch(e){}
let build = null;
try {
  // A kotojel a build-nev RESZE (V4-MERGE-PIN007). A regi minta az elso
  // kotojelnel vagott: az "OWN-STAFF-L3A"-bol "OWN" lett a jelentesben.
  const b = fs.readFileSync(path.join(ROOT,'index.html'),'utf8').slice(0,400).match(/BUILD:\s*([A-Za-z0-9_.-]+)/);
  build = b ? b[1] : null;
} catch(e){}

fs.writeFileSync(path.join(DIR,'last-run.json'), JSON.stringify({
  generated: new Date().toISOString(),
  node: process.version, npm: npmv, jsdom: jsdomVer, embedded_postgres: pgVer, build,
  unit: U, integration: I, frontend: F, static: S,
  staging: { verdict: stagingVerdict, note: stagingNote },
  duration_ms: totalMs,
  results: results
}, null, 2));

console.log('\n  gépi jelentés: _tests/last-run.json');

// Minden gépi kategóriának PASS-nak kell lennie.
const gepiOk = [U, I, F, S].every(x => x.verdict === 'PASS');
console.log('');
if (gepiOk && stagingVerdict === 'VERIFIED') {
  console.log('  EREDMÉNY: minden kategória igazolt.\n');
} else if (gepiOk) {
  console.log('  EREDMÉNY: a gépi tesztek zöldek.');
  console.log('  A STAGING NEM IGAZOLT — "minden teszt sikeres" NEM allithato.\n');
} else {
  console.log('  EREDMÉNY: SIKERTELEN — lásd fent.\n');
}
process.exit(gepiOk ? 0 : 1);
