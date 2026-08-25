// L1-P: a programalt auto adatai javithatok
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
const a=html.indexOf('// === BELEPESI PONTOK'), b=html.indexOf('// === /BELEPESI PONTOK');

global.S={};global.JOBS=[];global.T=k=>k;global.escH=s=>String(s==null?'':s);
let LAST={};
global.toast=m=>{LAST.toast=m};global.render=()=>{};
global.saveJob=async j=>{LAST.saved=JSON.parse(JSON.stringify(j))};
global.freshJob=async id=>JOBS.filter(j=>j.id===id)[0];
global.document={getElementById:()=>null};global.location={assign:u=>{LAST.nav=u}};
global.RPWUtil={jobId:()=>'RPW-X'};global.njNextNumber=async()=>'MS-26-900';
global.njDay=o=>{const d=new Date();d.setDate(d.getDate()+o);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
global.syncMirror=j=>{if(!j.programare)j.programare={};
  j.programare.status=j.inchis?'arhivat':(j.sosire==='ratat'?'ratat':(j.sosire==='sosit'?'in_lucru':'viitor'));
  j.doarDosar=(j.flux==='doar_dosar');return j};
global.migrateState=j=>syncMirror(j);
global.categorizeJob=j=>'viitoare';
global.window=global;
eval(html.slice(a,b));

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(g===e,m+'  got='+JSON.stringify(g));

const base={id:'j1',number:'MS-26-041',plate:'MS-66-DBC',phone:'0742779601',client:'',auto:'',
  damageType:null,dosarStatus:null,flux:'reparatie',sosire:'programat',inchis:false,phase:1,
  programare:{date:'2026-08-29',time:'08:00',status:'viitor',reprogramari:2,istoric:[{din:'a',catre:'b'}]}};

console.log('\n1. Megnyitas — a meglevo adatokat tolti be');
JOBS=[JSON.parse(JSON.stringify(base))];
openEditJob('j1');
eq(S.njMode,'edit','edit mod');
eq(S.njEditId,'j1','a munka azonositoja');
eq(S.njPlate,'MS-66-DBC','rendszam betoltve');
eq(S.njPhone,'0742779601','telefon betoltve');
eq(S.njTip,'auto','tipus levezetve (damageType null -> auto)');

JOBS=[Object.assign({},base,{damageType:'asig',dosarStatus:'deschis',asigurator:'Groupama',nrDosar:'D-7'})];
openEditJob('j1');
eq(S.njTip,'asig','asig munka -> asig'); eq(S.njPay,'deschis','dosszie-allapot betoltve');
eq(S.njAsig,'Groupama','biztosito'); eq(S.njDosar,'D-7','karszam');

console.log('\n2. A DATUM nem szerkesztheto itt (a Reprogramare dolga)');
ok(!/if\(mode==='prog'\|\|mode==='lucrare'\|\|mode==='edit'\)\{[\s\S]{0,120}nj_date/.test(html),'a datumblokk NEM jelenik meg edit modban');
openEditJob('j1');
eq(S.njDate,'','a datummezo ures marad');
ok(njMissing().indexOf('nj_m_date')<0,'es nem is keri');

console.log('\n3. Mentes — csak az adatokat irja at');
(async()=>{
  JOBS=[JSON.parse(JSON.stringify(base))];
  openEditJob('j1');
  S.njPlate='MS-99-XYZ'; S.njPhone='0730111222'; S.njClient='Kovacs I.'; S.njAuto='Dacia Logan';
  await submitEditJob();
  const j=LAST.saved;
  eq(j.plate,'MS-99-XYZ','uj rendszam'); eq(j.phone,'0730111222','uj telefon');
  eq(j.client,'Kovacs I.','ugyfel'); eq(j.auto,'Dacia Logan','marka');
  eq(j.programare.date,'2026-08-29','A DATUM VALTOZATLAN');
  eq(j.programare.reprogramari,2,'az atutemezes-szamlalo VALTOZATLAN');
  eq(j.programare.istoric.length,1,'az elozmeny VALTOZATLAN');
  eq(j.sosire,'programat','a sav valtozatlan'); eq(j.flux,'reparatie','a flux valtozatlan');
  eq(j.number,'MS-26-041','a munkaszam valtozatlan');
  eq(j.id,'j1','NEM uj munka jott letre');
  eq(S.showNew,0,'modal bezarul');

  console.log('\n4. Tipusvaltas mentese');
  JOBS=[JSON.parse(JSON.stringify(base))];
  openEditJob('j1'); S.njTip='asig'; S.njPay='deschid'; S.njAsig='Allianz Tiriac'; S.njClient='Kovacs I.';
  await submitEditJob();
  eq(LAST.saved.damageType,'asig','auto -> asig');
  eq(LAST.saved.dosarStatus,'deschid','dosszie-allapot mentve');
  eq(LAST.saved.asigurator,'Allianz Tiriac','biztosito mentve');

  JOBS=[Object.assign({},JSON.parse(JSON.stringify(base)),{damageType:'asig',dosarStatus:'deschis',nrDosar:'D-7'})];
  openEditJob('j1'); S.njTip='auto';
  await submitEditJob();
  eq(LAST.saved.damageType,null,'asig -> auto');
  eq(LAST.saved.dosarStatus,null,'  a dosszie-allapot torlodik');

  console.log('\n5. Validacio ugyanaz, mint nyitaskor');
  JOBS=[JSON.parse(JSON.stringify(base))];
  openEditJob('j1'); S.njPlate='xx';
  ok(njMissing().indexOf('nj_m_plate')>=0,'rossz rendszam -> blokkol');
  openEditJob('j1'); S.njPhone='123';
  ok(njMissing().indexOf('nj_m_phone')>=0,'rossz telefon -> blokkol');
  openEditJob('j1'); S.njTip='asig'; S.njPay=null;
  ok(njMissing().indexOf('nj_m_pay')>=0,'asig dosszie-allapot nelkul -> blokkol');
  openEditJob('j1'); S.njTip='asig'; S.njPay='deschid'; S.njClient='';
  ok(njMissing().indexOf('nj_m_client')>=0,'ugyfelnev nelkul -> blokkol (uj szabaly)');
  openEditJob('j1'); S.njTip='asig'; S.njPay='deschis'; S.njDosar='';
  ok(njMissing().indexOf('nj_m_nrdosar')>=0,'"mar nyitva" karszam nelkul -> blokkol');

  console.log('\n6. Nem jelzi sajat magat duplikatumkent');
  JOBS=[JSON.parse(JSON.stringify(base))];
  openEditJob('j1');
  ok(njDup()===null,'a szerkesztett munka nem duplikatum');
  JOBS.push(Object.assign({},base,{id:'j2',plate:'MS-66-DBC'}));
  ok(njDup()!==null,'de egy MASIK ugyanolyan rendszam igen');

  console.log('\n7. Gomb a soron');
  ok((html.match(/eb-edit2/g)||[]).length>=4,'szerkeszto gomb mindket sortipuson + CSS');
  ok(/openEditJob\(\\'\'\+j\.id/.test(html),'a gomb a sor azonositojat adja at');

  console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
  process.exit(fail?1:0);
})();
