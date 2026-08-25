// L1-I: a Dosare dauna ful sajat oszlopai es muveletei
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
eq(acteCount({dosarStatus:'deschid'}).total,17,'deschid -> 17 tetel');
eq(acteCount({dosarStatus:'deschis'}).total,8,'deschis -> 7 + karszam = 8');
eq(acteCount({}).total,17,'dosarStatus nelkul -> a szigorubb (17)');

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

console.log('\n4. Az OSSZEVONT nezet (L1-M) — a kulon ful helyett');
ok(html.indexOf("T('col_status')")>0,'egyetlen STATUS oszlop');
ok(/var deAzi=viitoare\.concat\(dosare\)/.test(html),'a ket lista egy nezetben');
ok(html.indexOf("setPanouTab(\\'dosare\\')")<0,'a kulon Dosare ful megszunt');
ok(/tab==='viitoare' && _dd/.test(html),'a dosar SOR sajat agat kap');
ok(/tab==='viitoare' && _dd[\s\S]{0,300}deschideDosar/.test(html),'  -> Deschide dosarul a fo muvelet');
ok(/if\(_dd\)\{[\s\S]{0,400}acteCount/.test(html),'a dosar sor iratszamlalot mutat');
// 2026-08-25: a rendszam melletti 📁/📅 jelveny KIKERULT — felesleges volt.
// A ket sav megkulonboztetese enelkul is egyertelmu, es EZT kotjuk ki:
ok(!/fx-b/.test(html),'a rendszam mellett nincs tobbe jelveny');
ok(/_dd\?'row-dosar'|_dd/.test(html),'  a dosar sor sajat agat kap (kiemeles)');
ok(/if\(_dd\)\{[\s\S]{0,400}acteCount/.test(html),'  iratszamlalot mutat');
ok(/tab==='viitoare' && _dd[\s\S]{0,300}deschideDosar/.test(html),'  es Deschide dosarul a fo muvelete');
ok(/if\(job\.flux==='doar_dosar'\) *return 'dosare'/.test(html),'az ADATMODELL valtozatlan');

console.log('\n5. Az Avizare dauna ablak KET utat kinal (2026-08-25)');
{
  // A harmadik gomb („Auto este aici — receptie acum") kikerult: az a ZOLD
  // „Lucrare noua" gomb dolga, nem az avizalase. Ami maradt:
  //   • Deschide dosar dauna  -> mi nyitjuk (openNewJob('dosar'))
  //   • Preluare dosar dauna  -> meglevo constatare/PV atvetele fajlbol
  // FIGYELEM: a `h+=newJobModalHtml()` KETSZER szerepel a fajlban (a lista-
  // nezetben is), ezert a zaro hatart a nyito hatartol KELL keresni.
  const _mb = html.indexOf('if(S.showDosar)');
  const modal = html.slice(_mb, html.indexOf('h+=newJobModalHtml()', _mb));
  const gombok = (modal.match(/btn-prog-new/g)||[]).length;
  ok(gombok === 2, 'pontosan ket ut van az ablakban (' + gombok + ')');
  ok(/onclick="dosarTarziu\(\)"/.test(modal), '  Deschide dosar dauna -> dosarTarziu');
  ok(/onchange="dosarFisier\(event\)"/.test(modal), '  Preluare dosar dauna -> fajlbol');
  ok(!/dosarAici/.test(html), 'a kivezetett harmadik ut sehol nem maradt (halott kod sem)');
  ok(!/dosar_aici/.test(html), '  a felirata sem');
  ok(/dosar_tarziu:\{ro:'Deschide dosar/.test(html), 'az elso gomb neve: Deschide dosar dauna');
  ok(/dosar_fisier:\{ro:'Preluare dosar/.test(html), 'a masodike: Preluare dosar dauna');
  // a kerdes a KET megmarado uthoz szol, nem a kivezetetthez
  ok(!/dosar_q:\{ro:'Autovehiculul este in service/.test(html),
     'a kerdes nem a kivezetett gombra kerdez tobbe');
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
