// ════════════════════════════════════════════════════════════════
//  P0.3 — KLIENS: minden művelet TOKEN-alapú RPC-n megy
//  A szerveroldali bizonyítás külön futott (SQL, két szerviz).
//  Ez azt méri, hogy a kliens tényleg oda fordul.
// ════════════════════════════════════════════════════════════════
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

let RPC=[], RESP={}, TBL=[];
function Q(t){this.t=t;this.ops=[]}
['eq','is','not','select','update','delete'].forEach(m=>{
  Q.prototype[m]=function(){this.ops.push([m].concat([].slice.call(arguments)));return this}});
Q.prototype.order=function(){TBL.push(this);return Promise.resolve({data:[],error:null})};
Q.prototype.single=function(){TBL.push(this);return Promise.resolve({data:null,error:null})};
Q.prototype.then=function(r){TBL.push(this);return Promise.resolve({data:[],error:null}).then(r)};
const sb={ from:t=>new Q(t),
           rpc:(n,a)=>{RPC.push([n,a]);return Promise.resolve(RESP[n]||{data:null,error:null})} };

const mem={};
const ls={getItem:k=>mem[k]||null,setItem:(k,v)=>{mem[k]=v},removeItem:k=>{delete mem[k]}};
global.window={RPW_CFG:{SHOP_ID:'S1',PATCH_RPC:'rpw_patch_v3'},localStorage:ls};
global.self=global.window; global.localStorage=ls;
eval(R('rpw-auth.js')); eval(R('rpw-db.js'));
const A=window.RPWAuth, DB=window.RPWDb;
const TOK='t'.repeat(64);
mem['rpw_auth']=JSON.stringify({token:TOK,rawRole:'Műszakvezető',name:'Teszt',exp:Date.now()+9e6});

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));
const okResp=rows=>({data:{ok:true,rows:rows||[]},error:null});

(async()=>{
console.log('\n1. PATCH_RPC=rpw_patch_v3 → minden az új úton megy');
for (const [nev, fn, rpcNev] of [
  ['listActive',  ()=>DB.listActive(sb),        'rpw_jobs_list'],
  ['listTrashed', ()=>DB.listTrashed(sb),       'rpw_jobs_list'],
  ['getRow',      ()=>DB.getRow(sb,'j1'),       'rpw_job_get'],
  ['softDelete',  ()=>DB.softDelete(sb,'j1'),   'rpw_job_trash'],
  ['restore',     ()=>DB.restore(sb,'j1'),      'rpw_job_restore'],
  ['purge',       ()=>DB.purge(sb,'j1'),        'rpw_job_purge'],
]){
  RPC=[]; TBL=[];
  RESP={[rpcNev]:{data:{ok:true,rows:[],id:'j1',data:{},version:1},error:null}};
  await fn();
  ok(RPC.length===1 && RPC[0][0]===rpcNev, nev+' → '+rpcNev);
  eq(TBL.length,0,'  '+nev+': NINCS közvetlen táblaművelet');
  ok(RPC[0] && RPC[0][1] && RPC[0][1].p_token===TOK, '  '+nev+': a tokent átadja');
}

console.log('\n2. A MENTÉS is');
RPC=[]; TBL=[];
RESP={rpw_patch_v3:{data:{ok:true,data:{a:1},version:2},error:null}};
await DB.patchV2(sb,'j1',{a:1},{phase:'4'});
eq(RPC[0][0],'rpw_patch_v3','patchV2 → rpw_patch_v3');
eq(RPC[0][1].p_token,TOK,'  tokennel');
eq(RPC[0][1].p_id,'j1','  a munka azonosítójával');
eq(RPC[0][1].p_phase,'4','  a fázissal');
ok(!('p_actor' in RPC[0][1]),'  NEM küld actort — azt a szerver tudja a tokenből');
ok(JSON.stringify(RPC[0][1]).indexOf('shop_id')<0,'  NEM küld shop_id-t');

console.log('\n3. A szerver elutasítását a kliens is hibaként adja tovább');
RESP={rpw_job_get:{data:{ok:false,error:'not_found'},error:null}};
let r=await DB.getRow(sb,'idegen');
ok(!!r.error,'idegen munka → hiba');
ok(/not_found/.test(JSON.stringify(r.error)),'  az ok is átjön');
RESP={rpw_patch_v3:{data:{ok:false,error:'unauthorized'},error:null}};
r=await DB.patchV2(sb,'j1',{a:1},{});
ok(!!r.error,'token nélküli mentés → hiba');

console.log('\n4. VISSZAÁLLÁS: PATCH_RPC=rpw_patch_v2 → a régi út');
window.RPW_CFG.PATCH_RPC='rpw_patch_v2';
RPC=[]; TBL=[];
await DB.listActive(sb);
eq(RPC.length,0,'listActive: nincs RPC');
eq(TBL.length,1,'  közvetlen táblaművelet (régi út)');
ok(TBL[0].ops.some(o=>o[0]==='eq'&&o[1]==='shop_id'),'  a régi kliensoldali szűrés megvan');
RPC=[];
await DB.patchV2(sb,'j1',{a:1},{});
eq(RPC[0][0],'rpw_patch_v2','patchV2 → a régi RPC');
ok('p_actor' in RPC[0][1],'  a régi úton megy az actor');
window.RPW_CFG.PATCH_RPC='rpw_patch_v3';

console.log('\n5. Token nélkül is elindul (a szerver utasít el)');
delete mem['rpw_auth'];
RPC=[];
RESP={rpw_jobs_list:{data:{ok:false,error:'unauthorized'},error:null}};
r=await DB.listActive(sb);
eq(RPC[0][1].p_token,null,'null tokent küld');
ok(!!r.error,'  és a szerver elutasítja');

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})();
