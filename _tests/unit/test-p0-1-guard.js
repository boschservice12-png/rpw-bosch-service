// ════════════════════════════════════════════════════════════════
//  P0.1 — BEJELENTKEZÉSI SORREND + ŐRZÖTTSÉG
//  Elfogadási feltétel a promptból:
//   · AUTH_REQUIRED=true + nincs munkamenet  → átirányít a loginra
//   · érvényes munkamenet                    → megnyílik
//   · lejárt / visszavont munkamenet         → NEM nyílik meg
//   · a teszt KÖZVETLEN URL-megnyitással is  (nem csak menüből)
// ════════════════════════════════════════════════════════════════
const fs=require('fs'), path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const DIR=__dirname;
const R=f=>fs.readFileSync(path.join(DIR,f),'utf8');

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));

// ── A guard viselkedésének futtatása igazi modullal ──────────────
function makeEnv(cfg, sessionRec, nowMs){
  const mem={};
  if(sessionRec!==undefined) mem['rpw_auth']=JSON.stringify(sessionRec);
  const ls={getItem:k=>mem[k]||null, setItem:(k,v)=>{mem[k]=v}, removeItem:k=>{delete mem[k]}};
  let navigated=null;
  const win={ RPW_CFG:cfg, localStorage:ls,
              location:{ pathname:'/rpw-cos.html', search:'?job=X', protocol:'https:',
                         assign:u=>{navigated=u} } };
  win.self=win; win.window=win;
  const g=global;
  const old={window:g.window,self:g.self,localStorage:g.localStorage,location:g.location,Date:g.Date};
  g.window=win; g.self=win; g.localStorage=ls; g.location=win.location;
  if(nowMs){ const RD=Date; g.Date=class extends RD{ static now(){return nowMs} constructor(...a){ a.length?super(...a):super(nowMs) } }; }
  eval(R('rpw-auth.js'));
  const A=win.RPWAuth;
  const res={ auth:A, nav:()=>navigated, restore:()=>{Object.assign(g,old)} };
  return res;
}
const validRec=exp=>({token:'t'.repeat(64),role:'admin',name:'Teszt Elek',
                      employeeId:'E1',shopId:'S1',exp:exp});

console.log('\n1. AUTH_REQUIRED=false → az őr nem avatkozik be');
{
  const e=makeEnv({AUTH_REQUIRED:false});
  eq(e.auth.guard(),true,'átengedi');
  eq(e.nav(),null,'nem irányít át');
  e.restore();
}

console.log('\n2. AUTH_REQUIRED=true + NINCS munkamenet → login');
{
  const e=makeEnv({AUTH_REQUIRED:true});
  eq(e.auth.guard(),false,'megállítja');
  ok(/rpw-login\.html/.test(e.nav()||''),'a login oldalra irányít');
  ok(/next=/.test(e.nav()||''),'  és megjegyzi, hova akart menni');
  ok(/rpw-cos/.test(decodeURIComponent(e.nav()||'')),'  KÖZVETLEN URL is (nem csak a főoldal)');
  e.restore();
}

console.log('\n3. Érvényes munkamenet → megnyílik');
{
  const now=1e12;
  const e=makeEnv({AUTH_REQUIRED:true}, validRec(now+3600e3), now);
  eq(e.auth.guard(),true,'átengedi');
  eq(e.nav(),null,'nem irányít át');
  eq(e.auth.name(),'Teszt Elek','ismeri a belépettet');
  e.restore();
}

console.log('\n4. LEJÁRT munkamenet → NEM nyílik meg');
{
  const now=1e12;
  const e=makeEnv({AUTH_REQUIRED:true}, validRec(now-1000), now);
  eq(e.auth.guard(),false,'megállítja');
  ok(/rpw-login/.test(e.nav()||''),'  loginra irányít');
  eq(e.auth.session(),null,'  a lejárt munkamenet nem érvényes');
  e.restore();
}

