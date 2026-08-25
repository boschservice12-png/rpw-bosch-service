// ════════════════════════════════════════════════════════════════
//  FRONTEND — VALÓDI GOMBKATTINTÁS (a feladat 31. pontja)
//  ----------------------------------------------------------------
//  NEM a RPWWorkflow.commitCriticalTransition-t hívjuk közvetlenül:
//  a VALÓDI oldal töltődik be (inline kódostul), a VALÓDI lezáró
//  gombot keressük meg, és VALÓDI click eseményt küldünk rá.
//  Szcenáriók oldalanként: siker · követelményhiány · jogosultsági
//  hiba · verziókonfliktus · offline · dupla kattintás · {ok:false}.
// ════════════════════════════════════════════════════════════════
const fs=require('fs'), path=require('path');
const jsdom=require('jsdom');
const {JSDOM}=jsdom;
const ROOT=path.resolve(__dirname,'..','..');
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// jsdom 30 nem ad ResourceLoader-t — a szkripteket ELŐRE beinline-oljuk:
// a CDN-es supabase helyére a mock-gyár kerül, a helyi rpw-*.js a fájlból.
function inlineScripts(html){
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m,src)=>{
    if(/supabase/.test(src))
      return '<script>window.supabase={createClient:function(){return window.__sbMock}};</'+'script>';
    const f=path.join(ROOT,src);
    if(/^rpw-/.test(src) && fs.existsSync(f))
      return '<script>'+fs.readFileSync(f,'utf8').replace(/<\/script>/g,'<\\/script>')+'</'+'script>';
    return '';
  });
}

const CAPS={ok:true,schema_version:'008',
  rpcs:['rpw_jobs_list','rpw_job_get','rpw_patch_v3','rpw_transition',
        'rpw_job_trash','rpw_job_restore','rpw_job_purge',
        'rpw2_session','rpw2_login','rpw_requirements','rpw_can_complete',
        'rpw_server_capabilities','rpw_job_create'],
  rls_locked:true, business_gates_server_side:true, storage_mode:'private',
  protected_fields:true, expected_version_required:true};

function mkJob(phase){
  const phases={};for(let p=1;p<=7;p++)phases[p]={status:p<phase?'done':(p===phase?'active':'pending')};
  return {id:'JOB-CLICK-1',number:'MS-26-050',plate:'MS-44-BSS',client:'Kovacs',phone:'0740',
    flux:'reparatie',damageType:null,inchis:false,phase:phase,phases:phases,version:7,
    photos:[],docs:[],panels:{},elements:{},materials:[],production:{},
    programare:{date:'2026-08-25',time:'08:00',confirmed:true},
    conditions:{programare:true,loc:true,om:true,piese:true,whatsapp:true},rework:[],
    // a Control oldal gombja addig disabled, amíg a kontroll nincs kész —
    // a siker-szcenárióhoz KÉSZ kontrollt adunk (ez a valós út):
    control:{allDone:true,lastResult:'ok'}};
}

