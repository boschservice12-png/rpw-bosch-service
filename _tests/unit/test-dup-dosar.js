// ── A DUPLIKATUM-VEDELEM UJ HELYE (2026-08-25) ────────────────────────
// Korabban az uj-dosszie URLAP blokkolta a masodik azonos esetet. Az urlap
// kikerult (az Avizare dauna gomb egybol a dosszie lapjara visz), ezert a
// vedelem a dosszie lapjara kerult at — figyelmeztetesként.
// Ez a teszt azt orzi, hogy a vedelem NEM VESZETT EL a koltozeskor.
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const dos=fs.readFileSync(path.join(ROOT,'rpw-dosar.html'),'utf8');
const idx=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(g===e,m+'  got='+JSON.stringify(g));

console.log('\n1. A vedelem tenyleg atkerult, nem tunt el');
ok(/window\.dosarDupCheck=async function/.test(dos),'a dosszie lapon van dosarDupCheck');
ok(/if\(k==='asigurator'\|\|k==='nrDosar'\) dosarDupCheck\(\)/.test(dos),
   '  a biztosito ES a karszam beirasakor is lefut');
ok(/function _dupCaseKey/.test(dos),'eset-kulcs fuggveny');
ok(/function _dupPlateKey/.test(dos),'rendszam-kulcs fuggveny');
ok(/\.dup-warn\{/.test(dos),'van sajat, lathato figyelmeztetes-stilus');
ok(/Deschide dosarul existent/.test(dos),'  linkkel a MASIK dossziera');

console.log('\n2. A szabaly ugyanaz, mint a regi urlape volt');
// A regi njCaseKey: ugyanaz a biztosito + ugyanaz a karszam, AZONOS
// rendszamon belul. Egy autonak lehet Allianz-kara ES Groupama-kara.
const src=dos.slice(dos.indexOf('function _dupPlateKey'), dos.indexOf('function _dupWarn'));
const sandbox={};
new Function('S', src.replace(/window\.dosarDupCheck[\s\S]*$/,'')
  +'\nS._pk=_dupPlateKey;S._ck=_dupCaseKey;')(sandbox);
const pk=sandbox._pk, ck=sandbox._ck;
eq(pk('ms-20-bbb'),'MS20BBB','a rendszam normalizalodik (kotojel, kisbetu)');
eq(pk(' MS 20 BBB '),'MS20BBB','  szokoz sem szamit');
eq(ck('Allianz','D-77'),ck('  allianz  ','  d-77  '),'a biztosito+karszam is normalizalodik');
ok(ck('Allianz','D-77')!==ck('Groupama','D-77'),'mas biztosito -> MAS eset');
ok(ck('Allianz','D-77')!==ck('Allianz','D-78'),'mas karszam -> MAS eset');
eq(ck('',''),null,'ures adatbol nem azonositunk');
ok(ck('Allianz','')!==null,'  de mar a biztosito onmagaban azonosit');

console.log('\n3. Amit a figyelmeztetes NEM tesz');
ok(!/blokk|disabled|preventDefault/.test(
   dos.slice(dos.indexOf('window.dosarDupCheck'), dos.indexOf('function _dupWarn'))),
   'nem blokkol — a dosszie ekkorra mar letezik');
ok(/if\(r && r\.error\) return null/.test(dos),'szerverhiba eseten CSENDBEN kihagyja');
ok(/catch\(e\)\{ return null \}/.test(dos),'offline sem hasal el');
ok(/if\(j\.inchis\) continue/.test(dos),'lezart esetet nem szamol duplikatumnak');
ok(/j\.id===JOB\.id/.test(dos),'onmagat nem jelenti duplikatumnak');

console.log('\n4. A regi, urlapos ut tenyleg megszunt');
ok(!/mode==='dosar'/.test(idx),'nincs tobbe dosar urlap-mod');
ok(!/openNewJob\('dosar'\)/.test(idx),'  senki nem hivja');
ok(/window\.dosarTarziu=async function/.test(idx),'a gomb sajat utat kapott');
ok(/deschideDosar\(j\.id\)/.test(idx),'  es ugyanoda visz, ahova a lista gombja');

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
if(fail) process.exit(1);
