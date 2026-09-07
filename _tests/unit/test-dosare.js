// L1-I: a kardosszie-sor sajat oszlopai es muveletei a KOZOS listaban
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
const cfg=fs.readFileSync('/mnt/user-data/outputs/rpw-L1F/rpw-config.js','utf8');

global.window={};
eval(cfg.replace(/\(function\(\)\{[\s\S]*?\}\)\(\);/,''));
const a=html.indexOf('window.acteCount='), b=html.indexOf('// === BELEPESI PONTOK', a);
eval(html.slice(a,b));
const acteCount=window.acteCount;

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(g===e,m+'  got='+JSON.stringify(g)+' exp='+JSON.stringify(e));

console.log('\n1. Iratszamlalo — AZONOS a dosszie-oldal szabalyaval');
// 2026-08-30: +1 kotelezo rekesz (foto_km) — a hat auto-foto hatodika
eq(acteCount({dosarStatus:'deschid'}).total,18,'deschid -> 18 tetel');
eq(acteCount({dosarStatus:'deschis'}).total,9,'deschis -> 8 + karszam = 9');
eq(acteCount({}).total,18,'dosarStatus nelkul -> a szigorubb (18)');

console.log('\n2. Szamlalas');
eq(acteCount({dosarStatus:'deschis'}).done,0,'ures -> 0');
eq(acteCount({dosarStatus:'deschis',nrDosar:'D-1'}).done,1,'karszam -> 1');
eq(acteCount({dosarStatus:'deschis',nrDosar:'D-1',
  dosarActe:{constatare_amiabila:[{url:'x'}]}}).done,2,'+ constatare -> 2');
eq(acteCount({dosarStatus:'deschis',nrDosar:'D-1',
  dosarActe:{constatare_amiabila:[{url:'x'}],foto_fata:[{url:'x'}],foto_spate:[{url:'x'}]}}).done,4,'+ 2 foto -> 4');
eq(acteCount({dosarStatus:'deschis',nrDosar:' '}).done,0,'csak szokoz -> nem szamit');
eq(acteCount({dosarStatus:'deschid',
  dosarActe:{pag_buletin:[{url:'x'}]}}).done,1,'deschid: buletin szamit');
eq(acteCount({dosarStatus:'deschis',
  dosarActe:{pag_buletin:[{url:'x'}]}}).done,0,'deschis: buletin NEM szamit (nem kotelezo)');

console.log('\n3. Nem hasal el');
[null,undefined,{},{dosarActe:null}].forEach(function(v,i){
  try{acteCount(v);ok(true,'bemenet #'+i)}catch(e){ok(false,'#'+i+' KIVETEL: '+e.message)}
});

console.log('\n4. EGY KOZOS LISTA — a dosszie-sor sajat oszlopai (Ferenc, 2026-08-26)');
// 2026-08-26 ("A"): a Status oszlop OSSZEVONVA a Proces oszloppal.
ok(html.indexOf("T('pr_proces')")>0,'PROCES oszlop a kozos listan');
ok(!/tab==='viitoare'\)\s*\?\s*'<th>'\+T\('pr_proces'\)\+'<\/th><th>'\+T\('col_status'\)/.test(html),
   '  a kulon Status oszlop megszunt');
ok(html.indexOf("setPanouTab(\\'dosare\\')")<0,'kulon Avizare dauna ful mar NINCS');
ok(/RPWProgres\.html\(j,\{T:T, acteCount:window\.acteCount/.test(html),
   'a dosszie-sor iratszamat a KOZOS folyamat-fuggveny adja');
ok(/tab==='viitoare'&&_dd\)\{[\s\S]{0,300}deschideDosar/.test(html.slice(html.indexOf('displayed.forEach'))),'  -> Deschide dosarul a fo muvelet');
ok(!/fx-b/.test(html),'a rendszam mellett tovabbra sincs jelveny');
ok(/if\(job\.flux==='doar_dosar'\) *return 'viitoare'/.test(html),'az ADATMODELL: a flux dont, a lista kozos');

console.log('\n5. Az Avizare dauna letrehozas KET utja — a FEJLECBEN');
{
  const _fb = html.indexOf('panou-hdr-actions');
  const fej = html.slice(_fb, html.indexOf('// Tabs', _fb));
  ok(/onclick="dosarTarziu\(\)"/.test(fej), '  Deschide dosar dauna -> dosarTarziu');
  ok(/onchange="dosarFisier\(event\)"/.test(fej), '  Preluare dosar dauna -> fajlbol');
  ok(!/showDosar|openDosarModal/.test(html),'a felugro ablak minden nyoma eltunt');
  ok(!/dosarAici/.test(html), 'a kivezetett harmadik ut sehol nem maradt (halott kod sem)');
  ok(!/dosar_aici/.test(html), '  a felirata sem');
  ok(/dosar_tarziu:\{ro:'Deschide dosar/.test(html), 'az elso gomb neve: Deschide dosar dauna');
  ok(/dosar_fisier:\{ro:'Preluare dosar/.test(html), 'a masodike: Preluare dosar dauna');
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
