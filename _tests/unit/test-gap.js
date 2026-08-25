// L1-W: a GAP-kerdes — mind a HAT ok, vegrehajtva
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};const {JSDOM,VirtualConsole}=require('jsdom');
let html=fs.readFileSync('index.html','utf8').replace(/<script[^>]+src=[^>]*><\/script>/g,'');
const WF=fs.readFileSync('rpw-workflow.js','utf8');
const STUB='<script>window.RPW_CFG={SB_URL:"https://x.co",SB_KEY:"k",BUCKET:"b"};'+
'window.supabase={createClient:function(){return{from:function(){return{select:function(){return{is:function(){return{order:function(){return Promise.resolve({data:[],error:null})}}}}}}},rpc:function(){return Promise.resolve({data:"X"})}}}};'+
'window.RPWDb={listActive:function(){return Promise.resolve([])},patchV2:function(){return Promise.resolve()},save:function(){return Promise.resolve({ok:1})}};'+
'window.RPWUtil={jobId:function(){return "J1"}};</script><script>'+WF+'</script>';
html=html.replace('</head>',STUB+'</head>');
const vc=new VirtualConsole();['error','warn','info','log','jsdomError'].forEach(k=>vc.on(k,()=>{}));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.test/',virtualConsole:vc});
const w=dom.window;

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g)+' exp='+JSON.stringify(e));

