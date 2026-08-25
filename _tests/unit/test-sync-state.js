// ── P0: SZINKRONÁLLAPOT (F-304) + CAPABILITY FAIL-CLOSED (F-901..903) ──
// 1. A 'synced' KIZÁRÓLAG igazolt szerveres ok:true után jelenhet meg.
// 2. Minden kötelező állapot létezik és megkülönböztethető.
// 3. Strict módban a capability-hiba után az üzleti réteg nem indul.
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const R=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));

function mkSaver(rpcImpl, cfg){
  const w={RPW_CFG:Object.assign({PATCH_RPC:'rpw_patch_v2'},cfg||{})};
  global.window=w; global.self=w; global.localStorage={
    _m:{}, getItem(k){return this._m[k]||null}, setItem(k,v){this._m[k]=v}, removeItem(k){delete this._m[k]} };
  w.localStorage=global.localStorage;
  eval(R('rpw-queue.js')); eval(R('rpw-save.js'));
  const states=[];
  const sv=w.RPWSave.createSaver({sb:{rpc:rpcImpl}, onState:s=>states.push(s),
    rpcName:'rpw_patch_v2', debounceMs:1});
  return {sv,states,w};
}

(async()=>{
console.log('\n1. synced CSAK igazolt ok:true után');
{
  const {sv,states}=mkSaver(async()=>({data:{ok:true,version:2},error:null}));
  await sv.save({id:'J1',version:1,client:'K'});
  await new Promise(r=>setTimeout(r,50));
  ok(states.indexOf('synced')>=0,'sikeres mentés -> synced megjelent');
  ok(states.indexOf('saving_local')<=states.indexOf('synced'),'  előbb saving_local, aztán synced');
}
{
  const {sv,states}=mkSaver(async()=>({data:{ok:false,error:'not_allowed'},error:null}));
  await sv.save({id:'J1',version:1,client:'K'});
  await new Promise(r=>setTimeout(r,50));
  ok(states.indexOf('synced')<0,'{ok:false} után SOHA nincs synced');
  ok(states.some(s=>['failed','permission','rejected'].indexOf(s)>=0),
     '  helyette hibaállapot van: '+JSON.stringify(states));
}
{
  const {sv,states}=mkSaver(async()=>({data:{ok:false,error:'version_conflict',server_version:9},error:null}));
  await sv.save({id:'J1',version:1,client:'K'});
  await new Promise(r=>setTimeout(r,50));
  ok(states.indexOf('synced')<0,'konfliktus után nincs synced');
  ok(states.indexOf('conflict')>=0,'  van conflict állapot');
}
{
  const {sv,states}=mkSaver(async()=>{throw new Error('FetchError')});
  await sv.save({id:'J1',version:1,client:'K'});
  await new Promise(r=>setTimeout(r,80));
  ok(states.indexOf('synced')<0,'hálózati hiba után nincs synced');
}

console.log('\n2. A kötelező állapot-készlet létezik a kódban');
{
  const src=R('rpw-save.js')+R('rpw-data.js');
  ['saving_local','syncing','synced','offline','retry','failed','conflict']
    .forEach(st=>ok(new RegExp("'"+st+"'").test(src),'  állapot létezik: '+st));
  // permission és auth: a serverRejection kind-jei fedik
  ok(/permission/.test(src),'  állapot létezik: permission');
}

console.log('\n3. Capability fail-closed: strict módban a config NULLÁZÓDIK');
{
  const w={RPW_CFG:{PRODUCTION:false,SERVER_TRANSITIONS:true,PATCH_RPC:'rpw_patch_v3',AUTH_REQUIRED:true}};
  global.window=w; global.self=w;
  eval(R('rpw-guard.js'));
  const G=w.RPWGuard;
  const bad=G.checkCapabilities({ok:true,schema_version:'003',rpcs:[]},w.RPW_CFG);
  eq(bad.ok,false,'hiányos szerver -> nem ok');
  ok(G.strictNeeded(w.RPW_CFG)===true,'  strict mód (SERVER_TRANSITIONS) -> kötelező a leállás');
  // halt: a config nullázása = SEMMILYEN további supabase-hívás nem lehetséges,
  // mert minden oldal a RPW_CFG-ből építi a klienst.
  G.halt('teszt',['x']);
  eq(w.RPW_CFG,null,'  halt() után RPW_CFG=null — nincs DB-kliens, nincs lista, nincs mentés, nincs flush');
}
{
  // nem-strict (mai éles): a halt NEM fut, a config megmarad — ez a hotfix #2 viselkedése
  const w={RPW_CFG:{PRODUCTION:false,SERVER_TRANSITIONS:false,PATCH_RPC:'rpw_patch_v2',AUTH_REQUIRED:false}};
  global.window=w; global.self=w;
  eval(R('rpw-guard.js'));
  ok(w.RPWGuard.strictNeeded(w.RPW_CFG)===false,'legacy mód: nem strict — óvatos futás, nincs leállás');
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})();
