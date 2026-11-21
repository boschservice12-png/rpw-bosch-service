// ════════════════════════════════════════════════════════════════
//  FRONTEND — A DOSSZIE-LAP FOTÓ-FORRÁSAI (2026-11-21)
//  Hiba: a recepció (RPW-003 óta) `photoKeys` + tároló-fájl formában ír,
//  a dosszié viszont CSAK a régi `job.photos` tömböt olvasta. Egy
//  szabályosan lezárt recepció így „Talon —" és „0/6" lett a dosszién.
//
//  A VALODI rpw-dosar.html + rpw-workflow.js + rpw-photos.js fut jsdom-ban,
//  bekapcsolt tároló-kapuval (STORAGE_GATEWAY:true). Három munka:
//    A) csak photoKeys (recepció, tároló)  → 6/6, talon OK, aláírt URL
//    B) csak régi photos tömb              → 6/6, talon OK, data-URL
//    C) csak dosarActe rekeszek (híd)      → 6/6, talon OK, aláírt URL
//  Mindhárom esetben a lap számlálója = RPWWorkflow.overviewPhotoCount.
// ════════════════════════════════════════════════════════════════
const fs=require('fs'),path=require('path'),jsdom=require('jsdom');
const {JSDOM}=jsdom;const ROOT=path.resolve(__dirname,'..','..');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function inline(html){return html.replace(/<script src="([^"]+)"><\/script>/g,(m,src)=>{
  if(/supabase/.test(src))return '<script>window.supabase={createClient:()=>window.__sbMock}</'+'script>';
  if(/rpw-(db|cache)\.js/.test(src))return '';
  const f=path.join(ROOT,src);
  if(/^rpw-/.test(src)&&fs.existsSync(f))return '<script>'+fs.readFileSync(f,'utf8').replace(/<\/script>/g,'<\\/script>')+'</'+'script>';
  return '';});}

// A szerver-képesség válasza: enélkül a rpw-guard (PRODUCTION) a configot
// nullázza, és a tároló-kapu sem kapcsol be — a teszt a VALÓDI éles utat futtatja.
const CAPS={ok:true,schema_version:'008',rpcs:['rpw_jobs_list','rpw_job_get','rpw_patch_v3',
  'rpw_transition','rpw_job_trash','rpw_job_restore','rpw_job_purge','rpw2_session','rpw2_login',
  'rpw_requirements'],rls_locked:true,business_gates_server_side:true,storage_mode:'private'};
const PX='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/';
const POZ=['front','back','left','right','serieCaros','km'];
const ACTE={front:'foto_fata',back:'foto_spate',left:'foto_stanga',right:'foto_dreapta',serieCaros:'foto_serie_caroserie',km:'foto_km'};
function base(id){return {id,number:'MS-26-'+id,plate:'MS-77-RPW',client:'Teszt',phone:'',note:'',
  damageType:'asig',dosarStatus:'deschid',asigurator:'Asirom',nrDosar:'',dosarActe:{},photos:[],docs:[],
  clientUploads:[],elements:{},phase:2,phases:{1:{status:'done'},2:{status:'pending'}},inchis:false,
  created:'2026-11-21',programare:{},version:1};}

// A) recepció: photoKeys[kulcs]=true, fájl <jobId>/<kulcs>.jpg; photoUrls üres (lejárt/nem mentett)
const JOB_A=Object.assign(base('FA'),{photoKeys:{talon:true,ov_0:true,ov_1:true,ov_2:true,ov_3:true,ov_4:true,ov_5:true},photoUrls:{}});
// B) régi tömb
const JOB_B=Object.assign(base('FB'),{photos:[{type:'talon',data:PX}].concat(POZ.map(()=>({type:'overview',data:PX})))});
// C) iratlista-rekeszek (híd)
const JOB_C=base('FC');
POZ.forEach(p=>{JOB_C.dosarActe[ACTE[p]]=[{path:'FC/acte/acta_'+ACTE[p]+'_1.jpg',url:'',name:ACTE[p]+'.jpg',type:'image/jpeg'}];});
JOB_C.dosarActe.pag_talon_fata=[{path:'FC/acte/acta_pag_talon_fata_1.jpg',url:'',name:'talon.jpg',type:'image/jpeg'}];

