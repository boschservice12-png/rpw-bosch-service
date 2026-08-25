// L1-N: nincs ket varians a dosar-nyitasnal + csik + kabalas ZIP-parbeszed
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const idx=fs.readFileSync('index.html','utf8');
const dos=fs.readFileSync('rpw-dosar.html','utf8');
const wf =fs.readFileSync('rpw-workflow.js','utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

// 2026-08-25: az urlap 'dosar' modja MEGSZUNT. Az Avizare dauna gomb
// atvette a „Deschide dosarul" muveletet: letrehozza a dossziet es
// egybol a dosszie lapjara visz. Nincs tobbe ket helyen ugyanaz a mezo.
console.log('\n1. Az urlapnak nincs tobbe kulon dosar-modja');
ok(!/mode!=='dosar'/.test(idx),'a kivezetett mod feltetele sehol nem maradt');
ok(!/njMode==='dosar'/.test(idx),'  a nyitas sem allit be dosar-modot');
ok(/S\.njMode='prog'/.test(idx),'  egy urlap-mod maradt: prog (+ edit)');
ok(/window\.lucrareAcum=async function/.test(idx),'a Lucrare noua sajat, urlap nelkuli utat kapott');
ok(/rpw-recepcio-red\.html\?job='\+encodeURIComponent/.test(idx),'  egyenesen a recepciora visz');
ok(!/openNewJob\('dosar'\)/.test(idx),'  senki nem hivja dosar-modban');
ok(/window\.dosarTarziu=async function/.test(idx),'a gomb sajat utat kapott');
ok(/deschideDosar\(j\.id\)/.test(idx),'  ugyanazt a deschideDosar-t hivja, mint a lista gombja');

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
