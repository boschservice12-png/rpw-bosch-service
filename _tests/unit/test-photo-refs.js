// ════════════════════════════════════════════════════════════════
//  RPW-004 (2026-11-21) — HOL VAN A FOTÓ? EGY FORRÁS.
//  A dosszié 0/6 fotót mutatott, miközben a recepció lezárult: a recepció
//  a tárolóba tölt (photoKeys + <munka>/ov_N.jpg), a dosszié viszont csak a
//  régi, beágyazott `photos` listát nézte. A közös RPWWorkflow.photoRefs()
//  UGYANAZOKAT a forrásokat nézi, mint a lezárási szabály.
// ════════════════════════════════════════════════════════════════
const path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const W=require(path.join(ROOT,'rpw-workflow.js'));
const P=require(path.join(ROOT,'rpw-photos.js'));

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b),m+'  got='+JSON.stringify(a));

// 1) recepció → tároló (photoKeys)
let r=W.photoRefs({id:'RPW-1',photoKeys:{talon:true,ov_0:true,ov_1:true,ov_2:true,ov_3:true,ov_4:true,ov_5:true}});
eq(r.overviewCount,6,'tárolóban lévő 6 fotó számít');
eq(r.overview[0],{data:null,url:null,path:'RPW-1/ov_0.jpg'},'a fájl útvonala a recepció kulcsából');
eq(r.talon&&r.talon.path,'RPW-1/talon.jpg','a talon a tárolóból');

// 2) kárdosszié → iratlista (dosarActe), lejárt url-lel is: a path számít
r=W.photoRefs({id:'RPW-2',dosarActe:{foto_fata:[{path:'RPW-2/acta_a.jpg',url:'https://x/lejart'}],pag_talon_fata:{path:'RPW-2/t.jpg'}}});
eq(r.overviewCount,1,'az iratlista fotója számít');
eq(r.overview[0].path,'RPW-2/acta_a.jpg','a path megmarad');
eq(r.talon.path,'RPW-2/t.jpg','a talon az iratlistából');

// 3) régi, beágyazott base64 (és a migráció által path-ra cserélt)
r=W.photoRefs({id:'RPW-3',photos:[{type:'overview',data:'data:image/jpeg;base64,AAA'},{type:'overview',data:null,path:'RPW-3/photo_1.jpg'},{type:'talon',data:'data:image/png;base64,BBB'},{type:'overview',data:''}]});
eq(r.overviewCount,2,'a régi lista: beágyazott ÉS migrált, az üres nem');
eq(r.overview[1].path,'RPW-3/photo_1.jpg','a migrált fotó a path-ból');
ok(r.talon&&/^data:image/.test(r.talon.data),'régi talon');

// 4) üres munka
eq(W.photoRefs({}).overviewCount,0,'üres munka: 0');

// 5) a számláló és a LEZÁRÁSI szabály ugyanazt mondja
const job={id:'RPW-4',damageType:'auto',photoKeys:{talon:true,ov_0:true,ov_1:true,ov_2:true,ov_3:true,ov_4:true,ov_5:true},
  elements:{fb:{status:'ok'}},phases:{}};
ok(W.photoRefs(job).overviewCount===6 && W.canCompletePhase(job,1).missing.indexOf('wf_overview_missing')<0,
   'ha a dosszié 6/6-ot mutat, a szabály sem kér fotót');

// 6) imgAttrs: biztonságos <img> attribútum
eq(P.imgAttrs({path:'RPW-1/ov_0.jpg',url:'https://lejart'}),'data-rpw-path="RPW-1/ov_0.jpg"','tárolt fájl: friss aláírás (hydrate), nem a lejárt url');
ok(/^src="data:image\/jpeg/.test(P.imgAttrs({data:'data:image/jpeg;base64,AAA'})),'beágyazott kép azonnal');
eq(P.imgAttrs({url:'javascript:alert(1)'}),'','javascript: séma soha');
eq(P.imgAttrs({data:'data:text/html;base64,PHNjcmlwdD4='}),'','nem-kép data: URL soha');
ok(P.imgAttrs({path:'a"><script>x</script>'}).indexOf('<script>')<0,'az útvonal escape-elve');
eq(P.imgAttrs(null),'','üres hivatkozás');

console.log((fail?'x ':'✓ ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
