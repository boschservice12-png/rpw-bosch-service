// L1-J: blokkolas-modal — valodi DOM, valodi rpw-workflow.js
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{pretendToBeVisual:true});
global.window=dom.window; global.document=dom.window.document;
global.self=dom.window; global.alert=()=>{throw new Error('alert() futott — nem szabadna!')};
eval(fs.readFileSync('rpw-workflow.js','utf8'));
const WF=dom.window.RPWWorkflow;

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

// a kepernyokepen latott allapot: Receptie aktiv, sok hianyzo tetel
const job={id:'j1',damageType:'asig',phase:1,
  phases:{1:{status:'active'},2:{status:'pending'},3:{status:'pending'},4:{status:'pending'},
          5:{status:'pending'},6:{status:'pending'},7:{status:'pending'}},
  photoKeys:{},photos:[],docs:[],elements:{}};

console.log('\n1. A modal megjelenik, alert NEM fut');
let threw=false;
try{ WF.showBlockModal({job:job,targetPhase:2,reasons:['wf_future_phase','wf_prev_not_closed'],lang:'ro'}); }
catch(e){ threw=true; console.log('  x KIVETEL: '+e.message); }
ok(!threw,'nincs alert(), nincs kivetel');
const ov=document.querySelector('.rpw-bm');
ok(!!ov,'overlay letrejott');
ok(!!document.getElementById('rpw-bm-css'),'CSS beinjektalva');

console.log('\n2. HASZNOS tartalom — nem a "faza anterioara nu e inchisa"');
const txt=ov?ov.textContent:'';
ok(!/faza anterioară nu este închisă/i.test(txt),'NEM a homalyos uzenet jelenik meg');
ok(/talon/i.test(txt),'kiirja: hianyzik a talon');
ok(/fotografii|ansamblu/i.test(txt),'kiirja: hianyzo fotok');
ok(/raport/i.test(txt),'kiirja: hianyzo karjelentes');
ok(/Recep/i.test(txt),'megmondja, MELYIK fazisban kell potolni');

console.log('\n3. Elet: kabala, halado sav, gombok');
ok(/rpw-mascot\.png/.test(ov.innerHTML),'kabala kepe ott van');
ok(!!ov.querySelector('.rpw-bm-prf'),'halado sav');
ok(!!ov.querySelector('.rpw-bm-av'),'avatar elem (lebego animacio)');
ok(ov.querySelectorAll('.rpw-bm-x').length>=3,'minden hianyra egy piros jel: '+ov.querySelectorAll('.rpw-bm-x').length);
ok(ov.querySelectorAll('[data-x]').length===2,'ket gomb');

console.log('\n4. Bezarhato');
ov.querySelector('[data-x]').click();
ok(!document.querySelector('.rpw-bm'),'gombra bezarul');

console.log('\n5. onClose lefut (a fazisor atiranyitasahoz kell)');
let closed=false;
WF.showBlockModal({job:job,targetPhase:1,reasons:['wf_prev_not_closed'],lang:'ro',onClose:function(){closed=true}});
document.querySelector('[data-x]').click();
ok(closed,'onClose meghivodott');

console.log('\n6. Harom nyelv');
['ro','hu','en'].forEach(function(l){
  WF.showBlockModal({job:job,targetPhase:2,reasons:[],lang:l});
  var t=document.querySelector('.rpw-bm').textContent;
  ok(t.length>40,l+': van tartalom');
  document.querySelector('[data-x]').click();
});

console.log('\n7. Nem hasal el job nelkul sem');
try{ WF.showBlockModal({reasons:['wf_talon_missing'],lang:'ro'});
     ok(/talon/i.test(document.querySelector('.rpw-bm').textContent),'job nelkul a nyers okokat mutatja');
     document.querySelector('[data-x]').click(); }
catch(e){ ok(false,'KIVETEL: '+e.message); }

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
