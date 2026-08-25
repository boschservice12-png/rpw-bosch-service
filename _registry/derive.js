// ════════════════════════════════════════════════════════════════
//  STÁTUSZ-LEVEZETÉS — a státuszt NEM kéz állítja, hanem ez a gép.
//  Bemenet:  funkciok.json (horgonyok, lifecycle, allapot)
//            _tests/last-run.json (gépi teszteredmény)
//            evidence.json (EMBERI staging/production bizonyíték — ha nincs,
//                           a státusz a gépi szinten PLAFONOZÓDIK)
//  Kimenet:  minden funkcióra: productionStatus + verification{} +
//            súlyozott készültségi mutatók.
//  Szintek:  PLANNED → IMPLEMENTED → UNIT_VERIFIED →
//            INTEGRATION_VERIFIED → UI_VERIFIED → STAGING_VERIFIED →
//            PRODUCTION_VERIFIED   (+ DORMANT / BLOCKED / DEPRECATED / REMOVED)
// ════════════════════════════════════════════════════════════════
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'funkciok.json'),'utf8'));
let run=null; try{ run=JSON.parse(fs.readFileSync(path.join(ROOT,'_tests','last-run.json'),'utf8')); }catch(e){}
let evidence={}; try{ evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence.json'),'utf8')); }catch(e){}

const WEIGHT={P0:10,P1:5,P2:2,P3:1};
const LEVELS=['PLANNED','IMPLEMENTED','UNIT_VERIFIED','INTEGRATION_VERIFIED',
              'UI_VERIFIED','STAGING_VERIFIED','PRODUCTION_VERIFIED'];
const cache={};
function fileHas(f, needle){
  const p=path.join(ROOT,f);
  if(!fs.existsSync(p)) return false;
  if(cache[f]===undefined) cache[f]=fs.readFileSync(p,'utf8');
  return cache[f].indexOf(needle)>=0;
}
function catVerdict(cat){
  const c=run && run[cat];
  return !!(c && c.verdict==='PASS');
}
function testCat(t){
  if(!t) return null;
  if(/\/unit\//.test(t)) return 'unit';
  if(/\/(integration|int)\//.test(t)) return 'integration';
  if(/\/frontend\//.test(t)) return 'frontend';
  return null;
}

function derive(f){
  const v={unit:false,database:false,ui:false,e2e:false,staging:false,production:false};
  // horgonyok megvannak-e
  const anchorsOk = (f.fe||[]).every(a=>fileHas(a[0],a[1]))
    && (f.be||[]).length===((f.be||[]).filter(rpc=>{
         const dir=path.join(ROOT,'_migrations');
         return fs.readdirSync(dir).filter(n=>/\.sql$/.test(n)&&!/rollback/.test(n))
           .some(n=>fileHas('_migrations/'+n,'function public.'+rpc));
       }).length);
  const tcat=testCat(f.teszt);
  const testExists = f.teszt && fs.existsSync(path.join(ROOT,f.teszt));
  if(testExists && catVerdict(tcat==='frontend'?'frontend':tcat)){
    if(tcat==='unit') v.unit=true;
    if(tcat==='integration'){ v.unit=true; v.database=true; }
    if(tcat==='frontend'){ v.unit=true; v.ui=true; }
  }
  const ev=evidence[f.id]||{};
  if(ev.staging===true)    v.staging=true;      // CSAK emberi bizonyítékkal
  if(ev.production===true) v.production=true;
  if(ev.e2e===true)        v.e2e=true;

  let status;
  if(f.lifecycle==='REMOVED') status='REMOVED';
  else if(f.lifecycle==='DEPRECATED') status='DEPRECATED';
  else if((f.blockers||[]).length && f.allapot!=='el') status='BLOCKED';
  else if(!anchorsOk) status='PLANNED';
  else if(f.allapot==='nincs-bekotve'||f.allapot==='csak-backend') status='DORMANT';
  else {
    status='IMPLEMENTED';
    if(v.unit) status='UNIT_VERIFIED';
    if(v.database) status='INTEGRATION_VERIFIED';
    if(v.ui) status='UI_VERIFIED';
    if(v.staging) status='STAGING_VERIFIED';
    // PRODUCTION_VERIFIED: minden gépi szint + staging + production bizonyíték
    if(v.production && v.staging && v.unit && (v.database||v.ui)) status='PRODUCTION_VERIFIED';
  }
  return {productionStatus:status, verification:v, anchorsOk,
          lastVerifiedAt:(run&&run.generated)||null};
}

function metrics(F){
  const lvl=s=>LEVELS.indexOf(s);
  const score=f=>{
    if(f.productionStatus==='DEPRECATED'||f.productionStatus==='REMOVED') return null; // nem szamit bele
    const l=lvl(f.productionStatus);
    if(l<0) return 0;                              // BLOCKED/DORMANT = 0
    return l/(LEVELS.length-1);
  };
  const groups={osszes:F, P0:F.filter(f=>f.criticality==='P0'),
    P1:F.filter(f=>f.criticality==='P1'),
    lanc:F.filter(f=>['BUSINESS_CAPABILITY','WORKFLOW_TRANSITION'].includes(f.category)),
    biztonsag:F.filter(f=>f.category==='SECURITY_CONTROL')};
  const out={};
  for(const [k,fs_] of Object.entries(groups)){
    let w=0,got=0;
    fs_.forEach(f=>{
      const s=score(f); if(s===null) return;
      const wt=WEIGHT[f.criticality]||1; w+=wt; got+=wt*s;
    });
    out[k]= w? Math.round(100*got/w) : 0;
  }
  const active=F.filter(f=>!['DEPRECATED','REMOVED'].includes(f.productionStatus));
  out.teszteles = Math.round(100*active.filter(f=>f.verification&&f.verification.unit).length/Math.max(1,active.length));
  out.production = Math.round(100*active.filter(f=>f.productionStatus==='PRODUCTION_VERIFIED').length/Math.max(1,active.length));
  return out;
}

const F=reg.funkciok;
F.forEach(f=>Object.assign(f,derive(f)));
reg._derived={ at:new Date().toISOString(), from:(run&&run.generated)||'nincs gépi futás',
  metrics:metrics(F) };
fs.writeFileSync(path.join(__dirname,'funkciok.json'), JSON.stringify(reg,null,1)+'\n');
const m=reg._derived.metrics;
console.log('Státusz levezetve '+F.length+' funkcióra a '+(run?run.generated:'?')+' gépi futásból.');
console.log('  összesített: '+m.osszes+'%   P0: '+m.P0+'%   P1: '+m.P1+'%');
console.log('  üzleti lánc: '+m.lanc+'%   biztonság: '+m.biztonsag+'%');
console.log('  tesztelési: '+m.teszteles+'%   production: '+m.production+'%');
const byS={};F.forEach(f=>{byS[f.productionStatus]=(byS[f.productionStatus]||0)+1});
console.log('  státuszok:',JSON.stringify(byS));
