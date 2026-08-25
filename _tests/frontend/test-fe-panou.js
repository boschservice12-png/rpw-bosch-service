// ════════════════════════════════════════════════════════════════
//  FRONTEND — A FŐABLAK VALÓDI RENDERELÉSE (K-19)
//  Nem regexeket nézünk a forrásban: a VALÓDI index.html fut jsdom-ban,
//  valódi adatokkal, és a KIRAJZOLT DOM-ot mérjük.
//   · Avizare daună fül: saját lista, két létrehozó út
//   · Viitoare: kétállapotú jelvény biztosítós javításnál
//   · a felugró kék modal nem létezik többé
// ════════════════════════════════════════════════════════════════
const fs=require('fs'),path=require('path'),jsdom=require('jsdom');
const {JSDOM}=jsdom;const ROOT=path.resolve(__dirname,'..','..');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function inline(html){return html.replace(/<script src="([^"]+)"><\/script>/g,(m,src)=>{
  if(/supabase/.test(src))return '<script>window.supabase={createClient:()=>window.__sbMock}</'+'script>';
  const f=path.join(ROOT,src);
  if(/^rpw-/.test(src)&&fs.existsSync(f))return '<script>'+fs.readFileSync(f,'utf8').replace(/<\/script>/g,'<\\/script>')+'</'+'script>';
  return '';});}

const CAPS={ok:true,schema_version:'008',rpcs:['rpw_jobs_list','rpw_job_get','rpw_patch_v3',
  'rpw_transition','rpw_job_trash','rpw_job_restore','rpw_job_purge','rpw2_session','rpw2_login',
  'rpw_requirements'],rls_locked:true,business_gates_server_side:true,storage_mode:'private'};
const JOBS=[
 {id:'D1',number:'MS-26-060',plate:'MS-11-AAA',client:'Dosar Elek',flux:'doar_dosar',doarDosar:true,
  damageType:'asig',dosarStatus:'deschid',dosarActe:{},phase:1,phases:{},inchis:false,
  created:'2026-08-25',programare:{}},
 {id:'V1',number:'MS-26-061',plate:'MS-22-BBB',client:'Prog Anna',flux:'reparatie',damageType:'asig',
  dosarStatus:'deschis',sosire:'programat',phase:1,phases:{},inchis:false,
  programare:{date:'2026-08-27',time:'09:00'},conditions:{programare:true}},
 {id:'V2',number:'MS-26-062',plate:'MS-33-CCC',client:'Aviz Bela',flux:'reparatie',damageType:'asig',
  dosarStatus:'deschid',sosire:'programat',phase:1,phases:{},inchis:false,
  programare:{date:'2026-08-28',time:'10:00'},conditions:{}},
 {id:'V3',number:'MS-26-063',plate:'MS-44-DDD',client:'Sajat Csaba',flux:'reparatie',damageType:'auto',
  sosire:'programat',phase:1,phases:{},inchis:false,
  programare:{date:'2026-08-29',time:'11:00'},conditions:{}},
];

(async()=>{
const raw=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const dom=new JSDOM(inline(raw),{url:'https://rpw.teszt/index.html',
 runScripts:'dangerously',pretendToBeVisual:true,
 beforeParse(w){
  w.__sbMock={rpc:(n)=>Promise.resolve({data:(n==='rpw_server_capabilities'?CAPS:
    (n==='rpw_jobs_list'?{ok:true,rows:JOBS.map(j=>({id:j.id,data:JSON.parse(JSON.stringify(j)),version:1}))}:{ok:true})),error:null}),
   from:()=>{const q={eq:()=>q,is:()=>q,order:()=>Promise.resolve(
     {data:JOBS.map(j=>({id:j.id,data:JSON.parse(JSON.stringify(j)),version:1})),error:null})};
     return {select:()=>q}},
   storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{}})})}};
  w.localStorage.setItem('rpw_auth',JSON.stringify({token:'t'.repeat(64),name:'T',employeeId:'E1',
    shopId:'S',can:{open:true,team:true},exp:Date.now()+9e6}));
  w.Chart=function(){this.destroy=()=>{}};
 }});
const w=dom.window;
for(let i=0;i<60 && !(w.JOBS&&w.JOBS.length===4);i++) await sleep(25);
w.S.screen='panou'; w.S.panouTab='viitoare';
try{ w.localStorage.setItem('rpw_az_seen', new Date().toISOString().slice(0,10)); }catch(e){}
w.render();
const app=()=>w.document.getElementById('app').innerHTML;

console.log('\n1. Viitoare fül — a kétállapotú jelvény (K-19)');
{
  const h=app();
  ok(w.JOBS.length===4,'a 4 teszt-munka betöltődött');
  const v1=h.split('<tr').filter(s=>/MS-22-BBB/.test(s))[0]||'';
  const v2=h.split('<tr').filter(s=>/MS-33-CCC/.test(s))[0]||'';
  const v3=h.split('<tr').filter(s=>/MS-44-DDD/.test(s))[0]||'';
  ok(/dd2-open/.test(v1)&&/Dosar deschis/.test(v1),'deschis → zöld „Dosar deschis" jelvény');
  ok(/dd2-aviz/.test(v2)&&/Avizare daun/.test(v2),'deschid → kék „Avizare daună" jelvény');
  ok(!/dd2-/.test(v3),'magánkáron NINCS jelvény');
  ok(!/MS-11-AAA/.test(h),'a kárdosszié nincs a Viitoare listán');
  ok(!/prog-modal/.test(h),'a felugró kék modal nem renderelődik');
}

console.log('\n2. Az Avizare daună fül — valódi fülváltással');
{
  const tabBtn=[...w.document.querySelectorAll('.panou-tab')]
    .find(b=>(b.getAttribute('onclick')||'').indexOf("'dosare'")>=0);
  ok(!!tabBtn,'a fül GOMBJA a kirajzolt DOM-ban van');
  if(tabBtn) tabBtn.click(); else w.setPanouTab('dosare');
  await sleep(30);
  const h=app();
  ok(/MS-11-AAA/.test(h),'a kárdosszié a saját fülén van');
  const btn=[...w.document.querySelectorAll('button')].find(b=>(b.getAttribute('onclick')||'')==='dosarTarziu()');
  ok(!!btn,'a „Deschide dosar daună" gomb VALÓDI elem a fülön');
  ok(!!w.document.querySelector('input[type=file]'),'a Preluare fájl-bemenet valódi elem');
  const row=h.split('<tr').filter(s=>/MS-11-AAA/.test(s))[0]||'';
  ok(/deschideDosar/.test(row),'a sor fő művelete: Deschide dosarul');
  ok(/ac-b/.test(row),'iratszámláló a soron');
  ok(!/markRatat/.test(row),'nincs Ratat a dosszié-soron');
}

console.log('\n3. A fül-gomb kattintása tényleg vált (oda-vissza)');
{
  const back=[...w.document.querySelectorAll('.panou-tab')]
    .find(b=>(b.getAttribute('onclick')||'').indexOf("'viitoare'")>=0);
  back.click(); await sleep(30);
  ok(/MS-22-BBB/.test(app())&&!/MS-11-AAA/.test(app()),'vissza a Viitoare-ra');
}

console.log('\n'+(fail?'✗ ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
