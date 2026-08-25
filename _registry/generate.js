// A FUNKCIOK.md-t NEM kezzel irjuk: ebbol a scriptbol keszul,
// hogy a lista es a nyilvantartas soha ne csuszhasson szet.
// Futtatas:  node _registry/generate.js
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'funkciok.json'),'utf8'));
const CSOPORT={
  '0':'Belépés és jogosultság', '1':'Munkalap élete', '2':'Avizare daună, dosszié, iratok',
  '3':'Mentés, offline, gyorsítótár', '4':'Fázis-oldalak', '5':'Admin és takarítás',
  '9':'Infrastruktúra'
};
const JEL={ 'el':'✅ él', 'csak-frontend':'🟦 csak frontend', 'csak-backend':'🟧 csak backend',
            'nincs-bekotve':'⚠️ nincs bekötve' };
let out='# RPW funkció-nyilvántartás\n\n';
out+='> Ezt a fájlt **gép írja**: `node _registry/generate.js`.\n';
out+='> A forrás a `_registry/funkciok.json`. Az őre a `_tests/unit/test-registry.js`.\n\n';
out+='Minden funkciónak **állandó száma** van. A szám soha nem változik és nem használjuk újra.\n';
out+='Ha egy lépés eltűnik vagy átalakul, a teszt a **számával** jelzi. Ha új funkció kerül be\n';
out+='szám nélkül, azt is megmondja.\n\n';
const F=reg.funkciok;
out+='| összesen | él | csak frontend | csak backend | nincs bekötve | teszt nélkül |\n|---|---|---|---|---|---|\n';
out+='| '+F.length+' | '+F.filter(f=>f.allapot==='el').length+' | '
   +F.filter(f=>f.allapot==='csak-frontend').length+' | '
   +F.filter(f=>f.allapot==='csak-backend').length+' | '
   +F.filter(f=>f.allapot==='nincs-bekotve').length+' | '
   +F.filter(f=>!f.teszt).length+' |\n\n';
Object.keys(CSOPORT).forEach(k=>{
  const cs=F.filter(f=>f.id[2]===k);
  if(!cs.length) return;
  out+='## F-'+k+'xx · '+CSOPORT[k]+'\n\n';
  out+='| szám | mit csinál | frontend | backend | teszt | állapot |\n|---|---|---|---|---|---|\n';
  cs.forEach(f=>{
    const fe=(f.fe||[]).map(a=>'`'+a[0]+'`').filter((v,i,a)=>a.indexOf(v)===i).join(' ')||'—';
    const be=(f.be||[]).map(b=>'`'+b+'`').join(' ')||'—';
    const t=f.teszt?'`'+f.teszt.replace(/^_tests\//,'')+'`':'**—**';
    out+='| **'+f.id+'** | '+f.nev+' | '+fe+' | '+be+' | '+t+' | '+(JEL[f.allapot]||f.allapot)+' |\n';
  });
  out+='\n';
});
out+='## Mit jelentenek az állapotok\n\n';
out+='- **✅ él** — a frontend hívja, a backend válaszol, teszt őrzi.\n';
out+='- **🟦 csak frontend** — a böngészőben fut, szervert nem igényel.\n';
out+='- **🟧 csak backend** — az adatbázisban készen áll, de a felület még nem használja.\n';
out+='- **⚠️ nincs bekötve** — meg van írva, de éles üzemben ki van kapcsolva (kapcsoló, kulcs vagy migráció hiányzik).\n';
fs.writeFileSync(path.join(ROOT,'FUNKCIOK.md'), out);
console.log('FUNKCIOK.md kesz — '+F.length+' bejegyzes');
