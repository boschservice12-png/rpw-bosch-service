// ════════════════════════════════════════════════════════════════
//  FOLYAMATJELZO — a harom lanc (rpw-progres.js)
//  Ferenc dontesei: A szegmens-sav · mindketto · kihagyott jelolve
//  · keses a savon · nem kattinthato
// ════════════════════════════════════════════════════════════════
const path=require('path');
const P=require(path.join(__dirname,'..','..','rpw-progres.js'));
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(a,b,m)=>ok(a===b,m+'  got="'+a+'" exp="'+b+'"');

const T=k=>k;                              // a kulcsot adja vissza — igy merheto
const shape=c=>c.steps.map(s=>({done:'D',now:'N',skip:'S',todo:'.',block:'B'}[s.state])).join('');
const nap=n=>new Date(Date.now()-n*86400000).toISOString();

console.log('\n1. Kardosszie — harom lepes, valtozo iratszammal');
{
  const gyujt={flux:'doar_dosar',dosarActe:{}};
  const c=P.chain(gyujt,{T,acteCount:()=>({done:3,total:8})});
  eq(c.kind,'dosar','felismeri a dossziet');
  eq(shape(c),'N..','az elso lepesen all');
  eq(c.counter,'3 / 8 pr_acte','az IRATSZAM latszik, nem a lepesszam');
  eq(c.label,'dd_s1','a lepes neve: Colectare acte');
  ok(c.late===false,'dossziera nincs keses-jeloles');

  const atadva=P.chain({flux:'doar_dosar',dosarPredat:'2026-08-20'},{T});
  eq(shape(atadva),'DN.','atadas utan a masodikon');
  eq(atadva.counter,'2 / 3 pr_lepes','ott mar lepesszamot mutat');

  const zart=P.chain({flux:'doar_dosar',dosarPredat:'2026-08-20',inchis:true},{T});
  eq(shape(zart),'DDD','lezarva minden kesz');

  // regi adat: flux nincs, csak doarDosar
  eq(P.chain({doarDosar:true},{T}).kind,'dosar','a regi doarDosar mezot is erti');
}

console.log('\n2. Varakozas — ot feltetel, EGY kapu');
{
  const c=P.chain({sosire:'programat',conditions:{programare:true,loc:true}},{T});
  eq(c.kind,'astept','felismeri a varakozast');
  eq(shape(c),'DD..B','a WhatsApp BLOKKOL, a tobbi hianyzas csak vilagos');
  eq(c.counter,'2 / 5 pr_feltetel','feltetel-szamlalo');
  eq(c.label,'pr_var_wa','a felirat megmondja, mire var');

  const kesz=P.chain({sosire:'programat',
    conditions:{programare:true,loc:true,om:true,piese:'livrat',whatsapp:true}},{T});
  eq(shape(kesz),'DDDDD','minden feltetel megvan');
  eq(kesz.label,'pr_gata','a felirat: fogadasra kesz');

  // A KAPU akkor is nyitva van, ha mas hianyzik — ez a szabaly nem lazult.
  const csakWa=P.chain({sosire:'programat',conditions:{whatsapp:true}},{T});
  eq(shape(csakWa),'....D','csak a WhatsApp van meg -> az utolso szegmens kesz');
  ok(csakWa.label==='pr_gata','  es a kapu nyitva: fogadasra kesz');

  // piese: a 'livrat' szamit keszne, a 'comandat' nem
  eq(shape(P.chain({sosire:'programat',conditions:{piese:'comandat'}},{T})),'....B','comandat != livrat');
  eq(shape(P.chain({sosire:'programat',conditions:{piese:'livrat'}},{T})),'...DB','livrat kesz');
}

