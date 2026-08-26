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
 {id:'D2',number:'MS-26-067',plate:'MS-20-HHH',client:'Nyitott Dosszie Dora',flux:'doar_dosar',doarDosar:true,
  damageType:'asig',dosarStatus:'deschis',nrDosar:'KAR-888',asigurator:'Omniasig',dosarActe:{},
  phase:1,phases:{},inchis:false,created:'2026-08-24',programare:{}},
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
 {id:'V5',number:'MS-26-066',plate:'MS-10-GGG',client:'Mar Nyitva Marta',flux:'reparatie',damageType:'asig',
  dosarStatus:'deschis',nrDosar:'KAR-777',sosire:'programat',phase:1,phases:{},inchis:false,phone:'0740999000',
  programare:{date:'2026-08-31',time:'13:00'},conditions:{}},
 {id:'V4',number:'MS-26-065',plate:'MS-88-FFF',client:'Keszen Kalman',flux:'reparatie',damageType:'auto',
  sosire:'programat',phase:1,phases:{},inchis:false,phone:'0740777888',
  programare:{date:'2026-08-30',time:'12:00'},conditions:{whatsapp:true}},
 {id:'R1',number:'MS-26-064',plate:'MS-77-EEE',client:'Ratat Dezso',flux:'reparatie',damageType:'auto',
  sosire:'ratat',phase:1,phases:{},inchis:false,phone:'0740555666',
  programare:{date:'2026-08-20',time:'08:00'},conditions:{}},
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
for(let i=0;i<60 && !(w.JOBS&&w.JOBS.length===8);i++) await sleep(25);
w.S.screen='panou'; w.S.panouTab='viitoare';
try{ w.localStorage.setItem('rpw_az_seen', new Date().toISOString().slice(0,10)); }catch(e){}
w.render();
const app=()=>w.document.getElementById('app').innerHTML;

console.log('\n1. Viitoare fül — a kétállapotú jelvény (K-19)');
{
  const h=app();
  ok(w.JOBS.length===8,'a 8 teszt-munka betöltődött');
  const v1=h.split('<tr').filter(s=>/MS-22-BBB/.test(s))[0]||'';
  const v2=h.split('<tr').filter(s=>/MS-33-CCC/.test(s))[0]||'';
  const v3=h.split('<tr').filter(s=>/MS-44-DDD/.test(s))[0]||'';
  ok(/dd2-open/.test(v1)&&/Dosar deschis/.test(v1),'deschis → zöld „Dosar deschis" jelvény');
  ok(/dd2-aviz/.test(v2)&&/Avizare daun/.test(v2),'deschid → kék „Avizare daună" jelvény');
  ok(!/dd2-/.test(v3),'magánkáron NINCS jelvény');
  ok(/MS-11-AAA/.test(h),'a kárdosszié IS a közös listában van (Ferenc: egy ablak)');
  ok(!/prog-modal/.test(h),'a felugró kék modal nem renderelődik');
}

