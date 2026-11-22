// ============================================================
//  ÜGY + FOLYAMAT (2026-11-23, Ferenc: "javits mindent logika szerint")
//  A ténylegesen kiszolgált index.html-t hajtja meg jsdom-ban (a test-acceptance.js
//  bábjával): piszkozat (ciornă), folyamat-csempék, Preluare dosar daună.
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
</script>
<script>${fs.readFileSync('rpw-progres.js','utf8').replace(/<\/script>/g,'<\\/script>')}</script>`;
// A folyamatjelzo a VALODI modul — nem bab. Ez a teszt igy azt is meri,
// hogy a lista es a modul egyutt mukodik-e (Ferenc "A" osszevonasa).

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


function addWork(n){var d=new Date();d.setHours(12,0,0,0);var l=n;while(l>0){d.setDate(d.getDate()-1);var x=d.getDay();if(x!==0&&x!==6)l--}return d.toISOString()}
function mk(o){return Object.assign({id:'T'+Math.random(),number:'MS-26-'+Math.floor(Math.random()*999),plate:'MS-01-XYZ',client:'',phone:'',vin:'',
  sosire:'sosit',flux:'reparatie',inchis:false,phase:1,damageType:null,photos:[],docs:[],
  phases:{1:{status:'active',started:new Date().toISOString()},2:{status:'pending'},3:{status:'pending'},4:{status:'pending'},5:{status:'pending'},6:{status:'pending'},7:{status:'pending'}}},o||{})}

setTimeout(async ()=>{
try{
  const realSave=w.saveJob, realFresh=w.freshJob;
  hookSave();
  w.JOBS.length=0; w.__db.length=0;

  grp('1 · CIORNĂ — rekord adat nélkül');
  ok(w.isCiorna(mk({plate:''})),'rendszám, ügyfél, fotó nélkül → piszkozat');
  ok(!w.isCiorna(mk()),'rendszámmal → NEM piszkozat');
  ok(!w.isCiorna(mk({plate:'',client:'Pop Ion'})),'ügyfélnévvel → NEM piszkozat');
  ok(!w.isCiorna(mk({plate:'',photos:[{type:'talon'}]})),'fotóval → NEM piszkozat');
  ok(!w.isCiorna(mk({plate:'',dosarActe:{talon:{path:'x'}}})),'irattal → NEM piszkozat');
  ok(!w.isCiorna(null)&&!w.isCiorna(undefined),'hibás bemenet → false, nem hasal el');

  grp('2 · LUCRARE NOUĂ — a lista megtartja, a szám NEM számolja');
  NAV=null; await w.lucrareAcum();
  let j=w.JOBS[w.JOBS.length-1];
  eq(w.categorizeJob(j),'lucrari','a Lucrări listában marad (Ferenc, 2026-08-26)');
  w.S.screen='lucrari'; w.S.lucF=null; w.render();
  let h=app();
  ok(/ci-bar/.test(h),'a Ciorne sáv megjelenik');
  ok(/Continuă/.test(h),'  „Continuă” gomb');
  let G=w.procGroups(w.JOBS.filter(function(x){return w.categorizeJob(x)==='lucrari'}));
  eq(G.pin.list.length,0,'a Recepție · Evaluare csempe NEM számolja a piszkozatot');
  eq(w.azBuild().filter(function(b){return b.k==='atl'})[0].n,0,'„Ce facem azi” · În atelier: a piszkozat nem autó a műhelyben');
  j.plate='MS-33-ABC'; await w.saveJob(j);
  G=w.procGroups(w.JOBS.filter(function(x){return w.categorizeJob(x)==='lucrari'}));
  eq(G.pin.list.length,1,'rendszám után már számít');

  grp('3 · AVIZARE DAUNĂ — piszkozatként nem teendő a „Ce facem azi”-ban');
  await w.dosarTarziu();
  j=w.JOBS[w.JOBS.length-1];
  eq(w.categorizeJob(j),'viitoare','a közös listában marad');
  let B=w.azBuild(), dos=B.filter(function(b){return b.k==='dos'})[0], ver=B.filter(function(b){return b.k==='ver'})[0];
  eq(dos.n,0,'Dosare daună: a piszkozat nem teendő');
  eq(ver.n,0,'De pus în ordine: a piszkozat nem teendő');
  j.plate='MS-44-DEF'; await w.saveJob(j);
  B=w.azBuild(); dos=B.filter(function(b){return b.k==='dos'})[0];
  eq(dos.n,1,'rendszám után a dosszié teendő lesz');

  grp('4 · FOLYAMAT-CSEMPÉK — fázis szerint, a szín az ÁLLAPOT');
  w.JOBS.length=0;
  w.RPWWorkflow.workMetrics=function(x){return {over:!!x.__over}};
  const today=new Date().toISOString().slice(0,10);
  w.JOBS.push(mk({phase:1}), mk({phase:2,phases:{2:{status:'active',started:addWork(3)}}}),
    mk({phase:3,phases:{3:{status:'active',started:addWork(8)}}}),
    mk({phase:4}), mk({phase:4,__over:true}), mk({phase:5,phases:{5:{status:'rework'}}}),
    mk({phase:6,termenPredare:today}), mk({phase:7,termenPredare:'2099-01-01'}));
  G=w.procGroups(w.JOBS);
  eq([G.pin.list.length,G.ins.list.length,G.tin.list.length,G.vop.list.length,G.out.list.length],[2,1,2,1,2],'csoportok: 1–2 · 3 · 4 · 5 · 6–7');
  eq(G.pin.late,1,'Recepție·Evaluare: 3 munkanapja áll → késik');
  eq(G.ins.late,1,'Reconstatare: 8 munkanapja vár → késik');
  eq(G.tin.late,1,'Tinichigerie: csak a devizen túli késik');
  eq(G.vop.late,1,'Vopsitorie: nyitott javítás (rework) → késik');
  eq(G.out.late,1,'Control·Închidere: a ma esedékes átadás késik, a 2099-es nem');
  w.S.screen='lucrari'; w.S.lucF=null; w.render(); h=app();
  eq((h.match(/class="stat-cell pc-t/g)||[]).length,5,'5 csempe');
  ok(/pc-red/.test(h)&&!/style="color:var\(--g\)"/.test(h),'a szín az állapotból jön, nem a helyből');
  ok(!/>Inchis</.test(h)&&/Închidere/.test(h),'a 7. fázis: „Închidere” (nem „Inchis”)');
  ok(/onclick="lucFilter\('tin'\)"/.test(h),'a csempe kattintható');
  eq(w.T('ph7'),'Închidere','a 7. fázis neve mindenhol „Închidere” (a lezárás ALATT áll, nem lezárt)');

  grp('5 · SZŰRÉS — a csempe a táblázatot szűri');
  w.lucFilter('tin'); h=app();
  eq((h.match(/onclick="lucDeschide\(/g)||[]).length,2,'Tinichigerie: 2 sor');
  ok(/Filtru:/.test(h),'„Filtru … arată tot” gomb');
  w.lucFilter('tin'); h=app();
  eq((h.match(/onclick="lucDeschide\(/g)||[]).length,8,'újra kattintva: mind a 8');

  grp('6 · PRELUARE DOSAR DAUNĂ — a dosszié MÁR nyitva van');
  w.JOBS.length=0; NAV=null;
  w.fetch=function(){return Promise.resolve({ok:true,json:function(){return Promise.resolve({plate:'ms-55-abc',proprietar:'Pop Ion',asigurator:'Groupama',nrDosar:'GR-123'})}})};
  w.toast=function(){};
  const blob=new w.Blob(['%PDF-1.4'],{type:'application/pdf'});
  w.dosarFisier({target:{files:[blob]}});
  await new Promise(r=>setTimeout(r,400));
  j=w.JOBS[w.JOBS.length-1];
  ok(!!j,'létrejött');
  eq(j.dosarStatus,'deschis','dosarStatus = deschis (nem a teljes iratcsomag)');
  eq(j.flux,'reparatie','javítási ügy, a constatare alapján');
  eq(j.sosire,'programat','az autó később jön');
  eq(j.phases[1].status,'pending','az 1. fázis NEM indul (az autó nincs itt)');
  eq(j.plate,'MS-55-ABC','rendszám az OCR-ből');
  eq(j.nrDosar,'GR-123','kárszám az OCR-ből');
  eq(w.categorizeJob(j),'viitoare','→ a közös lista (programálásra vár)');
  ok(!w.isCiorna(j),'adattal → nem piszkozat');

  grp('7 · AZ ÜGYEK AKTÁI — a Lucrări táblázat');
  w.JOBS.length=0;
  const past=new Date(Date.now()-2*864e5).toISOString().slice(0,10), fut='2099-01-01';
  const A=mk({number:'MS-26-A',plate:'MS-71-AAA',phase:4,termenPredare:fut,evalData:{piese:[{id:'p1',denumire:'aripa'}]},conditions:{piese:false}});
  const Bj=mk({number:'MS-26-B',plate:'MS-72-BBB',phase:5,termenPredare:past,damageType:'asig',asigurator:'Groupama',nrDosar:'GR-9',dosarStatus:'deschis'});
  const C=mk({number:'MS-26-C',plate:'MS-73-CCC',phase:2,termenPredare:fut,damageType:'asig',asigurator:'',nrDosar:''});
  const D=mk({number:'MS-26-D',plate:'MS-74-DDD',phase:6,evalData:{piese:[{id:'p2'}]},conditions:{piese:'livrat'}});
  const E=mk({number:'MS-26-E',plate:'',client:'',phase:1});
  w.JOBS.push(A,Bj,C,D,E);
  w.RPWWorkflow.workMetrics=function(){return {over:false,gap:0}};
  w.S.screen='lucrari'; w.S.lucF=null; w.render(); h=app();
  ok(/Client · Dosar/.test(h)&&/Blocaj/.test(h)&&/Predare/.test(h),'oszlopok: Client · Dosar · Blocaj · Predare');
  ok(!/cond-row/.test(h.slice(h.indexOf('<table'))),'a táblázatban nincs többé az 5 érkezési feltétel');
  ok(!/cell-inp/.test(h)&&typeof w.toggleEditJob==='undefined','nincs soron belüli, ellenőrizetlen szerkesztés');
  ok(/onclick="openEditJob\('/.test(h),'a ✎ a rendes, ellenőrző ablakot nyitja');
  eq(w.lucBlocaje(A).map(x=>x[1]),['piese necomandate'],'alkatrész kell, nincs rendelve → akadály');
  eq(w.lucBlocaje(D).length,0,'alkatrész megérkezett → nincs akadály');
  eq(w.lucBlocaje(mk({phase:4})).length,0,'nincs alkatrészlista → nincs piros zaj');
  eq(w.lucBlocaje(mk({phase:5,phases:{5:{status:'rework'}}})).map(x=>x[1]),['remediere deschisă'],'nyitott javítás → akadály');
  ok(/Groupama/.test(w.lucCaz(Bj))&&/GR-9/.test(w.lucCaz(Bj))&&/acte \d+\/\d+/.test(w.lucCaz(Bj)),'biztosítós akta: biztosító + kárszám + iratszám');
  ok(/fără nr\. dosar/.test(w.lucCaz(C))&&/asigurător \?/.test(w.lucCaz(C)),'hiányzó kárszám / biztosító látszik');
  ok(/plătitor nestabilit/.test(w.lucCaz(mk({damageType:null}))),'fizető nélkül: jelzi');
  eq(w.lucPredare(Bj).c,'late','lejárt átadás → late');
  const order=w.JOBS.slice().sort(w.lucOrder).map(x=>x.number);
  eq(order[0],'MS-26-B','a lejárt átadás áll elöl');
  eq(order[order.length-1],'MS-26-E','a piszkozat a végén');
  eq((h.slice(h.indexOf('<table')).match(/onclick="dJ\('/g)||[]).length,1,'törlés gomb a táblázatban csak a piszkozatnál (1)');
  eq(w.lucPage(A),'rpw-tinichigerie-red.html?job='+encodeURIComponent(A.id),'„Deschide faza” → a fázis saját lapja (4 → Tinichigerie)');
  eq(w.lucPage(D).split('?')[0],'rpw-control-red.html','  6 → Control');
  NAV=null; w.lucDeschide(A.id); ok(NAV!==null,'  és navigál');

  grp('8 · PROGRAMARE — 6 feltétel, hely és ember NÉV SZERINT');
  w.JOBS.length=0;
  w.EC.posts=[{code:'P1',label:'Post 1',active:true},{code:'P2',label:'Post 2 · vopsitorie',active:true}];
  w.EC.team=[{id:'e1',name:'Lajos Lakatos',active:true},{id:'e2',name:'Vasile Festő',active:true}];
  w.EC.loaded=true;
  const P1=mk({number:'MS-26-P1',plate:'MS-81-AAA',sosire:'programat',phase:1,phases:{1:{status:'pending'}},
    programare:{date:'2099-01-01',time:'08:00'},conditions:{programare:true,whatsapp:true}});
  w.JOBS.push(P1);
  await w.openCondModal(P1.id); h=app();
  ok(/Post 2 · vopsitorie/.test(h)&&/Lajos Lakatos/.test(h),'a feltétel-ablak a postot és az embert LISTÁBÓL kínálja');
  ok(/Nu e nevoie/.test(h),'alkatrész: „Nu e nevoie” választható');
  ok(/Plată client — nu e nevoie de dosar/.test(h),'saját zsebnél az akta: nem kell dosszié');
  w.setCondPick('loc','Post 2 · vopsitorie'); w.setCondPick('om','Lajos Lakatos'); w.setCondDraft('piese','nu_trebuie');
  await w.saveCondModal();
  eq([P1.conditions.loc,P1.conditions.locPost,P1.conditions.om,P1.conditions.omName,P1.conditions.piese].join('|'),
     'true|Post 2 · vopsitorie|true|Lajos Lakatos|nu_trebuie','elmentve: hely + ember névvel, alkatrész nem kell');
  const cc=w.computeConditions(P1);
  ok(cc.all===true&&cc.count===6,'mind a 6 feltétel rendben');
  w.S.screen='panou'; w.S.panouTab='viitoare'; w.render(); h=app();
  ok(/pg-conds/.test(h)&&/Post 2 · vopsitorie/.test(h)&&/Lajos Lakatos/.test(h),'a Panou sorában látszik a hely és az ember neve');
  w.setCondPick && null;
  const P2=mk({number:'MS-26-P2',plate:'MS-82-BBB',sosire:'programat',phase:1,phases:{1:{status:'pending'}},damageType:'asig',
    programare:{date:'2099-01-01',time:'09:00'},conditions:{programare:true,whatsapp:true}});
  w.JOBS.push(P2); w.render(); h=app();
  ok(/pg-cd no[^>]*>✗ Acte/.test(h),'biztosítós ügy kárszám nélkül: az „Acte” piros');

  grp('9 · BEMEGY JAVÍTÁSRA — nem tilt, de RÖGZÍT (Ferenc: „nem, csak jegyezzük”)');
  NAV=null; await w.deschideLucrare(P2.id);
  eq(P2.sosire,'sosit','a WhatsApp megvan → bemegy (a kapu változatlan)');
  ok(P2.intrare&&P2.intrare.cu_programare===true,'az érkezés rögzítve');
  eq(P2.intrare.lipsa.join(','),'loc,om,piese,acte','  a hiányzó feltételek névvel rögzítve');
  ok(NAV!==null,'  és a recepcióra navigál');
  await w.lucrareAcum(); const W=w.JOBS[w.JOBS.length-1];
  ok(W.intrare&&W.intrare.cu_programare===false,'Lucrare nouă (programálás nélkül): ez is rögzítve');

  grp('10 · PRELUARE — előbb a MEGLÉVŐ ügy (nincs dupla akta)');
  w.JOBS.length=0;
  const AV=mk({number:'MS-26-AV',plate:'MS-91-XYZ',flux:'doar_dosar',sosire:'programat',damageType:'asig',dosarStatus:'deschid',nrDosar:'',asigurator:'',docs:[]});
  const OTHER=mk({number:'MS-26-OT',plate:'MS-92-QQQ',damageType:'asig',nrDosar:'AL-7',asigurator:'Allianz'});
  w.JOBS.push(AV,OTHER);
  const ocr=(o)=>{w.fetch=function(){return Promise.resolve({ok:true,json:function(){return Promise.resolve(o)}})}};
  const send=async()=>{w.dosarFisier({target:{files:[new w.Blob(['%PDF'],{type:'application/pdf'})]}});await new Promise(r=>setTimeout(r,400))};
  ocr({plate:'ms-91-xyz',proprietar:'Pop Ion',asigurator:'Groupama',nrDosar:'GR-55'}); await send();
  eq(w.JOBS.length,2,'avizare + visszaküldött constatare → NEM nyílt új ügy');
  eq(AV.nrDosar,'GR-55','  a kárszám a meglévő ügybe került');
  eq(AV.asigurator,'Groupama','  a biztosító is');
  eq(AV.docs.length,1,'  a constatare a meglévő aktához csatolva');
  ok(w.RPWProgres.acteOk(AV),'  → az akta-feltétel zöld');
  ocr({plate:'',nrDosar:'GR-55',asigurator:'Groupama'}); await send();
  eq(w.JOBS.length,2,'ugyanaz a kárszám másodszor → ugyanahhoz az ügyhöz');
  eq(AV.docs.length,2,'  (második irat)');
  ocr({plate:'MS-91-XYZ',nrDosar:'GR-55',asigurator:'Allianz'}); await send();
  eq(w.JOBS.length,3,'ugyanaz a kárszám, MÁS biztosító → új ügy (nem keverjük)');
  ocr({plate:'MS-99-NEW',nrDosar:'OM-1',asigurator:'Omniasig'}); await send();
  eq(w.JOBS.length,4,'ismeretlen eset → új ügy');
  const closed=mk({plate:'MS-98-OLD',damageType:'asig',nrDosar:'',inchis:true});
  w.JOBS.push(closed);
  ocr({plate:'MS-98-OLD',nrDosar:'X-1',asigurator:'Euroins'}); await send();
  eq(w.JOBS.length,6,'lezárt ügyhöz NEM csatolunk → új ügy');

  grp('11 · A VERZIÓ NEM VÉSZ EL („Eșec salvare” a Symfony-szerveren, 2026-11-23)');
  const VJ={id:'V-1',plate:'MS-77-VER',conditions:{}};
  w.JOBS.length=0; w.JOBS.push(VJ);
  w.RPWDb.getRow=function(){return Promise.resolve({data:{id:'V-1',data:{id:'V-1',plate:'MS-77-VER',conditions:{}},version:5},error:null})};
  const fj=await realFresh('V-1');
  eq(fj.version,5,'a friss betöltés megtartja a szerver verzióját');
  let sentVer=null;
  w.RPWDb.patch=function(sb,job){sentVer=job.version;return Promise.resolve({data:{ok:true,version:job.version+1},error:null})};
  await realSave(fj);
  eq(sentVer,5,'a mentés a verzióval megy');
  eq(fj.version,6,'mentés után az új verzió átvéve');
  await realSave(fj);
  eq(sentVer,6,'  a következő mentés már az újjal (nincs version_conflict)');

  grp('12 · ECHIPĂ — mindkét szerver válaszalakja (Supabase: team/posts · Symfony: employees/rows)');
  const realRpc=w.sb.rpc; w.ecTok=function(){return 'tok'};
  w.sb.rpc=function(n){ if(n==='rpw2_team')return Promise.resolve({data:{ok:true,employees:[{id:'e9',name:'Ion Pop',active:true}],roles:[]}});
    if(n==='rpw_posts_get')return Promise.resolve({data:{ok:true,rows:[{code:'P9',label:'Post 9',active:true}]}});
    if(n==='rpw2_roster')return Promise.resolve({data:[{id:'e9',name:'Ion Pop',role:'x'}]});
    return Promise.resolve({data:{ok:true,rows:[]}}) };
  w.EC.loaded=false; w.EC.team=[]; w.EC.posts=[]; w.S.screen='lucrari';
  await w.ecLoad(true);
  eq(w.EC.team.map(e=>e.name).join(','),'Ion Pop','Symfony „employees” → EC.team');
  eq(w.EC.posts.map(p=>p.label).join(','),'Post 9','Symfony „rows” → EC.posts');
  ok(w.EC.manager===true,'  a sikeres csapat-válasz = csapat-jog');
  w.S.condRoster=null; await w.condRosterLoad();
  eq(w.S.condRoster.map(e=>e.name).join(','),'Ion Pop','a névsor (rpw2_roster) a feltétel-ablakhoz, csapat-jog nélkül is');
  w.sb.rpc=realRpc;
}catch(e){ fail++; console.log('   ✗ KIVÉTEL: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,4).join('\n')); }
console.log('\n'+(fail?'✗ ':'✓ ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
},900);
