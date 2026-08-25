// ── P0: MENTÉSI UTAK KONSZOLIDÁCIÓJA (2026-08-25) ─────────────────────
// Három szabályt őriz:
//   1. Secure (v3) módban a normál mentés SOHA nem visz workflow-mezőt —
//      a db-réteg szűri, minden hívóra egységesen (F-107 blokkolója volt:
//      a 006-os migráció az egész patch-et elutasítja, ha ilyen mező van).
//   2. A szerver explicit {ok:false} válasza SOHA nem siker (F-110) —
//      egyik úton sem, a legacy (v2) úton sem.
//   3. A fázisoldalak mentése nem nyeli el némán az elutasítást.
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const R=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));

function loadDb(cfg){
  const w={}; global.window=w; w.RPW_CFG=cfg;
  new Function('window','root', R('rpw-db.js').replace(/\(function\(root\)\{/,'(function(){').replace(/\}\)\(typeof self[^)]*\);?\s*$/,'})();'))(w,w);
  if(!w.RPWDb){ global.window=w; eval(R('rpw-db.js')); }
  return w.RPWDb;
}
// egyszerubb: eval kozvetlenul
function db(cfg){
  const w={RPW_CFG:cfg}; global.window=w; global.self=w;
  eval(R('rpw-db.js'));
  return w.RPWDb;
}

console.log('\n1. Secure módban a normál mentés nem visz workflow-mezőt');
{
  const D=db({PATCH_RPC:'rpw_patch_v3'});
  let sent=null;
  const sb={rpc:async(name,params)=>{sent={name,params};return{data:{ok:true,version:6},error:null}}};
  const job={id:'J1',version:5,plate:'MS-1',client:'K',phase:4,phases:{1:{status:'done'}},
             inchis:false,history:[{a:1}],completedBy:'x',started:'t',finished:null,
             closing:{status:'zart',closedAt:'t',handoverAt:'t2'},shop_id:'HAMIS',audit:[1]};
  return_ = null;
  (async()=>{
    const r=await D.patch(sb,job);
    eq(sent.name,'rpw_patch_v3','a secure út v3-at hív');
    const p=sent.params.p_patch;
    ['phase','phases','inchis','history','completedBy','started','finished','version','shop_id','audit']
      .forEach(k=>ok(!(k in p),'  a patch NEM tartalmazza: '+k));
    ok('plate' in p && 'client' in p,'  a normál adat átmegy');
    ok(p.closing && !('status' in p.closing),'  a closing védett kulcsa (status) kimarad');
    ok(p.closing.closedAt==='t' && p.closing.handoverAt==='t2',
       '  a closing nem-védett kulcsai (closedAt/handoverAt) megmaradnak');
    eq(sent.params.p_expected_version,5,'  a verziózár megy a szerverre');

    console.log('\n2. {ok:false} soha nem siker — secure út');
    const sbRej={rpc:async()=>({data:{ok:false,error:'not_allowed',message:'nu'},error:null})};
    const r2=await D.patch(sbRej,job);
    ok(r2.error && r2.error.code==='not_allowed','a v3 elutasítás hibaként jön vissza');
    ok(!r2.data,'  és nincs adat');

    console.log('\n3. {ok:false} soha nem siker — LEGACY (v2) út is');
    const L=db({PATCH_RPC:'rpw_patch_v2'});
    const r3=await L.patchV2(sbRej,'J1',{client:'K'},{expected:5});
    ok(r3.error && r3.error.code==='not_allowed','a v2 explicit elutasítás is hiba');
    const r4=await L.patch(sbRej,job);
    ok(r4.error && r4.error.code==='not_allowed','  a régi rpw_patch úton is');
    const sbConf={rpc:async()=>({data:{conflict:true,server_version:9},error:null})};
    const r5=await L.patchV2(sbConf,'J1',{client:'K'},{expected:5});
    ok(r5.error && r5.error.serverVersion===9,'  a conflict is hiba, szerververzióval');

    console.log('\n4. Legacy módban a workflow-mezők NEM szűrődnek (a mai éles működés)');
    let sentL=null;
    const sbL={rpc:async(n,p)=>{sentL={n,p};return{data:{ok:true},error:null}}};
    await L.patch(sbL,job);
    ok(sentL.p.p_patch.phase===4,'legacy: a phase átmegy (ma így él a fázisállapot)');

    console.log('\n5. A hívóhelyek nem nyelik el az elutasítást');
    const pages=['rpw-evaluare-red.html','rpw-inchidere-red.html','rpw-reconstatare-red.html',
                 'rpw-tinichigerie-red.html','rpw-vopsitorie-red.html'];
    pages.forEach(pg=>{
      const h=R(pg);
      ok(/Save respins/.test(h), pg+': kezeli az elutasítást');
      ok(!/try\{await RPWDb\.patch\(sb,JOB\)\}\s*catch\(e\)\{console\.error\('Save:',e\)\}/.test(h),
         '  '+pg+': a néma minta eltűnt');
    });
    ok(/Save respins/.test(R('rpw-recepcio-red.html')),'rpw-recepcio-red.html: kezeli');
    ok(/Save respins/.test(R('index.html')),'index.html saveJob: kezeli');

    console.log('\n6. Statikus őr: új teljes-job mentési út nem jöhet be észrevétlenül');
    // A teljes-job mentés EGYETLEN megengedett belépési pontja az RPWDb.patch —
    // ott a secure út szűr. Közvetlen sb.rpc('rpw_patch'...) hívás sehol.
    fs.readdirSync(ROOT).filter(n=>/\.(html|js)$/.test(n) && n!=='rpw-db.js').forEach(n=>{
      const t=R(n);
      ok(!/rpc\(\s*'rpw_patch'/.test(t), n+': közvetlen rpw_patch hívás TILOS (RPWDb.patch a kapu)'
        ) ;
    });

    console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
    process.exit(fail?1:0);
  })();
}