// Egy oldal VALÓDI betöltése; resp: rpc-név -> válasz (vagy fv)
async function boot(file, phase, resp, cfgOver){
  const raw=R(file);
  // a config UTÁN ráolvasztjuk a teszt-configot (a config felülírna minket)
  const inject='<script>window.RPW_CFG=Object.assign(window.RPW_CFG||{},'
    +JSON.stringify(Object.assign({SHOP_ID:'SHOP-A',AUTH_REQUIRED:true,PATCH_RPC:'rpw_patch_v3',
       SERVER_TRANSITIONS:true,STORAGE_PRIVATE:true,PRODUCTION:false},cfgOver||{}))+');</'+'script>';
  const html=inlineScripts(raw.replace('<script src="rpw-config.js"></script>',
                         '<script src="rpw-config.js"></script>'+inject));
  const RPC=[];
  const vc=new jsdom.VirtualConsole();
  vc.on('jsdomError',e=>{ if(process.env.CLICK_DEBUG) console.error('[jsdom]',e.message,(e.detail&&e.detail.stack||'').split('\n')[1]||'') });
  vc.on('error',(...a)=>{ if(process.env.CLICK_DEBUG) console.error('[err]',...a) });
  const dom=new JSDOM(html,{ virtualConsole:vc,
    url:'https://rpw.teszt/'+file+'?job=JOB-CLICK-1',
    runScripts:'dangerously', pretendToBeVisual:true,
    beforeParse(w){
      w.__sbMock={
        rpc:(n,a)=>{RPC.push({name:n,args:a});
          const r=resp[n];
          return Promise.resolve(typeof r==='function'?r(a):(r||{data:null,error:null}))},
        from:()=>({select:()=>({eq:()=>({single:()=>Promise.resolve({data:null,error:null}),
          is:()=>({order:()=>Promise.resolve({data:[],error:null})})})})}),
        storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{}})})}
      };
      w.localStorage.setItem('rpw_auth',JSON.stringify({token:'t'.repeat(64),name:'Teszt Elek',
        employeeId:'E1',shopId:'SHOP-A',role:'MANAGER',rawRole:'Műszakvezető',
        can:{open:true,reception:true,work:true,close:true,override:true,delete:true,team:true,posts:true},
        exp:Date.now()+9e6}));
      w.prompt=()=>'teszt indok'; w.confirm=()=>true; w.alert=()=>{};
      w.print=()=>{};
      w.matchMedia=w.matchMedia||(()=>({matches:false,addListener(){},removeListener(){}}));
    }});
  const w=dom.window;
  // várunk, míg az oldal betölti a JOB-ot és renderel
  for(let i=0;i<40 && !(w.JOB&&w.JOB.id);i++) await sleep(25);
  await sleep(60);
  return {w,RPC,dom};
}

function stdResp(phase, transitionResp){
  const job=mkJob(phase);
  return {
    rpw_server_capabilities:{data:CAPS,error:null},
    rpw2_session:{data:{ok:true,employee:{id:'E1',name:'Teszt Elek',role_code:'MANAGER',
      can:{open:true,reception:true,work:true,close:true,override:true,delete:true,team:true,posts:true}}},error:null},
    rpw_job_get:{data:{ok:true,id:job.id,data:job,version:7,updated_at:'2026-08-25T10:00:00Z'},error:null},
    rpw_jobs_list:{data:{ok:true,rows:[]},error:null},
    rpw_patch_v3:a=>({data:{ok:true,version:((a&&a.p_expected_version)||7)+1},error:null}),
    rpw_can_complete:{data:{ok:true,can:true,missing:[],version:7},error:null},
    rpw_transition:transitionResp
  };
}

function findBtn(w, names){
  const els=[...w.document.querySelectorAll('button,[onclick]')];
  for(const n of names){
    const el=els.find(e=>(e.getAttribute('onclick')||'').indexOf(n)>=0);
    if(el) return el;
  }
  return null;
}

