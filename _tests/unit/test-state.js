// L1-H: EGY ALLAPOT, EGY IGAZSAG — a valodi kodot vagja ki az index.html-bol.
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
const a=html.indexOf('function categorizeJob(job){');
const b=html.indexOf('\n// ── ',a)>0?html.indexOf('function syncMirror'):0;
const cat=html.slice(a, html.indexOf('\n}\n', html.indexOf('function syncMirror'))+3);

global.window={RPWWorkflow:null};
eval(cat);

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(g===e,m+'  got='+JSON.stringify(g)+' exp='+JSON.stringify(e));

console.log('\n1. Migracio a REGI adatbol (a te 9 dossziad mintaja)');
let j;
j=migrateState({phase:0,programare:{status:'viitor'}});
eq(j.sosire,'programat','phase 0 + viitor -> programat');
eq(j.flux,'reparatie','  flux=reparatie');
eq(j.phase,1,'  phase 0 -> 1 (SOHA nem marad 0)');

j=migrateState({phase:1,programare:{status:'in_lucru'}});
eq(j.sosire,'sosit','in_lucru -> sosit');

j=migrateState({phase:2,programare:{status:'ratat'}});
eq(j.sosire,'ratat','ratat -> ratat');

j=migrateState({phase:7,programare:{status:'arhivat'}});
eq(j.inchis,true,'arhivat -> inchis');

j=migrateState({phase:7,phases:{7:{status:'done'}},programare:{}});
eq(j.inchis,true,'phases[7]=done -> inchis');

j=migrateState({phase:1,doarDosar:true,programare:{status:'viitor'}});
eq(j.flux,'doar_dosar','doarDosar=true -> flux=doar_dosar');

console.log('\n2. A HARMADSZOR visszajott ellentmondas MEGSZUNIK');
// MS-26-041: phase=1 de status=viitor -> a regi modellben ket igazsag volt
j=migrateState({phase:1,programare:{status:'viitor'}});
eq(categorizeJob(j),'viitoare','phase 1 + viitor -> egyertelmuen viitoare');
eq(j.programare.status,'viitor','  a tukor is konzisztens');
// MS-26-005: doarDosar + phase 1
j=migrateState({phase:1,doarDosar:true,programare:{status:'in_lucru'}});
// 2026-08-26 (Ferenc): EGY kozos lista — a dosszie is a 'viitoare'-ba
// kerul. A megkulonboztetes a SORON tortenik (iratszamlalo, kek jeloles,
// "Deschide dosarul" fo muvelet), nem kulon kategoriaval.
eq(categorizeJob(j),'viitoare','csak-dosszie -> a KOZOS listaba');

console.log('\n3. categorizeJob — egyetlen lanc, determinisztikus');
const C=o=>categorizeJob(migrateState(o));
eq(C({separat:true,phase:1,programare:{}}),'separat','separat mindent megelozi');
eq(C({inchis:true,phase:7,programare:{}}),'arhivate','inchis -> arhivate');
eq(C({sosire:'ratat',flux:'doar_dosar',inchis:false,phase:1}),'ratate','ratat megelozi a dossziet is');
eq(C({sosire:'sosit',flux:'doar_dosar',inchis:false,phase:1}),'viitoare','sosit + doar_dosar -> a kozos lista (a flux dont, nem az erkezes)');
eq(C({sosire:'programat',flux:'reparatie',inchis:false,phase:1}),'viitoare','programat -> viitoare');
eq(C({sosire:'sosit',flux:'reparatie',inchis:false,phase:3}),'lucrari','sosit + reparatie -> lucrari');

console.log('\n4. Idempotens — barhanyszor futhat');
let x={phase:0,programare:{status:'viitor'}};
migrateState(x); const s1=JSON.stringify(x);
migrateState(x); migrateState(x);
eq(JSON.stringify(x),s1,'harom futas utan is ugyanaz');

console.log('\n5. A tukor (regi mezo) mindig konzisztens');
j=migrateState({sosire:'sosit',flux:'reparatie',inchis:false,phase:2});
eq(j.programare.status,'in_lucru','sosit -> tukor in_lucru');
j=migrateState({sosire:'ratat',flux:'reparatie',inchis:false,phase:1});
eq(j.programare.status,'ratat','ratat -> tukor ratat');
j=migrateState({sosire:'sosit',flux:'reparatie',inchis:true,phase:7});
eq(j.programare.status,'arhivat','inchis -> tukor arhivat');
j=migrateState({flux:'doar_dosar',sosire:'programat',inchis:false,phase:1});
eq(j.doarDosar,true,'doarDosar tukor is stimmel');

console.log('\n6. Semmilyen bemenet nem hasal el');
[null,undefined,{},{phase:'x'},{programare:null},{phases:{}}].forEach(function(v,i){
  try{ migrateState(v); ok(true,'bemenet #'+i+' rendben'); }
  catch(e){ ok(false,'bemenet #'+i+' KIVETEL: '+e.message); }
});

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
