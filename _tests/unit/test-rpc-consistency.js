// ════════════════════════════════════════════════════════════════
//  RPC-KONZISZTENCIA   (a brief 2. pontja)
//  ----------------------------------------------------------------
//  Összegyűjti a KLIENS által hívott RPW RPC-neveket, és összeveti a
//  MIGRÁCIÓKBAN létrehozott függvényekkel.
//
//  Elbukik, ha:
//    · a kliens nem létező RPC-t hív
//    · a migráció olyan függvényre ad jogot, amely nem létezik
//    · eltér a paraméterek neve
//
//  Ez a teszt fogta volna meg a v2 hibáját: hat RPC-t hívott a
//  kliens, amelyekhez soha nem készült migráció.
// ════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const MIG  = path.join(ROOT, '_migrations');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

// ── 1) Amit a MIGRÁCIÓK létrehoznak ──────────────────────────────
const migFiles = fs.readdirSync(MIG).filter(f => /^\d+_(?!rollback).*\.sql$/.test(f)).sort();
const created = new Map();     // név → paraméternevek
const granted = new Set();

for (const f of migFiles) {
  const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
  // create [or replace] function public.NEV(  ...  )
  const re = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*\n\s*returns/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const params = m[2].split(',')
      .map(p => (p.trim().match(/^(\w+)/) || [])[1])
      .filter(Boolean);
    created.set(m[1], params);
  }
  const gr = /grant\s+execute\s+on\s+function\s+public\.(\w+)\s*\(/gi;
  while ((m = gr.exec(sql)) !== null) granted.add(m[1]);
}

console.log('\n1. A migrációk tartalma');
ok(created.size > 0, 'találhatók függvények a migrációkban (' + created.size + ')');
ok(granted.size > 0, 'találhatók EXECUTE jogok (' + granted.size + ')');

console.log('\n2. Minden GRANT létező függvényre mutat');
{
  const hianyzo = [...granted].filter(g => !created.has(g));
  ok(hianyzo.length === 0,
     'nincs GRANT nem létező függvényre' + (hianyzo.length ? ' — ' + hianyzo.join(', ') : ''));
}

// ── 2) Amit a KLIENS hív ─────────────────────────────────────────
const clientFiles = fs.readdirSync(ROOT)
  .filter(f => /\.(js|html)$/.test(f))
  .filter(f => f !== 'rpw-config.staging.js');

