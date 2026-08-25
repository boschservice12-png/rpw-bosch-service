// ════════════════════════════════════════════════════════════════
//  VERZIÓÜTKÖZÉS KEZELÉSE  (a brief 6. pontja)
// ════════════════════════════════════════════════════════════════
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m));};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));

const { JSDOM }=require('jsdom');
const dom=new JSDOM('<body></body>',{url:'https://pelda.ro'});
global.window=dom.window; global.self=dom.window; global.document=dom.window.document;
dom.window.localStorage.setItem('rpw_lang','ro');
eval(R('rpw-conflict.js'));
const C=dom.window.RPWConflict;

console.log('\n1. A helyi módosítás nem vész el');
{
  C.clear('J1');
  const p=C.keep('J1',{plate:'MS-01-ABC',client:'Teszt'});
  ok(!!p,'megőrizve');
  eq(C.pending('J1').patch.plate,'MS-01-ABC','a tartalom megvan');
  C.clear('J1');
  eq(C.pending('J1'),null,'törölhető');
}

console.log('\n2. Megmutatja, MELY mezők térnek el');
{
  const d=C.diffFields({plate:'A',client:'X',note:'ua'},{plate:'B',client:'X',note:'ua'});
  eq(d,['plate'],'csak a ténylegesen eltérő mező');
  const d2=C.diffFields({a:1,version:5},{a:1,version:9});
  eq(d2,[],'a version maga nem "eltérés"');
}

console.log('\n3. A párbeszéd megjelenik és három választ kínál');
{
  document.body.innerHTML='';
  let valasz=null;
  C.show({ jobId:'J1', mine:{plate:'ENYEM'}, theirs:{plate:'OVEK'}, serverVersion:9,
           onReload:()=>{valasz='reload'}, onReapply:()=>{valasz='reapply'},
           onCancel:()=>{valasz='cancel'} });
  const ov=document.querySelector('.rpw-conflict-ov');
  ok(!!ov,'megjelenik');
  const btns=ov.querySelectorAll('button');
  eq(btns.length,3,'három lehetőség');
  ok(/Alt coleg/.test(ov.textContent),'románul szól');
  ok(/Reîncarcă/.test(ov.textContent),'újratöltés');
  ok(/Aplică din nou/.test(ov.textContent),'újraalkalmazás');
  btns[0].click();
  eq(valasz,'reload','az újratöltés meghívódik');
  eq(document.querySelectorAll('.rpw-conflict-ov').length,0,'bezárul');
}

console.log('\n4. Fázislezáráskor figyelmeztet — nincs automatikus összefésülés');
{
  document.body.innerHTML='';
  C.show({ jobId:'J2', mine:{}, theirs:{}, isPhaseClose:true, onReload:()=>{} });
  const ov=document.querySelector('.rpw-conflict-ov');
  ok(/nu se face îmbinare automată/.test(ov.textContent),'figyelmeztet a lezárásnál');
  ov.remove();
}

console.log('\n5. A megjelenítés nem HTML-ként kezeli az adatot');
{
  document.body.innerHTML='';
  C.show({ jobId:'<img src=x onerror=alert(1)>', mine:{'<script>':1}, theirs:{}, onReload:()=>{} });
  eq(document.querySelectorAll('img').length,0,'nem jön létre <img>');
  eq(document.querySelectorAll('script').length,0,'nem jön létre <script>');
  document.body.innerHTML='';
}

console.log('\n6. A mentési út nem próbálkozik újra ütközéskor');
{
  const sv=R('rpw-save.js');
  ok(/kind==='conflict'/.test(sv)||/conflict/.test(sv),'ismeri a conflict ágat');
  ok(/nem újrapróbálható/.test(sv)||/permission\/conflict/.test(sv),'nem próbálja újra');
  ok(/MEGMARAD/.test(sv)||/nem vész el/.test(sv),'a helyi példány megmarad');
  const idx=R('index.html');
  ok(/onSyncConflict/.test(idx),'index.html: van konfliktus-kezelő');
  ok(/RPWConflict\.show/.test(idx),'  a párbeszédet hívja');
  ok(/location\.reload/.test(idx),'  újratöltés lehetséges');
}

console.log('\n7. A szerver oldali elutasítás román üzenetet ad');
{
  // v3: a hibaüzenetek és az elutasítás-audit a 002-ben (rpw__msg / rpw__deny),
  // a fázisátmenet a 003-ban. Mindkettőt megnézzük.
  const m=R('_migrations/002_server_rpc.sql') + R('_migrations/003_business_requirements.sql');
  ok(/rpw__deny/.test(m),'van elutasítás-kezelő');
  ok(/Alt coleg a modificat dosarul/.test(m),'version_conflict románul');
  ok(/Există rework deschis/.test(m),'open_rework románul');
  ok(/Nu ai dreptul/.test(m),'not_allowed románul');
  ok(/denied:/.test(m),'az elutasított kísérlet auditba kerül');
  // 13.15 (v3): az audit hibája NEM teszi sikeressé a műveletet, de NEM is
  // rejti el az eredeti hibát — `audit_failed:true` kerül a válaszba.
  ok(/audit_failed/.test(m),'  az audit hibája jelezve van, nem elnyelve');
  ok(/exception when others then/.test(m),'  és kezelve van');
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
