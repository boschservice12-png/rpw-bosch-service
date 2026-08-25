// A FUNKCIOK.pdf-et is gep keszit, ugyanabbol a forrasbol (v2).
// Futtatas:  node _registry/pdf.js        (Chromium kell hozza)
const fs=require('fs'), path=require('path'), cp=require('child_process');
const ROOT=path.join(__dirname,'..');
const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'funkciok.json'),'utf8'));
const F=reg.funkciok, M=(reg._derived&&reg._derived.metrics)||{};
const LANC={'1':'Belépés','2':'Munkalap létrehozása','3':'Adatmentés','4':'Dokumentumok',
  '5':'Javítási fázisok','6':'Minőségkontroll','7':'Lezárás','8':'Kommunikáció',
  '9':'Admin','10':'Infrastruktúra'};
const SZ={PRODUCTION_VERIFIED:['production verified','#1a6b2a','#e3f5e6'],
  STAGING_VERIFIED:['staging verified','#17457f','#e5eefc'],
  INTEGRATION_VERIFIED:['DB-integrációval igazolt','#17457f','#e5eefc'],
  UI_VERIFIED:['valódi UI-val igazolt','#17457f','#e5eefc'],
  UNIT_VERIFIED:['unit-igazolt','#8a6d00','#fdf6d8'],
  IMPLEMENTED:['implementált','#8a6d00','#fdf6d8'],
  DORMANT:['alvó (nincs bekötve)','#8a4b06','#fdf0dd'],
  BLOCKED:['blokkolt','#8a4b06','#fdf0dd'],
  DEPRECATED:['kivezetés alatt','#555','#ececec'],
  REMOVED:['törölve','#555','#ececec'],
  PLANNED:['HIÁNY','#912121','#fde4e4']};
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const db=a=>F.filter(a).length;
const P0=F.filter(f=>f.criticality==='P0'&&f.lifecycle==='ACTIVE');

let h=`<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>RPW funkció-nyilvántartás v2</title>
<style>
@page{size:A4 landscape;margin:12mm 10mm 14mm}
*{box-sizing:border-box}
body{font:10px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;margin:0}
h1{font-size:21px;margin:0 0 2px}
.sub{color:#555;font-size:9.5px;margin-bottom:10px}
h2{font-size:13px;margin:14px 0 5px;padding-bottom:3px;border-bottom:2px solid #111;page-break-after:avoid}
table{width:100%;border-collapse:collapse;margin-bottom:4px}
th{background:#f1f3f5;text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:.4px;color:#444;padding:4px 5px;border-bottom:1.5px solid #ccc}
td{padding:4px 5px;border-bottom:1px solid #e6e6e6;vertical-align:top}
tr{page-break-inside:avoid}
.sz{font-weight:700;font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:8.5px;color:#334}
.j{white-space:nowrap;font-size:8.5px;padding:1.5px 6px;border-radius:9px;display:inline-block;font-weight:700}
.nincs{color:#b00;font-weight:700}
.kpi{width:100%;border:1px solid #ddd;margin-bottom:8px}
.kpi td{text-align:center;border:0;border-right:1px solid #eee;padding:7px 4px}
.kpi .n{font-size:17px;font-weight:700;display:block}
.kpi .c{font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.4px}
.box{border:1px solid #ddd;border-left:3px solid #111;padding:8px 10px;margin:6px 0 0;font-size:9px}
footer{margin-top:12px;padding-top:6px;border-top:1px solid #ddd;color:#666;font-size:8.5px}
</style></head><body>
<h1>RPW funkció-nyilvántartás <span style="font-size:13px;color:#888">v2 · értéklánc-nézet</span></h1>
<div class="sub">A státuszt GÉP számolja (derive.js) a teszteredményből + kódhorgonyokból + az evidence.json
EMBERI bizonyítékaiból. Gépi futás: <span class="mono">${esc((reg._derived&&reg._derived.from)||'?')}</span> ·
Újragenerálás: <span class="mono">npm run funkciok</span></div>

<h2>Vezetői összefoglaló</h2>
<table class="kpi"><tr>
<td><span class="n">${F.length}</span><span class="c">összes tétel</span></td>
<td><span class="n">${P0.length}</span><span class="c">P0 funkció</span></td>
<td><span class="n">${P0.filter(f=>f.productionStatus==='PRODUCTION_VERIFIED').length}</span><span class="c">P0 production-igazolt</span></td>
<td><span class="n">${P0.filter(f=>['BLOCKED','DORMANT'].includes(f.productionStatus)).length}</span><span class="c">P0 blokkolt/alvó</span></td>
<td><span class="n">${db(f=>f.lifecycle==='DEPRECATED')}</span><span class="c">deprecated</span></td>
<td><span class="n">${db(f=>!f.teszt&&f.lifecycle==='ACTIVE')}</span><span class="c">teszt nélkül</span></td>
<td><span class="n">${db(f=>f.verification&&f.verification.staging)}</span><span class="c">stagingen igazolt</span></td>
<td style="border-right:0"><span class="n">${db(f=>f.verification&&f.verification.production)}</span><span class="c">productionben igazolt</span></td>
</tr></table>
<table class="kpi"><tr>
<td><span class="n">${M.osszes||0}%</span><span class="c">összesített készültség</span></td>
<td><span class="n">${M.P0||0}%</span><span class="c">P0 készültség</span></td>
<td><span class="n">${M.P1||0}%</span><span class="c">P1 készültség</span></td>
<td><span class="n">${M.lanc||0}%</span><span class="c">üzleti lánc</span></td>
<td><span class="n">${M.biztonsag||0}%</span><span class="c">biztonság</span></td>
<td><span class="n">${M.teszteles||0}%</span><span class="c">tesztelési</span></td>
<td style="border-right:0"><span class="n">${M.production||0}%</span><span class="c">production</span></td>
</tr></table>
<div class="box"><b>Súlyozás:</b> P0=10 pont, P1=5, P2=2, P3=1 — egy P0-hiány nem rejthető el sok kész
UI-funkcióval. A „production 0%" azt jelenti: MÉG SEMMI nincs emberi staging+production bizonyítékkal igazolva.</div>`;

