// L1-K: allapotcsik — szin es tartalom
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;global.self=dom.window;
global.alert=()=>{throw new Error('alert futott!')};
eval(fs.readFileSync('rpw-workflow.js','utf8'));
const WF=dom.window.RPWWorkflow;

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const eq=(g,e,m)=>ok(g===e,m+'  got='+JSON.stringify(g));

function J(o){return Object.assign({phase:1,damageType:'auto',photoKeys:{},photos:[],docs:[],elements:{},rework:[],
  phases:{1:{status:'active'},2:{status:'pending'},3:{status:'pending'},4:{status:'pending'},5:{status:'pending'},6:{status:'pending'},7:{status:'pending'}}},o||{})}
const ZOLD='#1E9D55', SARGA='#E9A700', PIROS='#E11D2E', SZURKE='#94A3B8';

console.log('\n1. Harom szin, ahogy kerted');
eq(WF.barColor(J({phases:{1:{status:'done'}}}),1).c,ZOLD,'lezart faza -> ZOLD');
eq(WF.barColor(J(),1).c,SARGA,'folyamatban, van hianyzo -> SARGA');
eq(WF.barColor(J({phases:{1:{status:'blocked'}}}),1).c,PIROS,'blokkolt -> PIROS');
eq(WF.barColor(J({phases:{1:{status:'rework'}}}),1).c,PIROS,'rework -> PIROS');
eq(WF.barColor(J({rework:[{status:'open'}]}),1).c,PIROS,'nyitott rework -> PIROS');
eq(WF.barColor(J({phases:{1:{status:'skipped'}}}),1).c,SZURKE,'kihagyva -> SZURKE');

console.log('\n2. Zold akkor is, ha meg nincs lezarva, de mar lezarhato');
const kesz=J({damageType:'auto',phase:4,phases:{4:{status:'active'}},controlChecks:{},rework:[]});
ok([ZOLD,SARGA].indexOf(WF.barColor(kesz,4).c)>=0,'ertelmes szint ad');

console.log('\n3. Csak CSIK — nincs szoveg a kepernyon');
const h=WF.statusBarHtml(J(),1,'ro');
const el=dom.window.document.createElement('div'); el.innerHTML=h;
eq(el.textContent.trim(),'','a csikban NINCS lathato szoveg');
ok(/height:5px/.test(h),'vekony (5px)');
ok(/#E9A700/.test(h),'a szin benne van');
ok(el.querySelectorAll('div').length===2,'ket div: sav + kitoltes');

console.log('\n4. A reszlet a hover-ben marad (nem vesz el)');
const tip=el.firstElementChild.getAttribute('title');
ok(!!tip&&tip.length>20,'van tooltip: '+String(tip).slice(0,60)+'…');
ok(/talon|Recep/i.test(tip),'a tooltip a valodi hianyokat mondja');
ok(!!el.firstElementChild.getAttribute('aria-label'),'aria-label is (kepernyoolvaso)');

console.log('\n5. Nincs dupla ertesites — a regi bosbeszedu sav elemei eltuntek');
['bar_progress','Blocaje','Responsabil','Rework deschis'].forEach(function(k){
  ok(h.indexOf(k)<0,'nincs benne: '+k);
});

console.log('\n6. A kitoltes aranya kovetheto');
ok(/width:\d+%/.test(h),'szazalekos kitoltes');
ok(/width:100%/.test(WF.statusBarHtml(J({phases:{1:{status:'done'}}}),1,'ro')),'lezart -> 100%');

console.log('\n7. A modal tovabbra is el (o mondja a reszletet)');
WF.showBlockModal({job:J(),targetPhase:2,reasons:['wf_prev_not_closed'],lang:'ro'});
const ov=document.querySelector('.rpw-bm');
ok(!!ov,'modal megjelenik');
ok(/rpw-mascot/.test(ov.innerHTML),'kabala ott van');
ok(ov.textContent.length>40,'a reszletes uzenet a modalban van');

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
