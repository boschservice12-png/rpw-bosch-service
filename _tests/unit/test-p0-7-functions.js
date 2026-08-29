// ════════════════════════════════════════════════════════════════
//  P0.7 — A NETLIFY FUNKCIÓK HITELESÍTÉSE KÖTELEZŐ
//  Elfogadási feltétel a promptból:
//   · token nélküli kérés nem futtathat OCR-t / classify-t / levelet
//   · idegen szervizből érkező kérés sem
//   · a CORS önmagában nem jogosultság
// ════════════════════════════════════════════════════════════════
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));

// ── a valódi _shared.js betöltése, hálózat helyettesítve ────────
function load(fetchImpl, env){
  const old={fetch:global.fetch, env:process.env};
  process.env=Object.assign({},process.env,env||{});
  global.fetch=fetchImpl;
  delete require.cache[require.resolve(path.join(ROOT,'functions','_shared.js'))];
  const H=require(path.join(ROOT,'functions','_shared.js'));
  return {H, restore(){ global.fetch=old.fetch; process.env=old.env; }};
}
const ev=(auth)=>({headers: auth?{authorization:'Bearer '+auth}:{}, httpMethod:'POST'});
const TOK='t'.repeat(64);
const ENV={SUPABASE_URL:'https://x.supabase.co', SUPABASE_ANON_KEY:'anon-key'};

// szerver-báb: a saját rpw_session RPC-t utánozza
const okSession={ok:true,employee:{id:'E1',name:'Teszt',role:'Recepció',shop_id:'S1'}};
const srv=(resp,status)=>async(url,opt)=>({ok:(status||200)<400, status:status||200,
                                          json:async()=>resp, __url:url, __opt:opt});

