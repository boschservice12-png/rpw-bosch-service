// L1-U: Ce facem azi + 24 oras ellenorzopont — VEGREHAJTVA, valodi DOM-ban
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};const {JSDOM,VirtualConsole}=require('jsdom');
let html=fs.readFileSync('index.html','utf8').replace(/<script[^>]+src=[^>]*><\/script>/g,'');
const WF=fs.readFileSync('rpw-workflow.js','utf8');
const STUB='<script>window.__db=[];'+
'window.supabase={createClient:function(){return{from:function(){return{select:function(){return{is:function(){return{order:function(){return Promise.resolve({data:[],error:null})}}}}},upsert:function(){return Promise.resolve({error:null})},update:function(){return{eq:function(){return Promise.resolve({error:null})}}}}},rpc:function(){return Promise.resolve({data:"MS-26-999",error:null})}}}};'+
'window.RPW_CFG={SB_URL:"https://x.co",SB_KEY:"k",BUCKET:"b"};'+
'window.RPWDb={listActive:function(){return Promise.resolve([])},patch:function(){return Promise.resolve()},patchV2:function(){return Promise.resolve()},save:function(){return Promise.resolve({ok:true})}};'+
'window.RPWUtil={jobId:function(){return "J"+Math.random()}};</script>'+
'<script>'+WF+'</script>';
html=html.replace('</head>',STUB+'</head>');
const vc=new VirtualConsole(); vc.on('jsdomError',function(){}); ['error','warn','info','log'].forEach(function(k){vc.on(k,function(){})});
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.test/index.html',virtualConsole:vc});
const w=dom.window;

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g)+' exp='+JSON.stringify(e));