const called = new Map();      // név → { fájl, paraméternevek }
for (const f of clientFiles) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // a kommenteket kihagyjuk — a magyarázatokban régi nevek is szerepelhetnek
  const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|--)/.test(l)).join('\n');
  const re = /\.rpc\(\s*['"](rpw[\w]*)['"]\s*(?:,\s*\{([^}]*)\})?/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const params = (m[2] || '').split(',')
      .map(p => (p.trim().match(/^(p_\w+)/) || [])[1])
      .filter(Boolean);
    if (!called.has(m[1])) called.set(m[1], { file: f, params });
  }
  // a rpw-data.js táblázatos formája: ['rpw_transition', { ... }]
  const re2 = /\[\s*['"](rpw[\w]*)['"]\s*,\s*\{([^}]*)\}/g;
  while ((m = re2.exec(code)) !== null) {
    const params = (m[2] || '').split(',')
      .map(p => (p.trim().match(/^(p_\w+)/) || [])[1])
      .filter(Boolean);
    if (!called.has(m[1])) called.set(m[1], { file: f, params });
  }
}

console.log('\n3. A kliens által hívott RPC-k mind léteznek');
{
  console.log('   hívott RPC-k: ' + [...called.keys()].sort().join(', '));
  const nemLetezo = [...called.keys()].filter(n => !created.has(n));
  ok(nemLetezo.length === 0,
     'a kliens NEM hív nem létező RPC-t' +
     (nemLetezo.length ? ' — ' + nemLetezo.map(n => n + ' (' + called.get(n).file + ')').join(', ') : ''));
}

console.log('\n4. A paraméternevek egyeznek');
{
  let baj = [];
  for (const [name, info] of called) {
    if (!created.has(name)) continue;
    const def = created.get(name);
    const ismeretlen = info.params.filter(p => def.indexOf(p) < 0);
    if (ismeretlen.length) baj.push(name + ' → ' + ismeretlen.join(','));
  }
  ok(baj.length === 0, 'nincs ismeretlen paraméternév' + (baj.length ? ' — ' + baj.join(' | ') : ''));
}

console.log('\n5. A kliens által hívott RPC-k engedélyezve vannak');
{
  // A KIVEZETETT utak szándékosan NEM kapnak jogot: nincs bennük
  // bérlővédelem. Léteznek (hogy a `v2` fejlesztői konfiguráció ne
  // szálljon el ismeretlen függvényre), de production-ban a hívásuk
  // jogosultsági hibát ad, nem adatszivárgást.
  const KIVEZETETT = ['rpw_patch','rpw_login','rpw_team','rpw_next_job_number'];
  const belso = n => /^rpw__/.test(n);
  const nemGrantolt = [...called.keys()]
    .filter(n => created.has(n) && !granted.has(n) && !belso(n)
                 && KIVEZETETT.indexOf(n) < 0);
  ok(nemGrantolt.length === 0,
     'minden AKTÍV hívott RPC-hez van GRANT' + (nemGrantolt.length ? ' — ' + nemGrantolt.join(', ') : ''));
  // …és a kivezetettek tényleg NEM kaptak jogot
  KIVEZETETT.forEach(n => {
    if (created.has(n)) ok(!granted.has(n), '  kivezetett, nincs GRANT: ' + n);
  });
}

console.log('\n6. A belső segédek NEM kaptak jogot');
{
  const kiszivargott = [...granted].filter(g => /^rpw__/.test(g));
  ok(kiszivargott.length === 0,
     'a rpw__ előtagú segédek nem hívhatók kívülről' +
     (kiszivargott.length ? ' — ' + kiszivargott.join(', ') : ''));
}

console.log('\n7. A régi, megszűnt RPC-nevek sehol nem szerepelnek');
{
  const HALOTT = ['rpw_complete_phase','rpw_close_job','rpw_skip_phase','rpw_create_rework',
                  'rpw_resolve_rework','rpw_manager_override','rpw_jobs_trashed',
                  'rpw_patch_secure','rpw_soft_delete','rpw_purge_all_trashed'];
  HALOTT.forEach(n => ok(!called.has(n), '  nincs hívás: ' + n));
}

console.log('\n8. Minden rollbackhez tartozik forward migráció');
{
  const fwd = new Set(migFiles.map(f => f.match(/^(\d+)_/)[1]));
  const rbs = fs.readdirSync(MIG).filter(f => /_rollback\.sql$/.test(f));
  ok(rbs.length === migFiles.length, 'ugyanannyi rollback, mint migráció');
  rbs.forEach(r => ok(fwd.has(r.match(/^(\d+)_/)[1]), '  ' + r + ' párja megvan'));
}

console.log('\n9. Minden migráció tranzakciós és van ellenőrzése');
{
  migFiles.forEach(f => {
    const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
    ok(/^\s*begin;/m.test(sql), '  ' + f + ': begin;');
    ok(/^\s*commit;/m.test(sql), '  ' + f + ': commit;');
    ok(/ELLENŐRZÉS/.test(sql), '  ' + f + ': ellenőrző lekérdezés');
  });
  // előfeltétel-ellenőrzés a függő migrációkban
  ['002_server_rpc.sql','003_business_requirements.sql','004_staff_posts_legacy.sql','005_rls_lockdown.sql'].forEach(f => {
    const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
    ok(/ELŐFELTÉTEL HIÁNYZIK/.test(sql), '  ' + f + ': előfeltétel-ellenőrzés');
  });
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
