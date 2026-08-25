// A FUNKCIOK.md-t NEM kezzel irjuk: ebbol a scriptbol keszul.
// v2: erteklanc-nezet + vezetoi osszefoglalo + statusz-szinek.
// Futtatas:  node _registry/generate.js   (elotte: node _registry/derive.js)
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'funkciok.json'),'utf8'));
const F=reg.funkciok, M=(reg._derived&&reg._derived.metrics)||{};

const LANC={'1':'Belépés','2':'Munkalap létrehozása','3':'Adatmentés','4':'Dokumentumok',
  '5':'Javítási fázisok','6':'Minőségkontroll','7':'Lezárás','8':'Kommunikáció',
  '9':'Admin','10':'Infrastruktúra'};
const SZIN={PRODUCTION_VERIFIED:'🟢',STAGING_VERIFIED:'🔵',INTEGRATION_VERIFIED:'🔵',
  UI_VERIFIED:'🔵',UNIT_VERIFIED:'🟡',IMPLEMENTED:'🟡',DORMANT:'🟠',BLOCKED:'🟠',
  DEPRECATED:'⚪',REMOVED:'⚪',PLANNED:'🔴'};
const db=a=>F.filter(a).length;
const P0=F.filter(f=>f.criticality==='P0'&&f.lifecycle==='ACTIVE');

let out='# RPW funkció-nyilvántartás (v2)\n\n';
out+='> Ezt a fájlt **gép írja**: `npm run funkciok`. Forrás: `_registry/funkciok.json`.\n';
out+='> A **státuszt is gép számolja** (`derive.js`) a teszteredményből + kódhorgonyokból +\n';
out+='> az `evidence.json` emberi bizonyítékaiból. Kézzel átírni tilos.\n\n';
out+='Gépi futás: `'+((reg._derived&&reg._derived.from)||'?')+'`\n\n';

out+='## Vezetői összefoglaló\n\n';
out+='| Mutató | Érték |\n|---|---:|\n';
out+='| Összes regisztrált tétel | '+F.length+' |\n';
out+='| Üzleti képességek | '+db(f=>f.category==='BUSINESS_CAPABILITY')+' |\n';
out+='| Biztonsági kontrollok | '+db(f=>f.category==='SECURITY_CONTROL')+' |\n';
out+='| P0 funkciók (aktív) | '+P0.length+' |\n';
out+='| P0 teljesen igazolt (production) | '+P0.filter(f=>f.productionStatus==='PRODUCTION_VERIFIED').length+' |\n';
out+='| P0 blokkolt/alvó | '+P0.filter(f=>['BLOCKED','DORMANT'].includes(f.productionStatus)).length+' |\n';
out+='| Deprecated | '+db(f=>f.lifecycle==='DEPRECATED')+' |\n';
out+='| Teszt nélkül | '+db(f=>!f.teszt&&f.lifecycle==='ACTIVE')+' |\n';
out+='| Stagingen igazolt | '+db(f=>f.verification&&f.verification.staging)+' |\n';
out+='| Productionben igazolt | '+db(f=>f.verification&&f.verification.production)+' |\n\n';
out+='**Súlyozott készültség** (P0=10p, P1=5p, P2=2p, P3=1p): ';
out+='összesített **'+(M.osszes||0)+'%** · P0 **'+(M.P0||0)+'%** · P1 **'+(M.P1||0)+'%** · ';
out+='üzleti lánc **'+(M.lanc||0)+'%** · biztonság **'+(M.biztonsag||0)+'%** · ';
out+='tesztelési **'+(M.teszteles||0)+'%** · production **'+(M.production||0)+'%**\n\n';
out+='> Egy P0-hiány nem rejthető el sok kész UI-funkcióval: a súlyozás miatt a P0-oszlop\n';
out+='> önállóan mutatja a kritikus mag állapotát.\n\n';

out+='## Értéklánc szerinti nézet\n\n';
Object.keys(LANC).forEach(k=>{
  const cs=F.filter(f=>f.chain===k);
  if(!cs.length) return;
  out+='### '+k+'. '+LANC[k]+'\n\n';
  out+='| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |\n';
  out+='|---|---|---|---|---|---|---|---|---|\n';
  cs.forEach(f=>{
    const t=f.teszt?'`'+f.teszt.replace(/^_tests\//,'')+'`':'**NINCS**';
    out+='| **'+f.id+'** | '+f.nev+' | '+f.category.split('_').map(w=>w[0]).join('')+' | '
      +f.criticality+' | '+f.owner+' | '+(SZIN[f.productionStatus]||'')+' '+f.productionStatus+' | '
      +(f.nextFunctions||[]).join(' ')+' | '+t+' | '+((f.blockers||[]).join('; ')||'—')+' |\n';
  });
  out+='\n';
});

out+='## Színkód\n\n';
out+='- 🟢 production verified — gépi szintek + emberi staging + production bizonyíték\n';
out+='- 🔵 staging/integration/UI verified — gépileg igazolt\n';
out+='- 🟡 implemented / unit verified — megírva, részben igazolva\n';
out+='- 🟠 blocked / dormant — megírva, de nincs bekötve vagy blokkolt\n';
out+='- ⚪ deprecated — kivezetés alatt/után\n';
out+='- 🔴 planned / hiány — P0-nál ez teszthibát vagy hiányt jelez\n\n';
out+='A „csak frontend" önmagában nem negatív: egy UI-komponens természeténél fogva frontend-only.\n\n';
out+='## Kategória-rövidítések\n\nBC=BUSINESS_CAPABILITY · SC=SECURITY_CONTROL · WT=WORKFLOW_TRANSITION · UC=UI_COMPONENT · DO=DATA_OPERATION · I=INTEGRATION · I=INFRASTRUCTURE · AO=ADMIN_OPERATION\n';
fs.writeFileSync(path.join(ROOT,'FUNKCIOK.md'), out);
console.log('FUNKCIOK.md kesz — '+F.length+' bejegyzes, '+(M.osszes||0)+'% osszesitett keszultseg');
