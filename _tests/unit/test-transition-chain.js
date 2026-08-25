// ── P0: FÁZISLÁNC (F-111/112/113) — a kliens-oldali zárak ─────────────
// 1. PRODUCTION-ban NINCS lokális workflow-fallback (fail-closed).
// 2. A lezárhatóság-előnézet ugyanattól a szabályforrástól kérdez,
//    amit a rpw_transition kényszerít (rpw_can_complete).
// 3. Mind a 8 oldal kritikus művelete a commitCriticalTransition-ön megy.
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const R=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));

function wf(cfg, data){
  const w={RPW_CFG:cfg}; if(data) w.RPWData=data;
  global.window=w; global.self=w;
  eval(R('rpw-workflow.js'));
  return {W:w.RPWWorkflow, w};
}

(async()=>{
console.log('\n1. PRODUCTION-ban a lokális fallback TILOS');
{
  // szerver-út NINCS (SERVER_TRANSITIONS=false), de PRODUCTION=true:
  const {W}=wf({PRODUCTION:true, SERVER_TRANSITIONS:false});
  const job={id:'J',phase:2,phases:{2:{status:'active'}},version:3};
  let mutated=false;
  const r=await W.commitCriticalTransition(job,()=>{mutated=true;return{ok:true}},
    {action:'complete',phase:2});
  eq(r.ok,false,'a művelet elutasítva');
  eq(r.error.code,'local_fallback_forbidden','  local_fallback_forbidden');
  ok(!mutated,'  a helyi mutáció NEM futott le');
  eq(job.phases[2].status,'active','  az állapot változatlan');
}

console.log('\n2. Nem-production módban a helyi út él (mai éles működés)');
{
  const {W}=wf({PRODUCTION:false, SERVER_TRANSITIONS:false});
  const job={id:'J',phase:2,phases:{2:{status:'active'}},version:3};
  const r=await W.commitCriticalTransition(job,()=>({ok:true}),{action:'complete',phase:2});
  eq(r.ok,true,'a helyi út működik, ha nincs production-zár');
}

console.log('\n3. Lezárhatóság-előnézet (F-112/113)');
{
  // kikapcsolt szerver-átmenet: {server:false} — a helyi lista dönt
  const {W}=wf({SERVER_TRANSITIONS:false});
  const r0=await W.loadServerMissing({id:'J'},2);
  eq(r0.server,false,'kikapcsolva: server:false');

  // bekapcsolva: a rpw_can_complete válaszát adja tovább
  const data={__instance:{serverCanComplete:async(id,ph)=>({ok:true,can:false,
    missing:[{code:'talon',message:'Talon lipsă'}],version:4})}};
  const {W:W2}=wf({SERVER_TRANSITIONS:true},data);
  const r1=await W2.loadServerMissing({id:'J'},2);
  eq(r1.server,true,'bekapcsolva: a szervert kérdezi');
  eq(r1.can,false,'  a szerver mondja meg, zárható-e');
  eq(r1.missing[0].code,'talon','  a hiánylista a szervertől jön');

  // szerverhiba: nem hazudik zárhatóságot
  const dataErr={__instance:{serverCanComplete:async()=>({ok:false,error:{code:'unauthorized'}})}};
  const {W:W3}=wf({SERVER_TRANSITIONS:true},dataErr);
  const r2=await W3.loadServerMissing({id:'J'},2);
  eq(r2.server,true,'hiba: server:true');
  eq(r2.ok,false,'  de ok:false — nem hazudik zárhatóságot');
}

console.log('\n4. Mind a 8 oldal kritikus művelete a commitCriticalTransition-ön megy');
{
  const PAGES=['rpw-recepcio-red.html','rpw-evaluare-red.html','rpw-reconstatare-red.html',
    'rpw-tinichigerie-red.html','rpw-vopsitorie-red.html','rpw-control-red.html',
    'rpw-inchidere-red.html','rpw-dosar.html'];
  PAGES.forEach(p=>{
    const h=R(p);
    ok(/commitCriticalTransition/.test(h), p+': commitCriticalTransition-t hív');
    ok(/action:\s*'/.test(h), '  '+p+': action-t ad át (a szerver-út feltétele)');
    // senki nem írja közvetlenül a phases[..].status-t mentés előtt kritikus úton kívül:
    ok(!/rpc\(\s*'rpw_transition'/.test(h), '  '+p+': nem hívja KÖZVETLENÜL az RPC-t (a workflow-réteg a kapu)');
  });
}

console.log('\n5. A rpw_can_complete kliens-hívása létezik és a tokent használja');
{
  const d=R('rpw-data.js');
  ok(/serverCanComplete/.test(d),'rpw-data.js: serverCanComplete megvan');
  ok(/rpw_can_complete/.test(d),'  a rpw_can_complete RPC-t hívja');
  ok(/p_token:\s*authToken\(\)/.test(d),'  a tokent a munkamenetből veszi');
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})();