async function openDosar(job){
  const signed=[];                       // a kapunak küldött aláírás-kérések
  const raw=fs.readFileSync(path.join(ROOT,'rpw-dosar.html'),'utf8');
  const vc=new jsdom.VirtualConsole();['jsdomError','error'].forEach(e=>vc.on(e,(...a)=>{
    if(process.env.DBG) console.log('  ['+e+'] '+String((a[0]&&a[0].message)||a[0]||'').slice(0,200));}));
  const dom=new JSDOM(inline(raw),{virtualConsole:vc,
   url:'https://rpw.teszt/rpw-dosar.html?job='+job.id,runScripts:'dangerously',pretendToBeVisual:true,
   beforeParse(w){
    w.__sbMock={rpc:(n)=>Promise.resolve({data:(n==='rpw_server_capabilities'?CAPS:{ok:true}),error:null}),
     from:()=>{const q={eq:()=>q,is:()=>q,single:()=>Promise.resolve({data:null,error:null}),
       order:()=>Promise.resolve({data:[],error:null})};return{select:()=>q}},
     // A KÖZVETLEN út NEM használható: bekapcsolt kapunál ennek nem szabad futnia.
     storage:{from:()=>({createSignedUrl:async()=>{w.__direct=(w.__direct||0)+1;return {data:null,error:{}}},
       getPublicUrl:()=>({data:{publicUrl:''}})})}};
    // A tároló-kapu (rpw-storage Edge Function) helyettesítője
    w.fetch=async(url,o)=>{
      if(/\/functions\/v1\/rpw-storage$/.test(String(url))){
        const b=JSON.parse(o.body);
        if(b.op==='sign-read'){ b.paths.forEach(p=>signed.push(p));
          return {ok:true,status:200,json:async()=>({ok:true,urls:b.paths.map(p=>({path:p,signedUrl:'https://signed.teszt/'+p+'?token=x'}))})}; }
        return {ok:false,status:400,json:async()=>({ok:false,error:'op'})};
      }
      throw new Error('no network');
    };
    w.RPWDb={ getRow:async()=>({data:{data:JSON.parse(JSON.stringify(job)),version:1,
        updated_at:new Date().toISOString()},error:null}),
      patchV2:async()=>({ok:true}) };
    w.RPWCache={getJob:()=>null,setJob:()=>{}};
    w.localStorage.setItem('rpw_lang','ro');
    w.localStorage.setItem('rpw_auth',JSON.stringify({token:'t'.repeat(64),name:'T',employeeId:'E1',
      shopId:'S',can:{open:true,team:true},exp:Date.now()+9e6}));
   }});
  const w=dom.window;
  const sec=k=>[...w.document.querySelectorAll('.sec')].find(s=>{const t=s.querySelector('.sec-t');return t&&t.textContent.indexOf(k)>=0;});
  for(let i=0;i<160 && !sec('Fotografii ansamblu');i++) await sleep(25);
  await sleep(150);                       // a hydrate() aszinkron aláírásai
  return {w,signed,sec};
}

function badge(s){const b=s&&s.querySelector('.sec-badge');return b?b.textContent.trim():'?';}

