// ════════════════════════════════════════════════════════════════
//  FRONTEND — AZ UGYFEL FELTOLTO LAPJA (rpw-upload.html)
//  Ferenc, 2026-08-27: "a telefonos link en nincs trimite gomb
//                       es hibas az elolapja"
//
//  Ket kulon baj volt egy lapon:
//   1. ELOLAP — friss dossziehoz nincs se marka, se rendszam, ezert a
//      kartyan a szo szerinti "Autovehicul" allt: az ugyfel nem tudta,
//      melyik dossziejahoz tolt fel. Most a DOSSZIESZAM a focim.
//   2. TRIMITE — a fajlok kivalasztaskor azonnal mentodnek, de az
//      ugyfelnek nem volt egy pillanata, amikor kimondhatta: kesz
//      vagyok. Egyetlen gomb sem volt a lapon.
//
//  A VALODI rpw-upload.html fut jsdom-ban, Ferenc valos MS-26-074
//  alakjaval (nincs rendszam, nincs marka, 17 irat a 18-bol).
// ════════════════════════════════════════════════════════════════
const fs=require('fs'),path=require('path'),jsdom=require('jsdom');
const {JSDOM}=jsdom;const ROOT=path.resolve(__dirname,'..','..');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function inline(html){return html.replace(/<script src="([^"]+)"><\/script>/g,(m,src)=>{
  if(/supabase/.test(src))return '<script>window.supabase={createClient:()=>window.__sbMock}</'+'script>';
  // A rpw-db.js felulirna a beforeParse-ban rakott babot — a bab a szerver
  // helyettesitoje, abbol olvassuk ki, mit MENTETT volna a lap.
  if(/rpw-(db|cache|guard)\.js/.test(src))return '';
  const f=path.join(ROOT,src);
  if(/^rpw-/.test(src)&&fs.existsSync(f))return '<script>'+fs.readFileSync(f,'utf8').replace(/<\/script>/g,'<\\/script>')+'</'+'script>';
  return '';});}

// Ferenc valodi MS-26-074 sora: NINCS rendszam, NINCS marka, 18 irat.
// (a 19. — "foto_avarii" — hianyzik, ezert a szamlalo 18/19)
// 2026-08-30: a `foto_km` (kilometeróra) UJ kotelezo rekesz — Ferenc
// dontese szerint a hat auto-foto: 4 oldal + alvazszam + km.
const AKTA={};
['constatare_amiabila','pag_buletin','pag_talon_fata','pag_talon_verso',
 'pag_permis_fata','pag_permis_verso','declaratie_dauna','polita_rca',
 'vin_buletin','vin_talon','vin_permis','foto_fata','foto_spate',
 'foto_stanga','foto_dreapta','foto_serie_caroserie','foto_km',
 'imputernicire_doc'].forEach(function(k,i){
   AKTA[k]={url:'https://s/'+k+'.jpg',path:'p/'+k+'.jpg',type:'image/jpeg',src:'whatsapp'};
 });

function ujJob(x){
  return Object.assign({id:'U74',number:'MS-26-074',plate:'',brand:'',client:'',phone:'',
    damageType:'asig',dosarStatus:'deschid',dosarActe:JSON.parse(JSON.stringify(AKTA)),
    clientUploads:[{url:'https://s/x.jpg',path:'p/x.jpg',type:'image/jpeg',src:'whatsapp'}],
    photos:[],docs:[],phase:1,phases:{1:{status:'pending'}},inchis:false,version:1}, x||{});
}

