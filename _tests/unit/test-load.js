// A HIANYZO TESZT: betoltesi ut. Ez fogta volna el a phase:0 hibat.
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');

// a valodi szurofeltetelek kivagasa a fajlbol
const fSb=html.match(/\.filter\(function\(d\)\{return d&&([^}]+)\}\)/);
const fLs=html.match(/if\(j&&j\.id&&([^)]+)\)\{/);
if(!fSb||!fLs){console.error('nem talalom a szuroket');process.exit(1)}
const keepSb=new Function('d','return '+fSb[1]);
const keepLs=new Function('j','return '+fLs[1]);

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

console.log('\n1. Supabase-betolto szuro (ez dobta ki a programare-kat)');
ok(keepSb({phase:0})===true,'phase 0 (programare, auto meg nincs itt) ATMEGY');
ok(keepSb({phase:1})===true,'phase 1 (receptie) atmegy');
ok(keepSb({phase:7})===true,'phase 7 (lezart) atmegy');
ok(keepSb({})===false,'phase nelkuli sor kiesik');
ok(keepSb({phase:null})===false,'phase:null kiesik');
ok(keepSb({phase:'1'})===false,'string phase kiesik (hibas adat)');

console.log('\n2. localStorage-betolto szuro');
ok(keepLs({phase:0})===true,'phase 0 atmegy');
ok(keepLs({phase:2})===true,'phase 2 atmegy');
ok(keepLs({})===false,'phase nelkul kiesik');

console.log('\n3. Regresszio: a 6 elo munkad mind phase 0');
const eloMunkak=[
  {number:'MS-26-041',phase:0},{number:'MS-26-042',phase:0},
  {number:'MS-26-047',phase:0},{number:'MS-26-048',phase:0},
  {number:'MS-26-049',phase:0},{number:'MS-26-050',phase:0}];
ok(eloMunkak.filter(keepSb).length===6,'mind a 6 betoltodik (elotte: 0)');

console.log('\n4. Munkaszam-kiosztas (offline tartalek)');
const numFn=html.match(/window\.njNextNumber=async function\(\)\{[\s\S]*?\n\};/);
if(!numFn){console.error('njNextNumber nem talalhato');process.exit(1)}
global.sb={rpc:async()=>{throw new Error('offline')}};   // szerver nem elerheto
global.JOBS=[];global.window=global;
eval(numFn[0]);
const yr=new Date().getFullYear().toString().slice(-2);
(async()=>{
  JOBS=[{number:'MS-'+yr+'-048'},{number:'MS-'+yr+'-012'}];
  ok(await njNextNumber()==='MS-'+yr+'-049','offline: legmagasabb (048) +1 = 049, NEM a lista hossza');
  JOBS=[{number:'MS-'+yr+'-005'}];
  ok(await njNextNumber()==='MS-'+yr+'-006','egy elemu lista: 005 -> 006');
  JOBS=[];
  ok(await njNextNumber()==='MS-'+yr+'-001','ures lista -> 001');
  JOBS=[{number:'XX-99-777'},{number:null},{number:'MS-'+yr+'-003'}];
  ok(await njNextNumber()==='MS-'+yr+'-004','mas prefixet es null-t figyelmen kivul hagy');

  // szerver elerheto -> a szerver szava dont
  global.sb={rpc:async()=>({data:'MS-'+yr+'-777',error:null})};
  eval(numFn[0]);
  JOBS=[{number:'MS-'+yr+'-001'}];
  ok(await njNextNumber()==='MS-'+yr+'-777','online: a szerver atomi szamlaloja nyer');

  console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
  process.exit(fail?1:0);
})();