setTimeout(async ()=>{
try{
  w.saveJob=async function(j){var k=w.JOBS.findIndex(x=>x.id===j.id);if(k>=0)w.JOBS[k]=j;else w.JOBS.push(j);return{ok:1}};
  w.freshJob=async id=>w.JOBS.filter(x=>x.id===id)[0];
  const D=o=>{const d=new Date();d.setDate(d.getDate()+(o||0));
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  function J(o){o=o||{};var j={id:o.id||'j'+Math.random(),number:o.nr||'MS-26-001',plate:o.plate||'MS-11-AAA',
    phone:'0740111111',sosire:o.sosire||'programat',flux:o.flux||'reparatie',inchis:false,phase:o.phase||1,
    phases:{},damageType:o.dt||null,asigurator:o.asig||'',nrDosar:o.nrd||'',client:o.client||'',
    conditions:{whatsapp:o.wa!==false,piese:o.piese||'nu'},programare:{date:o.dat||'',time:'08:00'},
    deviz:o.deviz,evalData:o.evalData,reconst:o.reconst,dosarActe:{}};
    for(var i=1;i<=7;i++)j.phases[i]={status:'pending'};
    if(o.f1)j.phases[1]=o.f1;
    if(o.f2)j.phases[2]=o.f2;
    if(o.f3)j.phases[3]=o.f3;
    if(o.f4)j.phases[4]=o.f4;
    return j}

  console.log('\n1. A panel megnyilik es rangsorol');
  w.JOBS=[ J({nr:'A1',dat:D(0),sosire:'programat'}),
           J({nr:'A2',dat:D(-4),sosire:'programat'}),
           J({nr:'A3',sosire:'sosit',phase:4,f1:{status:'done'},f2:{status:'done'},f3:{status:'done'},f4:{status:'active',started:D(-6)+'T08:00:00Z'}}),
           J({nr:'A4',flux:'doar_dosar',dt:'asig',asig:'Groupama',nrd:'G1',client:'X',dat:D(3)}) ];
  w.azOpen();
  const ov=w.document.getElementById('azOv');
  ok(!!ov,'az ablak letrejott');
  ok(/rpw-mascot\.png/.test(ov.innerHTML),'a kabala ott van');
  ok(/Ce facem azi\?|Mit csinalunk|What are we/i.test(ov.textContent),'megkerdezi: Ce facem azi?');
  ok(/SOS/.test(ov.innerHTML)&&/RST/.test(ov.innerHTML)&&/ATL/.test(ov.innerHTML)&&/DOS/.test(ov.innerHTML),'technikai savkodok');
  ok(!/[\u{1F300}-\u{1FAFF}]/u.test(ov.textContent),'NINCS emoji a szovegben');

  console.log('\n2. A savok jol szamolnak');
  const cnt=k=>{const m=ov.innerHTML.match(new RegExp('>'+k+'</div>[^]*?az-cnt [^>]*>(\\d+)<'));return m?+m[1]:null};
  eq(cnt('SOS'),1,'SOS: 1 mai erkezes');
  eq(cnt('RST'),1,'RST: 1 lejart');
  eq(cnt('ATL'),1,'ATL: 1 a muhelyben');
  eq(cnt('DOS'),1,'DOS: 1 dosszie');

  console.log('\n3. Horizont: 1 / 3 / 7 nap');
  w.JOBS.push(J({nr:'A5',dat:D(2),sosire:'programat'}), J({nr:'A6',dat:D(6),sosire:'programat'}));
  w.azSetH(1); eq(cnt('SOS'),1,'Azi: 1');
  w.azSetH(3); eq(cnt('SOS'),2,'3 nap: 2');
  w.azSetH(7); eq(cnt('SOS'),3,'7 nap: 3');
  w.azSetH(1);

  console.log('\n4. Fazis-csik a muhelyben allo autoknal');
  ok(/az-ph/.test(ov.innerHTML),'fazis-csik kirajzolodik');
  ok(/az-pn">F4\/7 TINICHIGERIE/.test(ov.innerHTML),'F4/7 TINICHIGERIE felirat');
  ok(/FARA DEVIZ|NINCS DEVIZ|NO DEVIZ/i.test(ov.innerHTML),'deviz nelkul NEM talal ki gap-et');

  console.log('\n5. Deviz utan megjelenik a viszonyitas');
  w.JOBS[2].deviz={oreTinichigerie:6,oreVopsitorie:6};   // 12h -> 3 nap
  w.azRender();
  ok(/GAP \+\d+z/.test(ov.innerHTML),'GAP megjelenik, ha tullepte');
  ok(!/FARA DEVIZ/.test(ov.innerHTML.split('A3')[1]||''),'mar nem "fara deviz"');

  console.log('\n6. 24 ORAS ELLENORZOPONT — csak azt kerdi, amit nem lat');
  const j=J({nr:'C1',sosire:'sosit',phase:2,f1:{status:'done',started:D(-3)+'T08:00:00Z'},dt:'asig'});
  w.JOBS=[j];
  let nd=w.azCheckNeeds(j);
  eq(nd.eval,true,'ertekeles nelkul -> KERDI');
  eq(nd.reconst,true,'draft reconstatare -> KERDI');
  eq(nd.piese,true,'alkatresz nincs rendelve -> KERDI');
  eq(nd.ore,true,'nincs deviz-ora -> KERDI');

  j.evalData={status:'accepted'};
  j.reconst={status:'sent'};
  j.conditions.piese='comandat';
  nd=w.azCheckNeeds(j);
  eq(nd.eval,false,'elfogadott ertekeles -> NEM kerdi');
  eq(nd.reconst,false,'SENT reconstatare -> NEM kerdi (elkuldve)');
  eq(nd.piese,false,'rendelt alkatresz -> NEM kerdi');
  eq(nd.ore,true,'de az ORAKAT igen');
  eq(nd.any,true,'van meg kerdes');

  console.log('\n7. "Csak a szamokat kerdi" — pontosan ez a helyzet');
  w.azOpenCheck(j.id);
  const ck=w.document.getElementById('azCk');
  ok(!!ck,'az ellenorzo ablak megnyilt');
  ok(!!ck.querySelector('#ckTin')&&!!ck.querySelector('#ckVop'),'ket oramezo');
  eq(ck.querySelectorAll('.ck-yn').length,0,'NINCS igen/nem kerdes — mindent lat');
  eq(ck.querySelectorAll('.ck-seen').length,3,'harom "mar latom" jelzes');

  console.log('\n8. Az orak mentese es a szamitas');
  w.azCk.tin='10'; w.azCk.vop='10';
  await w.azCkSave();
  const saved=w.JOBS.filter(x=>x.id===j.id)[0];
  eq(saved.deviz.oreTinichigerie,10,'lakatos ora mentve');
  eq(saved.deviz.oreVopsitorie,10,'fenyezes ora mentve');
  eq(saved.deviz.sursa,'manual','forras jelolve');
  ok(!!saved.deviz.introdusLa,'idobelyeg');
  const m=w.RPWWorkflow.workMetrics(saved);
  eq(m.hours,20,'20 ora');
  eq(m.expected,5,'20/4 = 5 munkanap');
  eq(w.azCheckNeeds(saved).any,false,'tobbe nem kerdez semmit');

  console.log('\n9. Az igen/nem valaszok is mentodnek');
  const j2=J({nr:'C2',sosire:'sosit',phase:2,f1:{status:'done',started:D(-3)+'T08:00:00Z'},dt:'asig'});
  w.JOBS=[j2]; w.azOpenCheck(j2.id);
  const ck2=w.document.getElementById('azCk');
  eq(ck2.querySelectorAll('.ck-yn').length,3,'harom igen/nem kerdes');
  w.azCkSet('eval',true); w.azCkSet('reconst',true); w.azCkSet('piese',true);
  w.azCk.tin='4'; w.azCk.vop='0';
  await w.azCkSave();
  const s2=w.JOBS.filter(x=>x.id===j2.id)[0];
  eq(s2.evalData.status,'accepted','ertekeles elfogadva');
  eq(s2.reconst.status,'sent','reconstatare elkuldve');
  eq(s2.conditions.piese,'comandat','alkatresz megrendelve');
  eq(w.RPWWorkflow.workMetrics(s2).expected,1,'4h -> 1 nap');

  console.log('\n10. Az ellenorzopont csak a KOVETKEZO munkanapon jelenik meg');
  const ma=J({nr:'D1',sosire:'sosit',f1:{status:'active',started:D(0)+'T08:00:00Z'}});
  const regi=J({nr:'D2',sosire:'sosit',f1:{status:'active',started:D(-5)+'T08:00:00Z'}});
  w.JOBS=[ma,regi]; w.azSetH(1);
  const chkCnt=cnt('CHK');
  eq(chkCnt,1,'csak a regi kerul be, a mai meg nem');

  console.log('\n11. Naponta EGYSZER nyilik magatol');
  w.azClose();
  ok(w.localStorage.getItem('rpw_az_seen')===D(0),'bezaraskor rogzul a mai nap');
  const el=w.document.getElementById('azOv'); el.style.display='none';
  w.azMaybeAuto();
  eq(el.style.display,'none','ma mar nem nyilik ujra');
  w.localStorage.setItem('rpw_az_seen',D(-1));
  w.azMaybeAuto();
  eq(el.style.display,'flex','holnap ujra nyilik');

  console.log('\n12. A devizFAJL OPCIONALIS — de az ORAK merhetok');
  ok(/devizNotRequired!==true/.test(WF),'a "nem szukseges" jeloles el: a PDF nem kotelezo');
  ok(/oreTinichigerie/.test(WF),'az ORAKAT viszont merjuk — azokbol jon a statisztika');
  {var _j={phase:6,damageType:'auto',deviz:{oreTinichigerie:10,oreVopsitorie:6}};
   var _m=w.RPWWorkflow.workMetrics(_j);
   eq(_m.hours,16,'devizFAJL nelkul is van ora-adat');
   eq(_m.expected,4,'  es varhato atfutas');}

}catch(e){fail++;console.log('  x KIVETEL: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,3).join('\n'))}
console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
},1100);
