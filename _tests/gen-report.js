#!/usr/bin/env node
/* A TEST-REPORT.md-t a last-run.json-ból generálja.
   A brief 14. pontja: „Ne írj kézzel olyan tesztszámot, amely nem a
   tesztfuttató gépi kimenetéből származik." */
'use strict';
const fs=require('fs'), path=require('path');
const DIR=__dirname, ROOT=path.resolve(DIR,'..');
const R=JSON.parse(fs.readFileSync(path.join(DIR,'last-run.json'),'utf8'));

const rows = R.results.map(r =>
  '| ' + r.cat + ' | `' + r.file + '` | ' + r.pass + ' | ' + r.fail + ' | ' +
  (r.status==='OK'?'✅':(r.status==='BUKOTT'?'❌':'⚠ el sem indult')) + ' |').join('\n');

const md = `# TEST-REPORT.md

> **Ez a fájl generált.** Forrás: \`_tests/last-run.json\`.
> Újragenerálás: \`npm test && node _tests/gen-report.js\`

*Generálva: ${R.generated}*

---

## Környezet

| | |
|---|---|
| Node | ${R.node} |
| npm | ${R.npm||'—'} |
| jsdom | ${R.jsdom||'nincs'} |
| embedded-postgres | ${R.embedded_postgres||'nincs'} |
| Build | \`${R.build||'—'}\` |

## Parancsok

\`\`\`bash
npm ci                              # reprodukálható telepítés
npm test                            # unit + integrációs
node _tests/run-all.js --unit       # csak unit
node _tests/run-all.js --integration # csak integrációs (valódi PostgreSQL)
\`\`\`

---

## Eredmény kategóriánként

\`\`\`
Unit:                  ${R.unit.verdict}
Database integration:  ${R.integration.verdict}
Frontend integration:  ${R.frontend.verdict}
Static workflow audit: ${R.static.verdict}
Staging:               ${R.staging.verdict}
\`\`\`

| Kategória | Fájl | Állítás | Sikeres | Sikertelen | El sem indult |
|---|---:|---:|---:|---:|---:|
| **Unit** | ${R.unit.files} | ${R.unit.assertions} | ${R.unit.passed} | ${R.unit.failed} | ${R.unit.nemIndult} |
| **Database integration** | ${R.integration.files} | ${R.integration.assertions} | ${R.integration.passed} | ${R.integration.failed} | ${R.integration.nemIndult} |
| **Frontend integration** | ${R.frontend.files} | ${R.frontend.assertions} | ${R.frontend.passed} | ${R.frontend.failed} | ${R.frontend.nemIndult} |
| **Static workflow audit** | ${R.static.files} | ${R.static.assertions} | ${R.static.passed} | ${R.static.failed} | ${R.static.nemIndult} |
| **Staging** | — | — | — | — | — |

**Futási idő:** ${(R.duration_ms/1000).toFixed(1)} s

${R.staging.verdict !== 'VERIFIED' ? `> ⚠ **A staging NEM igazolt** — ${R.staging.note}
> Ezért a „minden teszt sikeres" állítás NEM tehető meg.
> A kézi ellenőrzés lépései: \`MANUAL-STAGING-CHECKLIST.md\`` : ''}

---

## A frontend-integrációs tesztek VALÓDI oldalkódot futtatnak

Nem statikus szövegkeresés. A HTML-oldal saját moduljai betöltődnek jsdom-ban,
a valódi \`commitCriticalTransition\` fut, és rögzítjük, MELYIK Supabase RPC
hívódott meg. A teszt kivételt dob a helyi mutációban — ha az lefutna, a teszt
elbukna. Mind a hét fázisoldalra + a dosszié-újranyitásra.

## Az adatbázis-integrációs tesztek VALÓDI adatbázison futnak

Nem mock. Beágyazott PostgreSQL indul (\`embedded-postgres\`), a migrációk
lefutnak, és az igazi SQL-függvények ellen mérünk — igazi RLS-szabályokkal,
igazi tranzakciókkal, két külön kapcsolaton át párhuzamosan.

Ez fedi a brief 6. pontjának mind a 12 esetét és a 13. pont regresszióit.

---

## Fájlonként

| Kategória | Fájl | Sikeres | Sikertelen | Állapot |
|---|---|---:|---:|---|
${rows}

---

## ⚠ NEM VOLT IGAZOLHATÓ

Ezek valódi Supabase/Netlify környezetet igényelnek — a homokozóból nem mérhetők:

| Állítás | Miért |
|---|---|
| A migrációk az ÉLES adatbázison lefutnak | Az 1. alapelv tiltja az éles DB módosítását |
| A signed URL lejárati ideje | Valódi Supabase-tárolót igényel |
| SHOP_A nem kérhet signed URL-t SHOP_B fájljához *(6.7)* | Ugyanaz — a kliensoldali „nincs publikus visszaesés" unit teszttel igazolt |
| A Netlify-funkciók éles viselkedése | Valódi Netlify-környezet |
| 10–20 egyidejű dolgozó | Terheléses staging |
| A CSP éles hatása | Report-only mérés kell előbb |
`;
fs.writeFileSync(path.join(ROOT,'TEST-REPORT.md'), md);
console.log('TEST-REPORT.md generálva a last-run.json-ból');