// Egy lap-peldany felepitese; a JOB-ot es a mentes sikeret kivulrol adjuk.
async function lap(job,opts){
  opts=opts||{};
  const PATCH=[];
  const raw=fs.readFileSync(path.join(ROOT,'rpw-upload.html'),'utf8');
  const vc=new jsdom.VirtualConsole();['jsdomError','error'].forEach(e=>vc.on(e,(...a)=>{
    if(process.env.DBG) console.log('  ['+e+'] '+String((a[0]&&a[0].message)||a[0]||'').slice(0,200));}));
  const dom=new JSDOM(inline(raw),{virtualConsole:vc,
   url:'https://rpw.teszt/rpw-upload.html?job=U74',runScripts:'dangerously',pretendToBeVisual:true,
   beforeParse(w){
    w.__sbMock={rpc:()=>Promise.resolve({data:{ok:true},error:null}),
     from:()=>{const q={eq:()=>q,is:()=>q,single:()=>Promise.resolve({data:null,error:null}),
       order:()=>Promise.resolve({data:[],error:null})};return{select:()=>q}},
     storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{}})})}};
    w.RPWDb={ getRow:async()=>({data:{data:JSON.parse(JSON.stringify(job)),version:1,
        updated_at:new Date().toISOString()},error:null}),
      patchV2:async(sb,id,p,o)=>{ PATCH.push({p:p,o:o});
        if(opts.mentesHibas) throw new Error('halot a halo');
        return {ok:true}; } };
    w.RPWCache={getJob:()=>null,setJob:()=>{}};
   }});
  const w=dom.window;
  for(let i=0;i<160 && !w.document.querySelector('.sendbar,.card');i++) await sleep(25);
  await sleep(40);
  return {w,PATCH,D:()=>w.document,
    // FONTOS: a #app tartalmahoz merunk, nem a body-hoz — a body-ban
    //         ott all a lap sajat <script> forrasa is (a kommentekkel).
    szoveg:()=>w.document.getElementById('app').textContent.replace(/\s+/g,' '),
    fej:()=>w.document.querySelector('.veh')?w.document.querySelector('.veh').textContent.replace(/\s+/g,' ').trim():'',
    gomb:()=>w.document.querySelector('.send')};
}