console.log('\n1f. A dosszié állapota MINDEN biztosítós soron látszik (Ferenc)');
{
  const rows=[...w.document.querySelectorAll('tr.panou-row')];
  const R=p=>rows.find(r=>r.textContent.indexOf(p)>=0);
  const dNyit=R('MS-20-HHH');   // kardosszie-sor, a dosszie MAR nyitva
  const dAviz=R('MS-11-AAA');   // kardosszie-sor, meg csak avizaljuk
  ok(dNyit && /dd2-open/.test(dNyit.innerHTML),
     'kárdosszié-soron is ott a 🟢 „Dosar deschis" — eddig hiányzott');
  ok(dNyit && /Dosar deschis/.test(dNyit.textContent),'  olvashatóan is kiírja');
  ok(dAviz && /dd2-aviz/.test(dAviz.innerHTML),'a még avizált dosszié 🔵 jelvényt kap');
  ok(dNyit && /ac-b/.test(dNyit.innerHTML),'  az iratszámláló megmarad mellette');
  // ugyanaz a szabaly a javitas-sorokon (regota)
  ok(R('MS-22-BBB') && /dd2-open/.test(R('MS-22-BBB').innerHTML),'javítás-soron változatlanul látszik');
  // magankaron nincs jelveny
  ok(R('MS-44-DDD') && !/dd2-/.test(R('MS-44-DDD').innerHTML),'magánkáron továbbra sincs jelvény');
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

console.log('\n1c. Sor-ikonok: rajz IGEN, néma gomb NEM');
{
  const h=app();
  const icoBtns=[...w.document.querySelectorAll('.edit-btn.eb-ico')];
  ok(icoBtns.length>0,'vannak ikonos gombok ('+icoBtns.length+')');
  ok(icoBtns.every(b=>!!b.querySelector('svg')),'mindegyikben valódi SVG rajz van');
  ok(icoBtns.every(b=>(b.getAttribute('title')||'').trim().length>2),
     'MINDEGYIKEN van egérmutató-címke (title)');
  ok(icoBtns.every(b=>(b.getAttribute('aria-label')||'').trim().length>2),
     'MINDEGYIKEN van felolvasó-címke (aria-label)');
  ok(icoBtns.every(b=>!b.textContent.trim()),'ikon-gomb: nincs benne szöveg');
  ok(!/📁|✎|🗑|&#128193;|&#9998;/.test(h),'a régi emojik eltűntek a sorokból');

  // Az ELSODLEGES muveletek szovegesek maradnak — azokat olvasni kell.
  const btnTxt=[...w.document.querySelectorAll('.edit-btn')].map(b=>b.textContent.trim()).filter(Boolean);
  ok(btnTxt.some(t=>/Recep[țt]ie auto|Deschide/.test(t)),
     'a fő művelet („Recepție auto" / „Deschide dosarul") SZÖVEGES maradt');

  // Reprogramare / Ratat mostantol ikon — de a jelentesuk a cimken ott van.
  const titles=icoBtns.map(b=>b.getAttribute('title'));
  ok(titles.some(t=>/Reprogram/i.test(t)),'a Reprogramare ikon címkéje beszél');
  ok(titles.some(t=>/Ratat/i.test(t)),'a Ratat ikon címkéje beszél');
}

console.log('\n1e. A mappa CSAK ott, ahol van dosszié-munka (Ferenc, 2026-08-26)');
{
  const rows=[...w.document.querySelectorAll('tr.panou-row')];
  const R=p=>rows.find(r=>r.textContent.indexOf(p)>=0);
  const asig=R('MS-33-CCC');   // biztositos, meg nem egyeztetve
  const auto=R('MS-44-DDD');   // magankar, meg nem egyeztetve
  const kesz=R('MS-88-FFF');   // magankar, mar egyeztetve

  ok(asig && /deschideDosar/.test(asig.innerHTML),'biztosítós soron OTT a dosszié-mappa');
  ok(auto && !/deschideDosar/.test(auto.innerHTML),'magánkár soron NINCS dosszié-mappa');
  ok(auto && /deschideLucrare/.test(auto.innerHTML),'  helyette a recepció útja');
  const w2=auto&&auto.querySelector('.eb-ico.eb-no');
  ok(!!w2 && !!w2.querySelector('svg'),'  ikonos gombként, rajzzal');
  ok(w2 && (w2.getAttribute('aria-label')||'').length>2,'  címkével');

  // Nem duplikalunk: ha a zold szoveges gomb ott van, nincs melle ikon.
  ok(kesz && /deschideLucrare/.test(kesz.innerHTML),'kész magánkár soron ott a recepció');
  ok(kesz && !/deschideDosar/.test(kesz.innerHTML),'  dosszié-mappa ott sincs');
  ok(kesz && kesz.querySelectorAll('.eb-ico.eb-no').length===0,
     '  és NEM kettőzzük: a szöveges gomb mellé nem kerül ikon');

  // Dosar dauna deschis: a dosszie MAR nyitva — nincs mit gyujteni.
  const nyitva=R('MS-10-GGG');   // asig + dosarStatus='deschis', meg nem egyeztetve
  ok(nyitva && !/deschideDosar/.test(nyitva.innerHTML),
     '„Dosar daună deschis" soron sincs mappa — a dosszié már nyitva');
  ok(nyitva && /deschideLucrare/.test(nyitva.innerHTML),'  ott is a recepció útja');
  ok(nyitva && /dd2-open/.test(nyitva.innerHTML),'  és a zöld „Dosar deschis" jelvény jelzi, miért');
  const kesz2=R('MS-22-BBB');    // asig + 'deschis' + mar egyeztetve
  ok(kesz2 && !/deschideDosar/.test(kesz2.innerHTML),'  kész állapotban sem jön vissza a mappa');

  // Aki MEG gyujti az iratokat, annal marad a mappa.
  ok(asig && /dd2-aviz/.test(asig.innerHTML),'„Avizare daună" soron viszont MARAD — ott mi gyűjtjük az iratokat');
}

console.log('\n1d. Ratate fül — a kuka is rajz, nem emoji');
{
  const rt=[...w.document.querySelectorAll('.panou-tab')]
    .find(b=>(b.getAttribute('onclick')||'').indexOf("'ratate'")>=0);
  ok(!!rt,'a Ratate fül gombja a DOM-ban van');
  if(rt) rt.click(); else w.setPanouTab('ratate');
  await sleep(30);
  const h=app();
  ok(/MS-77-EEE/.test(h),'a ratat munka a saját fülén van');
  const del=w.document.querySelector('.edit-btn.eb-del');
  ok(!!del && !!del.querySelector('svg'),'a törlés gombon valódi SVG kuka van');
  ok(del && (del.getAttribute('aria-label')||'').length>2,'  felolvasó-címkével');
  ok(!/🗑/.test(h),'a 🗑 emoji eltűnt');
  const back=[...w.document.querySelectorAll('.panou-tab')]
    .find(b=>(b.getAttribute('onclick')||'').indexOf("'viitoare'")>=0);
  if(back) back.click(); await sleep(30);
}

console.log('\n2. EGY KÖZÖS LISTA — a dosszié-sor mégis felismerhető (Ferenc)');
{
  ok(![...w.document.querySelectorAll('.panou-tab')]
      .some(b=>(b.getAttribute('onclick')||'').indexOf("'dosare'")>=0),
     'külön „Avizare daună" FÜL már nincs');
  const rows=[...w.document.querySelectorAll('tr.panou-row')];
  const dd=rows.find(r=>r.textContent.indexOf('MS-11-AAA')>=0);   // kárdosszié
  const rep=rows.find(r=>r.textContent.indexOf('MS-22-BBB')>=0);  // javítás
  ok(!!dd&&!!rep,'a dosszié és a javítás EGY listában van');
  ok(dd && dd.classList.contains('row-dd'),'a dosszié-sor kék jelölést kap');
  ok(rep && !rep.classList.contains('row-dd'),'a javítás-sor NEM kap ilyet');
  ok(dd && /ac-b/.test(dd.innerHTML),'a dosszié-soron IRATSZÁMLÁLÓ van');
  ok(rep && /panou-pill/.test(rep.innerHTML),'a javítás-soron állapot-pill van');
  ok(dd && /deschideDosar/.test(dd.innerHTML),'a dosszié fő művelete: Deschide dosarul');
  ok(dd && !/markRatat/.test(dd.innerHTML),'a dossziéra nincs Ratat');
  ok(rep && /markRatat/.test(rep.innerHTML),'a javításra van Ratat');
  // a fajl/OCR ut a fejlecben talalt uj helyet
  ok(!!w.document.querySelector('.panou-hdr-actions input[type=file]'),
     'a „Preluare dosar daună" (fájl/OCR) út a fejlécben él tovább');
  // a dossziek a lista VEGEN, legujabb elol
  const idx=p=>rows.findIndex(r=>r.textContent.indexOf(p)>=0);
  ok(idx('MS-11-AAA')>idx('MS-22-BBB'),'a dátum nélküli dosszié a programált munkák UTÁN áll');
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
  const h=app();
  ok(/MS-22-BBB/.test(h)&&/MS-11-AAA/.test(h),'a közös lista a helyén');
  ok(!/MS-77-EEE/.test(h),'a ratat munka NEM szivárog be ide');
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
