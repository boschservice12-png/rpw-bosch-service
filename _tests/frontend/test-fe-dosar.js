// ════════════════════════════════════════════════════════════════
//  FRONTEND — A DOSSZIE-LAP UGYFEL-MEZOI (Ferenc F-1..F-3)
//  A VALODI rpw-dosar.html fut jsdom-ban. A lanc, amit orzunk:
//    dosszie nyitas -> TELEFON -> WhatsApp-link -> ugyfel feltolt
//  Eddig a 2. lepes hianyzott: nem volt hova beirni a szamot.
// ════════════════════════════════════════════════════════════════
const fs=require('fs'),path=require('path'),jsdom=require('jsdom');
const {JSDOM}=jsdom;const ROOT=path.resolve(__dirname,'..','..');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function inline(html){return html.replace(/<script src="([^"]+)"><\/script>/g,(m,src)=>{
  if(/supabase/.test(src))return '<script>window.supabase={createClient:()=>window.__sbMock}</'+'script>';
  // A rpw-db.js / rpw-cache.js FELULIRNA a beforeParse-ban rakott babot,
  // ezert azt a kettot nem toltjuk be — a bab a szerver helyettesitoje.
  if(/rpw-(db|cache)\.js/.test(src))return '';
  const f=path.join(ROOT,src);
  if(/^rpw-/.test(src)&&fs.existsSync(f))return '<script>'+fs.readFileSync(f,'utf8').replace(/<\/script>/g,'<\\/script>')+'</'+'script>';
  return '';});}

const JOB={id:'D1',number:'MS-26-050',plate:'MS-55-BSS',client:'',phone:'',note:'',
  flux:'doar_dosar',doarDosar:true,damageType:'asig',dosarStatus:'deschid',
  asigurator:'Asirom',nrDosar:'',dosarActe:{},photos:[],docs:[],clientUploads:[],
  phase:1,phases:{1:{status:'pending'}},inchis:false,created:'2026-08-25',programare:{},version:1};
const PATCH=[];               // ide gyujtjuk, mit mentett a lap

(async()=>{
const raw=fs.readFileSync(path.join(ROOT,'rpw-dosar.html'),'utf8');
const vc=new jsdom.VirtualConsole();['jsdomError','error'].forEach(e=>vc.on(e,(...a)=>{
  if(process.env.DBG) console.log('  ['+e+'] '+String((a[0]&&a[0].message)||a[0]||'').slice(0,200));}));
const dom=new JSDOM(inline(raw),{virtualConsole:vc,
 url:'https://rpw.teszt/rpw-dosar.html?job=D1',runScripts:'dangerously',pretendToBeVisual:true,
 beforeParse(w){
  w.__sbMock={rpc:()=>Promise.resolve({data:{ok:true},error:null}),
   from:()=>{const q={eq:()=>q,is:()=>q,single:()=>Promise.resolve({data:null,error:null}),
     order:()=>Promise.resolve({data:[],error:null})};return{select:()=>q}},
   storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{}})})}};
  w.RPWDb={ getRow:async()=>({data:{data:JSON.parse(JSON.stringify(JOB)),version:1,
      updated_at:new Date().toISOString()},error:null}),
    patchV2:async(sb,id,p)=>{PATCH.push(p);return {ok:true}} };
  w.RPWCache={getJob:()=>null,setJob:()=>{}};
  w.localStorage.setItem('rpw_auth',JSON.stringify({token:'t'.repeat(64),name:'T',employeeId:'E1',
    shopId:'S',can:{open:true,team:true},exp:Date.now()+9e6}));
  let OPEN=null; w.open=(u)=>{OPEN=u;w.__open=u;return null};
 }});
const w=dom.window;
for(let i=0;i<120 && !w.document.getElementById('clTel');i++) await sleep(25);
const D=()=>w.document;
if(process.env.DBG){
  console.log('  [DBG] JOB betoltve:', !!w.JOB, ' guard:', typeof w.RPW_CFG);
  const app=w.document.getElementById('app');
  console.log('  [DBG] #app hossz:', app?app.innerHTML.length:'nincs #app');
  console.log('  [DBG] body eleje:', w.document.body.innerHTML.slice(0,260).replace(/\s+/g,' '));
}

console.log('\n1. A Client szekció mezői SZERKESZTHETŐK (F-1)');
{
  ok(!!D().getElementById('clNume'),'név-mező');
  ok(!!D().getElementById('clTel'),'telefon-mező');
  ok(!!D().getElementById('clObs'),'megjegyzés-mező');
  // Amit NEM nyitottunk meg: azoknak sajat szabalyaik vannak.
  const be=[...D().querySelectorAll('input')].map(i=>i.id).filter(Boolean);
  ok(be.indexOf('clPlate')<0 && be.indexOf('clNr')<0,'a rendszám és a kárszám NEM lett szabad mező');
}

console.log('\n2. A WhatsApp gomb telefon nélkül TILTOTT és beszél (F-3)');
{
  const b=D().getElementById('waLink');
  ok(!!b,'a gomb a lapon van');
  ok(b && b.disabled,'telefon nélkül tiltott — nem tudsz olyat nyomni, ami úgysem küld');
  ok(b && /telefon|phone|numărul|numarul/i.test(b.textContent),'  és megmondja, mi kell: '+b.textContent.trim());
}

