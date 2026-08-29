// A HIANYZO TESZT: betoltesi ut. Ez fogta volna el a phase:0 hibat.
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');

// a valodi szurofeltetelek kivagasa a fajlbol
// A TELJES feltetelt vagjuk ki, nem csak a vegét: a bevezeto "d&&" /
// "j&&j.id&&" resz maga is szur (null, id nelkuli sor), es eddig
// kimaradt a merésbol.
const fSb=html.match(/\.filter\(function\(d\)\{return (d&&[^}]+)\}\)/);
const fLs=html.match(/if\((j&&j\.id&&.+?)\)\{/);
if(!fSb||!fLs){console.error('nem talalom a szuroket');process.exit(1)}
// A feltetel a valodi migrateState-et hivja; a betoltesi ut szempontjabol
// annyi szamit, hogy az mindig visszaadja a munkat (es helyre teszi).
const keepSb=new Function('d','return '+fSb[1]);
const keepLs=new Function('migrateState','j','return '+fLs[1]).bind(null,function(j){
  if(typeof j.phase!=='number'||j.phase<1)j.phase=1; return j;});

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

// ── 2026-08-27: EZ A SZABALY VOLT A ROSSZ ────────────────────────
// A szuro eredetileg megkovetelte a szam tipusu `phase`-t. Kiderult,
// hogy a szerver-oldali letrehozas ota a munkakban NINCS `phase`:
// Ferenc adataiban 19 darab (MS-26-059-tol felfele, koztuk minden
// telefonrol feltoltott karddosszie) NEMAN kiesett a listabol.
// A `migrateState` pont ezt teszi helyre (phase>=1) — csak eddig a
// szuro UTAN futott. A sorrend megfordult; a szuro mar csak azt nezi,
// hogy egyaltalan objektum-e a sor.
console.log('\n1. Supabase-betolto szuro — a `phase` mar NEM felteltel');
ok(!!keepSb({phase:0}),'phase 0 atmegy');
ok(!!keepSb({phase:1}),'phase 1 (receptie) atmegy');
ok(!!keepSb({phase:7}),'phase 7 (lezart) atmegy');
ok(!!keepSb({}),'phase NELKULI sor is atmegy (ez volt a hiba)');
ok(!!keepSb({phase:null}),'  phase:null is');
ok(!!keepSb({phase:'1'}),'  string phase is — a migrateState helyre teszi');
ok(!keepSb(null),'de a null sor tovabbra sem megy at');
ok(!keepSb('nem objektum'),'  es a nem-objektum sem');

console.log('\n2. localStorage-betolto szuro — ugyanaz a szabaly');
ok(!!keepLs({id:'A',phase:0}),'phase 0 atmegy');
ok(!!keepLs({id:'A',phase:2}),'phase 2 atmegy');
ok(!!keepLs({id:'A'}),'phase nelkul IS atmegy');
ok(!keepLs({phase:2}),'id nelkul nem megy at');

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
