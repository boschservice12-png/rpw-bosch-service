// ════════════════════════════════════════════════════════════════
//  MI MEGY KI A NYILVÁNOS SITE-RA
//  ----------------------------------------------------------------
//  A `netlify.toml`-ben NINCS `publish` könyvtár: a Netlify a repó
//  GYÖKERÉT szolgálja ki. Ami tehát itt fekszik, az az élesítés
//  pillanatában LETÖLTHETŐ — a migrációk, a tesztek, a biztonsági
//  dokumentáció is.
//
//  Ez a teszt nem véleményt mond: FELSOROLJA a gyökér tartalmát, és
//  minden nem-alkalmazás fájlra megköveteli a záró szabályt. Ha
//  valaki holnap idetesz egy `_titkos/` mappát, ez elbukik.
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const TOML = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  x ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

// ── A záró szabályok kiolvasása ──────────────────────────────────
const szabalyok = [];
{
  const re = /\[\[redirects\]\]([\s\S]*?)(?=\n\[|\s*$)/g;
  let m;
  while ((m = re.exec(TOML)) !== null){
    const blk = m[1];
    const from   = (blk.match(/from\s*=\s*"([^"]+)"/)   || [])[1];
    const status = (blk.match(/status\s*=\s*(\d+)/)     || [])[1];
    const force  = /force\s*=\s*true/.test(blk);
    if(from) szabalyok.push({ from, status:Number(status), force });
  }
}

console.log('\n1. A záró szabályok tényleg zárnak');
{
  ok(szabalyok.length >= 8, 'van ' + szabalyok.length + ' szabály');
  const gyenge = szabalyok.filter(r => r.status !== 404 || !r.force);
  ok(gyenge.length === 0, 'mind 404 ÉS force' +
     (gyenge.length ? ' — gyenge: ' + gyenge.map(r=>r.from).join(', ') : ''));
}

// Illeszkedik-e egy útvonal valamelyik szabályra?
// FIGYELEM: a Netlify-nál a splat CSAK az útvonal VÉGÉN működik. A
// `/*.md` alakú kiterjesztés-minta NEM megbízható — ezért a fájlokat
// NÉVVEL zárjuk, és ez a teszt követeli meg, hogy egy se maradjon ki.
function zarva(nev, konyvtar){
  const ut = '/' + nev + (konyvtar ? '/valami.txt' : '');
  return szabalyok.some(r => {
    if(r.from.endsWith('/*')) return ut.indexOf(r.from.slice(0, -1)) === 0;
    return r.from === ut;
  });
}

console.log('\n1b. A fájl szerkezete érvényes TOML');
{
  // Ez a hiba ELVITTE a deployt, és a teszt mégis zöld volt:
  //     [context.branch-deploy.headers]     ← tábla
  //     [[context.branch-deploy.headers]]   ← ugyanaz a név, tábla-TÖMBKÉNT
  // A Netlify válasza: „trying to redefine an already defined table".
  // Node-ban nincs TOML-elemző, ezért pont ezt az ütközést keressük.
  const fejlecek = [];
  TOML.split('\n').forEach((sor, i) => {
    const m = sor.match(/^\s*(\[\[?)([^\]]+)\]\]?\s*$/);
    if(m) fejlecek.push({ nev:m[2].trim(), tomb:(m[1]==='[['), sor:i+1 });
  });
  ok(fejlecek.length > 0, 'találhatók szakaszfejlécek (' + fejlecek.length + ')');

  const utkozes = [];
  const latott = {};
  fejlecek.forEach(f => {
    if(latott[f.nev] !== undefined && latott[f.nev] !== f.tomb) utkozes.push(f.nev + ' (' + f.sor + '. sor)');
    latott[f.nev] = f.tomb;
  });
  ok(utkozes.length === 0, 'egy név sem szerepel táblaként ÉS tábla-tömbként is' +
     (utkozes.length ? ' — ÜTKÖZÉS: ' + utkozes.join(', ') : ''));

  // ugyanaz az egyszerű tábla kétszer szintén hiba
  const egyszeru = fejlecek.filter(f => !f.tomb).map(f => f.nev);
  const dupla = egyszeru.filter((n,i) => egyszeru.indexOf(n) !== i);
  ok(dupla.length === 0, 'nincs kétszer deklarált tábla' +
     (dupla.length ? ' — ' + [...new Set(dupla)].join(', ') : ''));

  // minden záró szabály teljes: from + to + status + force
  const hianyos = szabalyok.filter(r => !r.from || !r.status || !r.force);
  ok(hianyos.length === 0, 'minden szabály teljes');
  ok(!/from\s*=\s*"\/\*\./.test(TOML),
     'nincs /*.kiterjesztés minta — a Netlify-nál az nem megbízható');
}

