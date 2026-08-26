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
  phone:'0740111222',
  programare:{date:'2026-08-27',time:'09:00'},conditions:{programare:true,whatsapp:true}},
 {id:'V2',number:'MS-26-062',plate:'MS-33-CCC',client:'Aviz Bela',flux:'reparatie',damageType:'asig',
  dosarStatus:'deschid',sosire:'programat',phase:1,phases:{},inchis:false,
  phone:'0740333444',
  programare:{date:'2026-08-28',time:'10:00'},conditions:{}},
 {id:'V3',number:'MS-26-063',plate:'MS-44-DDD',client:'Sajat Csaba',flux:'reparatie',damageType:'auto',
  sosire:'programat',phase:1,phases:{},inchis:false,
  programare:{date:'2026-08-29',time:'11:00'},conditions:{}},
];

(async()=>{
const raw=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
// jsdom nem enged valodi navigaciot: a kiserletet a hibajelzesbol fogjuk el.
let NAV=null;
const vc=new jsdom.VirtualConsole();
['jsdomError','error','warn','info','log'].forEach(ev=>vc.on(ev,(...a)=>{
  const t=String((a[0]&&a[0].message)||a[0]||'');
  if(/navigat|not implemented/i.test(t)) NAV=t;
  if(process.env.NAVDBG) console.log('   ['+ev+']',t.slice(0,90));
}));
const dom=new JSDOM(inline(raw),{virtualConsole:vc, url:'https://rpw.teszt/index.html',
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

console.log('\n1b. Kapcsolat = a VALÓDI WhatsApp jel (Ferenc, 2026-08-26)');
{
  const h=app();
  ok(!/Contacteaza clientul|need_wa_btn/.test(h),'a „Contactează clientul" szöveges gomb eltűnt');
  const rows=[...w.document.querySelectorAll('tr.panou-row')];
  ok(rows.length>0,'vannak sorok');
  ok(rows.every(r=>r.querySelectorAll('.wa-btn').length===1),
     'soronként PONTOSAN EGY WhatsApp-vezérlő van (nem kettő)');
  const wa=[...w.document.querySelectorAll('.wa-btn')];
  ok(wa.length>0 && wa.every(b=>!!b.querySelector('svg')),'mindegyik a valódi WhatsApp jelet viseli (svg)');
  ok(!/💬/.test(h),'a 💬 emoji sehol nem maradt a listán');

  const rowOf=p=>rows.find(r=>r.textContent.indexOf(p)>=0);
  const btnOf=p=>{const r=rowOf(p);return r?r.querySelector('.wa-btn'):null};
  const b1=btnOf('MS-22-BBB'), b2=btnOf('MS-33-CCC'), b3=btnOf('MS-44-DDD');
  ok(b1 && !b1.classList.contains('dark') && !b1.classList.contains('nofon'),
     'egyeztetett ügyfél → ZÖLD jel');
  ok(b2 && b2.classList.contains('dark'),'még nem egyeztetett → SÖTÉT jel');
  ok(b3 && b3.classList.contains('nofon'),'nincs telefon → tompított jel');
  ok(b3 && /openCondModal/.test(b3.getAttribute('onclick')||''),
     '  telefon nélkül sem zsákutca: a kézi bejelölés útja nyílik');
  ok(b3 && !b3.disabled,'  nem néma tiltott gomb');
  ok(b2 && /clickWhatsApp/.test(b2.getAttribute('onclick')||''),
     'a sötét jel kattintásra ÍR az ügyfélnek és be is jelöli');
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

console.log('\n2b. A fejléc Avizare daună gombja EGYENESEN dossziét nyit (Ferenc)');
{
  // A keres: "az avizare dauna ugyanugy mukodjon mint deschide dosar de dauna".
  // A gomb tehat NEM fulet valt — LETREHOZZA a dossziet es odavisz.
  const kek=[...w.document.querySelectorAll('.panou-hdr-actions button')]
    .find(b=>/dosar_dauna|Avizare daun/.test(b.textContent));
  ok(!!kek,'a kék Avizare daună gomb a fejlécben van');
  ok(kek && (kek.getAttribute('onclick')||'')==='dosarTarziu()',
     '  a gomb dossziét NYIT, nem fület vált — onclick: '+(kek?kek.getAttribute('onclick'):'?'));
  const elotte=w.JOBS.length;
  NAV=null;
  const t0=Date.now();
  if(kek) kek.click();
  while(NAV===null && Date.now()-t0<8000) await sleep(50);
  ok(w.JOBS.length===elotte+1,'a kattintás LÉTREHOZTA a kárdossziét ('+elotte+'→'+w.JOBS.length+')');
  const uj=w.JOBS[w.JOBS.length-1];
  ok(!/nj-box/.test(app()),'NEM nyílt űrlap');
  ok(uj.flux==='doar_dosar','flux=doar_dosar — javítás nélküli dosszié');
  ok(uj.damageType==='asig' && uj.dosarStatus==='deschid','biztosítós kár, MI nyitjuk a dossziét');
  ok(NAV!==null && /navigation|not implemented/i.test(NAV),
     'a kattintás NAVIGÁLT a dosszié-lapra (nem maradt a panelen)');
}

console.log('\n3. Lucrare nouă — VALÓDI kattintás, űrlap nélkül a recepcióra');
{
  const back=[...w.document.querySelectorAll('.panou-tab')]
    .find(b=>(b.getAttribute('onclick')||'').indexOf("'viitoare'")>=0);
  back.click(); await sleep(30);
  const zold=[...w.document.querySelectorAll('button')]
    .find(b=>(b.getAttribute('onclick')||'')==='lucrareAcum()');
  ok(!!zold,'a zöld Lucrare nouă gomb VALÓDI elem');
  const elotte=w.JOBS.length;
  NAV=null;
  // A panelen a mentes a TARTOS SOROn megy (rpw-save.js, 800ms debounce),
  // ezert a navigacio nem azonnali. Nem alszunk vakon: varunk ra.
  const t0=Date.now();
  if(zold) zold.click();
  while(NAV===null && Date.now()-t0<8000) await sleep(50);
  console.log('    i a navigacio '+(Date.now()-t0)+' ms utan indult (sor-alapu mentes)');
  ok(w.JOBS.length===elotte+1,'a kattintás LÉTREHOZTA a munkalapot ('+elotte+'→'+w.JOBS.length+')');
  const uj=w.JOBS[w.JOBS.length-1];
  ok(!/nj-box/.test(app()),'NEM nyílt űrlap');
  ok(uj.sosire==='sosit','sosire=sosit — az autó itt van');
  ok(uj.flux==='reparatie','flux=reparatie');
  ok(uj.phase===1 && uj.phases[1].status==='active','phase=1, az 1. fázis AKTÍV');
  ok(uj.damageType===null,'a kártípust a recepció dönti el (null)');
  ok(uj.plate==='','üres rendszám — a talonból/OCR-ből jön');
  ok(uj.conditions && uj.conditions.programare===true,'a fogadási feltételek beállítva');
  // jsdom-ban csak az látszik, hogy navigáció TÖRTÉNT; a cél URL-t a
  // forrás rögzíti (lásd lentebb, 5. szakasz) — így nem hiszünk vakon.
  ok(NAV!==null && /navigation|not implemented/i.test(NAV),
     'a kattintás NAVIGÁLT (nem maradt a panelen) — jsdom: '+String(NAV).slice(0,60));
}

console.log('\n4. A fül-gomb kattintása tényleg vált (oda-vissza)');
{
  ok(/MS-22-BBB/.test(app())&&!/MS-11-AAA/.test(app()),'a Viitoare-fül a helyén');
}

console.log('\n5. A célok a forrásban (amit jsdom nem tud megmutatni)');
{
  const src=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const fn=src.slice(src.indexOf('window.lucrareAcum'), src.indexOf('window.dosarFisier'));
  ok(/rpw-recepcio-red\.html\?job='\+encodeURIComponent\(j\.id\)/.test(fn),
     'lucrareAcum → rpw-recepcio-red.html?job=<id>');
  ok(!/openNewJob/.test(fn),'  űrlapot nem nyit');
  ok(!/S\.njMode='lucrare'|mode==='lucrare'/.test(src),'a lucrare űrlap-mód sehol nem maradt');
  ok(/var asig   = \(S\.njTip==='asig'\)/.test(src),
     'az űrlap AMIT BEKÉR, azt át is viszi (nincs adatvesztés)');
  const dt=src.slice(src.indexOf('window.dosarTarziu'), src.indexOf('window.lucrareAcum'));
  ok(/deschideDosar\(j\.id\)/.test(dt),'dosarTarziu → deschideDosar(<id>) → dosszié-lap');
}

console.log('\n'+(fail?'✗ ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