setTimeout(async()=>{
try{
  w.saveJob=async function(j){var k=w.JOBS.findIndex(x=>x.id===j.id);if(k>=0)w.JOBS[k]=j;else w.JOBS.push(j);return{ok:1}};
  w.freshJob=async id=>w.JOBS.filter(x=>x.id===id)[0];
  const D=o=>{const d=new Date();d.setDate(d.getDate()+(o||0));
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  function J(o){o=o||{};var j={id:'g1',number:'MS-26-051',plate:'MS-11-XXX',phone:'0740111111',
    sosire:'sosit',flux:'reparatie',inchis:false,phase:4,phases:{},damageType:'asig',
    conditions:{whatsapp:true,piese:'comandat'},programare:{date:'',time:''},
    deviz:o.deviz||{oreTinichigerie:10,oreVopsitorie:6},dosarActe:{},gapLog:o.gapLog};
    for(var i=1;i<=7;i++)j.phases[i]={status:'pending'};
    j.phases[1]={status:'done'};j.phases[2]={status:'done'};j.phases[3]={status:'done'};
    j.phases[4]={status:'active',started:(o.t0||D(-20))+'T08:00:00Z'};
    return j}

  console.log('\n1. MIND A HAT ok elerheto — vreme es garantie is');
  const R=w.RPWWorkflow.GAP_REASONS;
  eq(R.length,6,'hat ok');
  ['piese','asigurator','capacitate','vreme','garantie','fara_motiv'].forEach(function(r){
    ok(R.indexOf(r)>=0,'  '+r);
  });

  console.log('\n2. Mind a hatnak van felirata HAROM nyelven');
  ['piese','asigurator','capacitate','vreme','garantie','fara_motiv'].forEach(function(r){
    ['ro','en','hu'].forEach(function(l){
      ok(new RegExp("gap_r_"+r+":\\{[^}]*"+l+":'[^']+'").test(html),'gap_r_'+r+' '+l);
    });
    ok(new RegExp("gap_r_"+r+"_s:\\{").test(html),'gap_r_'+r+' magyarazat');
  });

  console.log('\n3. A GAP-gomb csak akkor jelenik meg, ha KELL');
  w.JOBS=[J({t0:D(-20)})];                       // 16h -> 4 nap, 20 napja fut
  w.azOpen();
  const ov=w.document.getElementById('azOv');
  const m=w.RPWWorkflow.workMetrics(w.JOBS[0]);
  ok(m.over,'tullepte a varhato atfutast, GAP +'+m.gap);
  ok(m.needsReason,'a motor keri az okot');
  ok(/az-gapb/.test(ov.innerHTML),'a "De ce?" gomb megjelent');
  ok(/GAP \+\d+z/.test(ov.innerHTML),'a GAP erteke lathato');

  w.JOBS=[J({t0:D(-1)})];                        // meg belefer
  w.azRender();
  ok(!/az-gapb/.test(ov.innerHTML),'idoben levo munkanal NINCS gomb');

  w.JOBS=[J({t0:D(-20),deviz:{}})];              // nincs ora
  w.azRender();
  ok(!/az-gapb/.test(ov.innerHTML),'deviz-ora nelkul NEM kerdez (nincs mihez merni)');

  console.log('\n4. A kerdezo ablak — hat gomb');
  w.JOBS=[J({t0:D(-20)})];
  w.azRender(); w.gapOpen('g1');
  const gv=w.document.getElementById('gapOv');
  ok(!!gv,'a kerdes megnyilt');
  eq(gv.querySelectorAll('.gp-b').length,6,'hat valaszthato ok');
  ok(/rpw-mascot/.test(gv.innerHTML),'a kabala kerdez');
  ok(/Unde e problema|Hol a baj|Where is the/i.test(gv.textContent),'"Unde e problema?"');
  ok(/Vreme/.test(gv.textContent),'  VREME ott van');
  ok(/Garantie/.test(gv.textContent),'  GARANTIE ott van');
  ok(/gp-b own/.test(gv.innerHTML),'a "fara motiv" kulon kiemelve (a mi hibank)');
  ok(/16 h|16h/.test(gv.textContent),'kiirja az orat');
  ok(/#gapNoteIn|gapNoteIn/.test(gv.innerHTML),'jegyzet mezo');

  console.log('\n5. Valasztas nelkul nem ment');
  let toasted=null; const T0=w.toast; w.toast=function(m){toasted=m};
  await w.gapSave();
  ok(!!toasted,'szol, hogy valassz okot');
  ok(!w.JOBS[0].gapReason,'  es nem mentett semmit');

  console.log('\n6. VREME rogzitese');
  w.gapSet('vreme'); w.gapNote='ploaie 3 zile';
  await w.gapSave();
  let j=w.JOBS[0];
  eq(j.gapReason,'vreme','ok: vreme');
  eq(j.gapLog.length,1,'naplozva');
  eq(j.gapLog[0].reason,'vreme','  a naploban is');
  eq(j.gapLog[0].note,'ploaie 3 zile','  jegyzettel');
  eq(j.gapLog[0].gap,m.gap,'  a GAP ertekevel');
  ok(!!j.gapLog[0].at,'  idobelyeggel');

  console.log('\n7. GARANTIE rogzitese — MASODIK ok ugyanazon a munkan');
  w.gapOpen('g1'); w.gapSet('garantie'); w.gapNote='revopsire aripa';
  await w.gapSave();
  j=w.JOBS[0];
  eq(j.gapLog.length,2,'ket bejegyzes — egy munkan tobb ok is lehet');
  eq(j.gapLog[1].reason,'garantie','a masodik: garantie');
  eq(j.gapReason,'garantie','az aktualis a legutobbi');

  console.log('\n8. Valasz utan mar nem kerdez, de LATHATO marad');
  w.azRender();
  ok(!/az-gapb/.test(ov.innerHTML),'a "De ce?" gomb eltunt');
  ok(/notat:|rogzitve:|recorded:/i.test(ov.textContent),'a rogzitett ok kiirva');
  ok(/Garantie/i.test(ov.textContent),'  megnevezve');
  eq(w.RPWWorkflow.workMetrics(j).needsReason,false,'a motor sem keri tobbe');

  console.log('\n9. FARA MOTIV — ez a sajat hibank');
  w.JOBS=[J({t0:D(-20)})]; w.JOBS[0].id='g2'; w.JOBS[0].gapLog=undefined;
  w.gapOpen('g2'); w.gapSet('fara_motiv');
  await w.gapSave();
  eq(w.JOBS[0].gapReason,'fara_motiv','rogzitve');
  eq(w.JOBS[0].gapLog[0].reason,'fara_motiv','  a naploban is');

  console.log('\n10. Mind a hat ok elmentheto');
  const mind=['piese','asigurator','capacitate','vreme','garantie','fara_motiv'];
  for(const r of mind){
    w.JOBS=[J({t0:D(-20)})]; w.JOBS[0].id='t_'+r; w.JOBS[0].gapLog=undefined;
    w.gapOpen('t_'+r); w.gapSet(r); await w.gapSave();
    eq(w.JOBS[0].gapReason,r,'menthe: '+r);
  }
  w.toast=T0;

}catch(e){fail++;console.log('  x KIVETEL: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,3).join('\n'))}
console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
},1100);
