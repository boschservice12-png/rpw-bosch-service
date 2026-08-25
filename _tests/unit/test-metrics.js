// L1-T: munkaido-meres — T0 tinichigerie, T1 control final, szombat nincs
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
let NOW=new Date('2026-08-24T10:00:00');       // 2026-08-24 = HETFO
const R=Date; global.Date=class extends R{constructor(...x){if(x.length)super(...x);else super(NOW)}static now(){return NOW.getTime()}};
global.window={};
eval(fs.readFileSync('rpw-workflow.js','utf8'));
const W=window.RPWWorkflow;

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(g===e,m+'  got='+JSON.stringify(g)+' exp='+JSON.stringify(e));

function J(o){o=o||{};
  var j={phase:o.phase||4,damageType:'asig',phases:{},deviz:o.deviz,gapLog:o.gapLog};
  for(var i=1;i<=7;i++)j.phases[i]={status:'pending'};
  if(o.t0)j.phases[4]={status:'active',started:o.t0+'T08:00:00Z'};
  if(o.t1)j.phases[6]={status:'done',finished:o.t1+'T16:00:00Z'};
  return j;
}

console.log('\n1. MUNKANAP-SZAMITAS — szombat/vasarnap nem szamit');
eq(W.workdaysBetween('2026-08-24','2026-08-24'),1,'hetfo->hetfo = 1 nap');
eq(W.workdaysBetween('2026-08-24','2026-08-28'),5,'hetfo->pentek = 5 nap');
eq(W.workdaysBetween('2026-08-24','2026-08-30'),5,'hetfo->vasarnap = MEG MINDIG 5 (hetvege kimarad)');
eq(W.workdaysBetween('2026-08-24','2026-08-31'),6,'hetfo->kov.hetfo = 6');
eq(W.workdaysBetween('2026-08-28','2026-08-31'),2,'pentek->hetfo = 2 (nem 4)');
eq(W.workdaysBetween('2026-08-29','2026-08-30'),0,'csak hetvege = 0 munkanap');

console.log('\n2. HATARIDO-SZAMITAS');
eq(W.addWorkdays('2026-08-24',1),'2026-08-24','1 munkanap = ugyanaz a nap');
eq(W.addWorkdays('2026-08-24',5),'2026-08-28','5 munkanap: H->P');
eq(W.addWorkdays('2026-08-27',3),'2026-08-31','csutortok +3 -> hetfo (hetvege at)');
eq(W.addWorkdays('2026-08-28',2),'2026-08-31','pentek +2 -> hetfo');

console.log('\n3. DEVIZ-ORA — Audatex VAGY sajat deviz, mindegy');
eq(W.devizHours({deviz:{oreTinichigerie:6.2,oreVopsitorie:5.0}}),11.2,'6.2 + 5.0 = 11.2');
eq(W.devizHours({deviz:{oreTinichigerie:6.2}}),6.2,'csak lakatos');
eq(W.devizHours({deviz:{oreVopsitorie:5}}),5,'csak fenyezes');
eq(W.devizHours({deviz:{}}),null,'ures deviz -> nincs adat');
eq(W.devizHours({}),null,'nincs deviz -> null');
eq(W.devizHours({deviz:{oreTinichigerie:'6.2',oreVopsitorie:'5.0'}}),11.2,'szovegkent is');

console.log('\n4. VARHATO NAP = ora / 4, felfele kerekitve');
eq(W.expectedDays(11.2),3,'11.2h -> 3 nap');
eq(W.expectedDays(16),4,'16h -> 4 nap');
eq(W.expectedDays(18.4),5,'18.4h -> 5 nap');
eq(W.expectedDays(32),8,'32h -> 8 nap (a te 4-10 elemes savod)');
eq(W.expectedDays(1),1,'1h -> 1 nap (minimum)');
eq(W.expectedDays(0.5),1,'fel ora is 1 nap');
eq(W.expectedDays(null),null,'ora nelkul nincs varakozas');

console.log('\n5. T0 = TINICHIGERIE, nem a beerkezes');
let m=W.workMetrics(J({}));
eq(m.started,false,'lakatosmunka nelkul: nem indult');
eq(m.state,'neinceput','allapot: neinceput');
eq(m.elapsed,null,'nincs mit merni');
m=W.workMetrics(J({t0:'2026-08-24'}));
eq(m.t0,'2026-08-24','T0 = a tinichigerie indulasa');
eq(m.running,true,'meg fut');
eq(m.elapsed,1,'ma hetfo, indult ma -> 1 munkanap');

