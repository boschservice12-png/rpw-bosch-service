// L1-E: kesettseg-felismeres + atutemezes. A valos kodot vagja ki az index.html-bol.
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
const a=html.indexOf('// === PROGRAMARE IDO');
const b=html.indexOf('// === /PROGRAMARE IDO');
if(a<0||b<0){console.error('motor nem talalhato');process.exit(1)}

let NOW=new Date('2026-08-22T09:00:00');
global.Date=class extends Date{constructor(...x){if(x.length)super(...x);else super(NOW)}
  static now(){return NOW.getTime()}};
global.njDay=function(off){var d=new Date();d.setDate(d.getDate()+off);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
global.T=k=>k; global.escH=s=>String(s==null?'':s);
global.S={};global.JOBS=[];global.render=()=>{};global.toast=()=>{};
let SAVED=null; global.saveJob=async j=>{SAVED=j};
global.freshJob=async id=>JOBS.filter(j=>j.id===id)[0];
global.syncMirror=function(j){if(!j.programare)j.programare={};
  j.programare.status=j.inchis?'arhivat':(j.sosire==='ratat'?'ratat':(j.sosire==='sosit'?'in_lucru':'viitor'));return j};
global.window=global;
eval(html.slice(a,b));

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(g===e,m+'  got='+JSON.stringify(g));
const P=(date,extra)=>({programare:Object.assign({date:date,time:'08:00',status:'viitor'},extra||{})});

console.log('\n1. Delelott (09:00) — az aznapi meg NEM kesett');
NOW=new Date('2026-08-22T09:00:00');
eq(progInfo(P('2026-08-22')).state,'today','ma 08:00-ra programalva -> today');
eq(progInfo(P('2026-08-23')).state,'tomorrow','holnap -> tomorrow');
eq(progInfo(P('2026-08-29')).state,'future','jovo heten -> future');
eq(progInfo(P('2026-08-21')).state,'late','tegnap -> late');
eq(progInfo(P('2026-08-21')).days,1,'  1 nap keses');
eq(progInfo(P('2026-01-31')).days,203,'2026-01-31 -> 203 nap keses (MS-26-047/048)');
eq(progInfo({}).state,'nodate','datum nelkul -> nodate');
eq(progInfo({programare:{}}).state,'nodate','ures programare -> nodate');

console.log('\n2. Delutan (14:00) — DONTESED: az aznapi mar kesett');
NOW=new Date('2026-08-22T14:00:00');
eq(progInfo(P('2026-08-22')).state,'late','14:00-kor a mai mar late');
eq(progInfo(P('2026-08-22')).days,0,'  de 0 nap keses (nem tegnapi)');
eq(progInfo(P('2026-08-23')).state,'tomorrow','a holnapi delutan sem late');
NOW=new Date('2026-08-22T13:59:00');
eq(progInfo(P('2026-08-22')).state,'today','13:59-kor meg today — a kuszob pontos');

console.log('\n3. Sohasem ir automatikusan');
NOW=new Date('2026-08-22T16:00:00');
SAVED=null;
progInfo(P('2026-01-31'));
ok(SAVED===null,'a kesettseg-vizsgalat NEM ment semmit (nincs auto-ratat)');

console.log('\n4. Cella-megjelenites');
NOW=new Date('2026-08-22T09:00:00');
ok(/pg-azi/.test(progCell(P('2026-08-22'))),'mai -> kek Azi jelveny');
ok(/pg-late/.test(progCell(P('2026-08-01'))),'lejart -> piros jelveny');
ok(/pg-none/.test(progCell({})),'datum nelkul -> szurke');
ok(/08:00/.test(progCell(P('2026-08-22'))),'ido kiirva');
ok(/pg-repro/.test(progCell(P('2026-08-25',{reprogramari:2}))),'atutemezes-szamlalo latszik');
ok(!/pg-repro/.test(progCell(P('2026-08-25'))),'0 atutemezesnel nincs jelveny');

console.log('\n5. Atutemezes');
(async()=>{
  JOBS=[{id:'j1',plate:'MS-50-BSS',programare:{date:'2026-01-31',time:'08:00',status:'ratat'}}];
  S.showRepro='j1'; S.reproDate='2026-09-01'; S.reproTime='10:30';
  await saveRepro();
  eq(SAVED.programare.date,'2026-09-01','uj datum mentve');
  eq(SAVED.programare.time,'10:30','uj ido mentve');
  eq(SAVED.programare.status,'viitor','ratat -> visszakerul viitor-ba');
  eq(SAVED.programare.reprogramari,1,'szamlalo 1-re valt');
  eq(SAVED.programare.istoric.length,1,'elozmeny rogzitve');
  eq(SAVED.programare.istoric[0].din,'2026-01-31','  regi datum megorizve');
  eq(SAVED.programare.istoric[0].catre,'2026-09-01','  uj datum rogzitve');
  eq(S.showRepro,null,'modal bezarul');

  // masodik atutemezes ugyanarra
  JOBS=[SAVED]; S.showRepro='j1'; S.reproDate='2026-09-05';
  await saveRepro();
  eq(SAVED.programare.reprogramari,2,'masodik atutemezes -> 2');
  eq(SAVED.programare.istoric.length,2,'  ket elozmeny');

  // datum nelkul nem ment
  SAVED=null; S.showRepro='j1'; S.reproDate='';
  await saveRepro();
  ok(SAVED===null,'datum nelkul nem ment');

  console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
  process.exit(fail?1:0);
})();