console.log('\n5. HIÁNYOS / manipulált munkamenet → NEM nyílik meg');
{
  const now=1e12;
  [ {token:'',exp:now+3600e3},                       // nincs token
    {token:'x',exp:now+3600e3},                      // túl rövid token
    {token:'t'.repeat(64)},                          // nincs lejárat
    'nem-json'
  ].forEach(function(bad,i){
    const e=makeEnv({AUTH_REQUIRED:true}, bad, now);
    eq(e.auth.guard(),false,'manipulált #'+i+' → megállítja');
    e.restore();
  });
}

// ── A BETÖLTÉSI SORREND ellenőrzése a tényleges HTML-ekben ───────
console.log('\n6. A guard-hívás a CONFIG UTÁN fut minden őrzött oldalon');
const PAGES=['index.html','rpw-cos.html','rpw-cleanup.html','rpw-control-red.html',
             'rpw-dosar.html','rpw-evaluare-red.html','rpw-inchidere-red.html',
             'rpw-recepcio-red.html','rpw-reconstatare-red.html','rpw-tinichigerie-red.html',
             'rpw-vopsitorie-red.html'];
PAGES.forEach(function(p){
  let s; try{ s=R(p) }catch(e){ return; }              // ami nincs a mappában, kihagyjuk
  const lines=s.split('\n');
  const iCfg=lines.findIndex(l=>/src="rpw-config\.js"/.test(l));
  const iAuth=lines.findIndex(l=>/src="rpw-auth\.js"/.test(l));
  const iGuard=lines.findIndex(l=>/RPWAuth\.guard\(\)/.test(l));
  ok(iCfg>=0,p+': betölti a configot');
  ok(iAuth>=0,p+': betölti az auth modult');
  ok(iGuard>=0,p+': van őr-hívás');
  if(iCfg>=0&&iGuard>=0) ok(iGuard>iCfg, p+': az őr a CONFIG UTÁN fut  (config:'+(iCfg+1)+' őr:'+(iGuard+1)+')');
  if(iAuth>=0&&iGuard>=0) ok(iGuard>iAuth, p+': az őr az AUTH UTÁN fut');
});

console.log('\n7. A szándékosan nyilvános oldal dokumentálva');
{
  const u=R('rpw-upload.html');
  ok(!/RPWAuth\.guard\(\)/.test(u),'rpw-upload.html: nincs őr (az ÜGYFÉL nyitja)');
  ok(/SZÁNDÉKOSAN NINCS PIN-ŐR/.test(u),'  és ez ki van írva, nem mulasztásnak látszik');
  ok(/megkerülhető/.test(u),'  a maradék kockázat is jelölve');
}

console.log('\n8. A production-őr a négy kapcsolót nézi');
{
  const g=global, old={window:g.window,self:g.self};
  const win={}; win.self=win; g.window=win; g.self=win;
  eval(R('rpw-guard.js'));
  const G=win.RPWGuard;
  eq(G.productionSafety({PRODUCTION:false}).ok,true,'PRODUCTION=false → nem korlátoz');
  const bad=G.productionSafety({PRODUCTION:true,AUTH_REQUIRED:false,PATCH_RPC:'rpw_patch_v2',
                                SERVER_TRANSITIONS:false,STORAGE_PRIVATE:false});
  eq(bad.ok,false,'PRODUCTION=true + hiányos → NEM indul');
  // v3: KILENC feltétel — az utolsó öt csak ellenőrzés után állítható true-ra
  eq(bad.invalid.length, 9, '  mind a KILENC hiányt megnevezi');
  eq(G.productionSafety({PRODUCTION:true,AUTH_REQUIRED:true,PATCH_RPC:'rpw_patch_v3',
                         SERVER_TRANSITIONS:true,STORAGE_PRIVATE:true,
                         RLS_LOCKDOWN_VERIFIED:true,RPC_CONSISTENCY_VERIFIED:true,
                         BUSINESS_GATES_SERVER_SIDE:true,INTEGRATION_TESTS_PASSED:true,
                         ALL_ACTIVE_EMPLOYEES_HAVE_PIN:true}).ok,true,
     'mind a kilenc a helyén → indulhat');
  Object.assign(g,old);
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
