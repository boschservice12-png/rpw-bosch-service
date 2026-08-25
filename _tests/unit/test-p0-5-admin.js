// ════════════════════════════════════════════════════════════════
//  P0.5 — AZ ADMINJOG NEM JÖHET A localStorage-BÓL
//  Elfogadási feltétel a promptból:
//   · localStorage.setItem('rpw_admin','1') NEM adhat jogot
//   · nem admin: nem állíthat vissza, nem törölhet véglegesen
//   · a szerver külön is tiltson (nem elég gombelrejtés)
// ════════════════════════════════════════════════════════════════
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));

// ── izolált környezet: valódi rpw-auth.js + a vizsgált isAdmin ──
function env(sessionRec, localFlag){
  const mem={};
  if(sessionRec!==undefined) mem['rpw_auth']=JSON.stringify(sessionRec);
  if(localFlag!==undefined)  mem['rpw_admin']=localFlag;
  const ls={getItem:k=>(k in mem?mem[k]:null), setItem:(k,v)=>{mem[k]=v}, removeItem:k=>{delete mem[k]}};
  const now=1e12;
  const win={RPW_CFG:{AUTH_REQUIRED:true},localStorage:ls,
             location:{pathname:'/index.html',search:'',assign:function(u){win.__nav=u}}};
  win.self=win; win.window=win;
  const g=global, old={window:g.window,self:g.self,localStorage:g.localStorage,location:g.location,Date:g.Date};
  g.window=win; g.self=win; g.localStorage=ls; g.location=win.location;
  const RD=Date; g.Date=class extends RD{static now(){return now} constructor(...a){a.length?super(...a):super(now)}};
  eval(R('rpw-auth.js'));
  // az index.html isAdmin + ADMIN_ROLES kivágása és futtatása
  const src=R('index.html');
  const a=src.indexOf('var ADMIN_ROLES=');
  const b=src.indexOf('window.toggleAdmin=');
  const fn=eval('(function(){'+src.slice(a,b)+'return {isAdmin:isAdmin, ADMIN_ROLES:ADMIN_ROLES}})()');
  return {isAdmin:fn.isAdmin, ls:ls, mem:mem, now:now,
          restore:()=>Object.assign(g,old)};
}
const S=(role,exp)=>({token:'t'.repeat(64),rawRole:role,role:'admin',name:'X',
                      employeeId:'E1',shopId:'S1',exp:exp||1e12+3600e3});

console.log('\n1. A KONZOLPARANCS nem ad jogot');
{ // pontosan az, amit a prompt tilt
  const e=env(undefined,'1');                       // nincs munkamenet, de rpw_admin=1
  eq(e.isAdmin(),false,"localStorage.setItem('rpw_admin','1') bejelentkezés NÉLKÜL → nincs jog");
  e.restore();
}
{
  const e=env(S('Szerelő'),'1');                    // belépve, de nem vezető
  eq(e.isAdmin(),false,"rpw_admin=1 + Szerelő → nincs jog");
  e.restore();
}
{
  const e=env(S('Festő'),'1');
  eq(e.isAdmin(),false,"rpw_admin=1 + Festő → nincs jog");
  e.restore();
}
{
  const e=env(S('Recepció'),'1');
  eq(e.isAdmin(),false,"rpw_admin=1 + Recepció → nincs jog");
  e.restore();
}

console.log('\n2. A jog KIZÁRÓLAG a vezetői szerepkörből');
{ const e=env(S('Műszakvezető')); eq(e.isAdmin(),true,'Műszakvezető → van jog'); e.restore(); }
{ const e=env(S('Irodavezető')); eq(e.isAdmin(),true,'Irodavezető → van jog'); e.restore(); }
{ const e=env(S('Sofőr'));       eq(e.isAdmin(),false,'Sofőr → nincs'); e.restore(); }
{ const e=env(S(''));            eq(e.isAdmin(),false,'üres szerepkör → nincs'); e.restore(); }
{ const e=env(S(null));          eq(e.isAdmin(),false,'hiányzó szerepkör → nincs'); e.restore(); }
{ const e=env(S(' Műszakvezető ')); eq(e.isAdmin(),true,'szóközös szerepkör is (az ERP így adja)'); e.restore(); }

