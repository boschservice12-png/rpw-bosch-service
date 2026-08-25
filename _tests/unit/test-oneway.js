// L1-N: nincs ket varians a dosar-nyitasnal + csik + kabalas ZIP-parbeszed
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const idx=fs.readFileSync('index.html','utf8');
const dos=fs.readFileSync('rpw-dosar.html','utf8');
const wf =fs.readFileSync('rpw-workflow.js','utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

console.log('\n1. A nyito modal: dosar modban NINCS kerdes');
ok(/if\(mode!=='dosar'\)\{[\s\S]{0,400}nj_pay/.test(idx),'a valaszto csak nem-dosar modban jelenik meg');
ok(/S\.njPay=\(S\.njMode==='dosar'\)\?'deschid':null/.test(idx),'dosar mod -> automatikusan deschid');
ok(/kellDosar&&mode!=='dosar'&&!S\.njPay/.test(idx),'a validacio se keri');

console.log('\n2. A dosszie-oldal: doar_dosar -> nincs modvalto');
ok(/_ddj \? 'deschid' :/.test(dos),'a mod kenyszeritve deschid-re');
ok(/if\(!_ddj\)\{[\s\S]{0,600}dst-wrap/.test(dos),'a modvalto csak javitasi munkan');

console.log('\n3. EGY iratszamlalo — a csik es a szekcio ugyanazt hasznalja');
ok(/window\.acteCountFor=function/.test(dos),'kozos fuggveny');
ok(/var _cnt=acteCountFor\(job\), reqTotal=_cnt\.total/.test(dos),'a szekcio ezt hasznalja');
ok(/_ac0=\(typeof acteCountFor==='function'\)\?acteCountFor\(job\)/.test(dos),'a csik is ezt hasznalja');
ok(!/var reqTotal=0,reqDone=0;/.test(dos),'a regi, duplikalt szamolas eltunt');

console.log('\n4. Allapotcsik a dosszie-oldal tetejen');
ok(/class="dd-bar"/.test(dos),'csik elem');
ok(/#1E9D55/.test(dos)&&/#E9A700/.test(dos)&&/#E11D2E/.test(dos),'zold / sarga / piros');
const seg=dos.slice(dos.indexOf('var _bc='),dos.indexOf('var _bc=')+400);
ok(/done>=_ac0\.total \? '#1E9D55'/.test(seg),'teljes -> zold');
ok(/_ac0\.done \? '#E9A700' : '#E11D2E'/.test(seg),'reszleges -> sarga, ures -> piros');
ok(/height:5px/.test(dos),'vekony');
ok(/class="dd-bar"[^>]*><div style="width:/.test(dos),'a csikban csak egy kitolto div van, nincs szoveg');

console.log('\n5. A ZIP-parbeszed a kabalas modal');
ok(!/confirm\('Lipsesc /.test(dos),'a nyers confirm eltunt');
ok(/RPWWorkflow\.showBlockModal\(\{[\s\S]{0,400}items:missing/.test(dos),'a hianylista a modalba megy');
ok(/onConfirm:function\(\)\{ exportDosarZip/.test(dos),'"Descarca oricum" tovabbenged');
ok(/zip_go|zip_cancel/.test(dos),'sajat gombfeliratok');
['ro','en','hu'].forEach(l=>ok(new RegExp("zip_lead:\\{[^}]*"+l+":'").test(dos),'zip_lead '+l));

console.log('\n6. A modal altalanosithato lett (workflow)');
ok(/if\(Array\.isArray\(opts\.items\)/.test(wf),'sajat lista atadhato');
ok(/opts\.title\|\|um\('bm_title'/.test(wf),'sajat cim');
ok(/data-go/.test(wf),'megerosito gomb');
ok(/opts\.onConfirm\(\)/.test(wf),'onConfirm meghivodik');
ok(/if\(!items\.length && job && isNum\(target\)\)/.test(wf),'a sajat lista nem irodik felul');

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