// prep: amit a dolgozó a kattintás ELŐTT megtenne az oldalon
// (Controlnál: minden ellenőrzőpont kipipálása — enélkül a gomb disabled,
// és az advPh a controlChecks-ből újraszámolja az allDone-t).
function prepControl(w){
  const cc={};
  (w.CHECKLIST||[]).forEach(cat=>cat.items.forEach(it=>{cc[it.id]='ok'}));
  w.JOB.controlChecks=cc;
  if(typeof w.render==='function') try{w.render()}catch(e){}
}
// Recepció: teljes befogadási csomag — talon, 6 áttekintő fotó, munkatípus,
// elem-státuszok, kárfelvételi jegyzőkönyv. Enélkül a closeR jogosan tilt.
function prepRecepcio(w){
  const J=w.JOB;
  // magánkár (auto): a legrövidebb szabályos út — a biztosítós ág külön
  // dokumentum-készletet kér, azt az e2e lánc fedi majd
  J.damageType='auto'; J.workType='caroserie';
  J.photoKeys={talon:'pk1', ov_0:'a',ov_1:'b',ov_2:'c',ov_3:'d',ov_4:'e',ov_5:'f'};
  // a closeR MIND a 23 karosszériaelem státuszát megköveteli — kitöltjük,
  // ahogy a recepciós tenné (mind 'ok': nincs sérülés-fotó kötelezettség)
  J.elements={};
  (w.EK||['fb']).forEach(k=>{J.elements[k]={statusV2:'ok'}});
  J.damageReport={items:[]}; J.damageReportCreated=true;
  if(typeof w.render==='function') try{w.render()}catch(e){}
}
// Evaluare: elfogadható kalkuláció — jóváhagyott munkasor + határidő.
function prepEvaluare(w){
  const J=w.JOB;
  J.evalData={status:'sent', comanda:[{op:'Vopsire aripa',hours:2.5}]};
  J.termenPredare='2026-08-28';
  if(typeof w.render==='function') try{w.render()}catch(e){}
}
// Închidere: minden előző fázis lezárva (a mkJob a phase-ig done-t ad),
// nyitott rework nincs; a closing mezőket a closeJob maga tölti.
function prepInchidere(w){
  const J=w.JOB;
  J.control={allDone:true,lastResult:'ok'};
  // a checkPhase7 TELJES záró-csomagot kér — pontosan azt adjuk:
  J.closing={factura:'F-2026-101', devizRef:'DVZ-55', devizFileUrl:'https://x/d.pdf',
             vehicleOperational:true, finalControlConfirmed:true,
             documentsDeliveredToOffice:true, handoverBy:'Teszt Elek'};
  J.closingPhotos=[{url:'u1'},{url:'u2'},{url:'u3'},{url:'u4'},{url:'u5'}];
  if(typeof w.render==='function') try{w.render()}catch(e){}
}
const PAGES=[
  {f:'rpw-recepcio-red.html',     nev:'Recepció',     phase:1, btns:['closeR('],   prep:prepRecepcio},
  {f:'rpw-evaluare-red.html',     nev:'Evaluare',     phase:2, btns:['sendToProd('], prep:prepEvaluare},
  {f:'rpw-inchidere-red.html',    nev:'Închidere',    phase:7, btns:['closeJob('], prep:prepInchidere},
  {f:'rpw-reconstatare-red.html', nev:'Reconstatare', phase:3, btns:['advPh(']},
  {f:'rpw-tinichigerie-red.html', nev:'Tinichigerie', phase:4, btns:['advPh(']},
  {f:'rpw-vopsitorie-red.html',   nev:'Vopsitorie',   phase:5, btns:['advPh(']},
  {f:'rpw-control-red.html',      nev:'Control',      phase:6, btns:['advPh('], prep:prepControl},
];