Object.keys(LANC).forEach(k=>{
  const cs=F.filter(f=>f.chain===k); if(!cs.length) return;
  h+=`<h2>${k}. ${LANC[k]}</h2><table>
  <tr><th>Szám</th><th>Mit csinál</th><th>Kategória</th><th>Krit.</th><th>Felelős</th>
  <th>Státusz</th><th>Következő</th><th>Teszt</th><th>Blokkoló</th></tr>`;
  cs.forEach(f=>{
    const s=SZ[f.productionStatus]||[f.productionStatus,'#333','#eee'];
    const t=f.teszt?esc(f.teszt.replace(/^_tests\//,'')):'<span class="nincs">NINCS</span>';
    h+=`<tr><td class="sz">${esc(f.id)}</td><td>${esc(f.nev)}</td>
    <td class="mono">${esc(f.category)}</td><td class="sz">${esc(f.criticality)}</td>
    <td>${esc(f.owner)}</td>
    <td><span class="j" style="color:${s[1]};background:${s[2]}">${esc(s[0])}</span></td>
    <td class="mono">${esc((f.nextFunctions||[]).join(' '))||'—'}</td>
    <td class="mono">${t}</td><td>${esc((f.blockers||[]).join('; '))||'—'}</td></tr>`;
  });
  h+='</table>';
});

h+=`<div class="box"><b>Színkód</b> —
<span class="j" style="color:#1a6b2a;background:#e3f5e6">zöld</span> production verified (gépi + emberi staging + production bizonyíték) ·
<span class="j" style="color:#17457f;background:#e5eefc">kék</span> staging/DB/UI igazolt ·
<span class="j" style="color:#8a6d00;background:#fdf6d8">sárga</span> implementált, nem teljesen igazolt ·
<span class="j" style="color:#8a4b06;background:#fdf0dd">narancs</span> blokkolt/alvó ·
<span class="j" style="color:#555;background:#ececec">szürke</span> deprecated ·
<span class="j" style="color:#912121;background:#fde4e4">piros</span> P0-hiány vagy teszthiba.
A „csak frontend" önmagában nem negatív — egy UI-komponens természeténél fogva frontend-only.</div>
<footer>Gép készítette: <span class="mono">node _registry/pdf.js</span> — kézzel ne szerkeszd.
A staging/production oszlop CSAK az _registry/evidence.json emberi bejegyzéseiből töltődhet.</footer>
</body></html>`;

const tmp=path.join(ROOT,'_registry','.funkciok.tmp.html');
fs.writeFileSync(tmp,h);
const CHROME=['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!CHROME){ console.error('Nincs Chromium — a PDF nem keszult el. HTML: '+tmp); process.exit(1); }
const out=path.join(ROOT,'FUNKCIOK.pdf');
cp.execFileSync(CHROME,['--headless','--disable-gpu','--no-sandbox',
  '--print-to-pdf='+out,'--no-pdf-header-footer','file://'+tmp],{stdio:'ignore'});
fs.unlinkSync(tmp);
console.log('FUNKCIOK.pdf kesz — '+Math.round(fs.statSync(out).size/1024)+' kB');
