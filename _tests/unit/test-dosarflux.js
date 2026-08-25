// L1-L: a "csak dosszie" munka nem a javitasi csoben jelenik meg
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('rpw-dosar.html','utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

console.log('\n1. A fazissav feltetelhez kotott');
ok(/var _doarDosar *= *\(job\.flux==='doar_dosar'\)/.test(html),'_doarDosar a flux-bol jon');
ok(/job\.flux==null *&& *job\.doarDosar===true/.test(html),'regi mezovel is mukodik (visszafele komp.)');
ok(/if\(_doarDosar\)\{[\s\S]{0,2500}\} else \{[\s\S]{0,80}h\+='<div class="phase-nav">'/.test(html),
   'csak-dosszie eseten NEM rajzolodik a phase-nav');

console.log('\n2. Az override is csak javitasi munkan');
ok(/if\(_adm && !_doarDosar\)\{/.test(html),'override csak javitasnal');

console.log('\n3. A dosszie sajat harom lepese');
['dd_s1','dd_s2','dd_s3'].forEach(k=>ok(html.indexOf(k)>0,'lepes: '+k));
ok(/dd-steps/.test(html),'sajat lepes-sav');
ok(/job\.inchis *\? *3 *: *\(job\.dosarPredat *\? *2 *: *1\)/.test(html),'a lepes az adatbol jon');
['ro','en','hu'].forEach(function(l){
  ok(new RegExp("dd_s1:\\{[^}]*"+l+":'[^']+'").test(html),'dd_s1 '+l+' nyelven');
});

console.log('\n4. Atkonvertalas javitassa — EGY autohoz EGY dosszie');
ok(/window\.dosarToReparatie/.test(html),'van konvertalo fuggveny');
ok(/JOB\.flux='reparatie'/.test(html),'a fluxot valtja');
ok(/JOB\.doarDosar=false/.test(html),'a regi mezot is szinkronban tartja');
ok(!/RPWUtil\.jobId|new job|number:/.test(html.slice(html.indexOf('dosarToReparatie'),html.indexOf('dosarToReparatie')+700)),
   'NEM nyit uj munkat — ugyanaz a dosszie valt');
ok(/dlgAsk\(\{tone:'warn',title:T\('dd_toRep'\)/.test(html),'megerositest ker — kabalaval');

console.log('\n5. Az L1-F es L1-J tartalom megmaradt');
[['dst-wrap','modvalto'],['setDosarStatus','modvalto mentes'],['grpReq','doksilista mod szerint'],
 ['showBlockModal','kabalas modal'],['nrDosar','karszam mezo']].forEach(function(x){
  ok(html.indexOf(x[0])>0,x[1]);
});

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
