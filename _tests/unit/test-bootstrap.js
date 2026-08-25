// ── KÖZÖS BOOTSTRAP (29. pont) — minden lépés fail-closed ─────────────
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const R=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));

function boot(pre){
  const w={}; global.window=w; global.self=w;
  if(pre) pre(w);
  eval(R('rpw-bootstrap.js'));
  return w;
}

(async()=>{
console.log('\n1. Nincs config -> nem indul');
{
  const w=boot();
  let failed=null;
  const r=await w.RPWBootstrap.start({onFail:e=>failed=e});
  eq(r.code,'no_config','no_config'); ok(!!failed,'  onFail lefutott');
}

console.log('\n2. Érvénytelen production-config -> nem indul');
{
  const w=boot(w=>{
    w.RPW_CFG={SB_URL:'u',SB_KEY:'k',PRODUCTION:true,AUTH_REQUIRED:false};
    w.RPWGuard={productionSafety:c=>({ok:false,invalid:['AUTH_REQUIRED']})};
  });
  const r=await w.RPWBootstrap.start({});
  eq(r.code,'production_config_invalid','production_config_invalid');
}

console.log('\n3. AUTH_REQUIRED + nincs munkamenet -> nem indul');
{
  const w=boot(w=>{
    w.RPW_CFG={SB_URL:'u',SB_KEY:'k',AUTH_REQUIRED:true};
    w.RPWAuth={session:()=>null};
  });
  const r=await w.RPWBootstrap.start({});
  eq(r.code,'no_session','no_session');
}

console.log('\n4. Capability-hiba strict módban -> az üzleti init NEM fut');
{
  let readyRan=false;
  const w=boot(w=>{
    w.RPW_CFG={SB_URL:'u',SB_KEY:'k',AUTH_REQUIRED:false};
    w.supabase={createClient:()=>({rpc:async()=>({data:null,error:null})})};
    w.RPWGuard={verifyServer:async(sb,cfg)=>{ w.RPW_CFG=null; return {ok:false,problems:['no_capabilities']}; }};
  });
  const r=await w.RPWBootstrap.start({onReady:()=>{readyRan=true}});
  eq(r.code,'capabilities_failed','capabilities_failed');
  ok(!readyRan,'  az onReady (üzleti logika) NEM futott le');
}

console.log('\n5. Minden rendben -> ctx a helyes sorrend után');
{
  const order=[];
  const w=boot(w=>{
    w.RPW_CFG={SB_URL:'u',SB_KEY:'k',AUTH_REQUIRED:false};
    w.RPWAuth={session:()=>({name:'T'})};
    w.supabase={createClient:()=>{order.push('sb');return {rpc:async()=>({data:{ok:true},error:null})}}};
    w.RPWData={init:()=>order.push('data')};
    w.RPWGuard={verifyServer:async()=>{order.push('caps');return {ok:true}}};
  });
  let ctx=null;
  const r=await w.RPWBootstrap.start({onReady:c=>{order.push('page');ctx=c}});
  eq(r.ok,true,'elindult');
  eq(order,['sb','data','caps','page'],'  a sorrend: kliens → adat → capabilities → oldal');
  ok(!!ctx.sb && !!ctx.session,'  a ctx tartalmazza a klienst és a munkamenetet');
}

console.log('\n6. requireJob: hiányzó ?job= -> nem indul');
{
  const w=boot(w=>{
    w.RPW_CFG={SB_URL:'u',SB_KEY:'k'};
    w.supabase={createClient:()=>({rpc:async()=>({data:{ok:true},error:null})})};
  });
  const r=await w.RPWBootstrap.start({requireJob:true});
  eq(r.code,'no_job','no_job');
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})();
