// 2026-11-22 — sok fotó e-mailben: levelenként max. 10 melléklet / 10 MB (a levélküldő korlátja)
const path = require('path');
const U = require(path.join(__dirname, '..', '..', 'rpw-util.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const att = (n, kb) => Array.from({ length: n }, (_, i) => ({ filename: 'foto_' + (i + 1) + '.jpg', content: 'A'.repeat(kb * 1024) }));

console.log('\n══ e-mail mellékletek csomagolása ══');
{ const p = U.splitAttachments(att(1, 10)); ok(p.length === 1, '1 melléklet → 1 levél'); }
{ const a = att(51, 400), p = U.splitAttachments(a);   // PDF + 50 fotó, ~0,4 MB base64 / db
  ok(p.length === 6, '51 melléklet → 6 levél (10-esével), lett: ' + p.length);
  ok(p.every(x => x.length <= 10), 'egy levélben sincs 10-nél több');
  ok([].concat(...p).map(x => x.filename).join() === a.map(x => x.filename).join(), 'a sorrend és a teljes készlet megmarad');
}
{ const p = U.splitAttachments(att(8, 2000));          // 8 × 2 MB → méret szerint bont
  ok(p.every(x => x.reduce((s, y) => s + y.content.length, 0) <= 9.5 * 1024 * 1024), 'egy levél sem lépi át a 9,5 MB-ot');
  ok(p.length === 2, '8 × 2 MB → 2 levél, lett: ' + p.length);
}
{ const p = U.splitAttachments([{ filename: 'nagy.pdf', content: 'A'.repeat(11 * 1024 * 1024) }, ...att(2, 10)]);
  ok(p.length === 2 && p[0].length === 1, 'a korlátnál nagyobb egyetlen melléklet külön levél (a szerver szól róla)'); }
{ ok(U.splitAttachments([]).length === 0 && U.splitAttachments(null).length === 0, 'üres → nincs levél'); }

const fs = require('fs');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'rpw-reconstatare-red.html'), 'utf8');
ok(/RPWUtil\.splitAttachments\(atts\)/.test(src), 'a reconstatare levélküldő a csomagolót használja');
ok(/attachments:parts\[pn\]/.test(src) && !/attachments:atts\}/.test(src), 'egy levél csak a saját csomagját viszi');

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
