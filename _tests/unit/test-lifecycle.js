// L1-Q: a dosszie eletciklusa + hatarido-ora. A VALODI kodot vagja ki a fajlbol.
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('rpw-dosar.html','utf8');

let NOW=new Date('2026-08-23T10:00:00');
const RealDate=Date;
global.Date=class extends RealDate{constructor(...x){if(x.length)super(...x);else super(NOW)}
  static now(){return NOW.getTime()}};
global.window=global;
const a=html.indexOf('window.ddDay='), b=html.indexOf('window.acteCountFor=');
eval(html.slice(a,b));

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(g===e,m+'  got='+JSON.stringify(g)+' exp='+JSON.stringify(e));

console.log('\n1. Munkanap-szamitas (a constatare 3 MUNKANAP)');
eq(ddAddWork('2026-08-24',3),'2026-08-27','hetfo +3 munkanap -> csutortok');
eq(ddAddWork('2026-08-27',3),'2026-09-01','csutortok +3 -> kedd (hetvege kimarad)');
eq(ddAddWork('2026-08-28',3),'2026-09-02','pentek +3 -> szerda');
eq(ddAddWork('2026-08-29',3),'2026-09-02','szombat +3 -> szerda');

console.log('\n2. Naptari nap (az ajanlat 30 NAP)');
eq(ddAddDays('2026-08-23',30),'2026-09-22','+30 nap');
eq(ddDiff('2026-08-23','2026-08-26'),3,'kulonbseg napokban');

console.log('\n3. Hataridok az atadastol');
let t=ddTermene({dosarPredat:'2026-08-20'});
ok(!!t,'atadott dosszienal van hatarido');
eq(t.tel,3,'3 napja adtuk at');
eq(t.items.length,2,'ket hatarido: constatare + ajanlat');
eq(t.items[0].key,'dd_term_constatare','constatare');
eq(t.items[0].due,'2026-08-25','  hatarido: 08.20 + 3 munkanap');
eq(t.items[1].key,'dd_term_oferta','ajanlat');
eq(t.items[1].due,'2026-09-19','  hatarido: 08.20 + 30 nap');

console.log('\n4. Szinek — zold / sarga / piros');
t=ddTermene({dosarPredat:'2026-08-23'});
eq(t.items[1].cls,'dd-ok','ma atadva -> az ajanlat meg bo idoben (zold)');
t=ddTermene({dosarPredat:'2026-08-21'});
eq(t.items[0].cls,'dd-warn','a constatare 3 napon belul -> SARGA');
t=ddTermene({dosarPredat:'2026-08-10'});
eq(t.items[0].cls,'dd-late','lejart constatare -> PIROS');
ok(t.items[0].left<0,'  negativ nap: '+t.items[0].left);
t=ddTermene({dosarPredat:'2026-07-01'});
eq(t.items[1].cls,'dd-late','53 napja atadva -> az AJANLAT is lejart');
eq(t.items[1].left,-23,'  23 napja lejart (07.01+30=07.31, ma 08.23)');

console.log('\n5. Nem talal ki datumot');
ok(ddTermene({})===null,'atadas nelkul nincs hatarido');
ok(ddTermene({dosarPredat:''})===null,'ures datum -> nincs');
ok(ddTermene({dosarPredat:'valami'})===null,'rossz formatum -> nincs');
ok(ddTermene(null)===null,'null -> nincs');
ok(html.indexOf('10 napos fizetesi hatarido')>0,'a 10 napos fizetest NEM talalja ki (dokumentalva)');

console.log('\n6. A lepesek gombjai');
ok(/if\(_st===1\)h\+='<button class="dd-act dd-a2" onclick="dosarPredat\(\)/.test(html),'1. lepesnel: Predat gomb');
ok(/if\(_st===2\)h\+='<button class="dd-act dd-a3" onclick="dosarInchide\(\)/.test(html),'2. lepesnel: Inchide gomb');
ok(/if\(_st>=2\)h\+='<button class="dd-undo" onclick="dosarInapoi\(\)/.test(html),'visszalepes lehetoseg');
ok(/var _tm=\(_st===2\)\?ddTermene\(job\):null/.test(html),'hatarido CSAK atadas utan, lezaras elott');

console.log('\n7. A lepesek DATUMOT rogzitenek');
ok(/JOB\.dosarPredat\s*=\s*ddDay\(0\)/.test(html),'atadas datuma mentodik');
ok(/JOB\.dosarInchisLa\s*=\s*ddDay\(0\)/.test(html),'lezaras datuma mentodik');
ok(/patchV2\(sb,JOB\.id,\{dosarPredat/.test(html),'szerverre is megy');
ok(/dlgAsk\(\{tone:'info',title:T\('dd_predat'\)/.test(html),'megerositest ker — a KABALAN keresztul');
ok(/dlgAsk\(\{tone:'ok',title:T\('dd_inchide'\)/.test(html),'lezarashoz is — kabalaval');

console.log('\n8. ZIP utan felajanlja az atadast');
ok(/!JOB\.dosarPredat && !JOB\.inchis/.test(html),'csak ha meg nincs atadva');
ok(/onConfirm:function\(\)\{ dosarPredat\(\); \}/.test(html),'igenre megjeloli');
ok(/zip_predat_no|zip_predat_yes/.test(html),'sajat gombfeliratok');
['ro','en','hu'].forEach(l=>ok(new RegExp("dd_predat:\\{[^}]*"+l+":'").test(html),'dd_predat '+l));

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