console.log('\n3. Javitas — het fazis, a KIHAGYOTT jelolve (D-3)');
{
  const j={sosire:'sosit',phase:4,phases:{1:{status:'done'},2:{status:'done'},
    3:{status:'pending'},4:{status:'active',started:nap(1)},
    5:{status:'pending'},6:{status:'pending'},7:{status:'pending'}}};
  const c=P.chain(j,{T,threshold:5});
  eq(c.kind,'lucru','felismeri a futo javitast');
  eq(shape(c),'DDSN...','a kimaradt Reconstatare KIHAGYOTT (S), nem kesz es nem ures');
  eq(c.counter,'4 / 7 pr_fazis','fazis-szamlalo');
  eq(c.label,'ph4','a felirat az aktualis fazis');
  ok(c.late===false,'1 napja tart -> nem kesik');
}

console.log('\n4. Keses a savon (D-4)');
{
  const kesik={sosire:'sosit',phase:5,phases:{1:{status:'done'},2:{status:'done'},
    3:{status:'done'},4:{status:'done'},5:{status:'active',started:nap(9)},
    6:{status:'pending'},7:{status:'pending'}}};
  ok(P.chain(kesik,{T,threshold:5}).late===true,'9 nap > 5 napos kuszob -> KESIK');
  ok(P.chain(kesik,{T,threshold:30}).late===false,'  magasabb kuszobbel nem kesik');
  ok(P.chain(Object.assign({},kesik,{inchis:true}),{T,threshold:5}).late===false,
     'lezart munka SOHA nem kesik');
  // a rajzban a keso szegmens BOROSTYAN, nem kek
  const h=P.html(kesik,{T,threshold:5});
  ok(/pr-seg pr-late/.test(h),'a keso szegmens borostyan (pr-late)');
  ok(!/pr-seg pr-now/.test(h),'  es nem kek');
  ok(/pr-l-late/.test(h),'a felirat is jelzi');
}

console.log('\n5. A rajz — es amit Ferenc NEM kert (D-5)');
{
  const h=P.html({sosire:'sosit',phase:1,phases:{1:{status:'active',started:nap(0)}}},{T});
  ok(/class="pr-wrap"/.test(h),'kirajzolja a savot');
  ok(!/onclick/.test(h),'NEM kattinthato — a listaban a duplakattintas mar foglalt');
  ok(/aria-label="/.test(h),'a sav felolvasoval is ertheto');
  ok(/title="/.test(h),'minden szegmensnek van neve az egermutatora');
  ok(P.html(null,{T}).indexOf('pr-wrap')>=0,'ures bemenetre sem hasal el');
  ok(/pr-big/.test(P.html({flux:'doar_dosar'},{T,big:true})),'van nagy valtozat a munkalapokhoz');
}

console.log('\n6. A kozponti workflow a fazis-allapot forrasa (D-2)');
{
  // Ha a RPWWorkflow betoltodott, ANNAK az allapota szamit — kulonben a
  // lista mast mutatna, mint a munkalap fazis-sava.
  const j={sosire:'sosit',phase:4,phases:{1:{status:'done'},2:{status:'done'},
    3:{status:'pending'},4:{status:'active',started:nap(0)},5:{status:'pending'},
    6:{status:'pending'},7:{status:'pending'}}};
  const g=(typeof globalThis!=='undefined')?globalThis:global;
  const regi=g.RPWWorkflow;
  g.RPWWorkflow={phaseStatus:(job,p)=>(p<=2?'done':p===3?'skipped':p===4?'active':'pending')};
  eq(shape(P.chain(j,{T})),'DDSN...','a workflow "skipped" allapotat hasznalja');
  g.RPWWorkflow={phaseStatus:(job,p)=>(p===4?'rework':'pending')};
  eq(shape(P.chain(j,{T})),'...N...','a "rework" is aktualisnak szamit');
  // ES: ha a workflow azt mondja "pending", NEM tesszuk ra a sajat
  // "kihagyott" tippunket — kulonben a lista mast mutatna, mint a
  // munkalap fazis-sava. (Ezt a hibat ez a teszt talalta meg.)
  ok(shape(P.chain(j,{T})).indexOf('S')<0,'  a workflow "pending"-jere nem tippelunk kihagyottat');
  if(regi===undefined) delete g.RPWWorkflow; else g.RPWWorkflow=regi;
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
