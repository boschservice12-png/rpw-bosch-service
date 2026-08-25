// ── FUNKCIO-NYILVANTARTAS ORE ─────────────────────────────────────────
// Ez a teszt nem kodot ellenoriz, hanem azt, hogy a kod es a
// _registry/funkciok.json EGYEZIK-E. Ha egy lepes eltunik vagy atalakul,
// itt a SZAMAVAL derul ki. Ha uj funkcio kerul be szam nelkul, az is.
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const R=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const EXISTS=(p)=>fs.existsSync(path.join(ROOT,p));

let pass=0, fail=0;
function ok(c,m){ if(c){pass++} else {fail++; console.log('  x '+m)} }

const reg=JSON.parse(R('_registry/funkciok.json'));
const F=reg.funkciok;

console.log('\n1. A nyilvantartas alaki rendje');
{
  const latott=new Set();
  F.forEach(f=>{
    ok(/^F-\d{3}$/.test(f.id), 'rossz szam-formatum: '+f.id);
    ok(!latott.has(f.id), 'KETSZER kiosztott szam: '+f.id);
    latott.add(f.id);
    ok(f.nev && f.nev.length>5, f.id+': nincs ertheto nev');
    ok(['el','csak-frontend','csak-backend','nincs-bekotve'].indexOf(f.allapot)>=0,
       f.id+': ismeretlen allapot ('+f.allapot+')');
  });
}

console.log('\n2. Minden beszamozott funkcio HORGONYA megvan a kodban');
{
  const gyorsitotar={};
  F.forEach(f=>(f.fe||[]).forEach(([fajl,keresett])=>{
    if(!EXISTS(fajl)){ fail++; console.log('  x '+f.id+' ('+f.nev+'): a fajl ELTUNT -> '+fajl); return }
    if(gyorsitotar[fajl]===undefined) gyorsitotar[fajl]=R(fajl);
    ok(gyorsitotar[fajl].indexOf(keresett)>=0,
       f.id+' ('+f.nev+'): ELTUNT vagy ATALAKULT -> '+fajl+' mar nem tartalmazza: '+keresett);
  }));
}

console.log('\n3. Minden beszamozott backend-funkcio megvan a migraciokban');
const sql=fs.readdirSync(path.join(ROOT,'_migrations'))
  .filter(n=>/\.sql$/.test(n) && !/rollback/.test(n))
  .map(n=>R('_migrations/'+n)).join('\n');
{
  F.forEach(f=>(f.be||[]).forEach(rpc=>{
    ok(new RegExp('FUNCTION\\s+public\\.'+rpc+'\\s*\\(','i').test(sql),
       f.id+' ('+f.nev+'): a backend fuggveny ELTUNT a migraciokbol -> '+rpc);
  }));
}

console.log('\n4. Nincs BESZAMOZATLAN backend-funkcio');
{
  const beszamozott=new Set();
  F.forEach(f=>(f.be||[]).forEach(r=>beszamozott.add(r)));
  const nevek=new Set(); let m;
  const re=/function\s+public\.([a-z0-9_]+)\s*\(/gi;
  while((m=re.exec(sql))) nevek.add(m[1]);
  const megvan=[...nevek].filter(n=>!/^rpw__/.test(n));  // a rpw__* belso segedek, nem onallo funkciok
  megvan.forEach(n=>ok(beszamozott.has(n),
    'BESZAMOZATLAN backend-funkcio: '+n+' — vedd fel a _registry/funkciok.json-ba'));
}

console.log('\n5. Nincs BESZAMOZATLAN RPC-hivas a frontendrol');
{
  const beszamozott=new Set();
  F.forEach(f=>(f.be||[]).forEach(r=>beszamozott.add(r)));
  const fajlok=fs.readdirSync(ROOT).filter(n=>/\.(js|html)$/.test(n));
  const hivott=new Set();
  fajlok.forEach(n=>{ (R(n).match(/rpc\(\s*'([a-z0-9_]+)'/g)||[])
    .forEach(s=>hivott.add(s.replace(/.*'([a-z0-9_]+)'/,'$1'))) });
  [...hivott].sort().forEach(n=>ok(beszamozott.has(n),
    'BESZAMOZATLAN RPC-hivas a frontendrol: '+n+' — vedd fel a _registry/funkciok.json-ba'));
}

console.log('\n6. A megnevezett teszt-fajlok leteznek');
{
  const hianyzo=new Set();
  F.forEach(f=>{ if(f.teszt && !EXISTS(f.teszt)) hianyzo.add(f.teszt+'  <- '+f.id) });
  ok(hianyzo.size===0, 'nem letezo teszt-fajlra hivatkozik a nyilvantartas:\n      '+[...hianyzo].join('\n      '));
}

console.log('\n7. Frontend <-> backend EGYEZES (amit a felhasznalo kert)');
{
  // Ez nem hiba, hanem KIMUTATAS: melyik funkciot nem koti ossze a ket oldal.
  const csakBe=F.filter(f=>f.allapot==='csak-backend');
  const nincsBekotve=F.filter(f=>f.allapot==='nincs-bekotve');
  console.log('  i keszen all a szerveren, de a frontend NEM hivja ('+csakBe.length+'):');
  csakBe.forEach(f=>console.log('      '+f.id+'  '+f.nev+'  ['+(f.be||[]).join(', ')+']'));
  console.log('  i megirva, de eles uzemben NINCS bekapcsolva ('+nincsBekotve.length+'):');
  nincsBekotve.forEach(f=>console.log('      '+f.id+'  '+f.nev));
  ok(true,'kimutatas');
}

console.log('\n8. A FUNKCIOK.md naprakesz-e a nyilvantartashoz kepest');
{
  ok(EXISTS('FUNKCIOK.md'), 'a FUNKCIOK.md eltunt — futtasd: node _registry/generate.js');
  if(EXISTS('FUNKCIOK.md')){
    const md=R('FUNKCIOK.md');
    F.forEach(f=>ok(md.indexOf('**'+f.id+'**')>=0,
      f.id+' hianyzik a FUNKCIOK.md-bol — futtasd: node _registry/generate.js'));
    (md.match(/\*\*F-\d{3}\*\*/g)||[]).forEach(t=>{
      const id=t.replace(/\*/g,'');
      ok(F.some(f=>f.id===id), id+' a FUNKCIOK.md-ban van, de a nyilvantartasbol KIKERULT');
    });
  }
}

console.log('\n9. Melyik funkciot NEM orzi meg teszt');
{
  const arva=F.filter(f=>!f.teszt);
  console.log('  i nincs teszt ('+arva.length+' / '+F.length+'):');
  arva.forEach(f=>console.log('      '+f.id+'  '+f.nev));
  ok(true,'kimutatas');
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
if(fail) process.exit(1);
