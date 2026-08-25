// ════════════════════════════════════════════════════════════════
//  PIN-KIOSZTÁS — a javított párbeszéd
//  A hiba: az érték a modál TÖRLÉSE UTÁN olvasódott a DOM-ból → mindig üres.
//  Ez a teszt VÉGREHAJTJA a folyamatot, nem mintát keres.
// ════════════════════════════════════════════════════════════════
const fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..','..');
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
let html=R('index.html').replace(/<script[^>]+src=[^>]*><\/script>/g,'');
const WF=R('rpw-workflow.js');
const STUB='<script>window.RPW_CFG={SB_URL:"https://x.co",SB_KEY:"k",BUCKET:"b",SHOP_ID:"S1"};'+
'window.__rpc=[];window.__resp={};'+
'window.supabase={createClient:function(){return{from:function(){return{select:function(){return{is:function(){return{order:function(){return Promise.resolve({data:[],error:null})}}}}}}},'+
'rpc:function(n,a){window.__rpc.push([n,a]);return Promise.resolve(window.__resp[n]||{data:null,error:null})}}}};'+
'window.RPWDb={listActive:function(){return Promise.resolve([])},patchV2:function(){return Promise.resolve()},save:function(){return Promise.resolve({ok:1})}};'+
'window.RPWUtil={jobId:function(){return "J1"}};'+
'window.RPWAuth={token:function(){return "t".repeat(64)},name:function(){return "Ferenc"},'+
'session:function(){return {token:"t".repeat(64),rawRole:"Műszakvezető",name:"Ferenc",exp:Date.now()+9e6}},'+
'team:function(){return Promise.resolve(window.__teamResp||{ok:false})},logoutServer:function(){return Promise.resolve({ok:1})}};</script>';
html=html.replace('</head>',STUB+'<script>'+WF+'</script></head>');
const vc=new VirtualConsole();['error','warn','info','log','jsdomError'].forEach(k=>vc.on(k,()=>{}));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.test/',virtualConsole:vc});
const w=dom.window;
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const TEAM={ok:true,team:[
  {id:'E1',name:'Szkaliczki Ferenc',role:'Műszakvezető',has_pin:true,last_login:'2026-08-24 01:49'},
  {id:'E2',name:'Szkaliczki David',role:'Recepció',has_pin:false,last_login:null},
  {id:'E3',name:'Sunil Chaudary',role:'Karosszéria',has_pin:false,last_login:null}]};
const POSTS={data:{ok:true,manager:true,posts:[]},error:null};

