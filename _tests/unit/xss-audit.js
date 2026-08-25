#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   xss-audit.js — DINAMIKUS HTML ÁTVIZSGÁLÁSA   (a brief 14. pontja)

   Megkeresi azokat a sorokat, ahol változó kerül HTML-be ANÉLKÜL,
   hogy escape-elve lenne (escH / escA / escU / esc).

   Nem helyettesíti az emberi átnézést, de megmutatja, hova kell nézni.
     node _tests/xss-audit.js
   ════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

// A HTML-t építő minták
const HTML_SINK = /(innerHTML\s*[+]?=|outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\()/;
// A sorok, amelyek HTML-darabot fűznek össze: h+='<...'
const HTML_BUILD = /(^|[^\w])h\s*\+?=\s*['"`]\s*<|\bm\s*\+?=\s*['"`]\s*<|\bt\s*\+?=\s*['"`]\s*</;

const ESCAPED = /\b(escH|escA|escU|esc|escapeHtml|textContent|encodeURIComponent)\s*\(/;
// Nyilvánvalóan biztonságos beszúrások: számok, konstansok, T('...') fordítás
const SAFE_EXPR = /^\s*(\+\s*)?(T\(|CFG\.|String\(\s*\d|\d+|\w+\.length|JSON\.stringify\(|'[^']*'|"[^"]*")/;

const files = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f));
let flagged = [], scanned = 0, htmlLines = 0;

for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    scanned++;
    const isSink  = HTML_SINK.test(line);
    const isBuild = HTML_BUILD.test(line);
    if (!isSink && !isBuild) return;
    htmlLines++;

    // Van-e benne változó-behelyettesítés?  +valami.valami  vagy  ${...}
    const interps = [];
    const re = /\+\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+|\([^)]*\))/g;
    let m;
    while ((m = re.exec(line)) !== null) interps.push(m[1]);
    const tpl = /\$\{([^}]+)\}/g;
    while ((m = tpl.exec(line)) !== null) interps.push(m[1]);
    if (!interps.length) return;

    // Escape-elve van?
    if (ESCAPED.test(line)) return;

    // Csak konstansok / fordítások?
    const risky = interps.filter(x => !SAFE_EXPR.test('+' + x) && !/^T\(/.test(x)
                                   && !/^CFG\./.test(x) && !/^\(/.test(x));
    if (!risky.length) return;

    flagged.push({ file: f, line: i + 1, expr: risky.slice(0, 3).join(', '),
                   text: line.trim().slice(0, 100) });
  });
}

module.exports = { flagged };

// A jelentést CSAK közvetlen futtatáskor írjuk ki — importáláskor néma,
// különben elrontja az őt használó teszt összegző sorát.
if (require.main === module) {
  console.log('\n  XSS-audit — dinamikus HTML');
  console.log('  ─────────────────────────────────────────────');
  console.log('  átvizsgált sor      : ' + scanned);
  console.log('  HTML-t építő sor    : ' + htmlLines);
  console.log('  escape nélküli behelyettesítés: ' + flagged.length);
  if (flagged.length) {
    console.log('');
    flagged.forEach(x => {
      console.log('  ' + x.file + ':' + x.line);
      console.log('      ' + x.expr);
      console.log('      ' + x.text);
    });
  }
  console.log('');
}
