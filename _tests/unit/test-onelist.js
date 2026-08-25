// L1-M: egy lista, savonkent mas status
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

console.log('\n1. A ket lista OSSZEVONVA a nezetben');
ok(/var deAzi=viitoare\.concat\(dosare\)/.test(html),'viitoare + dosare egy listaban');
ok(/deAzi=viitoare\.concat\(dosare\)\.sort/.test(html) && /\)\.date\)\|\|'9999/.test(html),'datum szerint rendezve');
ok(/tab==='dosare'\)tab='viitoare'/.test(html),'a regi Dosare ful atiranyit (nem hasal el)');
ok(html.indexOf("setPanouTab(\\'dosare\\')")<0,'a Dosare ful gombja eltunt');
ok(/tab-count">'\+deAzi\.length/.test(html),'a szamlalo osszeadja a kettot');

console.log('\n2. Az ADATMODELL erintetlen — csak a nezet kozos');
ok(/categorizeJob\(j\)==='dosare'/.test(html),'categorizeJob tovabbra is kulon kezeli');
ok(/if\(job\.flux==='doar_dosar'\) *return 'dosare'/.test(html),'a dontesi lanc valtozatlan');

console.log('\n3. Savonkent mas status');
ok(/if\(_dd\)\{[\s\S]{0,400}acteCount/.test(html),'dosar sor -> iratszamlalo');
ok(/st_predat|st_inchis/.test(html),'atadva / lezarva allapot is megjelenik');
ok(/\} else \{[\s\S]{0,200}st_astept/.test(html),'programare sor -> "varjuk az autot"');
ok(/T\('col_status'\)/.test(html),'egyetlen STATUS oszlop');
ok(!/tab==='dosare'\s*\n?\s*\? *'<th>'\+T\('col_asig'\)/.test(html),'a kulon ASIGURATOR/ACTE oszloppar megszunt');

console.log('\n4. Jelveny mondja meg, melyik sav');
ok(/fx-b fx-d/.test(html),'dosar jelveny');
ok(/fx-b fx-p/.test(html),'programare jelveny');
ok(/j\.flux==='doar_dosar'\)\|\|\(j\.flux==null&&j\.doarDosar===true\)/.test(html),'regi mezovel is mukodik');

console.log('\n5. Muveletek soronkent');
ok(/tab==='viitoare' && _dd/.test(html),'dosar soron sajat gombsor');
ok(/deschideDosar/.test(html),'  -> Deschide dosarul');
ok(/deschideLucrare/.test(html),'programare soron -> recepcio');

console.log('\n6. Az atnevezes');
const m=html.match(/deschide_lucrarea:\{ro:'([^']+)'[^}]*hu:'([^']+)'/);
ok(!!m,'kulcs megvan');
ok(m&&/Recep/i.test(m[1]),'RO: "'+(m?m[1]:'')+'"');
ok(m&&/atvetel|átvétel/i.test(m[2]),'HU: "'+(m?m[2]:'')+'"');
ok(/nj_open_prog|nj_open_dosar|nj_open_lucrare/.test(html),'a modal mentes-gombja mod-fuggo');
ok(/T\('nj_open_'\+mode\)/.test(html),'  a gomb tenyleg a modot hasznalja');

console.log('\n7. A restant figyelmezteto az osszevont listat nezi');
ok(/restN=deAzi\.filter/.test(html),'restant szamlalo az egesz listan');

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