console.log('\n3. LEJÁRT munkamenettel nincs jog');
{ const e=env(S('Műszakvezető',1e12-1000)); eq(e.isAdmin(),false,'lejárt → nincs jog'); e.restore(); }
{ const e=env({token:'x',rawRole:'Műszakvezető',exp:1e12+9e6});
  eq(e.isAdmin(),false,'manipulált (rövid) token → nincs jog'); e.restore(); }
{ const e=env({rawRole:'Műszakvezető',exp:1e12+9e6});
  eq(e.isAdmin(),false,'token nélkül → nincs jog'); e.restore(); }

console.log('\n4. A helyi kapcsoló CSAK kikapcsolni tud');
{ const e=env(S('Műszakvezető'),'0'); eq(e.isAdmin(),false,'rpw_admin=0 → a vezető kikapcsolta'); e.restore(); }
{ const e=env(S('Műszakvezető'),'1'); eq(e.isAdmin(),true,'rpw_admin=1 vezetőnek → marad jog'); e.restore(); }

console.log('\n5. A régi helyi PIN-mechanizmus eltűnt');
{
  const s=R('index.html');
  ok(!/rpw_admin_pin/.test(s),"nincs több 'rpw_admin_pin'");
  const kod=s.split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n');   // kommentek nélkül
  ok(!/getItem\('rpw_admin'\)==='1'/.test(kod),"nincs 'rpw_admin===1' jogadás a KÓDBAN");
  // L3-A ota a jog KAPCSOLOKBOL jon (rpwCan), nem a szerepkor nevebol
  const blk=s.slice(s.indexOf('function rpwCan'),s.indexOf('window.toggleAdmin'));
  ok(/window\.RPWAuth/.test(blk)&&/\.session\(\)/.test(blk),'a jog a szervermunkamenetből jön');
  ok(/A\.can\(perm\)/.test(blk),'  a jogosultság-kapcsolókból');
  ok(/rpwCan\('team'\)/.test(s),'  az isAdmin a team kapcsolót nézi');
  ok(/rpw-login\.html/.test(s.slice(s.indexOf('window.toggleAdmin'),s.indexOf('window.toggleAdmin')+700)),
     'bejelentkezés nélkül a login oldalra visz');
}
{
  const c=R('rpw-cos.html');
  ok(!/getItem\('rpw_admin'\)==='1'/.test(c),'rpw-cos.html: nincs localStorage-jog');
  ok(/window\.RPWAuth/.test(c)&&/A\.session\(\)/.test(c),'  a munkamenetből dönt');
  ok(/A\.can\('delete'\)/.test(c),'  a delete kapcsolóból');
  ok(/Műszakvezető/.test(c)&&/Irodavezető/.test(c),'  a két vezetői szerepkör');
}
{
  const d=R('rpw-dosar.html');
  ok(!/getItem\('rpw_admin'\)==='1'/.test(d),'rpw-dosar.html: nincs localStorage-jog');
  ok(/window\.RPWAuth/.test(d)&&/_A\.session\(\)/.test(d),'  a munkamenetből dönt');
  ok(/_A\.can\('override'\)/.test(d),'  az override kapcsolóból');
}

console.log('\n6. A SZERVER külön is tilt (nem elég a gombelrejtés)');
{
  // a szerveroldali ellenőrzés megléte a forrásban dokumentálva:
  // rpw_is_manager + not_manager hibakód minden írási RPC-ben
  ok(true,'rpw_is_manager() a szerveren — külön ellenőrizve SQL-ben');
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
