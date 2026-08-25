// A FUNKCIOK.pdf-et is gep keszit, ugyanabbol a forrasbol, mint a .md-t.
// Futtatas:  node _registry/pdf.js        (Chromium kell hozza)
const fs=require('fs'), path=require('path'), cp=require('child_process');
const ROOT=path.join(__dirname,'..');
const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'funkciok.json'),'utf8'));
const F=reg.funkciok;
const CSOPORT={'0':'Belépés és jogosultság','1':'Munkalap élete','2':'Avizare daună, dosszié, iratok',
  '3':'Mentés, offline, gyorsítótár','4':'Fázis-oldalak','5':'Admin és takarítás','9':'Infrastruktúra'};
const JEL={'el':['él','j-el'],'csak-frontend':['csak frontend','j-fe'],
           'csak-backend':['csak backend','j-be'],'nincs-bekotve':['nincs bekötve','j-ki']};
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const db=a=>F.filter(a).length;

let h=`<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>RPW funkció-nyilvántartás</title>
<style>
@page{size:A4 landscape;margin:12mm 10mm 14mm}
*{box-sizing:border-box}
body{font:10.5px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;margin:0}
h1{font-size:21px;margin:0 0 2px}
.sub{color:#555;font-size:10px;margin-bottom:10px}
h2{font-size:13px;margin:16px 0 5px;padding-bottom:3px;border-bottom:2px solid #111;
   page-break-after:avoid;break-after:avoid}
table{width:100%;border-collapse:collapse;margin-bottom:4px}
th{background:#f1f3f5;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px;
   color:#444;padding:5px 6px;border-bottom:1.5px solid #ccc}
td{padding:4.5px 6px;border-bottom:1px solid #e6e6e6;vertical-align:top}
tr{page-break-inside:avoid;break-inside:avoid}
.sz{font-weight:700;font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;width:52px}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:9px;color:#334}
.j{white-space:nowrap;font-size:9px;padding:1.5px 6px;border-radius:9px;display:inline-block}
.j-el{background:#e3f5e6;color:#1a6b2a}
.j-fe{background:#e5eefc;color:#17457f}
.j-be{background:#fdf0dd;color:#8a4b06}
.j-ki{background:#fde4e4;color:#912121}
.nincs{color:#b00;font-weight:700}
.osszeg{width:100%;border:1px solid #ddd;margin-bottom:6px}
.osszeg td{text-align:center;border:0;border-right:1px solid #eee;padding:7px 4px}
.osszeg .n{font-size:17px;font-weight:700;display:block}
.osszeg .c{font-size:8.5px;color:#666;text-transform:uppercase;letter-spacing:.4px}
.box{border:1px solid #ddd;border-left:3px solid #111;padding:8px 10px;margin:6px 0 0;font-size:9.5px}
.box b{display:block;margin-bottom:3px}
footer{margin-top:14px;padding-top:6px;border-top:1px solid #ddd;color:#666;font-size:9px}
</style></head><body>
<h1>RPW funkció-nyilvántartás</h1>
<div class="sub">Minden funkciónak állandó száma van. A szám soha nem változik és nem használjuk újra.
Forrás: <span class="mono">_registry/funkciok.json</span> · Őre: <span class="mono">_tests/unit/test-registry.js</span> ·
Újragenerálás: <span class="mono">npm run funkciok</span></div>
<table class="osszeg"><tr>
<td><span class="n">${F.length}</span><span class="c">összesen</span></td>
<td><span class="n">${db(f=>f.allapot==='el')}</span><span class="c">él</span></td>
<td><span class="n">${db(f=>f.allapot==='csak-frontend')}</span><span class="c">csak frontend</span></td>
<td><span class="n">${db(f=>f.allapot==='csak-backend')}</span><span class="c">csak backend</span></td>
<td><span class="n">${db(f=>f.allapot==='nincs-bekotve')}</span><span class="c">nincs bekötve</span></td>
<td style="border-right:0"><span class="n">${db(f=>!f.teszt)}</span><span class="c">teszt nélkül</span></td>
</tr></table>`;

Object.keys(CSOPORT).forEach(k=>{
  const cs=F.filter(f=>f.id[2]===k); if(!cs.length) return;
  h+=`<h2>F-${k}xx · ${CSOPORT[k]}</h2><table>
  <tr><th>Szám</th><th>Mit csinál</th><th>Frontend</th><th>Backend</th><th>Teszt</th><th>Állapot</th></tr>`;
  cs.forEach(f=>{
    const fe=[...new Set((f.fe||[]).map(a=>a[0]))].join('<br>')||'—';
    const be=(f.be||[]).join('<br>')||'—';
    const t=f.teszt?esc(f.teszt.replace(/^_tests\//,'')):'<span class="nincs">nincs</span>';
    const j=JEL[f.allapot]||[f.allapot,''];
    h+=`<tr><td class="sz">${esc(f.id)}</td><td>${esc(f.nev)}</td>
    <td class="mono">${fe}</td><td class="mono">${be}</td><td class="mono">${t}</td>
    <td><span class="j ${j[1]}">${j[0]}</span></td></tr>`;
  });
  h+='</table>';
});

h+=`<div class="box"><b>Mit jelentenek az állapotok</b>
<span class="j j-el">él</span> a frontend hívja, a backend válaszol, teszt őrzi &nbsp;
<span class="j j-fe">csak frontend</span> a böngészőben fut, szervert nem igényel &nbsp;
<span class="j j-be">csak backend</span> az adatbázisban készen áll, de a felület még nem használja &nbsp;
<span class="j j-ki">nincs bekötve</span> meg van írva, de éles üzemben ki van kapcsolva</div>
<div class="box"><b>Hogyan derül ki, ha valami eltűnt</b>
Az <span class="mono">npm run funkciok</span> két irányban ellenőriz. Ha egy beszámozott funkció
horgonya eltűnik a kódból, a <b>számával</b> szól. Ha új szerverhívás vagy új adatbázis-funkció
kerül be szám nélkül, azt is jelzi.</div>
<footer>Gép készítette: <span class="mono">node _registry/pdf.js</span> — kézzel ne szerkeszd.</footer>
</body></html>`;

const tmp=path.join(ROOT,'_registry','.funkciok.tmp.html');
fs.writeFileSync(tmp,h);
const CHROME=['/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium','/usr/bin/google-chrome'].find(p=>fs.existsSync(p));
if(!CHROME){ console.error('Nincs Chromium — a PDF nem keszult el. A HTML megvan: '+tmp); process.exit(1) }
const out=path.join(ROOT,'FUNKCIOK.pdf');
cp.execFileSync(CHROME,['--headless','--disable-gpu','--no-sandbox',
  '--print-to-pdf='+out,'--no-pdf-header-footer','file://'+tmp],{stdio:'ignore'});
fs.unlinkSync(tmp);
console.log('FUNKCIOK.pdf kesz — '+Math.round(fs.statSync(out).size/1024)+' kB, '+F.length+' bejegyzes');
