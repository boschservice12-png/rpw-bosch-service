// ════════════════════════════════════════════════════════════════
//  FRONTEND — AZ ELOJEGYZES-URLAP: AMIT A MENTES KOVETEL, AZT KERJE IS
//  A VALODI index.html fut jsdom-ban. Nem forras-regex: valodi
//  gombkattintas, es a KIRAJZOLT DOM-ot merjuk.
//
//  A hiba, amit ez a teszt orzol (Ferenc, 2026-08-26):
//  biztositos esetben a mentes KOTELEZOVE tette az ugyfel nevet, a mezo
//  viszont az "Date optionale (client, masina)" fiokban ult, csillag
//  nelkul. Aki nem nyitotta ki: megnyomta a gombot es nem tortent semmi.
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

// Benne van-e <details>-ben? (a "fiok melyen" eset)
function inDetails(el){for(let p=el&&el.parentElement;p;p=p.parentElement){if(p.tagName==='DETAILS')return true}return false}
// A mezohoz tartozo <label> szovege
function labelOf(el){const f=el.closest('.prog-field');const l=f&&f.querySelector('label');return l?l.textContent.trim():''}

(async()=>{
const raw=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const vc=new jsdom.VirtualConsole();
['jsdomError','error'].forEach(ev=>vc.on(ev,()=>{}));
const dom=new JSDOM(inline(raw),{virtualConsole:vc,url:'https://rpw.teszt/index.html',
 runScripts:'dangerously',pretendToBeVisual:true,
 beforeParse(w){
  w.__sbMock={rpc:(n)=>Promise.resolve({data:(n==='rpw_server_capabilities'?CAPS:
    (n==='rpw_jobs_list'?{ok:true,rows:[]}:{ok:true})),error:null}),
   from:()=>{const q={eq:()=>q,is:()=>q,order:()=>Promise.resolve({data:[],error:null})};return {select:()=>q}},
   storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{}})})}};
  w.localStorage.setItem('rpw_auth',JSON.stringify({token:'t'.repeat(64),name:'T',employeeId:'E1',
    shopId:'S',can:{open:true,team:true},exp:Date.now()+9e6}));
  w.Chart=function(){this.destroy=()=>{}};
 }});
const w=dom.window;
for(let i=0;i<80 && !w.render;i++) await sleep(25);
try{ w.localStorage.setItem('rpw_az_seen', new Date().toISOString().slice(0,10)); }catch(e){}
w.S.screen='panou'; w.render(); await sleep(40);
const D=()=>w.document;

console.log('\n1. Programare nouă — valódi gombkattintással');
{
  const btn=[...D().querySelectorAll('button')]
    .find(b=>/openNewJob\('prog'\)/.test(b.getAttribute('onclick')||''));
  ok(!!btn,'a „Programare nouă" gomb a kirajzolt DOM-ban van');
  if(btn) btn.click(); else w.openNewJob('prog');
  await sleep(40);
  ok(w.S.showNew===1,'az űrlap megnyílt');
}

console.log('\n2. Biztosítós eset — a károsult neve LÁTHATÓ és kötelező');
{
  const asig=[...D().querySelectorAll('button')]
    .find(b=>/njSetTip\('asig'\)/.test(b.getAttribute('onclick')||''));
  ok(!!asig,'az „Asigurare" választógomb a DOM-ban van');
  if(asig) asig.click(); else w.njSetTip('asig');
  await sleep(40);

  const cli=D().getElementById('iClient');
  ok(!!cli,'az ügyfélnév-mező kirajzolódott');
  ok(cli && !inDetails(cli),'a mező NINCS a „Date opționale" fiókban elrejtve');
  ok(cli && /\*/.test(labelOf(cli)),'a címkéjén ott a csillag (kötelező)');
  ok(D().querySelectorAll('#iClient').length===1,'pontosan EGY ügyfélnév-mező van');

  const sum=D().querySelector('details.nj-more summary');
  ok(!!sum && !/client/i.test(sum.textContent),'a fiók felirata már nem ígér ügyfelet');
}

console.log('\n3. Amit a felület kér, azzal a mentés át is megy');
{
  const set=(sel,val)=>{const el=typeof sel==='string'?D().getElementById(sel):sel;
    if(!el)return false; el.value=val; el.dispatchEvent(new w.Event('input',{bubbles:true})); return true};
  ok(set('iPlate','MS-99-ZZZ'),'rendszám kitölthető a látható mezőben');
  ok(set('iPhone','0740111222'),'telefon kitölthető a látható mezőben');
  ok(set('iClient','Pagubit Elek'),'ügyfélnév kitölthető a látható mezőben');
  const pay=[...D().querySelectorAll('button')]
    .find(b=>/njSet\('njPay','deschid'\)/.test((b.getAttribute('onclick')||'').replace(/\\/g,'')));
  ok(!!pay,'a dosszié-állapot választógomb a DOM-ban van');
  if(pay) pay.click(); else w.njSet('njPay','deschid');
  const chip=[...D().querySelectorAll('button')].find(b=>/njQuick\(0\)/.test(b.getAttribute('onclick')||''));
  if(chip) chip.click();
  await sleep(40);
  const miss=w.njMissing();
  ok(miss.length===0,'njMissing() ÜRES — nincs láthatatlan követelmény: '+JSON.stringify(miss));
}

console.log('\n4. Magánkár — az ügyfélnév marad az opcionális fiókban');
{
  const auto=[...D().querySelectorAll('button')]
    .find(b=>/njSetTip\('auto'\)/.test(b.getAttribute('onclick')||''));
  if(auto) auto.click(); else w.njSetTip('auto');
  await sleep(40);
  const cli=D().getElementById('iClient');
  ok(!!cli && inDetails(cli),'magánkáron az ügyfélnév az opcionális fiókban van');
  ok(cli && !/\*/.test(labelOf(cli)),'magánkáron NINCS csillag rajta');
  const sum=D().querySelector('details.nj-more summary');
  ok(!!sum && /client/i.test(sum.textContent),'a fiók felirata megint ígér ügyfelet');
}

console.log('\n'+(fail?'✗ ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
