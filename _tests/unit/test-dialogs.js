// L1-R: minden visszajelzes a kabalan keresztul
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;global.self=dom.window;
let nativeUsed=false;
global.alert=()=>{nativeUsed=true}; global.confirm=()=>{nativeUsed=true;return true};
eval(fs.readFileSync('rpw-workflow.js','utf8'));
const WF=dom.window.RPWWorkflow;
const dos=fs.readFileSync('rpw-dosar.html','utf8');
const idx=fs.readFileSync('index.html','utf8');

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const close=()=>{const b=document.querySelector('[data-x]');if(b)b.click()};

console.log('\n1. ask() — kerdes ket gombbal');
let answered=null;
WF.ask({tone:'danger',title:'Torlod?',text:'A Kosarba kerul.',cancelText:'Marad',confirmText:'Torles',
        onConfirm:function(){answered='igen'}});
let ov=document.querySelector('.rpw-bm');
ok(!!ov,'modal megjelent');
ok(!nativeUsed,'NEM futott nyers confirm()');
ok(/Torlod\?/.test(ov.textContent),'cim');
ok(/Kosarba/.test(ov.textContent),'szoveg');
ok(/Marad/.test(ov.textContent)&&/Torles/.test(ov.textContent),'sajat gombfeliratok');
ok(/rpw-mascot/.test(ov.innerHTML),'kabala');
ov.querySelector('[data-go]').click();
ok(answered==='igen','a megerosito gomb lefuttatja a muveletet');
ok(!document.querySelector('.rpw-bm'),'utana bezarul');

console.log('\n2. Megse — nem hajtja vegre');
answered=null;
WF.ask({title:'X',text:'Y',onConfirm:function(){answered='igen'}});
document.querySelector('[data-x]').click();
ok(answered===null,'Megse eseten NEM fut le');

console.log('\n3. say() — csak kozles, EGY gomb');
WF.say({tone:'ok',title:'Kesz',text:'Sikerult.',okText:'Ertem'});
ov=document.querySelector('.rpw-bm');
ok(!!ov,'megjelent');
ok(ov.querySelectorAll('[data-go]').length===0,'nincs megerosito gomb');
ok(ov.querySelectorAll('[data-x]').length===1,'egyetlen gomb');
ok(/Ertem/.test(ov.textContent),'sajat felirat');
close();

console.log('\n4. Hangnem-szinek');
const tones={info:'#2563eb',ok:'#1E9D55',warn:'#E9A700',danger:'#E11D2E'};
Object.keys(tones).forEach(function(t){
  WF.say({tone:t,title:t});
  const html=document.querySelector('.rpw-bm').innerHTML;
  ok(html.indexOf(tones[t])>0,t+' -> '+tones[t]);
  close();
});
WF.say({title:'nincs hangnem'});
ok(document.querySelector('.rpw-bm').innerHTML.indexOf('#2563eb')>0,'alapertelmezes: info');
close();

console.log('\n5. A dosszie-oldalon nincs tobbe nyers ablak');
const valos=(dos.match(/(?:^|[^.\w])(?:alert|confirm)\(/g)||[]).length;
ok(valos===2,'csak a 2 tartalek maradt (ha a modal nem toltodne be), got='+valos);
ok(/function dlgAsk\(o\)\{[\s\S]{0,120}RPWWorkflow\.ask/.test(dos),'dlgAsk a modalt hasznalja');
ok(/function dlgSay\(o\)\{[\s\S]{0,120}RPWWorkflow\.say/.test(dos),'dlgSay a modalt hasznalja');
[['dosarPredat','info'],['dosarInchide','ok'],['dosarToReparatie','warn']].forEach(function(x){
  ok(new RegExp("window\\."+x[0]+"[\\s\\S]{0,300}dlgAsk\\(\\{tone:'"+x[1]+"'").test(dos),
     x[0]+" -> "+x[1]+" hangnem");
});
ok(/_stergeActaGo/.test(dos)&&/tone:'danger'/.test(dos),'fajltorles -> danger');
ok(/dlgSay\(\{tone:'ok',title:T\('dlg_ov_t'\)/.test(dos),'override siker -> ok hangnem');

console.log('\n6. Az index.html torlese is');
// 2026-08-25: ez a sor a HIBAT rogzitette. Szo szerint az `L()` hivast varta el,
// ami sehol nem volt definialva — a torles gombja ReferenceError-t dobott, ez a
// teszt meg zolden jelentette, hogy „danger parbeszed". A szoveg egyezett, a
// viselkedes nem: a parbeszed SOSEM nyilt meg. A valodi lefuttatast a
// test-delete.js vegzi; itt a helyes, LETEZO nyelv-fuggvenyt kotjuk ki.
ok(/RPWWorkflow\.ask\(\{lang:gL\(\),tone:'danger'/.test(idx),'munka torlese -> danger parbeszed');
ok(/onConfirm:function\(\)\{ _dJgo\(id\); \}/.test(idx),'megerositesre torol');
ok(/window\._dJgo=async function\(id\)/.test(idx),'a tenyleges torles kulon fuggveny');
ok(/dlg_del_s:\{ro:'Trece în Coș/.test(idx),'megmondja, hogy visszahozhato');

console.log('\n7. Harom nyelv');
['ro','en','hu'].forEach(function(l){
  ['dlg_del_t','dlg_sterge','dlg_pastreaza'].forEach(function(k){
    ok(new RegExp(k+":\\{[^}]*"+l+":'[^']+'").test(idx),k+' '+l);
  });
});

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
