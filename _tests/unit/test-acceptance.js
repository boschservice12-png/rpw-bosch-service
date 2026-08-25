// ============================================================
//  ÁTVÉTELI TESZT — minden funkciót VÉGREHAJT, nem csak keres.
//  A ténylegesen kiszolgált index.html-t hajtja meg jsdom-ban.
// ============================================================
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};const {JSDOM}=require('jsdom');
let html=fs.readFileSync('index.html','utf8');
html=html.replace(/<script[^>]+src=[^>]*><\/script>/g,'');

// ── szerver-báb: memóriában tartja a munkákat
let DB=[];
const STUB=`<script>
window.__db=[];
window.supabase={createClient:function(){return{
  from:function(){return{
    select:function(){return{is:function(){return{order:function(){return Promise.resolve({data:window.__db.map(function(d){return{id:d.id,data:d}}),error:null})}}},order:function(){return Promise.resolve({data:[],error:null})}}},
    upsert:function(){return Promise.resolve({error:null})},
    update:function(){return{eq:function(){return Promise.resolve({error:null})}}}
  }},
  rpc:function(n){ if(n==='rpw_next_job_number')return Promise.resolve({data:'MS-26-'+String(900+window.__db.length),error:null});
                   return Promise.resolve({data:null,error:null}) }
}}};
window.RPW_CFG={SB_URL:'https://x.supabase.co',SB_KEY:'k',BUCKET:'b'};
window.RPWDb={
  listActive:function(){return Promise.resolve(window.__db.slice())},
  patch:function(){return Promise.resolve()}, patchV2:function(){return Promise.resolve()},
  save:function(sb,j){ var i=window.__db.findIndex(function(x){return x.id===j.id});
    if(i>=0)window.__db[i]=j; else window.__db.push(j); return Promise.resolve({ok:true}) }
};
window.RPWUtil={jobId:function(){return 'J'+(window.__db.length+1)+'-'+Math.floor(Math.random()*1e6)}};
window.RPWWorkflow={migrateJob:function(){},phaseStatus:function(){return 'pending'}};
</script>`;
html=html.replace('</head>',STUB+'</head>');

// A jsdom nem hajt vegre navigaciot, de JELZI. Ezt fogjuk el.
// FIGYELEM: a jelzes NEM tartalmazza a cel URL-t — a jsdom nem adja meg,
// es a location.assign sem kicserelheto (belso wrapper). Ezert itt CSAK
// azt allitjuk, hogy navigalt-e. A cel URL-t a test-entry.js meri, ahol
// a location egy sima Node-global, tehat elkaphato.
const {VirtualConsole}=require('jsdom');
let NAV=null;
const vc=new VirtualConsole();
vc.on('jsdomError',function(e){
  if(/navigation to another Document/i.test(e.message||''))NAV='navigare';
});
vc.on('error',function(){}); vc.on('warn',function(){}); vc.on('info',function(){});
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.test/index.html',virtualConsole:vc});
const w=dom.window;
w.open=function(){};

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('   ✗ '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'   got='+JSON.stringify(g)+' exp='+JSON.stringify(e));
const grp=n=>console.log('\n'+n);
const app=()=>w.document.getElementById('app').innerHTML;
const today=()=>w.njDay(0);

// saveJob felülírása: memóriába ment
function hookSave(){
  w.saveJob=async function(j){
    var i=w.__db.findIndex(function(x){return x.id===j.id});
    if(i>=0)w.__db[i]=j; else w.__db.push(j);
    var k=w.JOBS.findIndex(function(x){return x.id===j.id});
    if(k>=0)w.JOBS[k]=j;
    return {ok:true};
  };
  w.freshJob=async function(id){ return w.JOBS.filter(function(x){return x.id===id})[0] };
}

// egy munka létrehozása a modálon keresztül
async function nyit(mode,f){
  w.openNewJob(mode);
  Object.assign(w.S,f||{});
  await w.submitNewJob();
  return w.JOBS[w.JOBS.length-1];
}

