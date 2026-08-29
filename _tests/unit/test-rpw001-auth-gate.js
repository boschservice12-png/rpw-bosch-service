// ════════════════════════════════════════════════════════════════
//  RPW-001 — A HITELESITES NELKULI HOZZAFERES LEZARASA (kliens-oldal)
//
//  Amit ez a teszt oriz, harom kulon rés volt:
//
//  1. A BUKOTT OR NEM ALLITOTTA MEG A LAPOT. A guard() elinditotta az
//     atiranyitast es visszaadott false-t — amit egyetlen hivo sem nezett
//     meg. Az atiranyitas nem azonnali: a lap tovabb futott, lekerte a
//     listat es kirajzolta az ugyfeleket.
//  2. AZ ADATREEG NEM VOLT FAIL-CLOSED. A keres a halozaton MEGIS elment.
//  3. A KEPESSEG-LISTA MEGBENITOTTA VOLNA AZ UZEMET. A guard fixen kovetelte
//     a rpw_transition / rpw_requirements fuggvenyeket, amelyek az ELO
//     szerveren nem leteznek — igy az AUTH_REQUIRED=true bekapcsolasa
//     halt()-ot valtott volna ki mindenkinek.
//
//  A teszt a VALODI modulokat futtatja, es kemmel figyeli, hogy elindul-e
//  egyaltalan adatbazis-hivas. Szemelyes adat nincs a fixture-ben.
// ════════════════════════════════════════════════════════════════
const path=require('path');
const {JSDOM}=require(path.join(__dirname,'..','..','node_modules','jsdom'));
const ROOT=path.resolve(__dirname,'..','..');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

const TOKEN='t'.repeat(64);
function ervenyesSession(){ return JSON.stringify({token:TOKEN,name:'TESZT',employeeId:'E1',
  shopId:'S1',can:{open:true},exp:Date.now()+9e6}); }
function lejartSession(){ return JSON.stringify({token:TOKEN,name:'TESZT',exp:Date.now()-1000}); }

// Egy friss lap-kornyezet: valodi rpw-auth.js + rpw-db.js + rpw-guard.js.
function kornyezet(cfg, sessionRaw, opts){
  opts=opts||{};
  const dom=new JSDOM('<!doctype html><head></head><body><div id=app>ugyfel-adat</div></body>',
    {url:'https://rpw.teszt/index.html?x=1'});
  const w=dom.window;
  w.RPW_CFG=cfg;
  if(opts.publikus) w.RPW_PUBLIC_PAGE=true;   // ugyfel-lap nyilatkozata
  if(sessionRaw) w.localStorage.setItem('rpw_auth', sessionRaw);
  // Az atiranyitast elkapjuk, nem hajtjuk vegre. A jsdom `location`-je
  // nem irhato felul mezonkent, ezert az EGESZ objektumot lecsereljuk.
  w.__nav=[];
  w.__loc={ pathname:'/index.html', search:'?x=1',
            assign:u=>w.__nav.push({mod:'assign',url:u}),
            replace:u=>w.__nav.push({mod:'replace',url:u}) };
  // KEM: minden adatbazis-hivast feljegyez
  w.__hivas=[];
  const q=()=>{const o={eq:()=>o,is:()=>o,not:()=>o,order:()=>Promise.resolve({data:[],error:null}),
    single:()=>Promise.resolve({data:{id:'J1',data:{}},error:null})};return o};
  w.__sb={ rpc:(n,a)=>{ w.__hivas.push('rpc:'+n); return Promise.resolve({data:{ok:true},error:null}) },
           from:(t)=>{ w.__hivas.push('from:'+t);
             return {select:()=>q(), update:()=>q(), delete:()=>q()} } };
  const g=global; const mento={self:g.self,window:g.window,document:g.document};
  g.self=w; g.window=w; g.document=w.document;
  const modulok = opts.roles ? ['rpw-roles.js','rpw-auth.js','rpw-db.js','rpw-guard.js']
                             : ['rpw-auth.js','rpw-db.js','rpw-guard.js'];
  modulok.forEach(function(f){
    delete require.cache[require.resolve(path.join(ROOT,f))];
    require(path.join(ROOT,f));
  });
  Object.assign(g,mento);
  return w;
}
const rejtve = w => !!w.document.querySelector('style[data-rpw-block]');

