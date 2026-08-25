// L1-S: ESET-azonossag — egy autonak lehet tobb parhuzamos esete
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
const a=html.indexOf('function njCaseKey('), b=html.indexOf('window.njAfterRender=function');

global.S={};global.JOBS=[];global.T=k=>k;global.escH=s=>String(s==null?'':s);
global.categorizeJob=j=>j._cat||'viitoare';
global.njKey=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
global.window=global;
eval(html.slice(a,b).replace(/window.njSync=function[\s\S]*?\n};\n/,''));

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(g===e,m+'  got='+JSON.stringify(g));

function J(o){return Object.assign({id:'j'+Math.random(),plate:'MS-55-BSS',number:'MS-26-001'},o)}
function setup(mode,tip,asig,dosar){S.njMode=mode;S.njTip=tip;S.njAsig=asig||'';S.njDosar=dosar||'';S.njPlate='MS-55-BSS';S.njEditId=null}

console.log('\n1. Harom parhuzamos eset ugyanazon az auton — SZABALYOS');
JOBS=[ J({damageType:'asig',asigurator:'Groupama',nrDosar:'G-1',number:'MS-26-010'}),
       J({damageType:'asig',asigurator:'Allianz Tiriac',nrDosar:'A-9',number:'MS-26-011'}),
       J({damageType:null,number:'MS-26-012'}) ];
setup('lucrare','asig','Omniasig','O-5');
ok(njDup()===null,'negyedik eset (Omniasig) -> NEM duplikatum');
eq(njOpenCases().length,3,'de mind a harom nyitott esetet felsorolja');

console.log('\n2. Ugyanaz az eset ketszer — EZ duplikatum');
setup('lucrare','asig','Groupama','G-1');
ok(njDup()!==null,'ugyanaz a biztosito + ugyanaz a karszam -> DUPLIKATUM');
eq(njDup().number,'MS-26-010','  a meglevo esetet mutatja');
setup('lucrare','asig','GROUPAMA','  g-1  ');
ok(njDup()!==null,'kis/nagybetu es szokoz nem szamit');

console.log('\n3. Ugyanaz a biztosito, MAS karszam — kulon eset');
setup('lucrare','asig','Groupama','G-2');
ok(njDup()===null,'masik kar ugyanannal a biztositonal -> szabalyos');

console.log('\n4. Sajat zseb: egyszerre csak egy');
setup('lucrare','auto');
ok(njDup()!==null,'mar fut egy sajat zsebes -> duplikatum');
eq(njDup().number,'MS-26-012','  azt mutatja');
JOBS=JOBS.filter(j=>j.damageType==='asig');
setup('lucrare','auto');
ok(njDup()===null,'ha nincs sajat zsebes, mehet');

console.log('\n5. Nem tud dontest hozni adat nelkul');
setup('lucrare','asig','','');
ok(njDup()===null,'biztosito es karszam nelkul nem allit duplikatumot');
setup('prog',null);
ok(njDup()===null,'tipus nelkul sem');

console.log('\n6. Lezart eset nem szamit');
JOBS=[ J({damageType:'asig',asigurator:'Groupama',nrDosar:'G-1',_cat:'arhivate'}) ];
setup('lucrare','asig','Groupama','G-1');
ok(njDup()===null,'archivalt eset -> ujranyithato');
eq(njOpenCases().length,0,'  es nem is sorolja fel');
JOBS[0]._cat='ratate';
ok(njOpenCases().length===1,'a ratat viszont meg nyitott eset');

console.log('\n7. Mas rendszam nem zavar');
JOBS=[ J({plate:'MS-11-AAA',damageType:'asig',asigurator:'Groupama',nrDosar:'G-1'}) ];
setup('lucrare','asig','Groupama','G-1');
ok(njDup()===null,'mas auto ugyanazzal a karszammal -> nem duplikatum');
eq(njOpenCases().length,0,'  nem is sorolja fel');

console.log('\n8. Sajat magat nem jelzi (szerkesztes)');
JOBS=[ J({id:'X',damageType:'asig',asigurator:'Groupama',nrDosar:'G-1'}) ];
setup('edit','asig','Groupama','G-1'); S.njEditId='X';
ok(njDup()===null,'a szerkesztett eset nem duplikatum');

console.log('\n9. A cimke megmondja, MELYIK eset');
eq(njCaseLabel({damageType:'asig',asigurator:'Groupama',nrDosar:'G-1'}),'Groupama · G-1','biztosito + karszam');
eq(njCaseLabel({damageType:'asig',asigurator:'Allianz'}),'Allianz','karszam nelkul');
eq(njCaseLabel({damageType:null}),'nj_case_auto','sajat zseb');
eq(njCaseLabel({damageType:'asig'}),'?','ismeretlen');

console.log('\n10. A tobbi javitas a kodban');
ok(/if\(kellDosar&&!String\(S\.njClient\|\|''\)\.trim\(\)\)m\.push\(T\('nj_m_client'\)\)/.test(html),'ugyfel neve kotelezo dossziehoz');
ok(/if\(njDup\(\)\)m\.push\(T\('nj_dup_real'\)\)/.test(html),'valodi duplikatum BLOKKOL');
ok(/S\.njDate < njDay\(0\)[\s\S]{0,80}nj_date_past/.test(html),'multbeli datum -> figyelmeztetes');
ok(!/tab==='viitoare' && _dd[\s\S]{0,400}markRatat/.test(html),'a Ratat gomb LEKERULT a dosszie sorrol');
ok(/njCaseLabel\(j\)/.test(html),'a soron latszik, melyik eset');
ok(/nj-dup-info/.test(html)&&/nj-dup-bad/.test(html),'ketfele jelzes: tajekoztato vs hiba');

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