setTimeout(async ()=>{
try{
  hookSave();
  w.S.screen='panou'; w.JOBS.length=0; w.__db.length=0;

  // ══════════════════════════════════════════════════════════
  grp('1 · PROGRAMARE NOUĂ — az autó később jön');
  let j=await nyit('prog',{njPlate:'MS-10-AAA',njPhone:'0740111111',njTip:'auto',njDate:w.njDay(2)});
  ok(!!j,'létrejött');
  eq(j.sosire,'programat','sosire=programat');
  eq(j.flux,'reparatie','flux=reparatie');
  eq(j.phase,1,'phase=1 (soha nem 0)');
  eq(j.phases[1].status,'pending','a javítás NEM indul el');
  eq(j.damageType,null,'saját zseb → damageType null');
  eq(j.programare.date,w.njDay(2),'a dátum eltárolva');
  eq(w.categorizeJob(j),'viitoare','→ Lucrări viitoare');
  ok(NAV===null,'nem navigál el');

  grp('2 · DESCHIDE DOSAR DAUNĂ — csak ügyintézés');
  NAV=null;
  j=await nyit('dosar',{njPlate:'MS-20-BBB',njPhone:'0740222222',njAsig:'Groupama',njClient:'Nagy Z.'});
  ok(!!j,'létrejött');
  eq(j.flux,'doar_dosar','flux=doar_dosar');
  eq(j.damageType,'asig','asig');
  eq(j.dosarStatus,'deschid','automatikusan "mi nyitjuk"');
  eq(j.phases[1].status,'pending','a javítás NEM indul el');
  eq(w.categorizeJob(j),'dosare','külön kategória');
  // 2026-08-25: az alkalmi dossziénál a MUNKA a biztosítói iratokkal van,
  // ezért a mentés a dosszié lapjára visz. (Cél URL: test-entry.js)
  ok(NAV!==null,'a dosszié lapjára navigál');

  grp('3 · LUCRARE NOUĂ — az autó itt van');
  NAV=null;
  j=await nyit('lucrare',{njPlate:'MS-30-CCC',njPhone:'0740333333',njTip:'auto',njDate:today()});
  eq(j.sosire,'sosit','sosire=sosit');
  eq(j.phases[1].status,'active','a recepció ELINDUL');
  eq(j.conditions.whatsapp,true,'a feltételek beállnak');
  eq(w.categorizeJob(j),'lucrari','→ Lucrări képernyő');
  ok(NAV!==null,'átvisz a recepcióra (cél URL: test-entry.js)');

  // ══════════════════════════════════════════════════════════
  grp('4 · A KAPUK — nem enged hiányos adatot');
  const probe=(mode,f)=>{ w.openNewJob(mode); Object.assign(w.S,f||{}); return w.njMissing() };
  ok(probe('prog',{}).length>=3,'üres modál → több hiány');
  ok(probe('prog',{njPlate:'xx',njPhone:'0740111111',njTip:'auto',njDate:today()}).length>0,'rossz rendszám → blokkol');
  ok(probe('prog',{njPlate:'MS-10-AAA',njPhone:'123',njTip:'auto',njDate:today()}).length>0,'rossz telefon → blokkol');
  ok(probe('prog',{njPlate:'MS-10-AAA',njPhone:'0740111111',njDate:today()}).length>0,'típus nélkül → blokkol');
  ok(probe('prog',{njPlate:'MS-10-AAA',njPhone:'0740111111',njTip:'auto'}).length>0,'dátum nélkül → blokkol');
  ok(probe('lucrare',{njPlate:'MS-40-DDD',njPhone:'0740444444',njTip:'asig',njPay:'deschis',njClient:'X',njDate:today()}).length>0,'"már nyitva" kárszám nélkül → blokkol');
  ok(probe('lucrare',{njPlate:'MS-40-DDD',njPhone:'0740444444',njTip:'asig',njPay:'deschid',njDate:today()}).length>0,'dosszié ügyfélnév nélkül → blokkol');
  eq(probe('lucrare',{njPlate:'MS-40-DDD',njPhone:'0740444444',njTip:'asig',njPay:'deschid',njClient:'Kiss',njDate:today()}),[],'minden megvan → mehet');

  grp('5 · RENDSZÁM-NORMALIZÁLÁS');
  eq(w.njPlate('ms10aaa'),'MS-10-AAA','ms10aaa → MS-10-AAA');
  eq(w.njPlate('MS 10 AAA'),'MS-10-AAA','szóközös → kötőjeles');
  eq(w.njPlate('b123xyz'),'B-123-XYZ','bukaresti');

  // ══════════════════════════════════════════════════════════
  grp('6 · ESET-AZONOSSÁG — egy autó, több párhuzamos eset');
  w.JOBS.length=0; w.__db.length=0;
  await nyit('lucrare',{njPlate:'MS-77-EEE',njPhone:'0740777777',njTip:'asig',njPay:'deschis',njDosar:'G-1',njAsig:'Groupama',njClient:'A',njDate:today()});
  await nyit('lucrare',{njPlate:'MS-77-EEE',njPhone:'0740777777',njTip:'asig',njPay:'deschis',njDosar:'A-9',njAsig:'Allianz',njClient:'A',njDate:today()});
  eq(w.JOBS.length,2,'két külön eset ugyanazon az autón LÉTREJÖTT');
  w.openNewJob('lucrare'); Object.assign(w.S,{njPlate:'MS-77-EEE',njTip:'asig',njAsig:'Omniasig',njDosar:'O-5'});
  ok(w.njDup()===null,'harmadik biztosító → NEM duplikátum');
  eq(w.njOpenCases?w.njOpenCases().length:2,2,'de felsorolja a két nyitott esetet');
  w.openNewJob('lucrare'); Object.assign(w.S,{njPlate:'MS-77-EEE',njTip:'asig',njAsig:'GROUPAMA',njDosar:' g-1 '});
  ok(w.njDup()!==null,'ugyanaz az eset (kis/nagybetű, szóköz) → DUPLIKÁTUM');
  ok(w.njMissing().length>0,'  és nem is menthető');

  grp('7 · ÁTÜTEMEZÉS — számolja és megjegyzi');
  w.JOBS.length=0; w.__db.length=0;
  j=await nyit('prog',{njPlate:'MS-50-FFF',njPhone:'0740555555',njTip:'auto',njDate:w.njDay(1)});
  const id=j.id, regi=j.programare.date;
  w.openRepro(id); w.S.reproDate=w.njDay(5); w.S.reproTime='10:30';
  await w.saveRepro();
  j=w.JOBS.filter(x=>x.id===id)[0];
  eq(j.programare.date,w.njDay(5),'új dátum');
  eq(j.programare.time,'10:30','új idő');
  eq(j.programare.reprogramari,1,'a számláló 1');
  eq(j.programare.istoric.length,1,'előzmény rögzítve');
  eq(j.programare.istoric[0].din,regi,'  a régi dátum megőrizve');
  w.openRepro(id); w.S.reproDate=w.njDay(9); await w.saveRepro();
  eq(w.JOBS.filter(x=>x.id===id)[0].programare.reprogramari,2,'második átütemezés → 2');

  grp('8 · ADATJAVÍTÁS — a dátumhoz nem nyúl');
  w.openEditJob(id);
  eq(w.S.njMode,'edit','szerkesztő mód');
  eq(w.S.njPlate,'MS-50-FFF','betölti a meglévő adatot');
  eq(w.S.njDate,'','a dátummező üres — ide nem tartozik');
  w.S.njPlate='MS-51-FFF'; w.S.njClient='Szabó P.';
  await w.submitEditJob();
  j=w.JOBS.filter(x=>x.id===id)[0];
  eq(j.plate,'MS-51-FFF','rendszám javítva');
  eq(j.client,'Szabó P.','ügyfél javítva');
  eq(j.programare.date,w.njDay(9),'A DÁTUM VÁLTOZATLAN');
  eq(j.programare.reprogramari,2,'a számláló VÁLTOZATLAN');
  eq(j.number,w.__db.filter(x=>x.id===id)[0].number,'a munkaszám VÁLTOZATLAN');

  grp('9 · RATAT ÉS VISSZAHOZÁS');
  await w.markRatat(id);
  j=w.JOBS.filter(x=>x.id===id)[0];
  eq(j.sosire,'ratat','ratat állapot');
  eq(w.categorizeJob(j),'ratate','→ Ratate fül');
  eq(j.programare.status,'ratat','a régi mező is szinkronban');
  await w.reactiveaza(id);
  j=w.JOBS.filter(x=>x.id===id)[0];
  eq(j.sosire,'programat','visszahozva');
  eq(w.categorizeJob(j),'viitoare','→ újra Viitoare');

  grp('10 · A WHATSAPP-KAPU');
  w.JOBS.length=0; w.__db.length=0;
  j=await nyit('prog',{njPlate:'MS-60-GGG',njPhone:'0740666666',njTip:'auto',njDate:today()});
  eq(j.conditions.whatsapp,false,'új előjegyzésnél még nincs kapcsolat');
  NAV=null;
  await w.deschideLucrare(j.id);
  ok(NAV===null,'kapcsolat nélkül NEM enged recepcióra');
  eq(w.JOBS[0].sosire,'programat','  és nem is állítja át');
  await w.clickWhatsApp(j.id,'0740666666');
  eq(w.JOBS[0].conditions.whatsapp,true,'a 💬 gomb megjelöli');
  await w.deschideLucrare(j.id);
  eq(w.JOBS[0].sosire,'sosit','most már átveszi');
  ok(NAV!==null,'  és átvisz a recepcióra (cél URL: test-entry.js)');

  grp('11 · KÉSETTSÉG-FELISMERÉS');
  const P=d=>({programare:{date:d,time:'08:00'}});
  eq(w.progInfo(P(w.njDay(1))).state,'tomorrow','holnapi → tomorrow');
  eq(w.progInfo(P(w.njDay(5))).state,'future','jövő heti → future');
  eq(w.progInfo(P(w.njDay(-3))).state,'late','3 napja lejárt → late');
  eq(w.progInfo(P(w.njDay(-3))).days,3,'  3 nap késés');
  eq(w.progInfo({}).state,'nodate','dátum nélkül → nodate');

  grp('12 · TÖRLÉS — a programáltat nem engedi');
  w.JOBS.length=0; w.__db.length=0;
  j=await nyit('prog',{njPlate:'MS-70-HHH',njPhone:'0740777000',njTip:'auto',njDate:today()});
  const elott=w.JOBS.length;
  await w.dJ(j.id);
  eq(w.JOBS.length,elott,'programált munka NEM törölhető (csak Ratat)');

  // ══════════════════════════════════════════════════════════
  grp('13 · A LISTA MEGJELENÍTÉSE');
  w.JOBS.length=0; w.__db.length=0;
  await nyit('prog',{njPlate:'MS-81-AAA',njPhone:'0740811111',njTip:'auto',njDate:w.njDay(1)});
  await nyit('dosar',{njPlate:'MS-82-BBB',njPhone:'0740822222',njAsig:'Groupama',njClient:'B'});
  w.S.screen='panou'; w.S.panouTab='viitoare'; w.render();
  let h=app();
  ok(/MS-81-AAA/.test(h),'az előjegyzés a listán');
  ok(/MS-82-BBB/.test(h),'a kárdosszié IS ugyanazon a listán');
  // 2026-08-25: a rendszám melletti jelvény kikerült (felesleges volt).
  // A két sáv megkülönböztetése a SORON látszik, nem egy ikonon:
  ok(!/fx-b/.test(h),'nincs jelvény a rendszám mellett');
  ok(/Deschide dosarul|deschideDosar/.test(h),'a dosszié-sor fő művelete a dosszié megnyitása');
  ok(/Groupama/.test(h),'a dosszié soron látszik a biztosító (melyik eset)');
  ok(/acte/.test(h),'iratszámláló a dosszié soron');
  ok(/openEditJob/.test(h),'✎ gomb');
  ok(/openRepro/.test(h),'Reprogramare gomb');
  ok(!/setPanouTab\(.dosare.\)/.test(h),'nincs külön Dosare fül');

  grp('14 · A DOSSZIÉ SORON NINCS "RATAT"');
  const sorok=h.split('<tr').filter(s=>/MS-82-BBB/.test(s));
  ok(sorok.length===1,'megvan a dosszié sora');
  ok(sorok[0]&&!/markRatat/.test(sorok[0]),'  nincs rajta Ratat gomb');
  const psor=h.split('<tr').filter(s=>/MS-81-AAA/.test(s));
  ok(psor[0]&&/markRatat/.test(psor[0]),'az előjegyzésen VAN Ratat gomb');

  grp('15 · MUNKASZÁM — nincs ütközés');
  const szamok=w.JOBS.map(x=>x.number);
  eq(new Set(szamok).size,szamok.length,'minden munkaszám egyedi: '+szamok.join(', '));

  grp('16 · A MODÁL MEGJELENÍTÉSE');
  w.openNewJob('prog'); h=app();
  ok(/nj-box/.test(h),'modál megnyílik');
  ok(/m_tip|Dau/.test(h),'típusválasztó ott van (prog módban is)');
  ok(/type="date"/.test(h),'dátum ott van');
  w.openNewJob('dosar'); h=app();
  ok(!/type="date"/.test(h),'dosar módban NINCS dátum');
  ok(/Groupama/.test(h),'dosar módban van biztosító-lista');
  w.njSet('njPlate','MS-82-BBB'); w.njSync();
  const dupdiv=w.document.getElementById('njDup');
  ok(dupdiv&&dupdiv.style.display!=='none','ismert rendszámnál jelez');
  w.closeNewJob();
  ok(!/nj-box/.test(app()),'modál bezárul');

}catch(e){ fail++; console.log('   ✗ KIVÉTEL: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,4).join('\n')); }

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
},900);
