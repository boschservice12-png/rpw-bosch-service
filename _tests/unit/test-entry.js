// L1-H: a harom belepesi pont
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
const a=html.indexOf('// === BELEPESI PONTOK'), b=html.indexOf('// === /BELEPESI PONTOK');

global.S={};global.JOBS=[];global.T=k=>k;global.escH=s=>String(s==null?'':s);
let LAST={};
global.toast=m=>{LAST.toast=m};global.render=()=>{};
global.saveJob=async j=>{LAST.saved=j};
global.document={getElementById:()=>null};
global.location={assign:u=>{LAST.nav=u}};
let _id=0;global.RPWUtil={jobId:()=>'RPW-T'+(++_id)};
global.njDay=function(o){var d=new Date();d.setDate(d.getDate()+o);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
global.njNextNumber=async()=>'MS-26-900';
global.syncMirror=function(j){if(!j.programare)j.programare={};
  j.programare.status=j.inchis?'arhivat':(j.sosire==='ratat'?'ratat':(j.sosire==='sosit'?'in_lucru':'viitor'));
  j.doarDosar=(j.flux==='doar_dosar');return j};
global.categorizeJob=j=>{
  if(j.inchis)return 'arhivate'; if(j.sosire==='ratat')return 'ratate';
  if(j.flux==='doar_dosar')return 'dosare';
  if(j.sosire==='programat')return 'viitoare'; return 'lucrari'};
global.window=global;
eval(html.slice(a,b));

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(g===e,m+'  got='+JSON.stringify(g));

console.log('\n1. A gomb donti el a fluxot');
openNewJob('prog');    eq(S.njMode,'prog','Programare noua'); eq(S.njTip,null,'  tipus nyitva'); eq(S.njDate,'','  datum ures');
openNewJob('dosar');   eq(S.njMode,'dosar','Deschide dosar'); eq(S.njTip,'asig','  a dosar mindig asig');
openNewJob('lucrare'); eq(S.njMode,'lucrare','Lucrare noua'); eq(S.njDate,njDay(0),'  datum alapbol MA');

console.log('\n2. Kotelezo mezok modonkent');
function fill(mode,o){openNewJob(mode);S.njPlate='MS-50-BSS';S.njPhone='0740123456';Object.assign(S,o||{});return njMissing()}
ok(fill('prog',{njDate:njDay(1)}).indexOf('m_m_tip')>=0,'prog: MOST MAR keri a tipust');
ok(fill('prog',{njDate:njDay(1),njTip:'auto'}).length===0,'prog + sajat zseb -> mehet');
ok(fill('prog',{njDate:njDay(1),njTip:'asig'}).indexOf('nj_m_pay')>=0,'prog + asig -> keri a dosszie-allapotot');
ok(fill('prog',{njDate:njDay(1),njTip:'asig',njPay:'deschis',njDosar:'D-1',njClient:'Kovacs'}).length===0,'  megadva + nevvel -> mehet');
ok(fill('prog',{njTip:'auto'}).indexOf('nj_m_date')>=0,'prog: datum nelkul blokkol');
ok(fill('dosar',{njPay:'deschid'}).indexOf('nj_m_client')>=0,'dosar: UGYFELNEV is kell (uj szabaly)');
ok(fill('dosar',{njPay:'deschid',njClient:'Kovacs'}).length===0,'  nevvel mehet');
ok(fill('dosar',{}).indexOf('nj_m_pay')<0,'dosar: NEM kerdez dosszie-allapotot (mi nyitjuk)');
ok((openNewJob('dosar'),S.njPay)==='deschid','  automatikusan deschid');
ok(fill('dosar',{njPay:'deschis'}).indexOf('nj_m_nrdosar')>=0,'dosar: "mar nyitva" -> karszam kell');
ok(fill('lucrare',{}).indexOf('m_m_tip')>=0,'lucrare: tipus nelkul blokkol');
ok(fill('lucrare',{njTip:'auto'}).length===0,'lucrare + sajat zseb: nem kerdez dossziet');
ok(fill('lucrare',{njTip:'asig'}).indexOf('nj_m_pay')>=0,'lucrare + asig: KERDEZI a dosszie-allapotot');
ok(fill('lucrare',{njTip:'asig',njPay:'deschid',njClient:'Kovacs'}).length===0,'  megadva + nevvel -> mehet');

console.log('\n3. njSetTip: auto valasztaskor a dosszie-allapot torlodik');
openNewJob('lucrare');S.njPay='deschis';njSetTip('auto');
eq(S.njPay,null,'auto -> njPay torolve');

console.log('\n4. A harom mentes eredmenye');
(async()=>{
  async function mk(mode,o){JOBS.length=0;LAST={};openNewJob(mode);
    S.njPlate='MS-50-BSS';S.njPhone='0740123456';Object.assign(S,o||{});
    await submitNewJob();return LAST.saved}
  let j;

  j=await mk('prog',{njDate:njDay(1),njTip:'auto'});
  ok(!!j,'[prog] letrejott');
  eq(j.sosire,'programat','  sosire=programat'); eq(j.flux,'reparatie','  flux=reparatie');
  eq(j.phase,1,'  phase=1 (nem 0!)'); eq(j.phases[1].status,'pending','  phases[1]=pending');
  eq(j.inchis,false,'  nincs lezarva'); eq(categorizeJob(j),'viitoare','  -> Viitoare');
  eq(j.programare.status,'viitor','  tukor ok'); ok(!LAST.nav,'  nem navigal');

  j=await mk('dosar',{njPay:'deschis',njDosar:'D-77',njAsig:'Groupama',njClient:'Kovacs'});
  ok(!!j,'[dosar] letrejott');
  eq(j.flux,'doar_dosar','  flux=doar_dosar'); eq(j.damageType,'asig','  asig');
  eq(j.dosarStatus,'deschis','  dosarStatus'); eq(j.nrDosar,'D-77','  karszam');
  eq(j.phase,1,'  phase=1'); eq(j.phases[1].status,'pending','  a javitas NEM indul');
  eq(categorizeJob(j),'dosare','  -> Dosare ful');
  // 2026-08-25: a dosszie mentese a DOSSZIE lapjara visz, nem a listara
  ok(/rpw-dosar\.html/.test(LAST.nav||''),'  a dosszie lapjara navigal');
  ok(/job=/.test(LAST.nav||''),'  a munka azonositojaval');

  j=await mk('lucrare',{njTip:'auto'});
  ok(!!j,'[lucrare/auto] letrejott');
  eq(j.sosire,'sosit','  sosire=sosit'); eq(j.flux,'reparatie','  flux=reparatie');
  eq(j.damageType,null,'  sajat zseb -> damageType null');
  eq(j.phases[1].status,'active','  phases[1]=active');
  eq(j.programare.status,'in_lucru','  tukor in_lucru');
  eq(categorizeJob(j),'lucrari','  -> Lucrari');
  ok(/rpw-recepcio-red\.html/.test(LAST.nav||''),'  recepciora navigal');

  j=await mk('lucrare',{njTip:'asig',njPay:'deschid',njAsig:'Allianz Tiriac',njClient:'Kovacs'});
  eq(j.damageType,'asig','[lucrare/asig] asig'); eq(j.dosarStatus,'deschid','  dosarStatus=deschid');
  eq(j.nrDosar,'','  karszam meg ures — helyes');
  eq(j.programare.date,njDay(0),'  datum: ma');

  console.log('\n5. Regi hivasok elnek');
  openProgModal();   eq(S.njMode,'prog','openProgModal -> prog');
  startReceptie();   eq(S.njMode,'lucrare','startReceptie -> lucrare');
  openNewJobRec();   eq(S.njMode,'lucrare','openNewJobRec -> lucrare');

  console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
  process.exit(fail?1:0);
})();
