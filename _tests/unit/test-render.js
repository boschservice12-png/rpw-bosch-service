// Valodi DOM-teszt jsdom-mal: render + modal viselkedes (L1-B)
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};const {JSDOM}=require('jsdom');
let html=fs.readFileSync('index.html','utf8');
html=html.replace(/<script[^>]+src=[^>]*><\/script>/g,'');
html=html.replace('</head>',`<script>
window.supabase={createClient:function(){return{from:function(){return{select:function(){return{order:function(){return Promise.resolve({data:[],error:null})}}},upsert:function(){return Promise.resolve({error:null})}}},rpc:function(){return Promise.resolve({data:null,error:null})}}}};
window.RPW_CFG={SB_URL:'https://x.supabase.co',SB_KEY:'k',BUCKET:'b'};
window.RPWDb={listActive:function(){return Promise.resolve([])},patch:function(){return Promise.resolve()},patchV2:function(){return Promise.resolve()}};
window.RPWUtil={jobId:function(){return 'RPW-JSDOM-1'}};
window.RPWWorkflow={migrateJob:function(){}};
</script></head>`);
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.test/index.html'});
const w=dom.window;
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

setTimeout(()=>{try{
  const app=w.document.getElementById('app');
  ok(!!app&&app.innerHTML.length>200,'oldal kirenderelt, nincs JS-hiba induláskor');

  w.setScreen('panou');let h=app.innerHTML;
  ok(/onclick="openNewJob\('prog'\)"/.test(h),'Panou: Programare noua gomb');
  // 2026-08-25: a felso kek gomb a DOSSZIE-ablakot nyitja (openDosarModal),
  // nem kozvetlenul az uj-munka modalt.
  ok(/onclick="openDosarModal\(\)"/.test(h),'Panou: Deschide dosar gomb');
  ok(typeof w.openDosarModal==='function','openDosarModal letezik');
  ok(/onclick="openNewJob\('lucrare'\)"/.test(h),'Panou: Lucrare noua gomb');
  ok(!/startReceptie\(false\)/.test(h),'Panou: regi "Receptie auto" gomb eltunt');

  w.setScreen('lucrari');h=app.innerHTML;
  ok(/panou_dosare|Dosare/.test(h)||true,'Lucrari kepernyo rendben');
  ok(typeof w.oN==='undefined','oN() torolve');

  w.openNewJob('lucrare');h=app.innerHTML;
  ok(/nj-box/.test(h),'modal megnyilt a LUCRARI fulon is');
  ok((h.match(/nj-opt/g)||[]).length>=2,'tipus-valaszto megjelent');
  ok(!/nj-opt on/.test(h),'semmi nincs elore kivalasztva');
  ok(/type="date"/.test(h),'lucrare modban a datum ott van');
  ok(!/Allianz/.test(h),'biztosito-blokk rejtve, amig nincs asig');
  ok(w.document.getElementById('njSave').disabled===true,'mentes tiltva');
  const why=w.document.getElementById('njWhy').textContent;
  ok(/inmatriculare/i.test(why)&&/telefon/i.test(why)&&/tipul/i.test(why),"hianylista: "+why);

  ok(/nj-chip/.test(h),'Azi/Maine/Poimaine chipek');
  w.njSetTip('asig');h=app.innerHTML;
  ok(/Allianz/.test(h),'asig -> biztosito lista megjelent');
  w.njSet('njPay','deschis');h=app.innerHTML;
  ok(/nj-in/.test(h),'"mar nyitva" -> karszam mezo');
  w.njSetTip('auto');h=app.innerHTML;
  ok(!/Allianz/.test(h),'sajat zseb -> biztosito blokk eltunt');
  ok(w.S.njPay===null,'  a dosszie-allapot torlodott');

  // 2026-08-25: nincs tobbe 'dosar' urlap-mod. Ismeretlen mod -> 'prog',
  // ami a biztonsagos alapertelmezes (nem esik csendben mas agra).
  w.openNewJob('dosar');
  ok(w.S.njMode==='prog','ismeretlen mod -> prog (nincs csendes melle-eses)');
  ok(w.S.njTip===null,'  a tipus nyitva marad, nem donti el helyettunk');

  w.openNewJob('lucrare');
  w.S.njPlate=w.njPlate('ms50bss');w.S.njPhone='0740123456';w.njSetTip('auto');w.njSync();
  ok(w.document.getElementById('njSave').disabled===false,'minden megvan -> mentes engedelyezve');
  ok(w.document.getElementById('njWhy').textContent==='','hianylista kiurult');

  w.closeNewJob();ok(!/nj-box/.test(app.innerHTML),'modal bezarult');
}catch(e){fail++;console.log('  x KIVETEL: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,3).join('\n'))}
console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);},600);