console.log('\n6. DEVIZ NELKUL is mer — csak nem itel');
m=W.workMetrics(J({t0:'2026-08-17'}));
eq(m.elapsed,6,'6 munkanapja fut');
eq(m.hours,null,'nincs ora');
eq(m.expected,null,'nincs varhato');
eq(m.gap,null,'nincs gap — NEM talal ki szamot');
eq(m.state,'fara_deviz','allapot: fara_deviz');
eq(m.needsReason,false,'nem kerdez okot, ha nincs mihez merni');

console.log('\n7. AMIKOR FELKERUL A DEVIZ — megjelenik a viszonyitas');
m=W.workMetrics(J({t0:'2026-08-24',deviz:{oreTinichigerie:6.2,oreVopsitorie:5.0}}));
eq(m.hours,11.2,'11.2 ora');
eq(m.expected,3,'3 nap varhato');
eq(m.deadline,'2026-08-26','hatarido: szerda');
eq(m.elapsed,1,'1 napja fut');
eq(m.gap,-2,'2 nappal a hatarido elott');
eq(m.over,false,'nincs tullepes');
eq(m.state,'in_grafic','allapot: in_grafic');

console.log('\n8. TULLEPES — es a rendszer KERDEZ');
m=W.workMetrics(J({t0:'2026-08-10',deviz:{oreTinichigerie:10,oreVopsitorie:6}}));
eq(m.expected,4,'16h -> 4 nap');
eq(m.elapsed,11,'11 munkanapja fut');
eq(m.gap,7,'GAP +7 munkanap');
eq(m.over,true,'tullepes');
eq(m.state,'depasit','allapot: depasit');
eq(m.needsReason,true,'KERDEZ: hol a baj?');

console.log('\n9. AZ OK ROGZITESE — naplo, nem felulиras');
let j=J({t0:'2026-08-10',deviz:{oreTinichigerie:10,oreVopsitorie:6}});
let r=W.setGapReason(j,'piese','asteptam bara fata');
ok(r.ok,'ok rogzitve');
eq(j.gapReason,'piese','aktualis ok');
eq(j.gapLog.length,1,'naplozva');
eq(j.gapLog[0].gap,7,'  a gap ertekevel egyutt');
eq(j.gapLog[0].note,'asteptam bara fata','  jegyzettel');
ok(!!j.gapLog[0].at,'  idobelyeggel');
W.setGapReason(j,'asigurator');
eq(j.gapLog.length,2,'MASODIK ok is naplozodik (egy munkan tobb is lehet)');
eq(j.gapReason,'asigurator','az aktualis a legutobbi');
eq(W.workMetrics(j).needsReason,false,'mar nem kerdez ujra');
ok(!W.setGapReason(j,'valami_mas').ok,'ismeretlen okot nem fogad el');
eq(W.GAP_REASONS.join(','),'piese,asigurator,capacitate,vreme,garantie,fara_motiv','a hat ok');

console.log('\n10. LEZART MUNKA — T1 a CONTROL FINAL');
m=W.workMetrics(J({t0:'2026-08-10',t1:'2026-08-14',deviz:{oreTinichigerie:10,oreVopsitorie:6}}));
eq(m.t1,'2026-08-14','T1 = a control lezarasa');
eq(m.running,false,'mar nem fut');
eq(m.elapsed,5,'H->P = 5 munkanap');
eq(m.gap,1,'4 varhato, 5 tenyleges -> +1');
eq(m.state,'depasit','tullepte');
// ha a control meg nem done, akkor meg fut
let j2=J({t0:'2026-08-10',deviz:{oreTinichigerie:10,oreVopsitorie:6}});
j2.phases[6]={status:'active',finished:'2026-08-14T10:00:00Z'};
eq(W.workMetrics(j2).t1,null,'aktiv control -> NEM szamit lezarasnak');

console.log('\n11. Nem hasal el hianyos adaton');
[null,undefined,{},{phases:null},{phases:{4:{}}}].forEach(function(x,i){
  try{ var mm=W.workMetrics(x||{}); ok(!!mm,'hianyos bemenet #'+i+' -> valaszol'); }
  catch(e){ ok(false,'hianyos bemenet #'+i+' KIVETEL: '+e.message); }
});

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
