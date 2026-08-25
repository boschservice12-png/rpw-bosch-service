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

console.log('\n4. Az Avizare dauna FUL (K-19) — az osszevonas visszafordult');
ok(html.indexOf("T('col_status')")>0,'STATUS oszlop a viitoare es a dosare fulon');
ok(!/var deAzi=viitoare\.concat\(dosare\)/.test(html),'nincs tobbe osszevont lista');
ok(html.indexOf("setPanouTab(\\'dosare\\')")>=0,'a kulon Avizare dauna ful LETEZIK');
ok(/tab==='dosare'\)\{[\s\S]{0,600}acteCount/.test(html),'a dosar sor iratszamlalot mutat');
ok(/tab==='dosare'\)\{[\s\S]{0,300}deschideDosar/.test(html.slice(html.indexOf('displayed.forEach'))),'  -> Deschide dosarul a fo muvelet');
ok(!/fx-b/.test(html),'a rendszam mellett tovabbra sincs jelveny');
ok(/if\(job\.flux==='doar_dosar'\) *return 'dosare'/.test(html),'az ADATMODELL valtozatlan');

console.log('\n5. Az Avizare dauna letrehozas KET utja — a FULON (K-19)');
{
  // A felugro kek ablak kivezetve: a ket ut a ful muvelet-savjaban el.
  const _fb = html.indexOf("if(tab==='dosare'){");
  const ful = html.slice(_fb, html.indexOf('// Restante figyelmezteto', _fb));
  ok(/onclick="dosarTarziu\(\)"/.test(ful), '  Deschide dosar dauna -> dosarTarziu');
  ok(/onchange="dosarFisier\(event\)"/.test(ful), '  Preluare dosar dauna -> fajlbol');
  const gombok=(ful.match(/btn-prog-new/g)||[]).length;
  ok(gombok===2,'pontosan ket ut van a fulon ('+gombok+')');
  ok(!/showDosar|openDosarModal/.test(html),'a felugro ablak minden nyoma eltunt');
  ok(!/dosarAici/.test(html), 'a kivezetett harmadik ut sehol nem maradt (halott kod sem)');
  ok(!/dosar_aici/.test(html), '  a felirata sem');
  ok(/dosar_tarziu:\{ro:'Deschide dosar/.test(html), 'az elso gomb neve: Deschide dosar dauna');
  ok(/dosar_fisier:\{ro:'Preluare dosar/.test(html), 'a masodike: Preluare dosar dauna');
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