console.log('\n2. A belső anyagok le vannak zárva');
{
  [['_migrations',1],['_db',1],['_tests',1]].forEach(([d,k]) => {
    if(fs.existsSync(path.join(ROOT,d))) ok(zarva(d,k), d + '/ nem tölthető le');
  });
  ['SECURITY.md','REMAINING-RISKS.md','DEPLOYMENT.md','CHANGELOG.md','TEST-REPORT.md',
   '00-ARCHITEKTURA.md','MANUAL-STAGING-CHECKLIST.md','README.md','FILE-CHANGES.md']
   .forEach(f => { if(fs.existsSync(path.join(ROOT,f))) ok(zarva(f,0), f + ' nem tölthető le'); });
  ['package.json','package-lock.json','rpw_consistency_check.sql','rpw-config.staging.js']
   .forEach(f => { if(fs.existsSync(path.join(ROOT,f))) ok(zarva(f,0), f + ' nem tölthető le'); });
}

console.log('\n3. Ami a gyökérben van, arról DÖNTENI kell');
{
  // Az alkalmazás része — ezek MENNEK ki, ez a rendes működés.
  const APP = /\.(html|js|png|ico|svg|webmanifest|toml)$/i;
  const KIVETEL = new Set(['node_modules','.git','.gitignore','functions','.netlify']);
  const gyoker = fs.readdirSync(ROOT).filter(f => !KIVETEL.has(f));
  const dontetlen = gyoker.filter(f => {
    const konyvtar = fs.statSync(path.join(ROOT,f)).isDirectory();
    if(!konyvtar && APP.test(f)) return false;          // alkalmazásfájl → mehet
    return !zarva(f, konyvtar);                          // minden más: kell rá szabály
  });
  ok(dontetlen.length === 0,
     'minden nem-alkalmazás fájlra van szabály' +
     (dontetlen.length ? ' — SZABÁLY NÉLKÜL: ' + dontetlen.join(', ') : ''));
  ok(gyoker.length > 20, 'a mérés érdemi (' + gyoker.length + ' bejegyzés a gyökérben)');
}

console.log('\n4. A 404-es lap létezik, és nem szivárogtat');
{
  const p404 = path.join(ROOT,'404.html');
  ok(fs.existsSync(p404), 'van 404.html');
  const s = fs.readFileSync(p404,'utf8');
  ok(/noindex/.test(s), '  noindex — nem kerül a keresőbe');
  ok(!/supabase|SB_KEY|migrations|token/i.test(s), '  és nem árul el semmit');
}

console.log('\n5. A biztonsági fejlécek megvannak');
{
  ['X-Frame-Options','X-Content-Type-Options','Referrer-Policy',
   'Strict-Transport-Security','Content-Security-Policy'].forEach(h => {
    ok(TOML.indexOf(h) >= 0, h + ' beállítva');
  });
  ok(/functions\s*=\s*"functions"/.test(TOML), 'a funkciók könyvtára megadva');
}

console.log('\n6. EGY adatbazis van: a BOSCH projekt');
{
  // Ferenc dontese (2026-08-29): a Supabase-en is a BOSCH projektre
  // epitunk. A cegnek tobb Supabase-projektje is van; ha barmelyik
  // config egy masikra mutatna, a munkak egy resze egy MASIK
  // adatbazisban keletkezne — es ugy tunne, hogy "eltuntek".
  // Ez a szakasz azt orzi, hogy egyetlen projekt-azonosito legyen.
  const BOSCH = 'pxypbbvqinbwesfikkdb';
  const cfgFajlok = fs.readdirSync(ROOT).filter(n => /^rpw-config.*\.js$/.test(n));
  ok(cfgFajlok.length > 0, 'van legalabb egy config-fajl  (' + cfgFajlok.join(', ') + ')');

  const refek = new Set();
  cfgFajlok.forEach(n => {
    const s = fs.readFileSync(path.join(ROOT, n), 'utf8');
    (s.match(/https:\/\/([a-z0-9]+)\.supabase\.co/g) || []).forEach(u =>
      refek.add(u.replace(/https:\/\/([a-z0-9]+)\.supabase\.co/, '$1')));
    // a kulcs maga is megnevezi a projektet a "ref" mezojeben
    (s.match(/"ref":"([a-z0-9]+)"/g) || []).forEach(m =>
      refek.add(m.replace(/"ref":"([a-z0-9]+)"/, '$1')));
  });
  eq([...refek].sort(), [BOSCH], 'MINDEN config ugyanarra az egy projektre mutat');

  // A beagyazott anon-kulcs is a BOSCH projekte legyen — kulonben a URL
  // es a kulcs ket kulon adatbazisrol beszelne, es a lap nemán elhalna.
  cfgFajlok.forEach(n => {
    const s = fs.readFileSync(path.join(ROOT, n), 'utf8');
    const kulcs = (s.match(/SB_KEY:\s*'([^']+)'/) || [])[1];
    if (!kulcs) return;
    let torzs = {};
    try { torzs = JSON.parse(Buffer.from(kulcs.split('.')[1], 'base64').toString('utf8')); } catch(e) {}
    eq(torzs.ref, BOSCH, n + ': az anon kulcs is a BOSCH projekte');
    eq(torzs.role, 'anon', '  es anon szerepu (nem service_role — az kiszivarogna)');
  });
}

console.log('\n' + (fail ? 'x ' : 'OK ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
