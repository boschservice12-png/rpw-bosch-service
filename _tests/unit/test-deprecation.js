// ── KIVEZETÉS-ŐR (a feladat 7-9. pontja) ──────────────────────────────
// Strict/secure módban a DEPRECATED utak (rpw_login, rpw_team,
// rpw_next_job_number, rpw_patch, rpw_patch_v2 közvetlen) SOHA nem
// hívhatók a frontendről. Legacy módban a tartalék él — a cutoverig.
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const R=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));

function auth(cfg){
  const w={RPW_CFG:cfg}; global.window=w; global.self=w;
  global.localStorage={_m:{},getItem(k){return this._m[k]||null},
    setItem(k,v){this._m[k]=v},removeItem(k){delete this._m[k]}};
  w.localStorage=global.localStorage;
  eval(R('rpw-auth.js'));
  return {A:w.RPWAuth,w};
}
const STRICT={SHOP_ID:'S',AUTH_REQUIRED:true,PATCH_RPC:'rpw_patch_v3'};
const LEGACY={SHOP_ID:'S',AUTH_REQUIRED:false,PATCH_RPC:'rpw_patch_v2'};

(async()=>{
console.log('\n1. Belépés név nélkül (rpw_login)');
{
  const {A}=auth(STRICT);
  const calls=[];
  const sb={rpc:async(n,a)=>{calls.push(n);return{data:{ok:true},error:null}}};
  const r=await A.login(sb,'1234',{});           // NINCS employeeId
  ok(calls.indexOf('rpw_login')<0,'strict mód: a rpw_login-t SENKI nem hívta');
  eq(r.ok,false,'  a névtelen belépés elutasítva');
  ok(/legacy_login_disabled/.test(JSON.stringify(r)),'  kóddal: legacy_login_disabled');
}
{
  const {A}=auth(LEGACY);
  const calls=[];
  const sb={rpc:async(n,a)=>{calls.push(n);return{data:{ok:false,error:'bad_pin'},error:null}}};
  await A.login(sb,'1234',{});
  ok(calls.indexOf('rpw_login')>=0,'legacy mód: a tartalék még él (cutoverig)');
}

console.log('\n2. Csapat-lekérés (rpw_team → rpw2_team)');
{
  const {A,w}=auth(STRICT);
  w.localStorage.setItem('rpw_auth',JSON.stringify({token:'t'.repeat(64),name:'X',exp:Date.now()+9e6}));
  const calls=[];
  const sb={rpc:async(n)=>{calls.push(n);return{data:{ok:true,team:[]},error:null}}};
  await A.team(sb,{});
  eq(calls,['rpw2_team'],'strict mód: rpw2_team megy, rpw_team nem');
}
{
  const {A,w}=auth(LEGACY);
  w.localStorage.setItem('rpw_auth',JSON.stringify({token:'t'.repeat(64),name:'X',exp:Date.now()+9e6}));
  const calls=[];
  const sb={rpc:async(n)=>{calls.push(n);return{data:{ok:true,team:[]},error:null}}};
  await A.team(sb,{});
  eq(calls,['rpw_team'],'legacy mód: a régi út él a cutoverig');
}

console.log('\n3. Munkalapszám (rpw_next_job_number → rpw_job_number)');
{
  const h=R('index.html');
  ok(/rpw_job_number/.test(h),'secure ágon a tokenes rpw_job_number');
  ok(/secureOn\(\)/.test(h.slice(h.indexOf('window.njNextNumber'),h.indexOf('window.njNextNumber')+900)),
     '  a választás a secure kapcsolón múlik');
}

console.log('\n4. A 008 elveszi a deprecated utak EXECUTE jogát');
{
  const m=R('_migrations/008_job_create_deprecations.sql');
  ['rpw_patch(','rpw_login(','rpw_next_job_number(','rpw_team(','rpw_patch_v2(']
    .forEach(fn=>ok(new RegExp('revoke execute on function public\\.'+fn.replace('(','\\(')).test(m),
      '  revoke: '+fn.slice(0,-1)));
  const rb=R('_migrations/008_rollback.sql');
  ok(!/grant execute on function public\.rpw_patch\(/.test(rb),
     'a rollback NEM adja vissza automatikusan a veszélyes jogokat');
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})();