(async()=>{

console.log('\n0. A közös függvény (RPWWorkflow) — három forrás, egy számláló');
{
  const WF=require(path.join(ROOT,'rpw-workflow.js'));
  ok(typeof WF.overviewPhotoRefs==='function' && typeof WF.talonRef==='function' && typeof WF.hasTalon==='function','az API kiteszi: overviewPhotoRefs, talonRef, hasTalon');
  [[JOB_A,'photoKeys'],[JOB_B,'photos'],[JOB_C,'dosarActe']].forEach(([j,src])=>{
    const r=WF.overviewPhotoRefs(j);
    ok(r.length===6 && WF.overviewPhotoCount(j)===6,src+': 6 hivatkozás = számláló 6 ('+r.length+')');
    ok(r.every(x=>x.source===src),src+': minden hivatkozás forrása '+src);
    ok(WF.hasTalon(j) && WF.talonRef(j).source===src,src+': talon megvan, forrás '+src);
  });
  ok(WF.overviewPhotoRefs(JOB_A)[0].path==='FA/ov_0.jpg','photoKeys → tároló-útvonal: <jobId>/ov_0.jpg');
  ok(WF.talonRef(JOB_A).path==='FA/talon.jpg','talon → FA/talon.jpg');
  ok(WF.overviewPhotoRefs(JOB_A).map(x=>x.pos).join()===POZ.join(),'pozíciók sorrendje: '+POZ.join());
  // a tárolási formátum NEM változik: a függvény nem ír a munkára
  const snap=JSON.stringify(JOB_A); WF.overviewPhotoRefs(JOB_A); WF.talonRef(JOB_A);
  ok(JSON.stringify(JOB_A)===snap,'csak olvas — a munka JSON-ja változatlan');
  // a recepció-kapu ugyanazt látja
  const e=base('FE'); ok(!WF.hasTalon(e) && WF.overviewPhotoCount(e)===0,'üres munka: nincs talon, 0 fotó');
  const reasons=WF.canCompletePhase(Object.assign(base('FG'),{phase:1,phases:{1:{status:'pending'}},photoKeys:{talon:true}}),1);
  const miss=(reasons&&(reasons.missing||reasons.reasons))||[];
  ok(miss.indexOf('wf_talon_missing')<0,'recepció-kapu: photoKeys.talon elég a talonhoz');
}

console.log('\nA) Csak photoKeys (recepció, tároló-kapu)');
{
  const {w,signed,sec}=await openDosar(JOB_A);
  const ts=sec('Talon scanat'), ps=sec('Fotografii ansamblu');
  ok(!!ts && !!ps,'a lap kirajzolódott');
  ok(w.RPW_CFG && w.RPW_CFG.STORAGE_GATEWAY===true && w.RPWPhotos.gatewayOn(),'a tároló-kapu BE van kapcsolva (éles config)');
  ok(badge(ts)==='OK','Talon: OK (volt: —) → '+badge(ts));
  ok(badge(ps)==='6/6','Fotografii ansamblu: 6/6 (volt: 0/6) → '+badge(ps));
  ok(badge(ps)===w.RPWWorkflow.overviewPhotoCount(w.JOB)+'/6','a lap száma = RPWWorkflow.overviewPhotoCount');
  const imgs=[...ps.querySelectorAll('.pslot img')];
  ok(imgs.length===6,'6 bélyegkép');
  ok(imgs.map(i=>i.getAttribute('data-rpw-path')).join()===[0,1,2,3,4,5].map(i=>'FA/ov_'+i+'.jpg').join(),'a bélyegképek tároló-útvonala: FA/ov_0..5.jpg');
  ok(imgs.every(i=>/^https:\/\/signed\.teszt\/FA\/ov_\d\.jpg\?token=x$/.test(i.getAttribute('src')||'')),'a bélyegképek aláírt URL-t kaptak a kapun át');
  const ti=ts.querySelector('img');
  ok(ti && ti.getAttribute('src')==='https://signed.teszt/FA/talon.jpg?token=x','a talon aláírt URL-t kapott');
  ok(signed.indexOf('FA/talon.jpg')>=0 && signed.indexOf('FA/ov_5.jpg')>=0,'a kapu kapta az aláírás-kéréseket ('+signed.length+')');
  ok(!w.__direct,'NINCS közvetlen tároló-hívás (fail closed)');
  ok(imgs.every(i=>i.getAttribute('src')!=='#'),'nincs „#" src (üres URL nem lesz az oldal címe)');
  ok(JSON.stringify(w.JOB.photoKeys)===JSON.stringify(JOB_A.photoKeys) && (w.JOB.photos||[]).length===0,'a tárolási formátum változatlan (photoKeys marad, photos üres)');
}

console.log('\nB) Csak régi photos tömb');
{
  const {w,signed,sec}=await openDosar(JOB_B);
  const ts=sec('Talon scanat'), ps=sec('Fotografii ansamblu');
  ok(badge(ts)==='OK','Talon: OK → '+badge(ts));
  ok(badge(ps)==='6/6','Fotografii ansamblu: 6/6 → '+badge(ps));
  const imgs=[...ps.querySelectorAll('.pslot img')];
  ok(imgs.length===6 && imgs.every(i=>(i.getAttribute('src')||'').indexOf('data:image/jpeg')===0),'a bélyegképek a régi data-URL-ből jönnek');
  ok(ts.querySelector('img') && (ts.querySelector('img').getAttribute('src')||'').indexOf('data:image/jpeg')===0,'a talon a régi data-URL-ből');
  ok(signed.length===0,'nincs aláírás-kérés (nincs tároló-útvonal)');
  ok(ps.querySelectorAll('.pslot-label')[0].textContent.trim().length>0,'a pozíció-címke megvan');
}

console.log('\nC) Csak dosarActe rekeszek (iratlista-híd)');
{
  const {w,signed,sec}=await openDosar(JOB_C);
  const ts=sec('Talon scanat'), ps=sec('Fotografii ansamblu');
  ok(badge(ts)==='OK','Talon (pag_talon_fata): OK → '+badge(ts));
  ok(badge(ps)==='6/6','Fotografii ansamblu: 6/6 → '+badge(ps));
  const imgs=[...ps.querySelectorAll('.pslot img')];
  ok(imgs.length===6 && imgs[0].getAttribute('data-rpw-path')==='FC/acte/acta_foto_fata_1.jpg','az első bélyegkép a foto_fata rekesz fájlja');
  ok(imgs.every(i=>/^https:\/\/signed\.teszt\/FC\/acte\//.test(i.getAttribute('src')||'')),'a bélyegképek aláírt URL-t kaptak');
  ok(signed.indexOf('FC/acte/acta_pag_talon_fata_1.jpg')>=0,'a talon-rekesz is aláírva');
  ok(badge(ps)===w.RPWWorkflow.overviewPhotoCount(w.JOB)+'/6','a lap száma = RPWWorkflow.overviewPhotoCount');
}

console.log('\n'+(fail?'✗ ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