(async()=>{

console.log('\n1. AZ OR: bejelentkezes nelkul a lap MEGALL, nem csak atiranyit');
{
  const w=kornyezet({AUTH_REQUIRED:true}, null);
  const r=w.RPWAuth.guard({location:w.__loc});
  ok(r===false,'a guard() elutasit');
  ok(w.RPWAuth.blocked()===true,'  es megjelolt allapotot hagy maga utan (blocked)');
  ok(rejtve(w),'  a lap MEG AZ ELSO KEPKOCKA ELOTT el van rejtve (html{display:none})');
  ok(w.document.body.textContent==='','  a mar kirajzolt tartalom is torlodik');
  ok(w.__nav.length===1 && w.__nav[0].mod==='replace',
     '  `replace`-szel iranyit at, nem `assign`-nal — a Vissza gomb ne vigyen ide');
  ok(/rpw-login\.html\?next=/.test(w.__nav[0].url),'  a login lapra, a visszaut megjegyezve');
}

console.log('\n1b. Lejart munkamenet ugyanugy elutasitva');
{
  const w=kornyezet({AUTH_REQUIRED:true}, lejartSession());
  ok(w.RPWAuth.guard({location:w.__loc})===false,'lejart token nem enged be');
  ok(rejtve(w),'  a lap itt is elrejtve');
}

console.log('\n2. AMIT NEM SZABAD ELRONTANI');
{
  const w=kornyezet({AUTH_REQUIRED:true}, ervenyesSession());
  ok(w.RPWAuth.guard({location:w.__loc})===true,'ervenyes munkamenettel atenged');
  ok(!rejtve(w),'  a lap NEM tunik el a bejelentkezett dolgozo elol');
  ok(w.RPWAuth.blocked()===false,'  nincs blokkolt allapot');

  const w2=kornyezet({AUTH_REQUIRED:false}, null);
  ok(w2.RPWAuth.guard()===true,'AUTH_REQUIRED=false eseten valtozatlan (ma ez az elo allapot)');
  ok(!rejtve(w2),'  es a lap sem tunik el');
  ok(w2.__nav.length===0,'  nincs atiranyitas');
}

console.log('\n3. AZ ADATREEG FAIL-CLOSED: nincs munkamenet, nincs egyetlen keres sem');
{
  const w=kornyezet({AUTH_REQUIRED:true}, null);
  const D=w.RPWDb, sb=w.__sb;
  const muveletek=[
    ['listActive',  ()=>D.listActive(sb)],
    ['getRow',      ()=>D.getRow(sb,'J1')],
    ['listTrashed', ()=>D.listTrashed(sb)],
    ['patchV2',     ()=>D.patchV2(sb,'J1',{client:'x'})],
    ['patch',       ()=>D.patch(sb,{id:'J1'})],
    ['softDelete',  ()=>D.softDelete(sb,'J1')],
    ['restore',     ()=>D.restore(sb,'J1')],
    ['purge',       ()=>D.purge(sb,'J1')],
    ['purgeAllTrashed', ()=>D.purgeAllTrashed(sb)]
  ];
  for(const [nev,fn] of muveletek){
    const r=await fn();
    ok(r && r.error && r.error.code==='auth_required',
       nev+'() elutasitva  (kapott: '+((r&&r.error&&r.error.code)||'SIKER!')+')');
  }
  ok(w.__hivas.length===0,
     'EGYETLEN adatbazis-hivas sem indult el — a keres a halozatra sem ment ki'
     +(w.__hivas.length?('  ['+w.__hivas.join(', ')+']'):''));
}

console.log('\n3b. Ervenyes munkamenettel a muveletek ATMENNEK');
{
  const w=kornyezet({AUTH_REQUIRED:true}, ervenyesSession());
  await w.RPWDb.listActive(w.__sb);
  ok(w.__hivas.length>0,'bejelentkezve a lekerdezes elindul  ('+(w.__hivas[0]||'—')+')');
}

console.log('\n3c. AUTH_REQUIRED=false: a mai elo mukodes valtozatlan');
{
  const w=kornyezet({AUTH_REQUIRED:false}, null);
  const r=await w.RPWDb.listActive(w.__sb);
  ok(!(r&&r.error&&r.error.code==='auth_required'),'nincs uj tiltas a mai uzemben');
  ok(w.__hivas.length>0,'  a regi anon ut valtozatlanul fut  ('+(w.__hivas[0]||'—')+')');
}

console.log('\n3d. AZ UGYFEL FELTOLTO LAPJA NEM ESIK A ZAR ALA');
{
  // RPW-002 elokeszitese kozben derult ki: az AUTH_REQUIRED=true bekapcsolasa
  // NEMAN megbenitotta volna a WhatsApp-linkrol nyilo ugyfel-feltoltest, mert
  // az a lap szandekosan PIN nelkuli, a 3. szakasz zara viszont mindent tiltott.
  // A mentesseg NEM talalgatas: a lapnak KI KELL MONDANIA magarol.
  const w=kornyezet({AUTH_REQUIRED:true}, null, {publikus:true});
  const r1=await w.RPWDb.getRow(w.__sb,'J1');
  const r2=await w.RPWDb.patchV2(w.__sb,'J1',{clientUploads:[]},{actor:'client_whatsapp'});
  ok(!(r1.error&&r1.error.code==='auth_required'),'az ugyfel OLVASHATJA a sajat dossziejat');
  ok(!(r2.error&&r2.error.code==='auth_required'),'  es fel is tolthet');
  ok(w.__hivas.length>0,'  a keres tenylegesen elindul  ('+(w.__hivas[0]||'—')+')');
  w.close();

  const w2=kornyezet({AUTH_REQUIRED:true}, null);
  const r3=await w2.RPWDb.getRow(w2.__sb,'J1');
  ok(r3.error&&r3.error.code==='auth_required','dolgozoi lapon a zar VALTOZATLANUL all');
  w2.close();

  // Pontosan EGY lap nyilatkozhat igy — ha egy dolgozoi lapra is bekerul, bukik.
  const fs3=require('fs');
  const lapok=fs3.readdirSync(ROOT).filter(f=>/\.html$/.test(f))
    .filter(f=>/RPW_PUBLIC_PAGE\s*=\s*true/.test(fs3.readFileSync(path.join(ROOT,f),'utf8')));
  ok(lapok.length===1 && lapok[0]==='rpw-upload.html',
     'pontosan EGY lap mentesul, es az az ugyfel-feltolto  ['+lapok.join(', ')+']');
}

console.log('\n3e. A SZUK UGYFEL-UT csak a kapcsolo bekapcsolasa utan aktiv (009)');
{
  // A 009 migracio ket szuk fuggvenyt hoz letre. Amig az nincs alkalmazva
  // az ELO adatbazison, a kliens NEM hivhatja oket — kulonben a mai
  // ugyfel-feltoltes azonnal eltorne. Ezert kapcsolo vedi.
  const ki=kornyezet({AUTH_REQUIRED:true, CLIENT_RPC:false}, null, {publikus:true});
  await ki.RPWDb.getRow(ki.__sb,'J1');
  await ki.RPWDb.patchV2(ki.__sb,'J1',{clientUploads:[]},{});
  ok(ki.__hivas.every(h=>!/rpw_client_/.test(h)),
     'kapcsolo NELKUL a regi uton megy  ['+ki.__hivas.join(', ')+']');
  ki.close();

  const be=kornyezet({AUTH_REQUIRED:true, CLIENT_RPC:true}, null, {publikus:true});
  await be.RPWDb.getRow(be.__sb,'J1');
  await be.RPWDb.patchV2(be.__sb,'J1',{clientUploads:[]},{});
  ok(be.__hivas.indexOf('rpc:rpw_client_job_get')>=0,'kapcsoloval az olvasas a szuk uton megy');
  ok(be.__hivas.indexOf('rpc:rpw_client_upload')>=0,'  es az iras is');
  ok(be.__hivas.every(h=>!/rpw_patch_v2|from:rpw_jobs/.test(h)),
     '  a regi, tag utakat mar nem hasznalja  ['+be.__hivas.join(', ')+']');
  be.close();

  // Dolgozoi lapon a szuk ut SOHA nem aktiv, meg bekapcsolt kapcsoloval sem.
  const dolg=kornyezet({AUTH_REQUIRED:true, CLIENT_RPC:true}, ervenyesSession());
  await dolg.RPWDb.getRow(dolg.__sb,'J1');
  ok(dolg.__hivas.every(h=>!/rpw_client_/.test(h)),
     'dolgozoi lap SOHA nem megy a szuk ugyfel-uton  ['+dolg.__hivas.join(', ')+']');
  dolg.close();
}

console.log('\n3f. A SZERELOK LATNAK MINDENT, DE NEM MODOSITANAK (Ferenc, 2026-08-29)');
{
  // A belepetes 11 emberbol 6-ot kizart volna, mert a szerep-lekepezes nem
  // ismerte a "Szerelo" munkakort. Ferenc dontese: hasznaljak a panelt
  // tajekozodasra, de fazist ne leptessenek. Az `auditor` pontosan ez.
  //
  // A tiltas az ADATRETEGBEN all, mert a panel a fazis-muveleteket nem koti
  // szerephez, az elo rpw_patch_v3 pedig egyaltalan nem nez szerepet.
  const kornyezetSzereppel = (szerep) => {
    const rec = JSON.stringify({token:TOKEN, role:szerep, name:'T', employeeId:'E1',
      shopId:'S1', can:{work:true}, exp:Date.now()+9e6});
    return kornyezet({AUTH_REQUIRED:true}, rec, {roles:true});
  };

  const olvaso = kornyezetSzereppel('auditor');
  const r1 = await olvaso.RPWDb.listActive(olvaso.__sb);
  const r2 = await olvaso.RPWDb.getRow(olvaso.__sb,'J1');
  ok(!(r1.error), 'a szerelo LATJA a listat');
  ok(!(r2.error), '  es megnyithat egy munkat');
  for(const [nev,fn] of [
    ['mentes',      ()=>olvaso.RPWDb.patchV2(olvaso.__sb,'J1',{client:'x'})],
    ['teljes patch',()=>olvaso.RPWDb.patch(olvaso.__sb,{id:'J1'})],
    ['kosarba',     ()=>olvaso.RPWDb.softDelete(olvaso.__sb,'J1')],
    ['visszaallitas',()=>olvaso.RPWDb.restore(olvaso.__sb,'J1')],
    ['vegleges torles',()=>olvaso.RPWDb.purge(olvaso.__sb,'J1')]]){
    const r = await fn();
    ok(r && r.error && r.error.code==='read_only',
       '  '+nev+' ELUTASITVA  (kapott: '+((r&&r.error&&r.error.code)||'SIKER!')+')');
  }
  const irasok = olvaso.__hivas.filter(h=>/patch|trash|restore|purge/.test(h));
  ok(irasok.length===0,
     '  egyetlen iras sem indult el a halozatra  ['+irasok.join(', ')+']');
  olvaso.close();

  // A TOBBI szerep valtozatlanul irhat — nem zartuk ki oket veletlenul.
  const festo = kornyezetSzereppel('vopsitor');
  const w = await festo.RPWDb.patchV2(festo.__sb,'J1',{client:'x'});
  ok(!(w.error && w.error.code==='read_only'), 'a festo TOVABBRA IS menthet');
  festo.close();

  // A lekepezes: a Szerelo bekerult, es csak-olvasokent.
  const RR = require(path.join(ROOT,'rpw-roles.js'));
  ok(RR.mapEmployeeRole('Szerelő')==='auditor',
     'a "Szerelő" munkakor auditor szerepet kap  ('+RR.mapEmployeeRole('Szerelő')+')');
  ok(RR.isReadOnly('auditor')===true,'  es az auditor csak olvas');
  ['Recepció','Karosszéria','Festő','Műszakvezető','Irodavezető'].forEach(function(m){
    ok(RR.isReadOnly(RR.mapEmployeeRole(m))===false, '  a '+m+' tovabbra is dolgozhat');
  });

  // ── A TELJES KEP, AHOGY 2026-08-29-EN ELDOLT ────────────────────
  // Ez a matrix az uzleti szabaly: ha barmelyik sor elcsuszik, valaki
  // vagy kizarodik a panelbol, vagy olyat tehet, amit nem szabadna.
  // A letszamok az elo adatbazisbol (11 aktiv dolgozo).
  const MATRIX = [
    ['Műszakvezető', 1, 'manager'],
    ['Recepció',     1, 'receptie'],
    ['Irodavezető',  1, 'admin'],
    ['Karosszéria',  1, 'tinichigiu'],
    ['Festő',        1, 'vopsitor'],
    ['Szerelő',      4, 'auditor'],    // belep, de csak nez
    ['Sofőr',        1, null],         // Ferenc dontese: nem kell neki
    ['Egyéb',        1, null]
  ];
  let belep = 0, kint = 0;
  MATRIX.forEach(function(x){
    const kapott = RR.mapEmployeeRole(x[0]);
    ok(kapott === x[2],
       '  '+x[0]+' -> '+(x[2]||'nincs hozzaferes')+'  (kapott: '+(kapott||'nincs')+')');
    if(kapott) belep += x[1]; else kint += x[1];
  });
  ok(belep === 9 && kint === 2,
     'a 11 emberbol 9 lephet be, 2 marad kint  (kapott: '+belep+' / '+kint+')');
  const dolgozhat = MATRIX.filter(x=>x[2] && !RR.isReadOnly(x[2]))
                          .reduce((n,x)=>n+x[1], 0);
  ok(dolgozhat === 5, '  ebbol 5 fo dolgozhat is, a tobbi csak nez  (kapott: '+dolgozhat+')');
}

console.log('\n4. A KEPESSEG-KOVETELMENY A MODHOZ IGAZODIK (nem benitja meg az uzemet)');
{
  const w=kornyezet({AUTH_REQUIRED:false}, null);
  const G=w.RPWGuard;
  const alap=G.requiredRpcs({AUTH_REQUIRED:false, PATCH_RPC:'rpw_patch_v2', SERVER_TRANSITIONS:false});
  ok(alap.indexOf('rpw_transition')<0 && alap.indexOf('rpw_requirements')<0,
     'alap modban NEM koveteljuk a rpw_transition/rpw_requirements-t — az elo szerveren nincsenek');
  ok(alap.indexOf('rpw2_session')<0,'  es a session-RPC-t sem, amig nincs auth');
  const auth=G.requiredRpcs({AUTH_REQUIRED:true, PATCH_RPC:'rpw_patch_v2', SERVER_TRANSITIONS:false});
  ok(auth.indexOf('rpw2_session')>=0 && auth.indexOf('rpw2_login')>=0,
     'auth bekapcsolva MAR koveteljuk a bejelentkezes RPC-it');
  ok(auth.indexOf('rpw_transition')<0,'  de a szerveroldali atmenetet meg nem');
  const tr=G.requiredRpcs({AUTH_REQUIRED:true, PATCH_RPC:'rpw_patch_v3', SERVER_TRANSITIONS:true});
  ok(tr.indexOf('rpw_transition')>=0 && tr.indexOf('rpw_requirements')>=0 && tr.indexOf('rpw_patch_v3')>=0,
     'szerveroldali atmenetnel MINDET koveteljuk');
  // az ELO szerver keszlete (2026-08-29-en lekerdezve) — a transition/requirements/capabilities hianyzik
  const ELO=['rpw_jobs_list','rpw_job_get','rpw_job_trash','rpw_job_restore','rpw_job_purge',
             'rpw2_session','rpw2_login','rpw_patch_v2','rpw_patch_v3'];
  const cap={ok:true, schema_version:'005', rpcs:ELO};
  const r1=G.checkCapabilities(cap,{AUTH_REQUIRED:true, PATCH_RPC:'rpw_patch_v2'});
  ok(r1.ok===true,
     'az ELO szerver keszletevel az auth bekapcsolhato lenne'
     +(r1.ok?'':('  hianyok: '+r1.problems.join(', '))));
  const r2=G.checkCapabilities(cap,{AUTH_REQUIRED:true, SERVER_TRANSITIONS:true});
  ok(r2.ok===false && r2.problems.some(p=>/rpw_transition/.test(p)),
     '  de a szerveroldali atmenet TOVABBRA IS blokkolt — az a fuggveny tenyleg hianyzik');
}

console.log('\n5. A DIAGNOSZTIKAI RPC HIANYA NEM ALLITJA MEG AZ UZEMET — PRODUCTION-ban IGEN');
{
  const nincsCap={ rpc:()=>Promise.resolve({data:null,error:null}) };
  const w=kornyezet({AUTH_REQUIRED:true}, ervenyesSession());
  const r=await w.RPWGuard.verifyServer(nincsCap,{AUTH_REQUIRED:true});
  ok(r.problems && r.problems[0]==='no_capabilities','a hianyt jelezzuk');
  ok(w.RPW_CFG!==null,'  de auth modban NEM allitjuk meg a muhelyt');

  // Ervenyes production-config (kulonben mar az enforce() megallitana),
  // hogy tisztan a kepesseg-ellenorzest merjuk.
  const PROD={PRODUCTION:true, AUTH_REQUIRED:true, PATCH_RPC:'rpw_patch_v3',
    SERVER_TRANSITIONS:true, STORAGE_PRIVATE:true, RLS_LOCKDOWN_VERIFIED:true,
    RPC_CONSISTENCY_VERIFIED:true, BUSINESS_GATES_SERVER_SIDE:true,
    INTEGRATION_TESTS_PASSED:true, ALL_ACTIVE_EMPLOYEES_HAVE_PIN:true};
  const w2=kornyezet(PROD, ervenyesSession());
  ok(w2.RPW_CFG!==null,'  (ellenorzes: a production-config maga ervenyes, nem az allitotta meg)');
  await w2.RPWGuard.verifyServer(nincsCap, PROD);
  ok(w2.RPW_CFG===null,'PRODUCTION modban a megallas VALTOZATLAN (fail-closed)');
}

console.log('\n6. VISSZAVONT TOKEN: azonnali kileptetes, halozati hibanal NEM');
{
  const w=kornyezet({AUTH_REQUIRED:true}, ervenyesSession());
  const ervenytelen={ rpc:()=>Promise.resolve({data:{ok:false,error:'revoked'},error:null}) };
  const r=await w.RPWAuth.enforceSession(ervenytelen,{location:w.__loc});
  ok(r.ok===false,'a szerver "ervenytelen" valasza kilepteti');
  ok(w.localStorage.getItem('rpw_auth')===null,'  a helyi munkamenet torolve');
  ok(w.RPWAuth.blocked()===true,'  es a lap blokkolva');

  const w2=kornyezet({AUTH_REQUIRED:true}, ervenyesSession());
  const halott={ rpc:()=>Promise.reject(new Error('offline')) };
  const r2=await w2.RPWAuth.enforceSession(halott,{location:w2.__loc});
  ok(r2.ok===true,'halozati hiba NEM lepteti ki a dolgozot (offline munka)');
  ok(w2.localStorage.getItem('rpw_auth')!==null,'  a munkamenet megmarad');
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