console.log('\n3. Gépelés közben ment, újrarajzolás nélkül (F-2)');
{
  const el=D().getElementById('clTel');
  el.value='0740111222';
  el.dispatchEvent(new w.Event('input',{bubbles:true}));
  // A fokusz megmarad: a lap NEM rajzolodik ujra gepeles kozben.
  ok(D().getElementById('clTel')===el,'ugyanaz a mező maradt (nincs újrarajzolás)');
  const b=D().getElementById('waLink');
  ok(b && !b.disabled,'a WhatsApp gomb AZONNAL aktívvá vált');
  ok(b && !/telefon|numărul/i.test(b.textContent),'  és a felirata is átváltott: '+b.textContent.trim());
  ok(PATCH.length===0,'800 ms-en belül még NEM mentett (nem küld minden leütésre)');
  await sleep(1100);
  ok(PATCH.length===1,'a késleltetés után EGYSZER mentett');
  ok(PATCH[0] && PATCH[0].phone==='0740111222','  a telefonszámot: '+JSON.stringify(PATCH[0]));
  ok(!PATCH[0].plate && !PATCH[0].nrDosar,'  és CSAK azt — szeletes mentés, nem az egész munkalap');
}

console.log('\n4. Kilépéskor azonnal ment (nem vész el semmi)');
{
  const el=D().getElementById('clNume');
  el.value='Pagubit Elek';
  el.dispatchEvent(new w.Event('change',{bubbles:true}));
  await sleep(60);
  const ut=PATCH[PATCH.length-1];
  ok(ut && ut.client==='Pagubit Elek','a névmezőből kilépve azonnal mentett: '+JSON.stringify(ut));
}

console.log('\n5. A lánc összeér');
{
  const src=fs.readFileSync(path.join(ROOT,'rpw-dosar.html'),'utf8');
  ok(/wa\.me\/'\+ph/.test(src),'a küldés a wa.me-re megy');
  ok(/rpw-upload\.html\?job=/.test(src),'  a feltöltési linkkel');
  ok(/setDosarClient/.test(src) && /\['client','phone','note'\]/.test(src),
     'a mentés CSAK a három ügyfél-mezőt engedi');
  ok(/RPWDb\.patchV2\(sb,JOB\.id,p,\{actor:'service'\}\)/.test(src),
     'ugyanazon a védett, szeletes úton, mint a lap többi mezője');
}

console.log('\n6. A KESON ERKEZO SZERVER-VALASZ NEM TOROLHETI, AMIT GEPELSZ');
{
  // Ferenc: "nem mukodik". A loadJob() eloszor a gyorsitotarbol rajzol,
  // MAJD a szerver valaszara LECSERELI a JOB-ot es ujrarajzol. Aki addig
  // beirta a telefont, annak elveszett. Ez a teszt azt a versenyt jatssza
  // ujra: lassu szerver + kozben gepeles.
  const PATCH2=[];
  const vc2=new jsdom.VirtualConsole();['jsdomError','error'].forEach(e=>vc2.on(e,()=>{}));
  const dom2=new JSDOM(inline(raw),{virtualConsole:vc2,
   url:'https://rpw.teszt/rpw-dosar.html?job=D1',runScripts:'dangerously',pretendToBeVisual:true,
   beforeParse(w2){
    w2.__sbMock={rpc:()=>Promise.resolve({data:{ok:true},error:null}),
     from:()=>{const q={eq:()=>q,is:()=>q,order:()=>Promise.resolve({data:[],error:null})};return{select:()=>q}},
     storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{}})})}};
    w2.RPWDb={ getRow:()=>new Promise(r=>setTimeout(()=>r(
        {data:{data:JSON.parse(JSON.stringify(JOB)),version:1,
               updated_at:new Date().toISOString()},error:null}),700)),   // LASSU
      patchV2:async(sb,id,p)=>{PATCH2.push(p);return {ok:true}} };
    // a gyorsitotarban mar ott a munka -> az elso rajzolas AZONNAL megy
    w2.RPWCache={getJob:()=>JSON.parse(JSON.stringify(JOB)),setJob:()=>{}};
    w2.localStorage.setItem('rpw_auth',JSON.stringify({token:'t'.repeat(64),name:'T',employeeId:'E1',
      shopId:'S',can:{open:true,team:true},exp:Date.now()+9e6}));
   }});
  const w2=dom2.window;
  for(let i=0;i<60 && !w2.document.getElementById('clTel');i++) await sleep(20);
  const t=w2.document.getElementById('clTel');
  ok(!!t,'a lap a gyorsítótárból már kirajzolódott');
  t.value='0740111222';
  t.dispatchEvent(new w2.Event('input',{bubbles:true}));
  await sleep(1400);                       // a lassu szerver-valasz IDE esik
  const t2=w2.document.getElementById('clTel');
  ok(t2 && t2.value==='0740111222','a beírt telefon TÚLÉLI a szerver-választ — "'+(t2?t2.value:'?')+'"');
  ok(w2.JOB && w2.JOB.phone==='0740111222','  és a munkalapon is megmaradt');
  const b=w2.document.getElementById('waLink');
  ok(b && !b.disabled,'  a WhatsApp gomb aktív maradt');
  ok(PATCH2.some(p=>p.phone==='0740111222'),'  és a mentés is elment');
}

console.log('\n'+(fail?'✗ ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