setTimeout(async()=>{
try{
  w.JOBS=[]; w.__resp={rpw_posts_get:POSTS}; w.__teamResp=TEAM;
  w.EC.loaded=false; w.setScreen('echipa'); await sleep(150);

  console.log('\n1. A PIN-ablak megnyílik');
  w.ecPin('E3','Sunil Chaudary');
  const ov=w.document.getElementById('ecPinOv');
  ok(!!ov,'saját ablak jött létre');
  ok(!!ov.querySelector('#ecPin1'),'első PIN mező');
  ok(!!ov.querySelector('#ecPin2'),'MEGERŐSÍTŐ mező (elgépelt PIN = kizárt ember)');
  ok(/Sunil Chaudary/.test(ov.textContent),'kiírja, kinek állítjuk');
  ok(/RPW/.test(ov.textContent)||/PIN/.test(ov.textContent),'megmondja, mire való a PIN');
  eq(w.EC.pinFor,'E3','megjegyzi, kiről van szó');

  console.log('\n2. AZ EREDETI HIBA: az érték a gépeléskor rögzül');
  w.EC.pin1='445566'; w.EC.pin2='445566';
  // szándékosan ELTÁVOLÍTJUK az ablakot — pontosan ez történt élesben
  ov.remove();
  w.__rpc=[]; w.__resp.rpw2_pin_set={data:{ok:true},error:null};
  w.ecPinConfirm(); await sleep(80);
  const c=w.__rpc.find(x=>x[0]==='rpw2_pin_set');
  ok(!!c,'a mentés LEFUT akkor is, ha az ablak már nincs meg');
  eq(c&&c[1].p_new_pin,'445566','  a HELYES PIN megy el (nem üres!)');
  eq(c&&c[1].p_employee_id,'E3','  a helyes emberhez');
  eq(c&&c[1].p_token.length,64,'  tokennel');

  console.log('\n3. Két különböző PIN → nem ment');
  w.ecPin('E2','Szkaliczki David');
  w.EC.pin1='111111'; w.EC.pin2='222222';
  w.__rpc=[]; w.ecPinConfirm(); await sleep(40);
  eq(w.__rpc.length,0,'eltérő megerősítés → NEM küldi el');
  ok(!!w.EC.pinErr,'  hibaüzenet beáll');
  ok(!!w.document.getElementById('ecPinOv'),'  az ablak nyitva marad');

  console.log('\n4. Túl rövid PIN → nem ment');
  w.ecPin('E2','Szkaliczki David');
  w.EC.pin1='12'; w.EC.pin2='12';
  w.__rpc=[]; w.ecPinConfirm(); await sleep(40);
  eq(w.__rpc.length,0,'3 karakter alatt nem küldi el');
  ok(/4/.test(w.EC.pinErr||''),'  megmondja, mi a minimum');

  console.log('\n5. Szóközök levágva');
  w.ecPin('E2','X'); w.EC.pin1='  778899  '; w.EC.pin2='778899';
  w.__rpc=[]; w.ecPinConfirm(); await sleep(60);
  const c2=w.__rpc.find(x=>x[0]==='rpw2_pin_set');
  eq(c2&&c2[1].p_new_pin,'778899','a szóközök nem számítanak');

  console.log('\n6. Mégse → semmi nem történik');
  w.ecPin('E2','X'); w.EC.pin1='999999'; w.EC.pin2='999999';
  w.__rpc=[]; w.ecPinClose(); await sleep(30);
  eq(w.__rpc.length,0,'nem küld el semmit');
  eq(w.EC.pinFor,null,'  és elfelejti, kiről volt szó');
  eq(w.EC.pin1,'','  a beírt PIN nem marad a memóriában');

  console.log('\n7. A szerver elutasítását ÉRTHETŐEN mondja');
  let toasts=[]; const T0=w.toast; w.toast=function(m,e){toasts.push(String(m))};
  w.__resp.rpw2_pin_set={data:{ok:false,error:'not_allowed'},error:null};
  await w.ecPinSave('E3','445566'); await sleep(40);
  ok(toasts.some(t=>/jog|drept|allowed/i.test(t)),'not_allowed → érthető üzenet, nem kód');
  toasts=[];
  w.__resp.rpw2_pin_set={data:{ok:false,error:'pin_too_short'},error:null};
  await w.ecPinSave('E3','12'); await sleep(40);
  ok(toasts.some(t=>/4|cifre|számjegy|digits/i.test(t)),'pin_too_short → érthető üzenet');
  w.toast=T0;

  console.log('\n8. A régi, hibás megoldás eltűnt');
  const src=R('index.html');
  ok(!/getElementById\('ecPinIn'\)/.test(src),"nincs több 'ecPinIn' DOM-olvasás a megerősítéskor");
  ok(!/setTimeout\(function\(\)\{\s*var box=document\.querySelector\('\.rpw-bm-bd'\)/.test(src),
     'nincs több input-injektálás a kabalás párbeszédbe');
  ok(/EC\.pin1=this\.value/.test(src),'az érték gépeléskor rögzül');

}catch(e){fail++;console.log('  ✗ KIVÉTEL: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,3).join('\n'))}
console.log('\n'+(fail?'✗ ':'✓ ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
},1200);