(async()=>{

console.log('\n1. TOKEN NÉLKÜL nem fut le semmi');
{
  const {H,restore}=load(srv(okSession),ENV);
  let r=await H.requireAuth(ev(null));
  eq(r.ok,false,'nincs Authorization fejléc → elutasít');
  eq(r.code,401,'  401');
  r=await H.requireAuth({headers:{authorization:'Bearer '},httpMethod:'POST'});
  eq(r.ok,false,'üres token → elutasít');
  r=await H.requireAuth(ev('rovid'));
  eq(r.ok,false,'túl rövid token → elutasít (nem is kérdezi a szervert)');
  restore();
}

console.log('\n2. A RÉGI kiskapu bezárva');
{
  // KORÁBBAN: if(!process.env.REQUIRE_FN_AUTH) return {ok:true, skipped:true}
  const {H,restore}=load(srv(okSession),{SUPABASE_URL:ENV.SUPABASE_URL,SUPABASE_ANON_KEY:ENV.SUPABASE_ANON_KEY});
  const r=await H.requireAuth(ev(null));
  eq(r.ok,false,'REQUIRE_FN_AUTH beállítása nélkül is TILT');
  ok(!r.skipped,'  nincs többé "skipped" átengedés');
  const kod=R('functions/_shared.js').split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n');
  ok(!/REQUIRE_FN_AUTH/.test(kod),'a kiskapu eltűnt a KÓDBÓL (csak a magyarázó komment említi)');
  restore();
}

console.log('\n3. A SAJÁT munkamenetet ellenőrzi (nem Supabase Auth JWT-t)');
{
  let hivottUrl=null;
  const f=async(url,opt)=>{ hivottUrl=url; return {ok:true,status:200,json:async()=>okSession} };
  const {H,restore}=load(f,ENV);
  const r=await H.requireAuth(ev(TOK));
  eq(r.ok,true,'érvényes tokennel átenged');
  // C2 (2026-08-24): az onallo szemelyzet ota rpw2_session a vegleges modell
  ok(/rpw2_session/.test(hivottUrl||''),'a sajat rpw2_session RPC-t hivja');
  ok(!/auth\/v1\/user/.test(hivottUrl||''),'  NEM a Supabase Auth végpontot');
  eq(r.shopId,'S1','a szerviz azonosítója megjön');
  eq(r.name,'Teszt','a név is');
  restore();
}

console.log('\n4. LEJÁRT / érvénytelen munkamenet');
{
  const {H,restore}=load(srv({ok:false,error:'expired'}),ENV);
  const r=await H.requireAuth(ev(TOK));
  eq(r.ok,false,'lejárt munkamenet → elutasít');
  eq(r.code,401,'  401');
  restore();
}
{
  const {H,restore}=load(srv(null,500),ENV);
  const r=await H.requireAuth(ev(TOK));
  eq(r.ok,false,'szerverhiba → elutasít (nem enged át)');
  restore();
}

console.log('\n5. HIÁNYZÓ szerverkonfig → NEM enged át');
{
  const {H,restore}=load(srv(okSession),{SUPABASE_URL:'',SUPABASE_ANON_KEY:''});
  const r=await H.requireAuth(ev(TOK));
  eq(r.ok,false,'nincs SUPABASE_URL → tilt, nem enged csendben');
  eq(r.code,500,'  500, hogy kiderüljön');
  restore();
}

console.log('\n6. IDEGEN szerviz munkája');
{
  // az ownsJob a rpw_job_get-en át kérdez: az idegen munka not_found
  const {H,restore}=load(srv({ok:false,error:'not_found'}),ENV);
  const van=await H.ownsJob({__token:TOK},'idegen-job');
  eq(van,false,'idegen munkára NEM ad hozzáférést');
  restore();
}
{
  const {H,restore}=load(srv({ok:true,id:'j1'}),ENV);
  eq(await H.ownsJob({__token:TOK},'j1'),true,'saját munkára igen');
  eq(await H.ownsJob({__token:TOK},null),true,'munkához nem kötött hívás átmegy');
  restore();
}

console.log('\n7. Mindhárom funkció hívja a hitelesítést');
['ocr.js','classify.js','sendmail.js'].forEach(function(f){
  const s=R('functions/'+f);
  ok(/requireAuth\(event\)/.test(s), f+': meghívja a requireAuth-ot');
  ok(/auth\.ok|_auth\.ok/.test(s),   f+': és kiértékeli az eredményt');
  ok(/rateLimited/.test(s),          f+': van sebességkorlát is');
});

console.log('\n8. A KLIENS küldi a tokent minden hívásnál');
{
  const a=R('rpw-auth.js');
  ok(/function fnHeaders/.test(a),'van közös fejléc-készítő');
  ok(/'Bearer '\s*\+\s*t/.test(a),'  Bearer-tokent tesz bele');
  ok(/fnHeaders:fnHeaders/.test(a),'  ki van exportálva');
  ['index.html','rpw-evaluare-red.html','rpw-recepcio-red.html','rpw-reconstatare-red.html']
  .forEach(function(f){
    const s=R(f);
    const hivas=(s.match(/netlify\/functions\/(ocr|classify|sendmail)/g)||[]).length;
    const fejlec=(s.match(/RPWAuth\.fnHeaders\(\)/g)||[]).length;
    ok(fejlec>0, f+': használja a fejléc-készítőt ('+fejlec+' hívás)');
  });
  // 2026-08-25: az iratbesoroló modul is a funkciót hívja — tokennel.
  {
    const c=R('rpw-classify.js');
    ok(/netlify\/functions\/classify/.test(c),'rpw-classify.js: hívja a classify funkciót');
    ok(/RPWAuth\.fnHeaders\(\)/.test(c),     '  és a közös fejléc-készítőn át küld tokent');
  }
}

console.log('\n9. A CORS önmagában nem jogosultság');
{
  const s=R('functions/_shared.js');
  ok(/CORS nem jogosultság|A CORS nem jogosultság/.test(s),'ez ki van írva a kódban');
  ok(/allowedOrigins/.test(s),'  a CORS attól még megvan');
}

// ── 2026-08-29 — MINDKET ELO CIM AZ ENGEDELYLISTAN ────────────────
// A csapatban ket Netlify-oldal all ugyanerre a repora. A lista eddig
// CSAK a regit ismerte, ezert az uj cimen az OCR / classify / levelkuldes
// NEMAN elhalt volna: a bongeszo blokkolja a valaszt, nem a szerver ad hibat.
console.log('\nQ. Mindket elo cim hivhatja a funkciokat');
{
  const H = require(path.join(ROOT,'functions','_shared.js'));
  const enged = o => H.corsHeaders({headers:{origin:o}})['Access-Control-Allow-Origin'] === o;
  ok(enged('https://rpw-bosch-service.netlify.app'),
     'a jelenleg epulo cim engedve');
  ok(enged('https://main--rpw-bosch-service.netlify.app'),
     '  az ag-valtozata is');
  ok(enged('https://beamish-arithmetic-e52bce.netlify.app'),
     'a regi cim TOVABBRA IS engedve (nem torunk el semmit)');
  ok(!enged('https://tamado.example.com'),
     'idegen cim tovabbra is BLOKKOLVA — a lista nem lett szabad ker');
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})();