(async()=>{
for(const P of PAGES){
  console.log('\n══ '+P.nev+' — valódi gomb, valódi kattintás ══');

  // ── 1. SIKER ──────────────────────────────────────────────────
  {
    const tr=a=>({data:{ok:true,version:8,data:(()=>{const j=mkJob(P.phase);
      j.phases[P.phase]={status:'done'};j.phase=P.phase+1;return j})()},error:null});
    const {w,RPC}=await boot(P.f,P.phase,stdResp(P.phase,tr));
    ok(w.JOB&&w.JOB.id==='JOB-CLICK-1',P.nev+': a VALÓDI oldal betöltötte a munkalapot');
    if(P.prep) P.prep(w);
    const btn=findBtn(w,P.btns);
    ok(!!btn,'  a lezáró gomb LÉTEZIK a kirajzolt DOM-ban');
    if(!btn) continue;
    btn.click(); await sleep(120);
    const t=RPC.filter(r=>r.name==='rpw_transition');
    eq(t.length,1,'  a kattintás PONTOSAN EGY rpw_transition hívást indított');
    if(t.length){
      ok(['complete','skip'].indexOf(t[0].args.p_action)>=0,'  action=complete/skip');
      eq(t[0].args.p_expected_version,7,'  verziózárral');
      ok(String(t[0].args.p_token).length>=32,'  tokennel');
    }
    ok(w.JOB.phases[P.phase].status==='done','  a kliens a SZERVER állapotát vette át');
    eq(w.JOB.version,8,'  az új verziót is');
  }

  // ── 2. KÖVETELMÉNYHIÁNY: {ok:false,missing} ───────────────────
  {
    const tr={data:{ok:false,error:'requirements_missing',message:'Lipsesc documente',
      missing:[{code:'talon'}]},error:null};
    const {w,RPC}=await boot(P.f,P.phase,stdResp(P.phase,tr));
    if(P.prep) P.prep(w);
    const btn=findBtn(w,P.btns); if(!btn){ok(false,P.nev+': nincs gomb');continue}
    btn.click(); await sleep(120);
    ok(w.JOB.phases[P.phase].status!=='done',P.nev+': hiánynál a fázis NEM zárult le');
    eq(w.JOB.version,7,'  a verzió nem ugrott');
  }

  // ── 3. JOGOSULTSÁGI HIBA ──────────────────────────────────────
  {
    const tr={data:{ok:false,error:'not_allowed',message:'Nu ai dreptul'},error:null};
    const {w}=await boot(P.f,P.phase,stdResp(P.phase,tr));
    if(P.prep) P.prep(w);
    const btn=findBtn(w,P.btns); if(!btn){ok(false,P.nev+': nincs gomb');continue}
    btn.click(); await sleep(120);
    ok(w.JOB.phases[P.phase].status!=='done',P.nev+': jogosultsági hibánál NEM zárult le');
  }

  // ── 4. VERZIÓKONFLIKTUS ───────────────────────────────────────
  {
    const tr={data:{ok:false,error:'version_conflict',server_version:12},error:null};
    const {w}=await boot(P.f,P.phase,stdResp(P.phase,tr));
    if(P.prep) P.prep(w);
    const btn=findBtn(w,P.btns); if(!btn){ok(false,P.nev+': nincs gomb');continue}
    btn.click(); await sleep(120);
    ok(w.JOB.phases[P.phase].status!=='done',P.nev+': konfliktusnál NEM zárult le');
    eq(w.JOB.version,7,'  a helyi verzió nem hamisítódott át');
  }

  // ── 5. OFFLINE ────────────────────────────────────────────────
  {
    const {w,RPC}=await boot(P.f,P.phase,stdResp(P.phase,{data:{ok:true},error:null}));
    Object.defineProperty(w.navigator,'onLine',{get:()=>false,configurable:true});
    if(P.prep) P.prep(w);
    const btn=findBtn(w,P.btns); if(!btn){ok(false,P.nev+': nincs gomb');continue}
    const before=RPC.filter(r=>r.name==='rpw_transition').length;
    btn.click(); await sleep(120);
    const after=RPC.filter(r=>r.name==='rpw_transition').length;
    eq(after,before,P.nev+': offline NEM indul kritikus művelet');
    ok(w.JOB.phases[P.phase].status!=='done','  és nem zárult le helyben sem');
  }

  // ── 6. DUPLA KATTINTÁS ────────────────────────────────────────
  {
    let calls=0;
    const tr=()=>{calls++;return new Promise(res=>setTimeout(()=>res(
      {data:{ok:true,version:8,data:(()=>{const j=mkJob(P.phase);
        j.phases[P.phase]={status:'done'};return j})()},error:null}),80))};
    const {w}=await boot(P.f,P.phase,stdResp(P.phase,tr));
    if(P.prep) P.prep(w);
    const btn=findBtn(w,P.btns); if(!btn){ok(false,P.nev+': nincs gomb');continue}
    btn.click(); btn.click(); await sleep(300);
    eq(calls,1, P.nev+': dupla katt = PONTOSAN EGY szerverhívás (in-flight zár)');
  }

  // ── 7. TRANSPORT-HIBA ─────────────────────────────────────────
  {
    const tr=()=>Promise.resolve({data:null,error:{message:'FetchError'}});
    const {w}=await boot(P.f,P.phase,stdResp(P.phase,tr));
    if(P.prep) P.prep(w);
    const btn=findBtn(w,P.btns); if(!btn){ok(false,P.nev+': nincs gomb');continue}
    btn.click(); await sleep(120);
    ok(w.JOB.phases[P.phase].status!=='done',P.nev+': hálózati hibánál NEM zárult le');
  }
}

console.log('\n'+(fail?'✗ ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