(async()=>{

console.log('\n1. AZ ELOLAP: marka es rendszam NELKUL is megmondja, MELYIK dosszie');
{
  const L=await lap(ujJob());
  const f=L.fej();
  ok(f.length>0,'a jarmu-kartya kirajzolodik  ("'+f+'")');
  ok(!/Autovehicul/i.test(L.szoveg()),
     'a szo szerinti "Autovehicul" tartalek-szoveg SEHOL nem jelenik meg');
  ok(/MS-26-074/.test(f),'a dossziészam a kartyan van — errol ismeri fel az ugyfel');
  ok(/Dosar de daună/.test(f),
     '  es megmondja, mi ez: "Dosar de daună" (nem ismetli meg a szamot ketszer)');
  ok(!/Dosar: MS-26-074/.test(f),'  a szam nem all ott ketszer');
  ok(/Adăugați pozele/.test(L.szoveg()),
     'a kartya megmondja, mit kell tennie: pozele si actele');
  L.w.close();
}

console.log('\n1b. Ha VAN marka es rendszam, mind a harom informacio latszik');
{
  const L=await lap(ujJob({plate:'MS-55-BSS',brand:'Dacia Logan'}));
  const f=L.fej();
  ok(/Dacia Logan/.test(f),'a marka a focim');
  ok(/MS-55-BSS/.test(f),'  a rendszam is ott van');
  ok(/Dosar: MS-26-074/.test(f),'  es alatta a dossziészam');
  const p=L.D().querySelector('.plate');
  ok(!!p && p.textContent.trim()==='MS-55-BSS','a rendszam kulon jelvenyen all');
  L.w.close();
}

console.log('\n1c. Rendszam van, marka nincs — a rendszam NEM all ott ketszer');
{
  const L=await lap(ujJob({plate:'MS-55-BSS'}));
  const f=L.fej();
  ok((f.match(/MS-55-BSS/g)||[]).length===1,
     'a rendszam pontosan egyszer szerepel  ("'+f+'")');
  ok(/MS-26-074/.test(f),'  a focim a dossziészam');
  L.w.close();
}

console.log('\n2. A TRIMITE GOMB LETEZIK — ez volt Ferenc panasza');
{
  const L=await lap(ujJob());
  const g=L.gomb();
  ok(!!g,'van "Trimite" gomb a lapon');
  ok(!!g && /Trimite/.test(g.textContent),'  a felirata Trimite  ("'+(g?g.textContent.trim():'—')+'")');
  ok(!!g && g.tagName==='BUTTON' && g.type==='button',
     '  valodi <button type="button"> — nem kuld el veletlenul urlapot');
  ok(!!L.D().querySelector('.sendbar'),'a gomb sav a lap aljan van');
  L.w.close();
}

console.log('\n3. HIANYOS dossziet is el LEHET kuldeni — de a lap megmondja, mi hianyzik');
{
  const L=await lap(ujJob());                 // 17 / 18
  const g=L.gomb();
  ok(!!g && !g.disabled,'a gomb hianyos dossziénél sem tiltott — az ugyfel nem ragad be');
  ok(!!g && /warn/.test(g.className),
     '  de figyelmezteto (kortvonalas) formaban all');
  ok(!!g && /18\/19/.test(g.textContent.replace(/\s/g,'')),
     '  a feliraton ott a merleg: '+(g?g.textContent.trim():'—'));
  ok(/Mai lipsesc 1 documente/.test(L.szoveg()),
     '  es szammal kimondja, hany irat hianyzik meg');
  L.w.close();
}

console.log('\n3b. TELJES dossziénél a gomb tomor piros, es nem panaszkodik');
{
  const teljes=ujJob(); teljes.dosarActe.foto_avarii=[{url:'https://s/av.jpg',path:'p/av.jpg',type:'image/jpeg'}];
  const L=await lap(teljes);
  const g=L.gomb();
  ok(!!g && !/warn/.test(g.className),'a gomb tele piros lesz');
  ok(!!g && /Trimite dosarul/.test(g.textContent),'  a felirat: "Trimite dosarul"');
  ok(!/Mai lipsesc/.test(L.szoveg()),'  nincs hianyzo-figyelmeztetes');
  L.w.close();
}

console.log('\n4. KATTINTAS: a jelzes ELMEGY, es az ugyfel LATJA, hogy elment');
{
  const L=await lap(ujJob());
  ok(!!L.gomb(),'van mire kattintani');
  if(L.gomb()) L.gomb().click();
  await sleep(60);
  ok(!L.gomb(),'a gomb eltunik — nem lehet ketszer elkuldeni');
  const s=L.D().querySelector('.sent');
  ok(!!s,'a helyen visszaigazolas all');
  ok(!!s && /Trimis/.test(s.textContent),'  "Trimis. Vă mulțumim!"  ("'+(s?s.textContent.trim():'—')+'")');
  ok(/Puteți adăuga în continuare/.test(L.szoveg()),
     '  es megnyugtatja: tovabb is tolthet fel fajlt');

  const p=L.PATCH.filter(x=>x.p&&x.p.clientGata);
  ok(p.length===1,'pontosan EGY mentes ment ki a szerverre');
  const cg=p.length?p[0].p.clientGata:null;
  ok(!!cg&&typeof cg.at==='string'&&!isNaN(Date.parse(cg.at)),
     '  a jelzes idopontot visz (ebbol tudja a szerviz, MIKOR zarta le)');
  ok(!!cg&&cg.files===19,'  es a fajlok szamat: 18 irat + 1 egyeb = 19  (kapott: '+(cg?cg.files:'—')+')');
  ok(p.length&&p[0].o&&p[0].o.actor==='client_whatsapp',
     '  a mentes az UGYFEL neveben megy, nem dolgozokent');
  ok(p.length&&!('phase' in p[0].p)&&!('inchis' in p[0].p),
     '  a gomb NEM nyul a munkafazishoz — az a szervizé');
  L.w.close();
}

console.log('\n5. HA A MENTES ELBUKIK, nem hazudunk "elkuldve"-t');
{
  const L=await lap(ujJob(),{mentesHibas:true});
  ok(!!L.gomb(),'van mire kattintani');
  if(L.gomb()) L.gomb().click();
  await sleep(80);
  ok(!L.D().querySelector('.sent'),'nincs hamis visszaigazolas');
  ok(!!L.gomb(),'a gomb VISSZAJON — ujra lehet probalni');
  ok(/Trimite/.test(L.gomb()?L.gomb().textContent:''),'  ugyanaz a gomb, ugyanazzal a felirattal');
  L.w.close();
}

console.log('\n6. AKI MAR ELKULDTE, ujranyitaskor is a visszaigazolast latja');
{
  const L=await lap(ujJob({clientGata:{at:'2026-08-27T09:00:00.000Z',files:19}}));
  ok(!L.gomb(),'nincs ujra "Trimite" gomb');
  ok(!!L.D().querySelector('.sent'),'a visszaigazolas all a helyen — a szerverrol jott allapot');
  ok(L.PATCH.length===0,'  es a puszta megnyitas nem ir a szerverre');
  L.w.close();
}

console.log('\n8. A KULDES NEM AUTOMATIKUS — a lap sehol nem allitja, hogy mar elment');
{
  // Ferenc: "a kuldes ne legyen automatikus". Harom helyen mondta a lap a
  // "Trimis" szot, pedig csak MENTES tortent: a 18/18 uzenetben, es minden
  // egyes fajl feltoltese utan. Az ugyfel ezert azt hitte, mar elkuldte.
  const teljes=ujJob(); teljes.dosarActe.foto_avarii=[{url:'a.jpg',path:'p/a',type:'image/jpeg'}];
  const L=await lap(teljes);                       // 18/18, de MEG NEM kuldve
  ok(!!L.gomb(),'18/18-nal is ott all a Trimite gomb — nem megy el magatol');
  ok(!/au fost trimise/i.test(L.szoveg()),
     'a 18/18 uzenet NEM allitja, hogy elmentek a papirok');
  ok(/sunt încărcate/.test(L.szoveg()),
     '  hanem azt, hogy fel vannak toltve');
  ok(/Apăsați butonul Trimite/.test(L.szoveg()),
     '  es megmondja, mi a kovetkezo lepes');
  ok(L.PATCH.length===0,'a puszta megnyitas semmit nem kuld el');
  L.w.close();

  // A fajlonkenti visszajelzes sem mondhatja, hogy "Trimis".
  const src=require('fs').readFileSync(path.join(ROOT,'rpw-upload.html'),'utf8');
  const toastok=(src.match(/toast\('[^']*'/g)||[]).map(x=>x.slice(7,-1));
  const hazug=toastok.filter(t=>/Trimis/.test(t));
  ok(hazug.length===1,
     'a "Trimis" szo pontosan EGY visszajelzesben szerepel — a gombeban'
     +(hazug.length!==1?('  ['+hazug.join(' | ')+']'):''));
  ok(/toast\('✓ Fișier încărcat'\)/.test(src) && /toast\('✓ Fișiere încărcate'\)/.test(src),
     '  a fajlmentes "incarcat"-ot mond, nem "trimis"-t');
}

console.log('\n8b. KULDES UTAN felvett fajlnal a Trimite VISSZAJON');
{
  // "plusz extra kepek, maradjon trimite" — kulonben az utolag felrakott
  // kepekrol a szerviz sosem kapna jelzest.
  const L=await lap(ujJob({clientGata:{at:'2026-08-27T09:00:00.000Z',files:14}}));  // most 19 van (a km-fotoval)
  ok(!!L.D().querySelector('.sent'),'a korabbi visszaigazolas megmarad');
  const g=L.gomb();
  ok(!!g,'  DE a Trimite gomb visszajott az uj fajlok miatt');
  ok(!!g && /5/.test(g.textContent),'  es megmondja, hany uj van  ("'+(g?g.textContent.trim():'—')+'")');
  ok(/Ați adăugat 5 fișier/.test(L.szoveg()),'  szoveggel is');
  L.w.close();
}

console.log('\n8c. Ha nincs uj fajl a kuldes ota, NINCS ujra gomb');
{
  const L=await lap(ujJob({clientGata:{at:'2026-08-27T09:00:00.000Z',files:19}}));
  ok(!L.gomb(),'ugyanannyi fajlnal nem tolakszik ujra a gomb');
  ok(!!L.D().querySelector('.sent'),'  csak a visszaigazolas all');
  L.w.close();
}

console.log('\n8d. Sikertelen UJRAKULDES nem torli a korabbi sikeres kuldest');
{
  const L=await lap(ujJob({clientGata:{at:'2026-08-27T09:00:00.000Z',files:14}}),{mentesHibas:true});
  ok(!!L.gomb(),'van mire kattintani');
  if(L.gomb()) L.gomb().click();
  await sleep(80);
  ok(!!L.D().querySelector('.sent'),
     'a regi visszaigazolas MEGMARAD — egy sikertelen ujrakuldes nem torli el');
  ok(!!L.gomb(),'  es az uj fajlok gombja is ott van, ujraprobalhato');
  L.w.close();
}

console.log('\n7. EGYETLEN DOBOZ SEM SOR-KOZI (Ferenc: "aranytalan")');
{
  // A <label class="drop"> alapertelmezesben SOR-KOZI elem volt. A sor-kozi
  // doboz fuggoleges bela- es keretmerete NEM tolja arrebb a szomszedait:
  // ratakar rajuk. Chromiumban meg is mertem: a szaggatott keret 14px-t
  // benyult a "Alte fisiere" cim ala, es 7px-t a kepek koze.
  //
  // Ez nem egy elirasra vonatkozo szabaly: MINDEN olyan dobozra all, aminek
  // kerete ES belso margoja van. Ezert nem a .drop-ot nezzuk, hanem
  // vegigmegyunk a lap SAJAT stiluslapjan, es minden ilyen szabalyt
  // ellenorzunk a KIRAJZOLT lapon.
  const L=await lap(ujJob());
  const w=L.w, D=w.document;
  const dobozok=[];
  for(const sheet of D.styleSheets){
    let szabalyok; try{ szabalyok=sheet.cssRules }catch(e){ continue }
    if(!szabalyok) continue;
    for(const r of szabalyok){
      if(!r.style || !r.selectorText) continue;
      const keret=r.style.getPropertyValue('border')||r.style.getPropertyValue('border-width');
      const belso=r.style.getPropertyValue('padding');
      if(keret && belso && !/none|^0/.test(keret)) dobozok.push(r.selectorText);
    }
  }
  ok(dobozok.length>=3,'a stiluslapon '+dobozok.length+' keretes-belsomargos doboz van');
  let sorkozi=[];
  dobozok.forEach(function(sel){
    let el; try{ el=D.querySelectorAll(sel) }catch(e){ return }
    for(const e of el){ if(w.getComputedStyle(e).display==='inline') sorkozi.push(sel); }
  });
  ok(sorkozi.length===0,
     'egyik keretes doboz sem sor-kozi — kulonben ratakarna a szomszedaira'
     +(sorkozi.length?('  [' + [...new Set(sorkozi)].join(', ') + ']'):''));

  // A konkret bunos, nevesitve — hogy a hibauzenet magaert beszeljen
  const drop=D.querySelector('.drop');
  ok(!!drop,'az "Adaugă alte poze / documente" mezo a lapon van');
  ok(!!drop && w.getComputedStyle(drop).display!=='inline',
     '  es NEM sor-kozi  (kapott: '+(drop?w.getComputedStyle(drop).display:'—')+')');
  L.w.close();
}

console.log('\n7b. A kepkockak egyforma meretuek a lap ket felen');
{
  // A "Documente necesare" 4 kockat rak egy sorba, a "Alte fisiere" 3-at —
  // ugyanaz a kep ket kulonbozo meretben allt ugyanazon a lapon.
  const fs2=require('fs');
  const st=fs2.readFileSync(path.join(ROOT,'rpw-upload.html'),'utf8')
             .match(/<style>([\s\S]*?)<\/style>/)[1];
  const oszlop=function(osztaly){
    const m=st.match(new RegExp('\\.'+osztaly+'\\{[^}]*grid-template-columns:repeat\\((\\d+)'));
    return m?+m[1]:null;
  };
  const a=oszlop('thumbs'), b=oszlop('list');
  ok(a!==null && b!==null,'mindket kockarács oszlopszama kiolvashato  (thumbs='+a+', list='+b+')');
  ok(a===b,'a ket racs UGYANANNYI oszlopos — a kockak egyformak  ('+a+' vs '+b+')');
}

console.log('\n'+(fail?'✗ ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
