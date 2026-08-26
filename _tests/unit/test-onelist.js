// L1-M: EGY KOZOS LISTA — Ferenc 2026-08-26-i dontese.
// A 2026-08-25-i K-19 (kulon "Avizare dauna" ful) visszavonva: a
// kardosszie es a jovobeli javitas UGYANABBAN a listaban el. A
// megkulonboztetes a SORON tortenik, nem kulon fulon.
//
// Ez a fajl a FORRAST nezi. A kirajzolt DOM-ot a
// _tests/frontend/test-fe-panou.js 2. szakasza meri (valodi jsdom).
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

console.log('\n1. Nincs tobbe kulon dosszie-ful');
ok(html.indexOf("setPanouTab(\\'dosare\\')")<0,'a ful gombja eltunt');
ok(!/tab==='dosare'\?dosare:/.test(html),'nincs kulon lista-ag');
ok(!/var dosare=jobs\.filter/.test(html),'nincs kulon dosszie-gyujtes');
ok(/if\(tab==='dosare'\)tab='viitoare'/.test(html),'a regi, elmentett fulnev a kozos listara vezet (nem ures kepernyore)');

console.log('\n2. A dosszie-utak a FEJLECBEN elnek');
ok(/panou-hdr-actions[\s\S]{0,900}onclick="dosarTarziu\(\)"/.test(html),'Avizare dauna gomb a fejlecben');
ok(/panou-hdr-actions[\s\S]{0,1400}onchange="dosarFisier\(event\)"/.test(html),'Preluare (fajl/OCR) ut a fejlecben');
ok(!/showDosar/.test(html),'a regi felugro modal minden nyoma eltunt');
ok(!/openDosarModal/.test(html),'  a nyito fuggveny is');

console.log('\n3. Az ADATMODELL: a flux dont, a kategoria kozos');
ok(/if\(job\.flux==='doar_dosar'\) *return 'viitoare'/.test(html),'doar_dosar -> viitoare');
ok(!/return 'dosare'/.test(html),"a 'dosare' kategoria megszunt");
ok(/job\.sosire==='ratat'\) *return 'ratate'/.test(html),'a ratat tovabbra is megelozi');

console.log('\n4. A SOR mondja meg, melyik melyik');
const sorok=html.slice(html.indexOf('displayed.forEach'));
ok(/RPWProgres\.html/.test(sorok),'a sorok a KOZOS folyamat-fuggvenyt hasznaljak');
ok(/st_predat|st_inchis/.test(html),'atadva / lezarva allapot is megjelenik');
ok(/pr_var_wa|pr_gata/.test(html),'a "varjuk az autot" allapot a sav feliratabol jon');
ok(/_ddRow\?' row-dd':''/.test(sorok),'a dosszie-sor sajat jelolest kap');
ok(/\.panou-row\.row-dd/.test(html),'  es van hozza CSS');

console.log('\n5. Biztositos javitas KET allapota a soron');
// 2026-08-26 ("A"): a ketallapotu JELVENY kivezetve — a szavai a
// folyamat-sav feliratanak elotagjai lettek (rpw-progres.js: procName).
ok(!/dd2-open|dd2-aviz|function ddBadge/.test(html),'a kulon jelveny kivezetve');
ok(/st_dosar_deschis/.test(html) && /st_avizare/.test(html),'  a ket felirat megmaradt (a sav elotagjakent)');

console.log('\n6. Muveletek soronkent');
ok(/tab==='viitoare'&&_dd\)\{[\s\S]{0,300}deschideDosar/.test(sorok),'dosszie-soron Deschide dosarul');
ok(/deschideLucrare/.test(html),'javitas-soron -> recepcio');
ok(!/fx-b/.test(html),'a rendszam melletti jelveny tovabbra sincs');

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
if(fail)process.exit(1);
